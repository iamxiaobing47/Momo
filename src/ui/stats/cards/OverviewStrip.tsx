import { copy } from '../../../momo/i18n'
import { useUi } from '../../store'
import type { MomoStats } from '../../../momo/stats'
import { pct } from '../format'
import { OverviewCell, CardHead } from '../cells'

/**
 * 状态解读层（② 记录概览条）：页面家具而非数据卡——不占 StatsSections 的键
 * （四组编译守卫要求每个键都归组，而概览横跨全部四组）。
 * 五格：本周节奏（带 vs 上周对照与下钻）/ 连续记录 / 记录天数占比 /
 * 高峰时段 / 周末。连续记录是「正在进行的状态」而不是子集，不可点。
 */
export function OverviewStrip({ stats, onWeek }: { stats: MomoStats; onWeek?: () => void }) {
  const weekUp = stats.weekCount > stats.weekPrevCount
  const weekDown = stats.weekCount < stats.weekPrevCount
  const peak = stats.profile.peakHour
  const peakCount = peak !== null ? stats.hourlyCounts[peak] ?? 0 : 0
  const weekendVsWeekday = stats.profile.weekendVsWeekday
  const filterByHours = useUi((s) => s.filterByHours)
  const filterByWeekdays = useUi((s) => s.filterByWeekdays)
  const ov = copy.statsPage.overview
  const streakSub =
    stats.streak > 0
      ? ov.streakOngoing
      : stats.currentGapDays > 0
        ? ov.streakBroken(stats.currentGapDays)
        : ov.streakToday
  return (
    <section className="momo-stats-card momo-ov">
      <CardHead title={ov.title} />
      <div className="momo-ov-grid">
        <OverviewCell
          label={ov.weekRhythm}
          num={`+${stats.weekCount}`}
          unit={copy.common.unit.note}
          sub={ov.weekVsPrev({ arrow: weekUp ? '↑' : weekDown ? '↓' : '→', prev: stats.weekPrevCount })}
          tone={weekUp ? 'up' : weekDown ? 'down' : 'flat'}
          onDrill={onWeek}
        />
        <OverviewCell
          label={ov.streak}
          num={stats.streak}
          unit={copy.common.unit.day}
          sub={streakSub}
          tone={stats.streak > 0 ? 'up' : 'flat'}
        />
        <OverviewCell
          label={ov.activeRatio}
          num={pct(stats.activeDayRatio)}
          sub={
            stats.windowDays > 0
              ? ov.activeRatioSub({ days: stats.activeDays, windowDays: stats.windowDays })
              : '—'
          }
        />
        <OverviewCell
          label={ov.peakHours}
          num={peak !== null ? peak : '—'}
          unit={peak !== null ? copy.common.unit.hour : undefined}
          sub={peakCount > 0 ? ov.peakSub(peakCount) : ov.noRecords}
          onDrill={peak !== null ? () => filterByHours([peak]) : undefined}
        />
        <OverviewCell
          label={ov.weekend}
          num={pct(stats.profile.weekendRatio)}
          sub={
            weekendVsWeekday === null
              ? ov.weekendNoSample
              : weekendVsWeekday > 1.1
                ? ov.weekendMore
                : weekendVsWeekday < 0.9
                  ? ov.weekdayMore
                  : ov.weekendSame
          }
          tone={weekendVsWeekday === null ? 'plain' : weekendVsWeekday > 1.1 ? 'up' : weekendVsWeekday < 0.9 ? 'down' : 'flat'}
          onDrill={() => filterByWeekdays([5, 6])}
        />
      </div>
    </section>
  )
}
