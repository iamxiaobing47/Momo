import { copy } from '../../../momo/i18n'
import { displayLocName } from '../../../momo/locations'
import type { MomoStats } from '../../../momo/stats'
import { DRILL, drillProps } from '../drill'
import { binWidth, pct } from '../format'
import { CardHead, DistRow, StatsFoot, SubSection } from '../cells'
import type { StatsDrill } from '../types'

// ⑤ 地点（`locations` 组，v0.9.33 新组）：足迹规模 / 地点排行 / 地点数分布 / 地点生命。
// 与 TagCards 的分层一一对应：tagCount + avgTagsPerEntry ↔ 足迹规模，标签数分布 ↔
// 地点数分布，生命周期 ↔ 地点生命（新开 / 冷掉 / 最近去过 + 一次性与集中度）。
//
// 下钻口径（用户拍板「复用地点那套筛选」；2026-10-01 晚地点模式撤除后落回列表）：
// 行级数字可点，回**全部笔记**并把该地点设成唯一的地点筛选（store.filterByLocation）
// ——与标签 / 日期那些下钻同一条路。足迹规模里的标量与地点数分布是**聚合口径**
// （不是某个地点子集），刻意不可点，与「平均 / 中位数字数不可点」同一条纪律。
//
// 屏幕上看见的地名一律过 `displayLocName`（2026-10-06「界面语言选英语后地点还是
// 中文」）：大洲 / 国家 / 名册城市按当前界面语言显示，用户手填认不出的词原样。
// **下钻回调仍递原始地名**——`filterByLocation` 收的是盘上那个字符串，显示层的
// 翻译不该渗进筛选键（存储不因语言变，见 locations/locDisplay.ts 文件头）。

/**
 * 足迹规模（范围口径）：五级标量 + 各大洲条数。空库（范围内零地点）走脚注空态，
 * 不摆五排 0——统计页的 0 行只有在别的卡都有数据时才有参照系。
 * 各大洲条数可下钻（洲名本身就是地点树的顶级节点）；查不到归属的地名不进这张表
 * （compute.ts 的 locations.ts：不造「未知大洲」占位）。
 */
