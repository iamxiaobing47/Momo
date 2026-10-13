import { copy } from '../../../momo/i18n'
import type { MomoStats } from '../../../momo/stats'
import { DRILL, drillProps } from '../drill'
import { binWidth, pct } from '../format'
import { CardHead, DistRow, StatsFoot, SubSection } from '../cells'
import type { StatsDrill } from '../types'

// ③ 标签体系（`tagSystem` 组）：标签生命周期 + 标签数分布。

/**
 * 标签生命周期（全库）：纯展示（v0.5.3 起不提供下钻）。
 * v0.6.8 起「标签排行」卡移除（用户裁决「标签排行，去掉」）——侧栏标签树每层都带
 * chip 数字、点一下就能按标签筛，统计页再列一份 Top 10 是同一件事的第三遍展示；
 * 本卡因此从「标签行」的一半变成独立一张，`momo-row-tags` 两列布局随卡片一起退役。
 * v0.7.1 起 `computeStats.topTags` 也删了——它最后一个消费者（年度回忆卡片的
 * 「最常用标签」）随那颗按钮一起移除，`buildTagTree(scoped)` 整棵没人用了。
 */
export function LifecycleCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  const { lifecycle } = stats
  const totalTags = lifecycle.singleUseTotal
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.lifecycle} pills={[copy.common.allLibrary]} />
      {totalTags === 0 ? (
        <StatsFoot>{copy.statsPage.tagLife.noTags}</StatsFoot>
      ) : (
        <>
          <SubSection>{copy.statsPage.subSection.newTags}</SubSection>
          <div className="momo-life-chips">
            {lifecycle.newTags.length === 0 ? (
              <span className="momo-life-none">{copy.statsPage.tagLife.newNone}</span>
            ) : (
              lifecycle.newTags.map((t) => (
                <span
                  key={t.key}
                  className={`momo-pill ${DRILL}`}
                  {...drillProps(copy.statsPage.drill.tag(t.displayPath), () => drill.filterByTag(t.key))}
                >
                  #{t.displayPath} ×{t.count}
                </span>
              ))
            )}
          </div>
          <SubSection gap>{copy.statsPage.subSection.coldTags}</SubSection>
          {lifecycle.coldTags.length === 0 ? (
            <span className="momo-life-none">{copy.statsPage.tagLife.coldNone}</span>
          ) : (
            <div className="momo-insights">
              {lifecycle.coldTags.map((t) => (
                <div
                  key={t.key}
                  className={`momo-life-btn ${DRILL}`}
                  {...drillProps(copy.statsPage.drill.tag(t.displayPath), () => drill.filterByTag(t.key))}
                >
                  <span className="momo-insight-label">#{t.displayPath}</span>
                  <span className="momo-insight-value">
                    {copy.statsPage.tagLife.coldValue({ count: t.count, days: t.days })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="momo-insights momo-sub-sec-gap">
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.tagLife.singleUse}</span>
              <span className="momo-insight-value">
                {copy.statsPage.tagLife.singleUseValue({
                  count: lifecycle.singleUseCount,
                  total: totalTags,
                  ratio: pct(totalTags ? lifecycle.singleUseCount / totalTags : 0),
                })}
              </span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.tagLife.top3}</span>
              <span className="momo-insight-value">{pct(lifecycle.top3Share)}</span>
            </div>
          </div>
        </>
      )}
    </article>
  )
}

/** 标签数分布（v0.5.3 新维度）：每条 Momo 的标签个数。
 *  v0.7.0 起每档可下钻：0 个走「无标签」模式，其余按个数闭区间筛。 */
export function TagDistCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.tagDist} />
      <div className="momo-statbars">
        {stats.tagCountBuckets.map((count, i) => {
          // 与 stats.ts 的分档口径一致：0 / 1 / 2 / ≥3（按身份键去重后）
          const min = i === 3 ? 3 : i
          const max = i === 3 ? Number.MAX_SAFE_INTEGER : i
          const drillFn = i === 0 ? () => drill.filterUntagged() : () => drill.filterByTagCount(min, max)
          const label = copy.meta.tagCountBin[i]
          return (
            <DistRow
              key={label}
              label={label}
              count={count}
              width={binWidth(count, stats.tagCountBuckets)}
              drillLabel={i === 0 ? copy.statsPage.drill.untagged : copy.statsPage.drill.tagCountBin(label)}
              onDrill={drillFn}
            />
          )
        })}
      </div>
    </article>
  )
}
