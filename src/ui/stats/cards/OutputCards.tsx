import { copy } from '../../../momo/i18n'
import { STATS_LONG_NOTE_CHARS, type MomoStats } from '../../../momo/stats'
import { pct } from '../format'
import { QualityCell } from '../cells'
import type { StatsDrill } from '../types'

// ① 我的产出（`output` 组）：内容质量。范围内口径。
// （年度目标卡 v0.6.0 建、v0.7.4 加类型可选，本轮用户裁决「统计页面里去掉年度目标」
//   整卡移除，设置里配套的两行配置一并删除。）

/** 内容质量卡：四格 + 竖分隔。
 *  v0.7.0 起两格可下钻：长记录占比 → ≥ 200 字，无标签 → 无标签模式。 */
export function QualityCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  return (
    <section className="momo-stats-card momo-quality">
      <QualityCell label={copy.statsPage.quality.avg} num={stats.avgLength} unit={copy.common.unit.char} />
      <span className="momo-quality-div" aria-hidden="true" />
      <QualityCell
        label={copy.statsPage.quality.median}
        num={stats.medianLength}
        unit={copy.common.unit.char}
      />
      <span className="momo-quality-div" aria-hidden="true" />
      <QualityCell
        label={copy.statsPage.quality.longRatio}
        num={pct(stats.longRatio)}
        hint={copy.statsPage.quality.longHint(STATS_LONG_NOTE_CHARS)}
        onDrill={() => drill.filterByLength(STATS_LONG_NOTE_CHARS, Number.MAX_SAFE_INTEGER)}
      />
      <span className="momo-quality-div" aria-hidden="true" />
      <QualityCell
        label={copy.statsPage.quality.untagged}
        num={stats.untaggedCount}
        unit={copy.common.unit.note}
        hint={pct(stats.untaggedRatio)}
        onDrill={() => drill.filterUntagged()}
      />
    </section>
  )
}
