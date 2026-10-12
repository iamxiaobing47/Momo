// 视口窗口挂载（「虚拟滚动」的本体，v0.9.13）。
//
// 治的是「命中多少条就挂多少张卡」：单列密度过去一次挂载全部
// 卡片（本库 511 条 = 511 棵组件树、1500+ 订阅、511 次 IO 注册；@10k 时首开就要命）。
// 现在每个条目先落一个**轻槽位**（空 div + 估算高度，滚动几何不变），靠近视口才挂
// 真卡片，离开远了再卸载。
//
// 与 focus 密度（`focus/useFocusWindow.ts`）是同一种思想、不同的驱动：focus 按
// **焦点下标**（滚动容器自管、scroll-snap、逐帧补间），这里按**浏览器相交**——
// 单列密度没有自管的滚动容器，`.momo-content` 是页面级滚动区，用 IntersectionObserver
// 让浏览器做命中测试：滚动路径上**零 JS**（回调只在跨越阈值那天发生一次），不需要
// 监听 scroll、不需要每帧算偏移。
//
// 四个机制，缺一个都会在真实滚动里露出破绽：
// ① **双阈值滞回**：700px 内挂载、2600px 外才卸载。单阈值会在边界附近反复
//    挂/卸（鼠标停在阈值边、惯性滚动回弹），滞回带 ~1900px 一次跨过。
// ② **实测高度缓存**（条目 path → 像素）：卸载时按**量过的原值**回填占位，
//    与挂载时逐像素一致——滚动几何不因卸载抖一下。没量过的用「已测高度的
//    均值、取整到 50px」：均值会随新测量漂移，取整档让它一跳几十像素才动一次
//    （focus 密度当年是同一套取舍，但它改「一屏一卡」后槽位高度由 CSS 定死、估算
//    口径整体退场，见 `focus/useFocusWindow.ts` 头部——**本文件是这条口径现在唯一
//    的使用者**，别再去找第二处），Slot 首挂时快照，不会反复改。
// ③ **锚点修正**：第一次挂载（估算→实测）或内容变高发生在**视口上方**时，下方
//    内容会被顶下去——按高度差补 `scrollTop`，把 visually stable 拉回来
//    （与 FocusScroll 的 `settleDrift` 同属漂移修正那一类；它那只「高度采样 + 视口
//    上缘外长高补偿」的共享 RO 已随一屏一卡退场，见 FocusScroll.tsx 的 v0.9.15 注释。
//    这里的 RO 是一处集中）。
// ④ **无 IO 回退**：没有 IntersectionObserver 的环境（jsdom / 老 Electron）里
//  WindowSlot 直接渲染 children，**不套槽位**——那一侧没有窗口化可省（全都会
//  挂载），套了只是白付 N 个组件实例；见过的 DOM 也与窗口化前逐字一致，存量
//  DOM 契约测试天然不受影响。有 IO 的环境（生产 / 假 IO 的测试）才走槽位。
//
// 历史：v0.9.13 起窗口化按「密度档」分键（card / compact 两套高度估算与缓存）。
// compact 紧凑档移除后，单列密度只剩卡片一种高度档，这层「密度档」抽象一并删除
// ——缓存键与估算均值都收敛成单一档。

/** 靠近视口到这个距离内就挂真卡片（IO rootMargin，比 MarkdownBody 的 600px 略大，
 *  让「切完密度紧接着快滚」的第一屏也已就位——上半列表还有 hover 预热烘缓存） */
export const MOUNT_MARGIN = 700
/** 离开视口超过这个距离才卸载（滞回带 = KEEP - MOUNT ≈ 1900px） */
export const KEEP_MARGIN = 2600
/** 未测量高度的估算均值取整档（档位大 → 均值漂移不逐像素改 props；本文件独占此口径） */
const ROUND_STEP = 50

/** 从没量过任何一张时的兜底估算（混合长短正文的卡片） */
const ESTIMATE_DEFAULT = 320
/** 均值的夹取区间：夹住极端长文 / 空条目把估算带飞 */
const ESTIMATE_MIN = 160
const ESTIMATE_MAX = 900

