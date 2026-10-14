import { memo, useCallback, useMemo, useRef } from 'react'
import { dayOfCached, useUi } from '../store'
import { copy } from '../../momo/i18n'
import { monthWindowEnd, monthWindowStart, parseDay } from '../../momo/dates'
import { buildWeeks, levelClass, pickMonthLabels, type HeatCell } from '../../momo/dates'
import { heatTipText, HeatTip, useCellSize, useHeatTip, type HeatTipApi } from '../kit'
import { useTodayKey } from '../hooks/useTodayKey'
import { moveDayGridFocus } from './dayGridNav'

// 活跃度热力图（concept-momo-heatmap）：
// 滚动窗口月数可配（prefs.heatmapMonths，1–12，默认 1）：窗口 = 含当月在内 N 个
// **完整的自然月**——起点是 N 个月前的 1 号、终点是当月最后一天（2026-10-09 用户
// 要求「选 1 个月就完整展示当月的格子」；旧口径终点是今天，月初只画得出几天）。
// N=1 时副标题写「当前月份」，N≥2 写「最近 N 个月」。
// 色度 = 当日 Momo 条数；点击某日 → 加入列表的日期筛选（v0.5.1 起支持**多选**，
// 再点同一日移除；多日之间为并集，命中任一即显示）。
// 列宽 = min(侧栏可视宽 / 列数, 20px)：月数多时列自己收窄铺满，月数少时封顶居中、
// 不无限放大（1 个月窗口下格子 ≈15.6px，与正文字号相称）。月份标签按**实测列宽**
// 挑显示（pickMonthLabels：同列折叠 + 从右往左按最小间距贪心，当月永留）——
// 旧口径「按 idx 奇偶一律隔月」在 3 个月窗口下会留下只覆盖窗口起点那一月的
// 「6月」、又把当月「9月」跳掉（2026-09-30 用户报障）。
// 格子悬浮出「日期 · 条数」提示（kit/HeatCellTip，与统计页日历共用）。

function HeatmapImpl() {
  const mode = useUi((s) => s.mode)
  const entries = useUi((s) => s.entries)
  const trash = useUi((s) => s.trash)
  const filterDates = useUi((s) => s.filterDates)
  const toggleFilterDate = useUi((s) => s.toggleFilterDate)
  const setSearch = useUi((s) => s.setSearch)
  const windowMonths = useUi((s) => s.heatmapMonths)

  const scrollRef = useRef<HTMLDivElement>(null)
  const tip = useHeatTip()

  // 语料跟着模式走（v0.9.26）：回收站页的热力图画的是**回收站条目**的活跃度。
  // 它是筛选入口而不是统计口径——点某一天筛的就是主区那批卡片，所以画的必须是
  // 同一批。否则回收站里点热力图只能点到「列表有条、回收站没有」的日子，
  // Deleted notes 的日期反倒点不着（那正是「活跃度里不再跳转」的另一半）。
  const trashEntries = useMemo(() => trash.map((t) => t.entry), [trash])
  const corpus = mode === 'trash' ? trashEntries : entries

  const byDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of corpus) {
      const d = dayOfCached(e)
      map.set(d, (map.get(d) ?? 0) + 1)
    }
    return map
  }, [corpus])

  // D-12：热力图窗口的「今天」取自 useTodayKey，不再在 memo 内部现取
  // `new Date()`——旧写法依赖里没有今天，面板跨天时窗口终点与「未来」格判定停在
  // 挂载那天（跨年更明显：去年的格子全被判成未来 / 过去都不更新）。
  const today = useTodayKey()
  const { weeks, monthLabels } = useMemo(() => {
    // 终点 = **当月最后一天**（2026-10-09 用户要求「选 1 个月就完整展示当月」：
    // 旧口径终点是今天，10 月 9 日看过去窗口只有 9 天、两三列，读不出「这个月」
    // 的形状）。N=1 铺满一张当月日历，N=2 是当月 + 前一月两张，以此类推。
    const end = monthWindowEnd(parseDay(today))
    // 起点 = 含当月 N 个自然月的 1 号（N = prefs.heatmapMonths）：2026-10-01、
    // N=3 时窗口是 8/1 → 10/31，正好铺 8/9/10 三个月，不会横跨 4 个自然月
    // （旧口径「N 个月前的今天」落到 7/1，首月只露一天——2026-10-01 用户报障
    // 「活跃度显示最近三个月，但实际显示了四个月」）。列 = 周、首列按星期几补空位。
    const start = monthWindowStart(end, windowMonths)
    return buildWeeks(start, end, byDay)
  }, [byDay, windowMonths, today])

  // 列宽实测（与 CSS 两侧同源）：ResizeObserver 跟随面板拖宽 / 侧栏显隐 / 月数变化。
  // max: 20 必须与 .momo-heat-month / .momo-heat-week 的 max-width: 20px 同值——
  // 旧 bug（v0.9.x）正是两张皮：JS 按未夹的 45.8px 判「全显」、CSS 却把列压回 18px，
  // 「8月」「9月」两盒相邻、文字溢出相叠。
  // colPx 只用来折算月份标签能留几个（最小间距 ÷ 列宽 = 最少隔几列）——周列本身是
  // width: colPct% 的百分比铺法，列间没有 gap，所以 gap: 0。
  const cols = Math.max(1, weeks.length)
  const colPct = 100 / cols
  const colPx = useCellSize(scrollRef, cols, { min: 0, max: 20, gap: 0, initial: 13 })

  // 月份标签：同列折叠（起点落在上个月尾巴时，只露一两格的界外月让位给当月）
  // + 从右往左按最小间距贪心（当月永留，放不下先丢最旧的月）。口径、为什么不再
  // 「一律隔月」写在 momo/dates/heatWeeks.ts 的 pickMonthLabels 上，单测在那文件里。
  const labelByCol = useMemo(() => pickMonthLabels(monthLabels, colPx), [monthLabels, colPx])

  const pickDay = useCallback(
    (day: string) => {
      const isAdding = !filterDates.includes(day)
      toggleFilterDate(day)
      // 新增某日当作一次新的筛选意图，清掉搜索词；移除已有日期不动搜索
      if (isAdding) setSearch('')
    },
    [filterDates, toggleFilterDate, setSearch],
  )

  return (
    <div className="momo-heatmap">
      <div className="momo-heat-head">
        <span className="momo-sidebar-title">{copy.heatmap.title}</span>
        <span className="momo-heat-range">{copy.heatmap.range(windowMonths)}</span>
      </div>
      <div className="momo-heat-scroll" ref={scrollRef}>
        <div className="momo-heat-months">
          {weeks.map((_, i) => (
            <div key={i} className="momo-heat-month" style={{ width: `${colPct}%` }}>
              {labelByCol.get(i) ?? ''}
            </div>
          ))}
        </div>
        <HeatGrid
          weeks={weeks}
          colPct={colPct}
          today={today}
          filterDates={filterDates}
          pickDay={pickDay}
          show={tip.show}
          hide={tip.hide}
        />
      </div>
      <HeatTip tip={tip.tip} />
    </div>
  )
}

