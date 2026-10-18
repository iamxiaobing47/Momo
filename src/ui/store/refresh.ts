import { localDay, startOfToday } from '../../momo/dates'
import { tagNodeMapOf } from '../../momo/tags'
import { copy } from '../../momo/i18n'
import { errMsg } from '../../momo/core'
import { computeAttachmentStats, type AttachmentStats } from '../../momo/stats'
import type { MomoEntry } from '../../momo/types'
import { NO_ATTACHMENT_FILES, attachCache, sameAttachmentStats, sameFileList } from './caches'
import type { StoreActions } from './slice'
import type { UiState } from './types'

// refresh 串行化：批量删除等操作收尾 + vault 事件可能叠加出多次刷新请求，
// 并发 refresh 的完成顺序不确定，旧快照后完成会把已删的卡片「闪回来」。
// 让后来的调用合并为「在途那轮结束后再补一轮」，永远以最新读到的为准。
//
// **单飞 + 补跑**（2026-09-19 重写）：同一时刻只有一个在途 `inflight`，所有调用方
// 都 await 它，所以「加载完成 → loading 归位」永远有人负责。上一版把在途期间的
// 调用直接 `return`（resolve 成 undefined）而不接在在途 Promise 上 —— 视图外壳
// 在加载完成前重新挂载时（`useUi` 是模块级单例，重挂载会回到 loading=true 初值
// 并只订阅 loading、不重新发起加载），那唯一在途的 Promise 却是 fire-and-forget
// （`init()` / vault 事件）的，一旦它被拒绝就没人再关 loading，面板永远停在
// 「加载中…」。见 docs/requirements/overview.md §4。
let inflight: Promise<void> | null = null
let queued = false

/**
 * 读一轮：解析索引 + 回收站，并做僵尸置顶清理。抛错由调用方决定是否重试。
 */
