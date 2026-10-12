import { copy } from '../../../momo/i18n'
import type { MomoStats } from '../../../momo/stats'
import { ActiveRing, Sparkline } from '../charts'
import { KpiCard } from '../cells'

/**
 * 规模层（① 核心指标行，四组之外）：主数字 44px，总笔记带累计走势曲线。
 * 三张卡：总笔记（曲线 + 最长字数副行）/ 标签（平均每条）/ 记录天数（30 天活跃环）。
 * v0.7.5 C1 起最长字数挂在总笔记卡副行：它是「平均 / 中位」可想象的上界，
 * 与内容质量卡同口径不同视角。
 * 三张共用 KpiCard 一个壳（P1 收敛）：差异全走 props——head 右侧放 delta / 图标
 * （headExtra），曲线进 children 位，活跃环进 foot。
 */
export function KpiRow({ stats }: { stats: MomoStats }) {
  return (
    <section className="momo-row momo-row-kpi">
      <KpiCard
        lead
        name={copy.statsPage.kpi.total}
        headExtra={<span className="momo-kpi-delta">{copy.statsPage.kpi.last30(stats.last30Count)}</span>}
        value={stats.total}
        unit={copy.common.unit.note}
        foot={
          // 最长字数（v0.7.5 C1）：规模层的极值锚点——「最长 2519 字」给
          // 「平均 134 / 中位 68」一个可想象的上界，与内容质量卡同口径不同视角
          <div className="momo-kpi-foot">{copy.statsPage.kpi.maxLength(stats.maxLength)}</div>
        }
      >
        <Sparkline values={stats.daily30} />
      </KpiCard>

      <KpiCard
        name={copy.statsPage.kpi.tags}
        headExtra={
          <svg className="momo-kpi-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8.6 1.8H13a1.2 1.2 0 0 1 1.2 1.2v4.4a1.2 1.2 0 0 1-.35.85l-6.2 6.2a1.2 1.2 0 0 1-1.7 0L2.35 11.2a1.2 1.2 0 0 1 0-1.7l6.2-6.2a1.2 1.2 0 0 1 .85-.35Z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <circle cx="11" cy="5" r="1.15" fill="currentColor" />
          </svg>
        }
        value={stats.tagCount}
        unit={copy.common.unit.item}
        foot={<div className="momo-kpi-foot">{copy.statsPage.kpi.avgTags(stats.avgTagsPerEntry)}</div>}
      />

      <KpiCard
        name={copy.statsPage.kpi.activeDays}
        headExtra={
          <svg className="momo-kpi-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.2 6.6h11.6M5.4 2v2.6M10.6 2v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        }
        value={stats.activeDays}
        unit={copy.common.unit.day}
        foot={
          <div className="momo-kpi-foot momo-kpi-ring">
            <ActiveRing days={stats.last30ActiveDays} total={30} />
            <span className="momo-ring-cap">
              {copy.statsPage.kpi.active30Label}
              <em>{copy.statsPage.kpi.active30Value(stats.last30ActiveDays)}</em>
            </span>
          </div>
        }
      />
    </section>
  )
}
