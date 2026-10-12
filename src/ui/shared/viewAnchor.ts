// 视图锚点（v0.9.15）：**跨密度切换的位置联动**。用户切的是「同一份结果的另一种
// 看法」，不是换一篇笔记看——在焦点视图滚到某张卡，切去列表 / 网格，
// 落点还该是那张卡；反向也一样。
//
// 为什么各视图要「自己写」锚点：每档密度拿到当前卡片的成本结构完全不同——
//   · 焦点档：焦点下标是**现成状态**（FocusScroll 的 focus），写一次不花任何布局读；
//   · 其它档：滚动容器是 `.momo-content`（页面级），没有「当前卡」这个概念，
//     只能从滚动位置反推（pickTopPath）。
// 读取侧只有一个消费者：切密度那一刻的归位（restoreAnchor / FocusScroll 的挂载
// 认领）。写多读少，所以写法怎么便宜怎么来，读的那一次值得多花几毫秒。
//
// 锚点按 **App 实例** 存（WeakMap 键 = `.momo-app` 根元素）：面板可以同时开多份
// （侧栏各一格 / 主区标签页各一颗），两边的滚动位置互不相干，锚点也不能串台
// （scrollAppToTop 同款考虑）。根元素卸载即整份丢弃，不需要清理回调。
//
// `data-path` 是这套机制的**唯一定位标记**：`.momo-slot`（窗口槽位，v0.9.13）、
// `.momo-focus-item`（焦点槽位）、`.momo-card`（无 IO 环境的直出卡，以及网格档
// 移除前的多列卡）都带。同一路径会出现两处（槽位 + 卡内），取**文档序第一处**
// （槽位在前，且它俩位置相同）。统计页里的预览卡也带 data-path（2026-10-01 起
// 「最长笔记」复用主页面那张真卡），但它们被 EXCLUDED_SELECTOR 排除在外——
// 见下面那段注释。

/** 面板根选择器：锚点与滚动容器都相对它找（多开面板时各找各的） */
const ROOT_SELECTOR = '.momo-app'
/** 主区滚动容器（焦点档除外——那一档滚的是内层 `.momo-focus`） */
const CONTENT_SELECTOR = '.momo-content'
/**
 * 锚点的** excluded 作用域**：统计页内部。统计页也住在 `.momo-content` 里，而
 * 2026-10-01 起「最长笔记」那三张是**带 data-path 的真卡片**（复用主页面 Card）——
 * 不排除的话，滚统计页会把某篇笔记写成视图锚点，之后切密度时列表会朝那一篇跳
 * （用户可没在列表里做过这个选择）。锚点是「同一份结果的另一种看法」的定位标记，
 * 统计页不是那份结果的一种看法，它的卡不参与。
 */
const EXCLUDED_SELECTOR = '.momo-stats-page'

/** 带 data-path 的元素里，排除统计页预览卡之后的那些（文档序不变） */
function anchorElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-path]')).filter(
    (el) => !el.closest<HTMLElement>(EXCLUDED_SELECTOR),
  )
}

/** 按 App 实例存的锚点：根元素 → 当前路径。WeakMap：根一卸载，锚点跟着消失 */
const anchors = new WeakMap<HTMLElement, string>()

/** 元素所在的面板根（找不到 = 游离在面板外，不写不读） */
export function anchorRootOf(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>(ROOT_SELECTOR) ?? null
}

/** 读锚点；没有（没滚过 / 刚回顶部）返回 null */
export function readAnchor(root: HTMLElement | null): string | null {
  return (root && anchors.get(root)) ?? null
}

/** 写锚点。同值不写（滚动路径上每帧都会调，少一次 Map 写入是一次） */
export function writeAnchor(root: HTMLElement | null, path: string): void {
  if (!root || !path) return
  if (anchors.get(root) === path) return
  anchors.set(root, path)
}

/** 清锚点：「回家」这类明确回顶部的动作用它（scrollAppToTop），下次切密度不再归位 */
export function clearAnchor(root: HTMLElement | null): void {
  if (root) anchors.delete(root)
}

/**
 * 面板里第一个带该路径的元素（文档序优先）。筛选后卡片不在列表里时返回 null，
 * 归位方据此「不写 scrollTop」——照旧让浏览器按新内容夹住位置，不强跳。
 */
export function findPathElement(root: HTMLElement, path: string): HTMLElement | null {
  for (const el of anchorElements(root)) {
    if (el.dataset.path === path) return el
  }
  return null
}

