import { copy } from '../../../momo/i18n'
import type { MomoStats } from '../../../momo/stats'
import { StatsHeatmap } from '../../calendar/StatsHeatmap'
import { HourBars, TrendBars, WeekdayBars } from '../charts'
import { CardHead, HabitCell, MilestoneRow, StatsFoot, SubSection } from '../cells'
import { pct } from '../format'
import type { StatsDrill, TrendBarPoint } from '../types'

// ② 记录节奏（`rhythm` 组）：活跃度日历 + 趋势行 + 习惯与里程碑行。
// 本组横跨「范围内」（趋势 / 习惯）与「全库」（里程碑）两种口径，各自的卡片自己注明。

/** 活跃度日历（v0.5.4 新维度）：整年热力图，点格子 = 按日期筛选并跳列表（与侧栏热力图同数据同交互） */
export function HeatmapCard() {
  return (
    <section className="momo-stats-card">
      <StatsHeatmap />
    </section>
  )
}

/**
 * 趋势行（全库 / 范围内各一张）：v0.7.4 起趋势卡粒度自适应（跨度 < 60 天出周柱）。
 * 左卡 = 趋势点序列（峰值写进卡头 pill），右卡 = 记录时间（按小时 + 星期分布）。
 * v0.9.5：左卡每根趋势柱可点——带着「这一周 / 这一个月」的日期组跳回全部笔记
 * （与右卡的小时柱 / 星期柱、活跃度日历同一套下钻口径）。
 */
export function TrendRow({
  stats,
  trendPoints,
  trendPeak,
  trendLast,
  peakHourCount,
  peakIndex,
  hasHours,
  drill,
}: {
  stats: MomoStats
  trendPoints: readonly TrendBarPoint[]
  trendPeak: TrendBarPoint | undefined
  trendLast: TrendBarPoint | undefined
  peakHourCount: number
  peakIndex: number
  hasHours: boolean
  drill: StatsDrill
}) {
  return (
    <section className="momo-row momo-row-trend">
      <article className="momo-stats-card">
        <CardHead
          title={copy.statsPage.cardTitle.trend}
          pills={[
            copy.common.allLibrary,
            ...(trendPeak && trendPeak.count > 0
              ? [copy.statsPage.trend.peak({ label: trendPeak.label, count: trendPeak.count })]
              : []),
          ]}
        />
        <TrendBars points={trendPoints} onDrill={(days) => drill.filterByDates(days)} />
        <div className="momo-axis">
          <span>{trendPoints[0]?.label ?? ''}</span>
          <span>
            {trendLast
              ? stats.trendGranularity === 'week'
                ? copy.statsPage.trend.lastWeek(trendLast.label)
                : copy.statsPage.trend.lastMonth(trendLast.label)
              : ''}
          </span>
        </div>
      </article>

      <article className="momo-stats-card">
        <CardHead
          title={copy.statsPage.cardTitle.time}
          pills={
            hasHours
              ? [copy.statsPage.trend.peakHour({ hour: peakIndex, count: peakHourCount })]
              : undefined
          }
        />
        <HourBars counts={stats.hourlyCounts} />
        <div className="momo-axis">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </div>
        <SubSection>{copy.statsPage.subSection.weekdayDist}</SubSection>
        <WeekdayBars counts={stats.weekdayCounts} />
      </article>
    </section>
  )
}

/**
 * 习惯与里程碑行（范围内 / 全库）：记录间隔卡 v0.6.5 已裁，本行固定两张卡。
 * v0.7.5 C2：网格删「本周新增」（概览条本周节奏已有，带 vs 上周对照与下钻）与
 * 「最近 30 天」（总笔记卡 +N 30天 胶囊已有，与曲线终点同源）——一屏两现的
 * 数字不留；保留「本月新增」（唯一位置）。8 格 → 6 格，信息零损失。
 */