const readOnce = async ({ set, get }: StoreActions): Promise<void> => {
  const caps = get().caps
  if (!caps) return
  // BUG-54：loading 的唯一视觉消费是 CardFlow 的「loading && entries.length === 0」
  // 空态——稳态（entries 非空）翻 true 没有任何可见效果，却让单独订阅 loading 的
  // App 每轮刷新白渲两遍。只在空态（首载 / 空库）翻 true；置 false 照旧无条件。
  const prev = get().entries
  if (prev.length === 0) set({ loading: true })
  const [entries, trash] = await Promise.all([caps.listEntries(), caps.listTrash()])
  // 索引缓存命中时条目对象身份不变：数组内容完全一致就不换引用，
  // 避免每次 vault 事件都触发一次无意义的全列表重渲。
  const same = prev.length === entries.length && entries.every((e, i) => e === prev[i])
  // D-01：service.listEntriesRun()（service/index.ts 的 listEntriesRun）每次都 new MomoEntry[]，
  // 拿到的 `entries` 永远是全新引用。本函数只把**稳定数组**还回了 store，而本函数
  // 后面仍有许多处要用 entries——直接写局部新数组会让 tags/derived.ts 的三个按引用缓存
  // （标签树 / tagNodeMap / 共现）与 N18 的附件统计缓存**每次刷新全部失效**：
  // 标签树每轮重建两次（refresh 存新数组的结果，UI 用 store 稳定数组读时又重建一遍，
  // 两个引用互相把对方挤出单槽），附件统计每轮把全库正文扫一遍图片正则。
  // 这里显式取出稳定数组，之后一律用它。
  const stable = same ? prev : entries
  // 回收站也加引用守卫（N02）：service.listTrash() 每次读盘都返回全新对象
  // （行数组与行本身都新分配），回收站内容没变也换引用 → 白重渲一次。
  // v0.9.26 起行里带完整索引投影 `entry`，service 的 trashCache 保证「文件没变
  // 时 entry 是同一个对象」，所以这里比 entry **身份**（比文本便宜且更严）。
  const prevTrash = get().trash
  const trashSame =
    prevTrash.length === trash.length &&
    trash.every((t, i) => {
      const p = prevTrash[i]
      return (
        p !== undefined &&
        t.name === p.name &&
        t.entry === p.entry &&
        t.record.originalPath === p.record.originalPath &&
        t.record.deletedAt === p.record.deletedAt
      )
    })
  set({ entries: stable, trash: trashSame ? prevTrash : trash, loading: false })

  // 回顾批次是**抽批时的对象快照**：从回顾里「打开」笔记改完正文，vault 事件
  // 刷新了 entries，但批次里攥着的还是旧对象——卡片就一直显示改前的话
  // （v0.5.2 用户反馈）。按路径把批次条目换成本轮的新对象：改了的换新，
  // 没改的是同一引用（整批没变就不 set，避免无意义重渲）。
  //
  // BUG-249：快照还**必须对账**——索引里没有的路径（删到回收站 / 外部删除 /
  // 改名）已经不是「可回顾的 Momo」，攥着旧对象就会继续渲染那张卡、「第 N 张 /
  // 共 M 张」也一动不动（用户在回顾里删笔记撞上的正是这个：`?? e` 保留旧对象，
  // 而删除若是本轮唯一变化，连 set 都不会发）。判据与下面的 reviewSeen /
  // pinnedNotes 自愈同源，外加**回收站登记**这条更硬的：`record.originalPath`
  // 里出现过就立刻摘掉——库被删空那一刻索引本就为空，只有它还能证明这是「删了」；
  // 反过来，空索引更可能是 root 还没就绪，那时没登记就一条都不动（宁可不删也不误清）。
  // 游标跟着摘除走：摘的是游标之前的条目就前移，当前那张被摘则原地指向后一张
  // （不是回退到前一张）；批次被摘空而池子还有内容 → 重抽一批（等价于点「再抽一批」），
  // 免得空态那句「暂无可回顾」与还在库里的笔记打架。
  const batch = get().reviewBatch
  if (batch.length > 0) {
    const byPath = new Map(stable.map((e) => [e.path, e]))
    const trashed = new Set(trash.map((t) => t.record.originalPath))
    const index = get().reviewIndex
    const nextBatch: MomoEntry[] = []
    let droppedBefore = 0
    for (let i = 0; i < batch.length; i++) {
      const e = batch[i]
      if (!byPath.has(e.path) && (trashed.has(e.path) || stable.length > 0)) {
        if (i < index) droppedBefore++
        continue
      }
      nextBatch.push(byPath.get(e.path) ?? e)
    }
    const batchSame = nextBatch.length === batch.length && nextBatch.every((e, i) => e === batch[i])
    const nextIndex = Math.max(0, Math.min(nextBatch.length, index - droppedBefore))
    if (nextBatch.length === 0) get().newReviewBatch()
    else if (!batchSame || nextIndex !== index) set({ reviewBatch: nextBatch, reviewIndex: nextIndex })
  }

  // 僵尸置顶清理（ADR-004 §2.7）：标签被删光 / 改名后，置顶里对应的项要跟着消失。
  // 有效键 = 标签树的**全部节点键**，所以「只有子级的虚拟父节点」仍然有效、不会被误删。
  // 索引为空时**不**清理：空索引更可能是「root 还没就绪」，宁可不删也不误删。
  const valid = tagNodeMapOf(stable)
  if (valid.size > 0) {
    const prevPinned = get().pinned
    // 身份键自 BUG-116d 起走 NFC：旧盘上存的分解形键先折成 NFC 再判有效，
    // 置顶跟着自愈到新键，而不是被当僵尸清掉；折完撞键的去重
    const pinned = [...new Set(prevPinned.map((k) => k.normalize('NFC')))].filter((k) => valid.has(k))
    if (pinned.length !== prevPinned.length || pinned.some((k, i) => k !== prevPinned[i])) get().setPrefs({ pinned })
  }

  // 视图偏好自愈：Momo 被删 / 改名后，清掉指向它的登记，避免无限增长或永久空位。
  // - 回顾展示记录（reviewSeen）：条目没了就删记录，否则这个映射只增不减；
  // - 置顶笔记（v0.8.3）：路径没了就剔出「置顶」组，否则那一组会空着一格、
  //   点开是「文件不存在」。
  // 两者口径相同（路径集合），共用一个 Set、合并成一次 setPrefs（一次落盘）。
  // 索引为空时**不**清理——空索引更可能是「root 还没就绪」，宁可不删也不误删
  // （与标签置顶按 valid.size 判断是同一个理由）。
  if (entries.length > 0) {
    const paths = new Set(stable.map((e) => e.path))
    const seen = get().reviewSeen
    const nextSeen = Object.fromEntries(Object.entries(seen).filter(([p]) => paths.has(p)))
    const prevNotes = get().pinnedNotes
    const nextNotes = prevNotes.filter((p) => paths.has(p))
    const patch: { reviewSeen?: Record<string, string>; pinnedNotes?: string[] } = {}
    if (Object.keys(nextSeen).length !== Object.keys(seen).length) patch.reviewSeen = nextSeen
    if (nextNotes.length !== prevNotes.length) patch.pinnedNotes = nextNotes
    if (patch.reviewSeen !== undefined || patch.pinnedNotes !== undefined) get().setPrefs(patch)
  }

  // 附件统计（v0.6.3 裁掉标签共现 Top、标签健康检查、历史快照三个维度及其计算）。
  // 附件统计需要附件目录清单：v0.6.3 前这行为「仅开每日快照时才列」——
  // 快照开关已随历史快照维度一起移除，附件统计改为每次刷新都列。
  // 成本相对 listEntries()（读+解析全部 Momo）可忽略；顺带修掉了
  // 「不开快照、附件统计永远显示 0」的隐性bug。
  const attachmentFiles = (await caps.listAttachmentFiles?.()) ?? NO_ATTACHMENT_FILES
  // N18：附件统计的输入缓存——三个输入都没变才复用上一次的结果。它每次刷新都要
  // 把全库正文扫一遍图片正则（`hasImage`），而结果十有八九被下面那个
  // sameAttachmentStats 守卫原样丢掉：读盘没变时这笔 CPU 是纯付（@10k 是全库
  // 几万 KB 的正则扫描，每次 vault 事件都来一遍）。
  //
  // 三个输入各自的比法（少一个就漏一种变化）：
  // - `stable` 比**引用**：入 state 的那个稳定数组。listEntries 每轮都 new，
  //   比它的新引用永远命不中（D-01）；
  // - 附件清单只能**按内容**比（sameFileList）：service 每轮也 new 一个新数组，
  //   比引用同样永远命不中——原先的双引用缓存因此完整失效；
  // - 今天也要比：computeAttachmentStats 的 12 个月趋势窗口由「本月」决定，
  //   跨月不失效会让趋势停在上个月的窗口里。缓存键与统计窗口共用**同一次**读钟
  //   （BUG-111c 顺手）：跨午夜那一瞬两条读法不再分叉到两天的两侧。
  const now = new Date()
  const today = localDay(startOfToday(now))
  const filesSame = sameFileList(attachCache.files, attachmentFiles)
  const attachmentStats: AttachmentStats =
    attachCache.day === today && attachCache.entries === stable && filesSame
      ? (attachCache.stats as AttachmentStats)
      : computeAttachmentStats(stable, attachmentFiles, now)
  attachCache.day = today
  attachCache.entries = stable
  attachCache.files = attachmentFiles
  attachCache.stats = attachmentStats
  // N03：附件没变就还回旧引用（computeAttachmentStats 每轮都给全新对象）
  const prevStats = get().attachmentStats
  set({ attachmentStats: sameAttachmentStats(prevStats, attachmentStats) ? prevStats : attachmentStats })

  // M3：这一轮读成功了 → 撤掉读失败提示。只在置过位时 set：稳态每轮都写同一个
  // null 会让订阅 readError 的组件白渲（与上面那批引用守卫同一个道理）。
  if (get().readError !== null) set({ readError: null })
}