interface HeatGridProps {
  weeks: HeatCell[][]
  colPct: number
  /** 今天的日期键：晚于它的格子是未来格（当月铺满到月末后网格里才有） */
  today: string
  filterDates: readonly string[]
  pickDay: (day: string) => void
  show: HeatTipApi['show']
  hide: HeatTipApi['hide']
}

/**
 * 格子矩阵（BUG-61）：hover 提示的 state 由外层 HeatmapImpl 持有，这里抽成 memo 的
 * 子组件——tip 状态一变只重渲外层与 HeatTip portal，91 个格子的元素树与内联闭包
 * 不再逐格重建。pickDay 也 useCallback 了，hover 期间 props 全部保持同引用。
 */
const HeatGrid = memo(function HeatGrid({
  weeks,
  colPct,
  today,
  filterDates,
  pickDay,
  show,
  hide,
}: HeatGridProps): React.JSX.Element {
  return (
    <div className="momo-heat-grid">
      {weeks.map((week, wi) => (
        <div key={wi} className="momo-heat-week" style={{ width: `${colPct}%` }}>
          {week.map((cell, ci) => {
            if (!cell.date) {
              return <div key={ci} className="momo-heat-cell momo-heat-empty" />
            }
            // 未来格（key > today）：窗口铺满到当月末后，今天之后的日子也在网格里。
            // 与统计页活跃度日历同一契约（CalendarGrid + stats-calendar-future 用例）：
            // 不可点、不进 Tab 序列、不出悬浮提示——点未来日只会筛出一张空列表，
            // 用户看到的就是「点了没反应」。色阶与「未来」正交：预写 / 定时到未来
            // 的条目在这一格照样按条数上色，不凭空消失。
            const future = cell.key > today
            return (
              <div
                key={ci}
                className={`momo-heat-cell ${future ? 'momo-heat-future ' : ''}${levelClass(cell.count)} ${
                  filterDates.includes(cell.key) ? 'momo-heat-selected' : ''
                }`}
                {...(future
                  ? {}
                  : {
                      // BUG-82b：侧栏活跃度的格子改可聚焦的 div（role=button + tabIndex 0
                      // + Enter/Space）。旧实现是裸 div + onClick——市面上几乎唯一一处
                      // 「完全键盘空心区」。不改 <button>：这会重置浏览器默认样式并把
                      // 卡片 DOM 契（dom-snapshot 的 sidebar / stats）带崩；div + ARIA
                      // 一样可达，颜色契约只活在 .momo-heat-cell（30+ 条用例钉着它）。
                      // BUG-109d 起方向键接共享的 dayGridNav（与统计页日历同一份语义）：
                      // 90 多格全在 Tab 序列里时逐格 Tab 根本走不动，方向键才是主路。
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': heatTipText(cell.key, cell.count),
                      'aria-pressed': filterDates.includes(cell.key),
                      onClick: () => pickDay(cell.key),
                      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (moveDayGridFocus(e.currentTarget, e.key)) {
                          e.preventDefault()
                          return
                        }
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        pickDay(cell.key)
                      },
                      onMouseOver: (e: React.MouseEvent<HTMLDivElement>) => show(cell.key, cell.count, e.currentTarget),
                      onMouseOut: hide,
                    })}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
})

// memo（v0.5.3 性能）：无 props，App 的每次渲染都不再连带重渲热力图。
export const Heatmap = memo(HeatmapImpl)
