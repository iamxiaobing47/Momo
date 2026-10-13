import { copy } from '../../../momo/i18n'
import { CHAR_BIN_UPPER, type AttachmentStats, type MomoStats, type ReviewCoverage } from '../../../momo/stats'
import { binWidth, formatBytes, pct } from '../format'
import { CardHead, DistRow, HabitCell, StatsFoot, SubSection } from '../cells'
import { Card } from '../../card'
import { TrendBars } from '../charts'
import type { StatsDrill } from '../types'

// ④ 内容与回顾（`content` 组）：字数分布 + 回顾 + 最长笔记 + 附件。

/** 字数分布（v0.5.3 新维度）：按正文字符数分五档。
 *  v0.7.0 起每档可下钻：按该档的字数闭区间筛（CHAR_BIN_UPPER 同口径）。 */
export function LengthDistCard({ stats, drill }: { stats: MomoStats; drill: StatsDrill }) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.lengthDist} />
      <div className="momo-statbars">
        {stats.charBins.map((count, i) => {
          const min = i === 0 ? 0 : CHAR_BIN_UPPER[i - 1] + 1
          const max = i === CHAR_BIN_UPPER.length ? Number.MAX_SAFE_INTEGER : CHAR_BIN_UPPER[i]
          const label = copy.meta.charBin[i] ?? ''
          return (
            <DistRow
              key={label}
              label={label}
              count={count}
              width={binWidth(count, stats.charBins)}
              drillLabel={copy.statsPage.drill.label(label)}
              onDrill={() => drill.filterByLength(min, max)}
            />
          )
        })}
      </div>
    </article>
  )
}

/**
 * 回顾（v0.6.0 建卡时叫「回顾覆盖率」，v0.7.3 扩容后更名「回顾」）：
 *  回顾节奏为主（近 7 / 30 天回顾条数、最久未回顾天数）——「最近还在回看吗」
 *  比静态覆盖率更能推动下一步；已回顾 / 未回顾 / 覆盖率退为副格。
 *  四格可下钻：已回顾 / 未回顾两格筛「回顾批次里展示过 / 没展示过」，
 *  近 30 / 近 7 天两格筛「那个时间窗里回顾过的」。
 *
 *  v0.9.37：节奏三格此前点了没反应（同属一个网格，用户无从分辨哪格能点）。实测后
 *  **只接前两格**，第三格维持不可点：
 *    近 30 天回顾 → filterByReviewed('recent30')：近 30 天内回顾过的 ✅ D-03 成立
 *    近 7 天回顾  → filterByReviewed('recent7')：近 7 天内回顾过的  ✅ D-03 成立
 *    最久未回顾  → 不可点 ❌ D-03 破口
 *  最后一格为什么接不上：它写的是「最久 N 天未回顾」——**单位是天、值是极值**，
 *  而筛选维度只给得出「条数」。实测（4 条库 / 1 条已回顾）格子写 90 天、点未回顾
 *  全档看到 3 条，数字对不上、单位也对不上。「极值没有对应子集」是**不可点**的
 *  理由，不能反过来当成「那就下钻到全档」的理由——那只是把一个无效跳转接上。
 *  「覆盖率」同样不可点：比例聚合值，没有对应子集。
 *  前两格计数为 0 时不给回调：点了必然是空列表，与日历未来格同一类无效跳转。
 */
export function ReviewCoverageCard({
  reviewCoverage,
  drill,
}: {
  reviewCoverage: ReviewCoverage
  drill: StatsDrill
}) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.review} pills={[copy.common.allLibrary]} />
      <div className="momo-habit-grid">
        <HabitCell
          name={copy.statsPage.review.recent30}
          num={reviewCoverage.recent30}
          unit={copy.common.unit.note}
          onDrill={reviewCoverage.recent30 > 0 ? () => drill.filterByReviewed('recent30') : undefined}
        />
        <HabitCell
          name={copy.statsPage.review.recent7}
          num={reviewCoverage.recent7}
          unit={copy.common.unit.note}
          onDrill={reviewCoverage.recent7 > 0 ? () => drill.filterByReviewed('recent7') : undefined}
        />
        <HabitCell
          name={copy.statsPage.review.oldest}
          num={reviewCoverage.oldestUnreviewedDays}
          unit={copy.common.unit.day}
          // 刻意**不可点**（v0.9.37 实测裁决）：这格写的是「最久 N 天未回顾」——
          // 单位是**天数**、值是极值，而可下的钻只给得出「条数」。实测（种子 4 条 /
          // 1 条已回顾）：格子写 90 天，点「未回顾」全档看到 3 条，数字与单位都对不上，
          // 正是 D-03 禁止的「点下去看到的和格子上写的不是一回事」。
          // 「极值没有对应子集」是**不可点**的理由，不是给它硬凑一个下钻的理由——
          // 下轮若要给它动作，正确形态是「定位到那一条」（跳列表 + 滚到最旧那条 + 高亮），
          // 那是一条新机制（reveal 到具体条目），不是筛选维度的下钻。
        />
        <HabitCell
          name={copy.statsPage.review.reviewed}
          num={reviewCoverage.reviewed}
          unit={copy.common.unit.note}
          onDrill={() => drill.filterByReviewed('reviewed')}
        />
        <HabitCell
          name={copy.statsPage.review.unreviewed}
          num={reviewCoverage.unreviewed}
          unit={copy.common.unit.note}
          strong
          onDrill={() => drill.filterByReviewed('unreviewed')}
        />
        <HabitCell name={copy.statsPage.review.coverage} num={pct(reviewCoverage.ratio)} />
      </div>
    </article>
  )
}

