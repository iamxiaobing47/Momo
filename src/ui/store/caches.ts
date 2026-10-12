import type { MomoEntry } from '../../momo/types'
import { tagKey } from '../../momo/tags'
import { safeDay } from '../../momo/stats/window'
import type { AttachmentStats } from '../../momo/stats'

// 引用守卫与输入缓存的集合。共同思路：**按对象身份 / 数组引用**缓存派生值，
// 「内容没变就不换引用」——store 保证这一点，所以缓存命中即数据一致（见各条注释）。

/**
 * N14：`pinnedNotes` 的 Set 派生（按数组引用命中缓存，和 N02/N03 同一防守思路）。
 *
 *  卡片要的只是「这条 Momo 是否置顶」这一个布尔值，旧写法
 *  `pinnedNotes.includes(path)` 每张卡、每次 store 变更都线性扫一遍置顶表——
 *  @10k 条 × 50 个置顶就是每次变更几十万次字符串比较，而其中绝大多数查询
 *  问的都是同一个数组、同样的几条。Set 把单次查询降到 O(1)。
 *
 *  会反向退化的只剩一种：内容没变却拿到一个新 Set。所以缓存键取**数组引用**——
 *  所有改写 pinnedNotes 的路径（toggleNotePin 的 filter / 展开、setPrefs、
 *  视图打开时的偏好回灌、设置页恢复默认）都会传新数组，而内容没动的那些轮
 *  （例如 setPrefs 只改 density）拿到的是同一个数组引用，Set 原样复用。
 *  真出现「原地改数组」的写法的那些场景，WeakMap 会拒收不可缓存的键并及时重建。
 */
const pinnedNotesSetCache = new WeakMap<readonly string[], Set<string>>()
export function pinnedNotesSetOf(notes: readonly string[]): Set<string> {
  let s = pinnedNotesSetCache.get(notes)
  if (s === undefined) {
    s = new Set(notes)
    pinnedNotesSetCache.set(notes, s)
  }
  return s
}

/**
 * 正文小写缓存（v0.5.3 性能）：索引对未变更的文件返回**同一个条目对象**，
 * 于是可以按对象身份缓存 toLowerCase 的结果。旧实现每个键入字符都对全部
 * 条目正文跑一遍 toLowerCase —— 几百条 Momo 时每键分配数 MB 字符串，是搜索
 * 越敲越卡的主力。条目内容变更时服务层会造新对象，缓存自然失效。
 */
const searchLowerCache = new WeakMap<MomoEntry, string>()
export function lowerOf(e: MomoEntry): string {
  let s = searchLowerCache.get(e)
  if (s === undefined) {
    s = e.content.toLowerCase()
    searchLowerCache.set(e, s)
  }
  return s
}

// ---- Q1：matchEntries 下钻维度的按条目缓存（同 lowerOf 手法）----
// 下钻会话里每次搜索停顿 / 筛选变化都对全库重付：safeDay、小时/星期 Date、
// 正文 trim、去重标签数（@10k 约 2ms/趟）。条目内容变更时服务层造新对象，
// 缓存随对象身份失效。

/** 下钻「今天及以前」闸的日期键。⚠️ 与 dayOfCached 不互替：safeDay 对无效日期
 *  返回 null，dayKey 会回退前 10 位——无效日期不算未来的语义靠 null 分支。 */
const safeDayCache = new WeakMap<MomoEntry, string | null>()
export function safeDayOf(e: MomoEntry): string | null {
  let d = safeDayCache.get(e)
  if (d === undefined) {
    d = safeDay(e.createdAt)
    safeDayCache.set(e, d)
  }
  return d
}

/** 小时 / 星期下钻的折叠 Date：§3.2「每条目的时间戳只折算一次、复用到底」——
 *  filterHours 与 filterWeekdays 同亮时从同一个 Date 取两样。Date 只读不改。 */
