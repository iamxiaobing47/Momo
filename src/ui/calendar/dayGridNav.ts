/**
 * 「一日类格子」网格的方向键导航（BUG-109d）：侧栏热力图（Heatmap）与统计页
 * 日历（CalendarGrid）共用。两处网格 DOM 同形：容器（.momo-heat-grid /
 * .momo-cal-grid）> 周列（.momo-heat-week / .momo-cal-week）> 每列最多 7 格
 * （.momo-heat-cell，列内顺序 = 周日…周六，与星期行同口径）。
 *
 * 语义：←→ = 相邻周列的同一天（跨周同类日）；↑↓ = 前后一天，跨列自动续行
 * （周日 ↑ 落上周六、周六 ↓ 落下周日）。不可点的格子（补白 .momo-heat-empty /
 * 两处网格的未来格 .momo-cal-future 与 .momo-heat-future）与点击口径一致——
 * 键盘也不停上去；直接候选不可达时停在原地。
 *
 * 纯 DOM 走位、直接 focus()，不经 React state：焦点移动是浏览器的本职，
 * 组件只在 keydown 里调一次。返回值 = 这个键是否被本助手消费（方向键即使
 * 没移动也消费，拦住页面对方向键的滚动），调用方据此 preventDefault。
 */

const STEPS: Readonly<Record<string, { week: -1 | 0 | 1; day: -1 | 0 | 1 }>> = {
  ArrowLeft: { week: -1, day: 0 },
  ArrowRight: { week: 1, day: 0 },
  ArrowUp: { week: 0, day: -1 },
  ArrowDown: { week: 0, day: 1 },
}

/** 不可点的格子不进键盘序列（与 onClick 缺席同一口径） */
function isFocusableCell(el: Element | undefined): el is HTMLElement {
  return (
    el !== undefined &&
    !el.classList.contains('momo-heat-empty') &&
    // 两处网格各有一族未来格：统计页日历 .momo-cal-future（BUG-125b）、侧栏热力图
    // .momo-heat-future（2026-10-09 窗口铺满到当月末后才有）。它们没有 tabindex，
    // focus() 上去也是落空——焦点凭空消失，之后所有方向键都不再有声。
    !el.classList.contains('momo-cal-future') &&
    !el.classList.contains('momo-heat-future')
  )
}

export function moveDayGridFocus(from: HTMLElement, key: string): boolean {
  const step = STEPS[key]
  if (step === undefined) return false

  const week = from.parentElement
  const grid = week?.parentElement ?? null
  if (week === null || grid === null) return true

  const weeks = Array.from(grid.children)
  const wi = weeks.indexOf(week)
  const cells = Array.from(week.children)
  const ci = cells.indexOf(from)
  if (wi < 0 || ci < 0) return true

  let target: Element | undefined
  if (step.week !== 0) {
    target = weeks[wi + step.week]?.children[ci]
  } else if (step.day === -1) {
    const prev = weeks[wi - 1]
    target = ci > 0 ? cells[ci - 1] : prev?.children[prev.children.length - 1]
  } else {
    target = ci < cells.length - 1 ? cells[ci + 1] : weeks[wi + 1]?.children[0]
  }

  if (isFocusableCell(target)) target.focus()
  return true
}