/**
 * 高度缓存：key = 条目 path → **实测原始像素**（不取整——卸载回填必须
 * 与挂载时逐像素一致，取整会让每次卸载都差几像素、滚动几何慢慢爬）。
 * 存活期 = 面板这一次加载（切密度 / 改筛选都不清：同一条目在哪种单列密度里
 * 同高）。条目删了会留一个陈旧的数字，8 字节，不清理。
 */
const heightCache = new Map<string, number>()

/** 估算高度 = 已测高度的均值，夹取后取整到 50px 档；一条都没量过用兜底值。
 *  纯函数（缓存由调用方传入）——单测直接喂数据，不依赖模块状态。 */
export function estimateFor(cache: ReadonlyMap<string, number>): number {
  let sum = 0
  let count = 0
  for (const value of cache.values()) {
    sum += value
    count += 1
  }
  return estimateFromMean(sum, count)
}

/** 均值 → 夹取 + 取整档的共同口径（estimateFor 与增量均值共用，避免两处漂移） */
function estimateFromMean(sum: number, count: number): number {
  if (count === 0) return ESTIMATE_DEFAULT
  const avg = Math.min(ESTIMATE_MAX, Math.max(ESTIMATE_MIN, sum / count))
  return Math.round(avg / ROUND_STEP) * ROUND_STEP
}

/**
 * **增量均值**（BUG-63）：heightCache 只在 ensureRO 写，均值随之 O(1)
 * 更新——每个新槽位不再对整张缓存全扫。旧实现那种「一条都没量过」的兜底
 * 仍在 estimateFromMean 里。
 * 实测高度可能把同一个 path 重测（挂载 → 量 → 卸载 → 再挂），旧值先扣再加。
 */
const meanCache: { sum: number; count: number } = { sum: 0, count: 0 }

/** 写一条实测高度：同步更新 heightCache 与增量均值（同 path 重测时先扣旧值） */
function rememberHeight(path: string, height: number): void {
  const previous = heightCache.get(path)
  if (previous !== undefined) {
    meanCache.sum -= previous
    meanCache.count -= 1
  }
  heightCache.set(path, height)
  meanCache.sum += height
  meanCache.count += 1
}

/** 读模块缓存的当前估算（Slot 首挂时快照用）：O(1)，不再遍历 heightCache */
export function currentEstimate(): number {
  return estimateFromMean(meanCache.sum, meanCache.count)
}

const slots = new WeakMap<Element, SlotInfo>()

let mountIO: IntersectionObserver | null = null
let keepIO: IntersectionObserver | null = null
let sharedRO: ResizeObserver | null = null

function ioSupported(): boolean {
  return typeof IntersectionObserver !== 'undefined'
}

/** 渲染侧查询：不支持 IO 的环境不套槽位（WindowSlot 的零包装直出分支） */
export function windowSupported(): boolean {
  return ioSupported()
}

function roSupported(): boolean {
  return typeof ResizeObserver !== 'undefined'
}

/**
 * 挂 / 卸两个观察者（全库共享两个实例，D-09 同款思路：N 个槽位不许 N 个 IO）。
 * 回调只做「翻 mounted 标志 + 通知 React」，不读布局不 setState。
 */
function ensureObservers(): void {
  if (!mountIO) {
    mountIO = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          const info = slots.get(en.target)
          if (info && !info.mounted) {
            info.mounted = true
            info.set(true)
          }
        }
      },
      // rootMargin 必须带单位（'700px 0px'）：无单位的 '700 0px' 是非法 CSS，
      // Chromium 构造 IO 时直接 SyntaxError——窗口挂载整套失效
      { rootMargin: `${MOUNT_MARGIN}px 0px` },
    )
  }
  if (!keepIO) {
    keepIO = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          // 离开 2600px 大带才卸：滞回，见文件头 ①
          if (en.isIntersecting) continue
          const info = slots.get(en.target)
          if (info && info.mounted) {
            info.mounted = false
            info.set(false)
          }
        }
      },
      { rootMargin: `${KEEP_MARGIN}px 0px` },
    )
  }
}

