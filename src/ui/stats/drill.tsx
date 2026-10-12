// 下钻 class：可点元素的视觉暗示（cursor + hover 底色），由 .momo-drill 提供
export const DRILL = 'momo-drill'

/**
 * 交互范式与活跃度日历的格子一致：div + aria-label + onClick + role/tabIndex/键盘触发。
 * `drillProps` 只负责「可点」那部分属性，className 由调用方自己拼（布局类名不动）。
 * 没有回调时返回空对象——调用方照常展开，不可点的格子少一个 class 就行。
 *
 * v0.9.2：说明文字从原生 `title` 改为 `aria-label`。原生 title 是浏览器的兜底产物，
 * 黑底白字 tooltip 体验差：悬停约 1 秒才弹出（统计页格子小而密，鼠标扫过时排队
 * 弹出又消失，纯噪音）、固定黑底白字与 accent 体系割裂、出现在鼠标处盖住旁边的
 * 柱子数字、贴面板边缘被窗口裁掉、键盘聚焦不显示、触屏失效。这里延续 v0.6.7
 *「卡内口径小字全删」与 v0.9.0「口径长句不再进 hover」的同一条口径：视觉层只留
 * 手型 + hover 底色（40-stats.css `.momo-drill`），挑不挑明「点了会发生什么」
 * 退到 aria-label 只给读屏软件。
 * BUG-212（2026-10-12）：v0.9.2 这步只换了一半——Obsidian 对 aria-label 一样弹
 * 黑底气泡（body 上委托 pointerover[aria-label]），长句每根柱子都弹。现在
 * `.momo-drill` 带 `--no-tooltip: true`（Obsidian 源码：getComputedStyle 取该变量
 * trim() === "true" 即跳过），「只给读屏软件」这才真正成立；守卫见
 * scripts/aria-tooltip-css.test.mts。stats-render.test.mts 的子串断言不依赖属性名，
 * 不受影响。
 */
/** 可点元素的交互属性（v0.9.2 起带键盘触发）；空实现 = 不可点 */
export interface DrillProps {
  'aria-label'?: string
  onClick?: () => void
  role?: 'button'
  tabIndex?: number
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export function drillProps(label: string, onDrill: (() => void) | undefined): DrillProps {
  if (!onDrill) return {}
  return {
    'aria-label': label,
    onClick: onDrill,
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onDrill()
      }
    },
  }
}