/**
 * 滚动容器里「视口最上面那张卡」的路径（非焦点密度的锚点来源）。
 *
 * 快路用 `elementFromPoint`（视口顶缘内侧一次命中测试）：O(1)，与 FocusScroll 的
 * 焦点判定同款——每帧扫全部槽位读 rect 正是焦点视图 v0.8.1 拆掉的 O(N) 开销，
 * 这里不捡回来。命中落在卡片间隙 / 分组头 / 面板被滚出视口（拿不到 box）时，
 * 退回一次**从顶往下**的扫描：第一个下缘越过视口顶缘的就是最上面那张。
 * 两条路都只读布局、不写；环境没有 elementFromPoint（jsdom）直接走扫描。
 *
 * `keep` 是**已经认下的锚点**：只要它还贴着视口顶缘（跨过顶缘，或落在归位那 8px
 * 缝隙里），就还是它——「锚点没动」的那些滚动帧因此**只读一次 rect** 就返回，不必
 * 从顶往下扫（下面那条 O(1) 快路在真实面板里从未命中：探针点落在 `.momo-content`
 * 的 24px 内距里，真 Chromium 实测只命中容器本身）。
 * 它同时也是 BUG-210 当初的修法：网格档那时还参与锚点，归位自己发的 scroll 事件会
 * 把锚点挪到左邻列那张上。网格现已**整档不参与**（进网格一律回第一张，见
 * `hooks/useViewAnchorSync`），那条病根不存在了；这层判断留着是因为它对列表 / 焦点
 * 两档是等价且更省的，删了只是把 O(N) 扫描捡回来。
 */
export function pickTopPath(scroller: HTMLElement, keep?: string | null): string | null {
  const box = scroller.getBoundingClientRect()
  if (box.height <= 0) return null
  if (keep) {
    const kept = findPathElement(scroller, keep)
    if (kept) {
      const r = kept.getBoundingClientRect()
      // +1：归位把它停在 TOP_INSET 上，浮点上落不到整数像素
      if (r.height > 0 && r.bottom > box.top + 1 && r.top <= box.top + TOP_INSET + 1) return keep
    }
  }
  if (typeof document.elementFromPoint === 'function') {
    const y = box.top + Math.min(4, box.height / 4)
    const x = box.left + Math.min(16, box.width / 4)
    let hit: Element | null = null
    try {
      hit = document.elementFromPoint(x, y)
    } catch {
      hit = null
    }
    const marked = hit?.closest<HTMLElement>('[data-path]') ?? null
    if (marked && scroller.contains(marked) && marked.dataset.path) return marked.dataset.path
  }
  for (const el of anchorElements(scroller)) {
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.bottom > box.top + 1) return el.dataset.path ?? null
  }
  return null
}

/**
 * 把某张卡滚到视口顶部（留 TOP_INSET 不贴死筛选条）：按**当前 rect** 算差值，
 * 不是按 offsetTop——页面级滚动区里 rect 差已经是视空间坐标，少一次布局读。
 * 高度是估值的窗口槽位也一样成立：估的是「这张卡自己多高」，它的**顶**就是定位基准。
 */
/** 归位时卡片不贴死视口顶缘（与 `.momo-content` 的滚动留白同数量级） */
const TOP_INSET = 8

export function scrollElementToTop(scroller: HTMLElement, el: HTMLElement): void {
  const dy = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTop = scroller.scrollTop + dy - TOP_INSET
}

/**
 * 切密度后的归位（App 的 useLayoutEffect 调，非焦点四档）：把锚点那张卡送到
 * `.momo-content` 顶部。**焦点档不在这里**——它滚的是内层 `.momo-focus`、落点是
 * 「居中」而不是「贴顶」，由 FocusScroll 挂载时自己认领（见那边同名的 effect）。
 *
 * 布局阶段跑（早于绘制）：等 passive effect 再写，会先画一帧新密度的第 0 张再跳。
 */
export function restoreAnchor(root: HTMLElement | null): void {
  if (!root) return
  const path = readAnchor(root)
  if (!path) return
  const scroller = root.querySelector<HTMLElement>(CONTENT_SELECTOR)
  if (!scroller) return
  const el = findPathElement(root, path)
  if (!el || !scroller.contains(el)) return
  scrollElementToTop(scroller, el)
}
