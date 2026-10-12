import { copy } from '../../momo/i18n'

// 活跃度日历的卡头（自 StatsHeatmap.tsx 拆出）：标题 + 年份胶囊 + 翻页箭头。
// v0.7.4 起卡头只留这两样（yearTotal / yearActiveDays 随口径小字一起退役了），
// 且库内数据只有一个年份时收起翻页箭头——两个 disabled 按钮摆在那里更像坏了，
// 不像「没有可翻的」；年份胶囊保留，它回答「看的是哪年」。
// 年份 state 留在 StatsHeatmap：翻到边界要影响 buildWeeks 的 useMemo。

export interface CalendarHeadProps {
  /** 当前展示的自然年 */
  year: number
  /** 库内最早一年（左边界，过了就不许再往前翻） */
  earliestYear: number
  /** 今年（右边界） */
  thisYear: number
  /** 是否跨了多个年份：单年份没有可翻的页，箭头整组收起 */
  multiYear: boolean
  /** 翻到某一年（StatsHeatmap → setYear） */
  onYear: (year: number) => void
}

export function CalendarHead({
  year,
  earliestYear,
  thisYear,
  multiYear,
  onYear,
}: CalendarHeadProps): React.JSX.Element {
  return (
    <div className="momo-card-head">
      <span className="momo-card-title">{copy.heatmap.calendarTitle}</span>
      {/* BUG-125e：日历按全库画整年、不吃顶栏范围——与同页其余全库口径的卡一样挂「全库」标记
          （v0.7.4 M2 立它正为修「顶栏范围不影响哪些卡不可见」），否则「近 90 天」下读作这 90 天 */}
      <span className="momo-card-pill">{copy.common.allLibrary}</span>
      <span className="momo-cal-nav">
        {multiYear && (
          <button
            className="momo-cal-arrow"
            aria-label={copy.heatmap.prevYear}
            disabled={year <= earliestYear}
            onClick={() => onYear(year - 1)}
          >
            ‹
          </button>
        )}
        <span className="momo-card-pill">{year}</span>
        {multiYear && (
          <button
            className="momo-cal-arrow"
            aria-label={copy.heatmap.nextYear}
            disabled={year >= thisYear}
            onClick={() => onYear(year + 1)}
          >
            ›
          </button>
        )}
      </span>
    </div>
  )
}