/**
 * 共享 ResizeObserver：量高度、写缓存、做**锚点修正**。回调里不 setState
 * （FocusScroll 的共享 RO 同款纪律：React 状态只在 IO 的挂/卸回调里翻）。
 *
 * 锚点修正：槽位在**滚动容器的可见区上方**时长高 / 变矮，它下方的所有内容
 * （含用户正在看的）会被顶下去——按差值补 `scrollTop` 拉回原位。判据拿容器自己的
 * 矩形比（`.momo-content` 在顶栏之下，视口零不是它的可见上缘，BUG-136m）。
 * 修正是滚动路径上唯一一次强制布局读（contentRect 之后紧随一次 rect），
 * 只发生在高度真正变化时。
 */
function ensureRO(): void {
  if (sharedRO) return
  sharedRO = new ResizeObserver((entries) => {
    for (const en of entries) {
      const info = slots.get(en.target)
      // 占位高度不写缓存（否则把估值当成实测腌起来）
      if (!info || !info.mounted) continue
      const next = en.contentRect.height
      if (next <= 0 || next === info.usedHeight) continue
      const prev = info.usedHeight
      info.usedHeight = next
      rememberHeight(info.path, next)
      const el = en.target as HTMLElement
      const scroller = el.closest<HTMLElement>('.momo-content')
      // 「在视口上方」= 在**滚动容器**可见区的上方，不是 viewport 的顶（BUG-136m）：
      // `.momo-content` 在顶栏（约 64px + 1px 分隔线，列表 / 回收站档还多一条 44px
      // 筛选条）**之下**，视口 top 落在 [0, 约 65–109) 的槽位其实已被滚出容器，
      // 旧判据 `rect.top < 0` 跳过补偿 → 正文渲染完长高时把用户正在读的内容顶下去一截。
      if (scroller !== null && el.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
        scroller.scrollTop += next - prev
      }
    }
  })
}

export interface SlotObserveOptions {
  path: string
  estimate: number
  onMount: (mounted: boolean) => void
}

/** 槽位信息（render 期创建、effect 期登记、IO/RO 回调期更新）。`usedHeight` 是当前
 *  DOM 上生效的高度：卸载 = 实测原值或快照估算，挂载 = 内容自决（不设高度）。
 *  **必须 render 期就有**：未挂载槽位的占位高度在第一帧就要正确，等 effect 跑完再
 *  补会先闪一帧 0 高度——滚动几何塌一下，正是这套机制要避免的。 */
export interface SlotInfo {
  path: string
  /** 首挂时快照的估算（第一次测量按它算锚点修正量） */
  estimate: number
  usedHeight: number
  mounted: boolean
  set: (mounted: boolean) => void
}

/** 创建槽位信息：占位高度取「实测原值优先，没量过用快照估算」 */
export function createSlotInfo(opts: SlotObserveOptions): SlotInfo {
  const measured = heightCache.get(opts.path)
  return {
    path: opts.path,
    estimate: opts.estimate,
    usedHeight: measured ?? opts.estimate,
    mounted: false,
    set: opts.onMount,
  }
}

/**
 * 把一个已创建的槽位登记进窗口（effect 里调）。返回清理函数（组件卸载时反注册）。
 * 没有 IO 的环境：直接当「已挂载」（改动前的渲染结果，见文件头 ④）。
 */
export function observeSlot(el: HTMLElement, info: SlotInfo): () => void {
  slots.set(el, info)
  if (!ioSupported()) {
    info.mounted = true
    info.set(true)
    return () => slots.delete(el)
  }
  ensureObservers()
  mountIO!.observe(el)
  keepIO!.observe(el)
  if (roSupported()) {
    ensureRO()
    sharedRO!.observe(el)
  }
  return () => {
    mountIO?.unobserve(el)
    keepIO?.unobserve(el)
    sharedRO?.unobserve(el)
    slots.delete(el)
  }
}
