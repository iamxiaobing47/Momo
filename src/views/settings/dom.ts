import { PATHS, type IconName } from '../../ui/shared/icons'

// 建 DOM 的小工具（不引 React：设置页是原生 DOM，和 Obsidian 的 Setting 同层）。

/** 行名 / 图标名等静态文本。BUG-74 起**不再支持**「读取时求值」的函数形态：
 *  此前函数只挂 textContent getter、从不 append 文本节点，浏览器渲染只认
 *  子文本节点 → 页头品牌名永远空白（BUG-33 的用例只断言 getter 读取，被
 *  骗过）。「跟着偏好变」的正解是真实文本节点 + onPrefChange 订阅更新
 *  （见 settings.ts 页头），不是 getter。 */
export type TextLike = string

function setTextLike(el: HTMLElement, text: TextLike | undefined): void {
  if (text === undefined) return
  el.textContent = text
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: TextLike,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  setTextLike(el, text)
  return el
}

/** 24×24 视图框的线稿图标，形状取自 ui/icons 的 PATHS（同一语义 = 同一形状）。
 *  形状在创建时写死：要跟着偏好换形状，在 onPrefChange 订阅里整枚重建
 *  （BUG-74，settings.ts 页头 mark 的做法——thunk 只求值一次，救不了）。 */
export function iconSvg(name: IconName, size = 16, strokeWidth = 1.6): SVGSVGElement {
  const paths = PATHS[name]
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', String(strokeWidth))
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

/**
 * **实心**方向钮（上移 / 下移用）：一枚填满的等边朝向三角。
 *
 * 为什么不用 `iconSvg` 的线稿（原先是 PATHS 的 chevron-up / chevron-down）：
 * 用户报「上下移动的按钮，在墨夜下，应该正常渲染，我希望换一个更明显的图标」——
 * 1.6px 的描边 V 在 26px 的钮里只剩两道细丝，墨夜（ink-night）的深炭底上尤其弱，
 * 亮色三套的纸底上也轻。实心三角是同一块面积下墨最重的形状，四套主题都压得住。
 *
 * 为什么不进 `ui/icons` 的 PATHS：PATHS 的键即「用户可配置的语义图标」
 * （CONFIGURABLE_ICON_NAMES = 全部键 - leaf，会整片进「图标」卡的选择器网格）。
 * 这颗三角只是设置页这一对序位钮的**私货**，没有语义、也没有第二处使用者，
 * 登记进去等于往用户的选择器里塞两颗不能点的东西。于是形状留在这里做局部件，
 * 与 `minus`（步进器）同属「只服务设置页控件」的一类。
 *
 * 三角占满 24 视图框的中段：高 11（up 的尖 4.5→15.5）、宽 18（3→21），
 * 与 rows / grid / focus 那一族的墨量同级；14px 渲染下尖与底边都仍可辨。
 * up / down 是**精确镜像**（绕 y=10 翻转），两颗视觉重量相同。
 */
export function triangleSvg(dir: 'up' | 'down', size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  // 实心路径：填色不描边（stroke=none），颜色由 CSS 的 color 经 currentColor 给，
  // 激活 / 悬停换色与线稿图标同一条路。
  path.setAttribute('stroke', 'none')
  path.setAttribute('d', dir === 'up' ? 'M12 4.5 21 15.5H3Z' : 'M12 19.5 3 8.5h18Z')
  svg.append(path)
  return svg
}

/**
 * StepFun 品牌标（配色方案卡专用）：黑圆 + 白色阶梯像素。
 *
 * 形状取自官方标（stepfun.com/step_favicon.svg，viewBox 0 0 20 20）：一个满圆 +
 * 五枚 3.65 见方的方块，从左下一级级阶到右上一级——「阶跃」二字说得就是它。
 * 官方标是白圆白块（给深色浏览器 UI 当 favicon 用的反色版），这里反过来：
 * 圆取 `currentColor`（色卡名称行自己的墨色），块取白——每张色卡各自穿着
 * 自己那套配色，这枚标在任何一张上都是「深圆 + 白阶梯」，读得清。
 *
 * 为什么不进 `ui/icons` 的 PATHS：同 triangleSvg——PATHS 的键即「用户可配置的
 * 语义图标」，会整片进「图标」卡的选择器网格；这枚只是 StepFun 方案的私标，
 * 没有语义、也不该进那个网格。它只服务设置页配色方案卡的名称行
 * （fields.ts 的 schemePicker），别处要用了再说。
 */
export function stepfunLogoSvg(size = 15): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('class', 'momo-set-scheme-logo')
  svg.setAttribute('aria-hidden', 'true')
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  circle.setAttribute('fill', 'currentColor')
  circle.setAttribute('d', 'M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0Z')
  svg.append(circle)
  // 五枚阶梯方块：左下一枚、中列三枚、右上一枚（与官方标逐格同坐标）
  const steps: ReadonlyArray<readonly [string, string]> = [
    ['3.65', '12.69'],
    ['8.17', '12.69'],
    ['8.17', '8.17'],
    ['8.17', '3.66'],
    ['12.69', '3.65'],
  ]
  for (const [x, y] of steps) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', x)
    rect.setAttribute('y', y)
    rect.setAttribute('width', '3.65')
    rect.setAttribute('height', '3.65')
    rect.setAttribute('fill', '#ffffff')
    svg.append(rect)
  }
  return svg
}

/**
 * radiogroup / tablist 的方向键导航（WAI-ARIA 的 roving tabindex 模式）：
 * 左右 / 上下在组内**循环**移动焦点并直接选中——radio 的箭头即选择，tab 的
 * 箭头即切换，都不需要再多按一次 Enter（WAI-ARIA 对这两种模式都推荐自动激活）。
 *
 * Tab 键仍然只在「当前选中项」进出：其余项的 tabindex=-1 由各控件的 paint()
 * 维护（这里只管焦点移动与触发），所以 Tab 一次进组就落在选中项上，不会逐格停。
 * 鼠标党不受影响：click 走各控件自己的监听，跟这条路径无关。
 */
export function arrowNav(
  group: HTMLElement,
  itemSelector: string,
  onPick: (el: HTMLButtonElement) => void,
): void {
  group.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (
      ev.key !== 'ArrowLeft' &&
      ev.key !== 'ArrowRight' &&
      ev.key !== 'ArrowUp' &&
      ev.key !== 'ArrowDown'
    ) {
      return
    }
    const list = Array.from(group.querySelectorAll<HTMLButtonElement>(itemSelector))
    const idx = list.indexOf(document.activeElement as HTMLButtonElement)
    if (idx < 0) return
    ev.preventDefault()
    const dir = ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1
    const next = list[(idx + dir + list.length) % list.length]
    next.focus()
    onPick(next)
  })
}