/**
 * 最长笔记 Top 3（v0.6.3 起「记录之最」只留这一半）：「最高产的一天 Top 3」
 * 与习惯网格的「最高产的一天」、热力图的疏密是同一件事的三遍展示，裁掉；
 * 最长笔记不重复——它是平均 / 中位字数之外的极值样本，指向「哪篇值得回看」。
 *
 * v0.7.4 起每条可点 = **在 Obsidian 里打开这一条**（不是筛列表）：极值样本的
 * 下一步动作是「读它」，补上 v0.7.0 下钻哲学漏掉的最后一块。
 * 2026-10-01 用户反馈「和主页面正常渲染的卡片不一致」→ **改用主页面上那张真卡片**
 * （`ui/card/Card`）渲染，只加两条限制（用户同期裁决）：
 *   ① 正文只露前三行（标题升格照常；字数仍按全篇算，见 Card 的 `previewLines`）；
 *   ② 只读预览：无操作行、无右键菜单，点正文即在 Obsidian 打开（`preview`）。
 * 在此之前这里自己拼了一张 `.momo-record-card` 伪卡（标题 + 前 100 字摘要），
 * 两套渲染路径各写一遍，于是主页面卡片一改版面就漂移——就是用户看见的不一致。
 */
export function RecordsCard({ stats }: { stats: MomoStats }) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.records} />
      {stats.longestNotes.length === 0 ? (
        <StatsFoot>{copy.statsPage.records.empty}</StatsFoot>
      ) : (
        <div className="momo-record-cards">
          {stats.longestNotes.map((entry) => (
            <Card key={entry.path} entry={entry} preview previewLines={3} />
          ))}
        </div>
      )}
    </article>
  )
}

/**
 * 附件统计（v0.6.0，全库口径）。
 * `entryCount` 传的是**全库条目数**（不是范围口径的 stats.total）：附件占比的分母
 * 是「库里有多少条 Momo」，与附件清单同为全库口径，混用范围数会让占比忽大忽小。
 * 附件统计没有下钻（全库清单没有筛选口径），所以是本页唯一一份纯展示的趋势柱——
 * 传 `peak={false}`（峰值深一档是记录趋势的口径）。N12 的「高度只依赖一个 max」
 * 由 TrendBars 内部一次 `Math.max` 保证。
 */
export function AttachmentsCard({
  entryCount,
  attachmentStats,
  brand,
}: {
  entryCount: number
  attachmentStats: AttachmentStats
  brand: string
}) {
  return (
    <article className="momo-stats-card">
      <CardHead title={copy.statsPage.cardTitle.attachments} pills={[copy.common.allLibrary]} />
      <div className="momo-habit-grid">
        <HabitCell name={copy.statsPage.attachments.total} num={attachmentStats.total} unit={copy.common.unit.item} />
        <HabitCell name={copy.statsPage.attachments.totalBytes} num={formatBytes(attachmentStats.totalBytes)} />
        <HabitCell
          name={copy.statsPage.attachments.entriesWithImages(brand)}
          num={attachmentStats.entriesWithImages}
          unit={copy.common.unit.note}
        />
        <HabitCell name={copy.statsPage.attachments.imageRatio} num={entryCount ? pct(attachmentStats.entriesWithImages / entryCount) : '0%'} />
      </div>
      {attachmentStats.monthlyTrend.length > 0 && (
        <>
          <SubSection>{copy.statsPage.subSection.attachmentTrend}</SubSection>
          <TrendBars
            points={attachmentStats.monthlyTrend.map((m) => ({ key: m.month, count: m.count, drillLabel: '', days: [] }))}
            peak={false}
            zeroHeight="6%"
          />
        </>
      )}
    </article>
  )
}