/**
 * 把在途期间排队的请求跑完。每轮开始前先清标记：本轮读盘期间再来的请求会把标记
 * 置回 true，于是本轮结束后要再读一轮（读盘串行，完成顺序即请求顺序）。
 */
const drain = async (store: StoreActions): Promise<void> => {
  while (true) {
    if (!store.get().caps) return
    queued = false
    await readOnce(store)
    if (!queued) break
  }
}

// 失败原因的展示形态取 momo/core 的 errMsg：D1 起它是全仓唯一口径
// （caps / settings / service 都用它），报错文本不再跟着文件各写一份。

export type RefreshSlice = Pick<UiState, 'refresh'>

export function createRefreshSlice(store: StoreActions): RefreshSlice {
  return {
    async refresh() {
      // 面板还没打开（caps 未注入）：没有任何可读的东西，直接返回。
      // **不能**在这里挂一个 parking 用的在途 Promise —— 那样后面 init(caps) 发起的
      // 第一轮只会「合并」到这个永远不会读盘的 Promise 上，loading 就再也没人放下。
      if (!store.get().caps) return

      // 在途期间来的请求：标记「结束后补跑一轮」，并与在途那轮共用同一个 Promise。
      // 绝不能返回一个「不接在在途加载上」的 Promise —— 那样加载完成的那一刻就没人
      // 有责任把 loading 放下来（见文件上方注释）。
      const pending = inflight
      if (pending) {
        queued = true
        await pending
        return
      }
      const promise = (async () => {
        try {
          await drain(store)
        } catch (e) {
          // 读盘失败（文件被外部删除、vault 事件落在 root 就绪之前…）只影响这一轮的数据，
          // 绝不能把 loading 留在 true 上。
          //
          // M3：同时把失败摆到用户眼前（readError）。此前这里只有 console.error，
          // 于是「读盘失败」在界面上与「读到了旧数据」完全同形——用户没有任何
          // 途径知道自己看到的不是最新的。控制台日志保留（排查要它），但它不是
          // 用户的入口。
          store.set({ loading: false, readError: copy.errors.refreshFailed(errMsg(e)) })
          console.error('[Momo] 刷新列表失败（列表未更新）', e)
          // 失败这轮期间如果还排着一轮，就立刻补跑：首发加载被 vault 事件叠上是最常见的
          // 路径，那轮请求不该跟着一起失败、一直等到下一个 vault 事件才重试。
          // 标记只由外部调用置位，所以不会自旋。
          if (queued) {
            queued = false
            try {
              await drain(store)
            } catch (retryError) {
              store.set({ loading: false, readError: copy.errors.refreshFailed(errMsg(retryError)) })
              console.error('[Momo] 重试刷新列表仍然失败（列表未更新）', retryError)
            }
          }
        } finally {
          // 必须先清在途标记：否则后面所有 refresh 都会走「合并到在途」分支，
          // 而那个 Promise 已经结束 —— 列表从此再也刷不动。
          inflight = null
        }
      })()
      inflight = promise
      await promise
    },
  }
}