const tsCache = new WeakMap<MomoEntry, Date>()
export function tsOf(e: MomoEntry): Date {
  let d = tsCache.get(e)
  if (d === undefined) {
    d = new Date(e.createdAt)
    tsCache.set(e, d)
  }
  return d
}

/** 字数下钻：trim 后长度（与字数分布五档、长记录占比同口径） */
const trimLenCache = new WeakMap<MomoEntry, number>()
export function trimLenOf(e: MomoEntry): number {
  let n = trimLenCache.get(e)
  if (n === undefined) {
    n = e.content.trim().length
    trimLenCache.set(e, n)
  }
  return n
}

/** 标签数下钻：按身份键去重（与标签数分布同口径） */
const tagCountCache = new WeakMap<MomoEntry, number>()
export function tagCountOf(e: MomoEntry): number {
  let n = tagCountCache.get(e)
  if (n === undefined) {
    n = new Set(e.tags.map(tagKey)).size
    tagCountCache.set(e, n)
  }
  return n
}

/** `caps.listAttachmentFiles` 不存在时的共享空数组：`?? []` 每次都是新数组，
 *  引用比较永远命不中，N18 的缓存就白做了。类型跟着 computeAttachmentStats 的
 *  入参写成可变的（它只读不改），但**谁都不许往里推东西**。 */
export const NO_ATTACHMENT_FILES: { path: string; size: number; mtime: number }[] = []

/** N18：附件统计的输入缓存（单槽，见 readOnce 里的说明）。
 *  `day` 是**第三个输入**，不是附属字段：computeAttachmentStats 的 12 个月趋势
 *  窗口由「本月」决定，跨月不失效会让趋势停在上个月的窗口里（面板开着过夜、
 *  期间一个 vault 事件都没有时尤其明显——entries 那边也是同一个理由）。 */
export const attachCache: {
  day: string | null
  entries: readonly MomoEntry[] | null
  files: { path: string; size: number; mtime: number }[] | null
  stats: AttachmentStats | null
} = { day: null, entries: null, files: null, stats: null }

/**
 * 附件清单的**按内容**比较（N18 的守卫本体）。
 *
 * 不能比引用：`service.listAttachmentFiles()`（service/index.ts 的 listAttachmentFiles）
 * 每次读盘都 new 一个数组，刷新拿到的清单和上一轮的 `attachCache.files`
 * 永远不是同一个对象——比引用等于缓存白做，`computeAttachmentStats` 每轮
 * 把全库正文过一遍图片正则（@10k 是几万 KB 的扫描，每个 vault 事件一遍）。
 * 文件数十级，逐条比 path/size/mtime 的代价可忽略。
 * mtime 也在比较里：它是内容变化的一部分（月度趋势按它分月），「只动了
 * 修改时间」照样要重算。
 */
export function sameFileList(
  a: readonly { path: string; size: number; mtime: number }[] | null,
  b: readonly { path: string; size: number; mtime: number }[],
): boolean {
  if (a === null || a.length !== b.length) return false
  return b.every((f, i) => {
    const p = a[i]
    return p !== undefined && p.path === f.path && p.size === f.size && p.mtime === f.mtime
  })
}

/**
 * 附件统计引用守卫（N03）：这值每轮 refresh 都重算一遍，附件没变化也会拿到全新对象
 * （monthlyTrend 也是新数组）→ 订阅 attachmentStats 的统计页无谓重渲。
 * 三个标量逐值比，monthlyTrend 逐项比 month/count/bytes。
 */
export function sameAttachmentStats(prev: AttachmentStats, next: AttachmentStats): boolean {
  if (prev.total !== next.total || prev.totalBytes !== next.totalBytes) return false
  if (prev.entriesWithImages !== next.entriesWithImages) return false
  const a = prev.monthlyTrend
  const b = next.monthlyTrend
  if (a.length !== b.length) return false
  return b.every((m, i) => {
    const p = a[i]
    return p !== undefined && p.month === m.month && p.count === m.count && p.bytes === m.bytes
  })
}