export function LocScaleCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  const { loc } = stats
  const coverage = loc.continentCoverage
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.locScale} />
      {loc.locCount === 0 ? (
        <StatsFoot>{copy.statsPage.loc.empty}</StatsFoot>
      ) : (
        <>
          <div className="momo-insights">
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.scale.locCount}</span>
              <span className="momo-insight-value">{loc.locCount}</span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.scale.country}</span>
              <span className="momo-insight-value">{loc.countryCount}</span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.scale.continent}</span>
              <span className="momo-insight-value">{loc.continentCount}</span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.scale.avgLocs}</span>
              <span className="momo-insight-value">{loc.avgLocsPerEntry}</span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.scale.noLoc({ count: loc.noLocCount, ratio: pct(loc.noLocRatio) })}</span>
              <span className="momo-insight-value" />
            </div>
          </div>
          {coverage.length > 0 && (
            <>
              <SubSection gap>{copy.statsPage.subSection.continentCoverage}</SubSection>
              <div className="momo-statbars">
                {coverage.map((c) => {
                  // 洲名是这个维度的**显示名**（本地化），筛选键仍是盘上那个中文字符串
                  const name = displayLocName(c.location)
                  return (
                    <DistRow
                      key={c.location}
                      label={name}
                      count={c.count}
                      width={binWidth(c.count, coverage.map((x) => x.count))}
                      drillLabel={copy.statsPage.drill.location(name)}
                      onDrill={() => drill.filterByLocation(c.location)}
                    />
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </article>
  )
}

/**
 * 地点排行（范围口径）：Top N 地名。可下钻——点一行回全部笔记并筛出该地点。
 * 与侧栏「全部地点」树的信息重合是**有意的**（用户拍板全量维度）：那张树管
 * 「从哪儿筛」，这张卡回答「这段时间我都在哪」；行值只有条数，没有组头那种
 * 洲 · 国 · 地名全路径——路径归属由足迹规模的洲际覆盖与地点树各司其职。
 */
export function LocRankCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  const { topLocs } = stats.loc
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.locRank} />
      {topLocs.length === 0 ? (
        <StatsFoot>{copy.statsPage.loc.empty}</StatsFoot>
      ) : (
        <div className="momo-insights">
          {topLocs.map((t) => {
            const name = displayLocName(t.location)
            return (
              <div
                key={t.location}
                className={`momo-life-btn ${DRILL}`}
                {...drillProps(copy.statsPage.drill.location(name), () => drill.filterByLocation(t.location))}
              >
                <span className="momo-insight-label">{name}</span>
                <span className="momo-insight-value">{copy.statsPage.loc.rankValue(t.count)}</span>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

/**
 * 地点数分布（范围口径）：每条 Momo 身上带几个地点（0 / 1 / 2 / 3+）。
 * **不可下钻**：「2 个地点」不是某个地点子集，地点模式里没有对应节点——
 * 与「平均 / 中位字数不可点」同一条纪律。
 */
export function LocDistCard({ stats }: { stats: MomoStats }) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.locDist} />
      <div className="momo-statbars">
        {stats.loc.locCountBuckets.map((count, i) => (
          <DistRow
            key={i}
            label={copy.meta.locCountBin[i]!}
            count={count}
            width={binWidth(count, stats.loc.locCountBuckets)}
          />
        ))}
      </div>
    </article>
  )
}

/**
 * 地点生命（**全库**口径，与标签生命周期同纪律）：新开 / 冷掉 / 最近去过三段列表
 * + 一次性地点数与 Top 3 集中度。三段的行都可下钻（点地点跳地点模式选中它）。
 */
export function LocLifecycleCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  const { locLifecycle: life } = stats
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.locLifecycle} pills={[copy.common.allLibrary]} />
      {life.singleVisitTotal === 0 ? (
        <StatsFoot>{copy.statsPage.loc.empty}</StatsFoot>
      ) : (
        <>
          <SubSection>{copy.statsPage.subSection.newLocs}</SubSection>
          <div className="momo-life-chips">
            {life.newLocs.length === 0 ? (
              <span className="momo-life-none">{copy.statsPage.loc.life.newNone}</span>
            ) : (
              life.newLocs.map((t) => {
                const name = displayLocName(t.location)
                return (
                  <span
                    key={t.location}
                    className={`momo-pill ${DRILL}`}
                    {...drillProps(copy.statsPage.drill.location(name), () => drill.filterByLocation(t.location))}
                  >
                    {name} ×{t.count}
                  </span>
                )
              })
            )}
          </div>
          <SubSection gap>{copy.statsPage.subSection.coldLocs}</SubSection>
          {life.coldLocs.length === 0 ? (
            <span className="momo-life-none">{copy.statsPage.loc.life.coldNone}</span>
          ) : (
            <div className="momo-insights">
              {life.coldLocs.map((t) => {
                const name = displayLocName(t.location)
                return (
                  <div
                    key={t.location}
                    className={`momo-life-btn ${DRILL}`}
                    {...drillProps(copy.statsPage.drill.location(name), () => drill.filterByLocation(t.location))}
                  >
                    <span className="momo-insight-label">{name}</span>
                    <span className="momo-insight-value">
                      {copy.statsPage.loc.life.coldValue({ count: t.count, days: t.days })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <SubSection gap>{copy.statsPage.subSection.recentLocs}</SubSection>
          {life.recentLocs.length === 0 ? (
            <span className="momo-life-none">{copy.statsPage.loc.life.recentNone}</span>
          ) : (
            <div className="momo-life-chips">
              {life.recentLocs.map((t) => {
                const name = displayLocName(t.location)
                return (
                  <span
                    key={t.location}
                    className={`momo-pill ${DRILL}`}
                    {...drillProps(copy.statsPage.drill.location(name), () => drill.filterByLocation(t.location))}
                  >
                    {name} ×{t.count}
                  </span>
                )
              })}
            </div>
          )}
          <div className="momo-insights momo-sub-sec-gap">
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.life.singleVisit}</span>
              <span className="momo-insight-value">
                {copy.statsPage.loc.life.singleVisitValue({
                  count: life.singleVisitCount,
                  total: life.singleVisitTotal,
                  ratio: pct(life.singleVisitTotal ? life.singleVisitCount / life.singleVisitTotal : 0),
                })}
              </span>
            </div>
            <div className="momo-insight-row">
              <span className="momo-insight-label">{copy.statsPage.loc.life.top3}</span>
              <span className="momo-insight-value">{pct(life.top3Share)}</span>
            </div>
          </div>
        </>
      )}
    </article>
  )
}
