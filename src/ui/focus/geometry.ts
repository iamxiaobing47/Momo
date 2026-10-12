// 焦点滚动的几何与焦点判定（纯函数 + 常量，不碰 React）。
// 这是整个焦点滚动里唯一「可以单独测」的部分：窗口半径怎么定、谁是焦点、
// 平均高怎么收敛——全是数字与 DOM 测量，没有状态。

/** 挂载窗口半径：焦点 ±4 挂真卡片；窗口外的槽位空着，只保留几何占位。
 *  半径要盖住「一屏能看见几张」——短 Momo（一两行）在长面板里能同时露出五六张，
 *  半径给小了边缘会出现还没罩住内容的空槽。 */
export const MOUNT_RADIUS = 4
/** 层次窗口半径：只在这段距离里按远近递减 z-index，更远的统一垫底（props 才能稳定） */
export const DEPTH_RADIUS = 6
/** 毛玻璃半径（v0.9.2 性能）：只有焦点 ±GLASS_RADIUS 的卡片跑完整毛玻璃
 *  （半透明底 + backdrop 模糊 + 内容柔化）。再往外那几张几乎整张在视口外，
 *  给它们跑 backdrop-filter 是替看不见的东西付 GPU 的钱。
 *  实测（headless Chrome + 真组件 + 511 条复刻库）：真 GPU / 520×900 面板上与
 *  「全量毛玻璃」无差（都只丢 3~5 帧）；软件合成（弱 GPU 模型）+ 1300 高面板上，
 *  >50ms 的长卡顿 18 帧 → 1~2 帧——收益全在最难受的那几帧上。
 *  窗口外改半透明 + 轻缩放，滚动时看不出分别（它们本来就被压在焦点卡的压边下面）。 */
export const GLASS_RADIUS = 2

/**
 * 滚动容器里「谁占焦点」——**O(1) 版**：视口中心那一点实际命中哪个元素，就属于哪张卡。
 * 返回 null = 没能定夺（中心落在槽位之间的缝隙里 / 环境不支持），调用方应维持当前焦点。
 * 命中到容器外（例如浮层压在上面）同样按「没定夺」处理，不做越界推断。
 *
 * `rect` 由调用方缓存（syncGeometry 时量一次）：滚动过程里容器的位置像素级不变，
 * 每帧再 getBoundingClientRect 等于每帧逼一次同步布局——输入已经等绘制了，
 * 就别让焦点判定再插一次队。传 null 时才回退现量（挂载后第一帧 / 面板刚变形）。
 */
export function hitFocusAtCenter(
  scroller: HTMLElement,
  rect?: { left: number; top: number; width: number; height: number } | null,
): number | null {
  if (typeof document.elementFromPoint !== 'function') return null
  const box = rect ?? scroller.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return null
  let hit: Element | null = null
  try {
    hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  } catch {
    return null
  }
  const slot = hit?.closest('.momo-focus-item') ?? null
  if (!slot || !scroller.contains(slot)) return null
  const i = Number((slot as HTMLElement).dataset.index)
  return Number.isFinite(i) ? i : null
}

/**
 * 焦点判定兜底（O(N) 遍历，**不是**每帧那条路）：只在挂载 / entries 换了一茬 /
 * 容器尺寸变化时跑。这些场合量的是「当前滚动位置该配哪一张」，而新内容还没有
 * 稳定的布局可供命中测试（卡片高度要等 Markdown 渲染），扫一遍才准。
 */
export function scanFocus(scroller: HTMLElement, items: ReadonlyArray<HTMLElement | null>): number {
  const mid = scroller.scrollTop + scroller.clientHeight / 2
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    if (!el) continue
    // 卡片中心用 `itemTop + min(itemHeight, 视口高)/2` 量：卡片比视口矮时就是卡片中心；
    // 万一有卡片超过一屏（max-height 兜底），量的是它首屏的中心——停在「顶对齐」
    // 夹取位时它依然是焦点，不会莫名让给下面只露个边的卡片。
    const point = el.offsetTop + Math.min(el.offsetHeight, scroller.clientHeight) / 2
    const dist = Math.abs(point - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/**
 * 第 i 张卡「停在视口中心」对应的 scrollTop（与 scroll-snap-align: center 同口径）。
 * 纯函数：槽位尺寸由调用方量好后传进来，jsdom / 浏览器都能测。
 * 取 max(0, …)：首/末槽位有居中补偿 margin，正常量出来就是正的；防御性夹一次，
 * 免得估算高度漂移时把 scrollTop 写成负值（浏览器会忽略，但断言与日志会难看）。
 */
export function snapTop(offsetTop: number, offsetHeight: number, viewportH: number): number {
  return Math.max(0, offsetTop + offsetHeight / 2 - viewportH / 2)
}

/** 槽位注册回调：下标 → 槽位元素（行卸载时 React 会用 null 再调一次） */
export type RegisterItem = (index: number, el: HTMLElement | null) => void