export function HabitsRow({
  stats,
  monthDays,
  drill,
}: {
  stats: MomoStats
  /** 「本月新增」下钻要打的日期组（与格子上的数字同窗口，见 StatsPage 注释）；
   *  空数组 = 当前统计范围不覆盖本月，格子退化为纯展示（D-03 守卫） */
  monthDays: string[]
  drill: StatsDrill
}) {
  const notesCurrent = stats.notesMilestone
    ? stats.notesMilestone.target - stats.notesMilestone.remaining
    : 0
  const streakCurrent = stats.streakMilestone
    ? stats.streakMilestone.target - stats.streakMilestone.remaining
    : 0
  return (
    <section className="momo-row momo-row-habits">
      <article className="momo-stats-card">
        <CardHead title={copy.statsPage.cardTitle.habits} />
        <div className="momo-habit-grid">
          <HabitCell
            name={copy.statsPage.habits.currentStreak}
            num={stats.streak}
            unit={copy.common.unit.day}
            strong
          />
          <HabitCell
            name={copy.statsPage.habits.bestStreak}
            num={stats.bestStreak}
            unit={copy.common.unit.day}
          />
          <HabitCell
            name={copy.statsPage.habits.monthNew}
            num={`+${stats.monthCount}`}
            unit={copy.statsPage.habits.monthPrev(stats.monthPrevCount)}
            onDrill={monthDays.length > 0 ? () => drill.filterByDates(monthDays) : undefined}
          />
          <HabitCell
            name={copy.statsPage.habits.avgPerActiveDay}
            num={stats.avgPerActiveDay}
            unit={copy.common.unit.note}
          />
          <HabitCell
            name={
              stats.bestDay
                ? copy.statsPage.habits.bestDayOn(stats.bestDay.day.slice(5))
                : copy.statsPage.habits.bestDay
            }
            num={stats.bestDay ? stats.bestDay.count : 0}
            unit={copy.common.unit.note}
            onDrill={stats.bestDay ? () => drill.filterByDates([stats.bestDay!.day]) : undefined}
            /* 导入日标记（v0.7.5 C3）：单日集中度 > 50% 时，最高产的这一天是
               异常值而不是高产样本——pill 是数据标记不是提示语，与「全库」同款 */
            pill={
              stats.bestDay && stats.maxDayShare > 0.5 ? (
                <span className="momo-card-pill" style={{ marginLeft: 6 }}>
                  {copy.common.importDay}
                </span>
              ) : undefined
            }
          />
          {/* 单日集中度（v0.7.3）：与上一格配对读——「最高产的一天 N 条」是事实，
              这个比例是解释：占比高 = 库被一次性导入 / 单日爆发主导，本卡其余
              「习惯」读数都要先打折扣。聚合口径，不可点。 */}
          <HabitCell name={copy.statsPage.habits.maxDayShare} num={pct(stats.maxDayShare)} />
        </div>
      </article>

      <article className="momo-stats-card">
        <CardHead title={copy.statsPage.cardTitle.milestones} pills={[copy.common.allLibrary]} />
        {stats.notesMilestone || stats.streakMilestone ? (
          <div className="momo-ms-list">
            {stats.notesMilestone && (
              <MilestoneRow
                name={copy.statsPage.milestone.notes(stats.notesMilestone.target)}
                current={notesCurrent}
                target={stats.notesMilestone.target}
                remaining={stats.notesMilestone.remaining}
                unit={copy.common.unit.note}
                upcoming={stats.notesMilestone.upcoming}
              />
            )}
            {stats.streakMilestone && (
              <MilestoneRow
                name={copy.statsPage.milestone.streak(stats.streakMilestone.target)}
                current={streakCurrent}
                target={stats.streakMilestone.target}
                remaining={stats.streakMilestone.remaining}
                unit={copy.common.unit.day}
                upcoming={stats.streakMilestone.upcoming}
              />
            )}
          </div>
        ) : (
          <StatsFoot>{copy.statsPage.milestone.allDone}</StatsFoot>
        )}
        {/* 从 X 开始（v0.7.5 C1）：里程碑是「旅程」概念，脚注给出旅程起点——
            范围内最早有记录的一天（与连续行的范围口径一致；全部范围即库内首日） */}
        {stats.firstDay && (
          <StatsFoot>{copy.statsPage.milestone.since(stats.firstDay.slice(5))}</StatsFoot>
        )}
      </article>
    </section>
  )
}
