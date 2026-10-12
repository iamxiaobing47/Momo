// 统计页的数据模块入口（v0.4.17，ADR-005 本地确定性统计同口径）：
// 只读 Momo 投影派生数字，不联网、不写文件；`now` 可注入，便于测试。
// 日期口径与热力图 / 洞察一致：`dayKey`（本地日历日，工单 WO-1）。
// 连续记录 / 本周 / 本月直接复用 `insightsFromDays`（与侧栏洞察曾用的同一套口径，
// 一处定义；insights.ts 的 UI 区块已于 v0.4.8 移入统计页，纯逻辑保留）。
//
// 时间范围（v0.4.17，用户裁决「全部维度都要」；v0.5.4 增自定义区间）：
// - `range` 只作用于**数数**的卡片：累计 / 记录习惯（含本周 / 上月对照、近 30 天活跃率、
//   星期与时段分布）——「近 90 天的我是什么样」。
// - 月度趋势 / 标签 lifecycle / 里程碑是**全史**概念（首末次出现、绝对总量），
//   永远按全部历史算，不受 range 影响；UI 卡片标题会注明「全库」。
// - `custom` = 用户自选的双闭区间 [from, to]（`YYYY-MM-DD` 本地日期键）；
//   与 90d / ytd 同一套筛选口径，只是起止不由今天反推。
//
// 不做什么（两轮用户裁决，都是「裁掉讲重复故事的维度」）：
// - v0.6.4「去掉同比」：不再产出任何「后半程 vs 前半程」的百分比变化角标。理由是它对
//   单窗口任意切分——窗口短、条目少时一个 +200% 只是「上周写了 1 条、这周写了 3 条」，
//   读起来像趋势其实是噪音；方向性判断交给本周 / 上月这类固定自然窗口的**绝对值**对照
//   （insights 的 week / month）。
// - v0.6.5「去掉记录间隔」：平均间隔 / 最长断更 / 间隔分布五档整体移除（`GapStats` 一并
//   删除）——「规律还是随机」已经由连续记录、最长连续、热力图疏密讲了三遍，五档分布是
//   第四遍。只留 `currentGapDays`（多久没写了）：它是概览条「已断更 N 天」的供数，
//   一个数、一张卡都占不到。
//
// v0.7.3（数据体检四项 P0，2026-09-21 统计页优化分析报告；对 420 条真实 Momo 审计后发现
// 66% 来自单日一次性导入，全部「习惯」指标被那一天绑架）：
// - 单日集中度 `maxDayShare`：最高单日条数 ÷ 总条数。占比高 = 这个库被一次性导入 /
//   单日爆发主导，高峰时段 / 星期峰值 / 月度峰值都先别读——一个数让污染可见。
// - 记录天数占比 `activeDayRatio`（分母 `windowDays`）：活跃日 ÷ 当前窗口日历天。
//   比连续记录温和的存在感指标：不惩罚中断、只累计出现。
// - 回顾节奏（`computeReviewCoverage` 的 `recent7` / `recent30` / `oldestUnreviewedDays`）：
//   `reviewSeen` 的值本就是 ISO 时间串（回顾时写 `new Date().toISOString()`），
//   此前只被当布尔用——「最近还在回看吗、旧笔记积压多老」一直都在数据里，没人算。
//
// v0.7.5（同报告 6.3 清理四项）：
// - C1 死字段清理：`longCount` / `range` 不再暴露（算了没人要）。`maxLength` 挂上
//   总笔记卡副行、`firstDay` 挂上里程碑卡脚注，各有着落。
// - C4 行为维度曾补进「导出报告」的 Markdown 摘要，并为此给 `TagLifecycle` 加了
//   `newTagCount` / `coldTagCount`（页面列表是 Top 5 截断的，报告不能拿截断长度充总数）。
//   本轮用户裁决移除统计页三颗导出按钮（导出报告 / 导出笔记 / 复制统计报告），
//   报告链整条删除，这两个只服务报告的精确计数随之从接口上退场——照 C1 的规矩，
//   算了没人要的字段不许留着。
//
// 文件划分（拆模块后各段去处）：
// - `types.ts`     产物形状（一个字节都不落盘，ADR-003）
// - `constants.ts` 阈值与分档定义（页面 / compute / 设置面板共用）
// - `window.ts`    日期键折算 + per-entry 预折叠 + 统计窗口
// - `scalars.ts`   窗口数数标量 + 范围展示名
// - `milestones.ts` 档位表与「下一个」
// - `compute.ts`   主函数（一遍主循环 + 全库维度组装）
// - `coverage.ts` 回顾覆盖率 / 节奏
// - `attachments.ts` 附件统计

export type {
  AttachmentStats,
  BestDay,
  ColdLocRank,
  ColdTagRank,
  LocLifecycle,
  LocRank,
  LocStats,
  MomoStats,
  HabitProfile,
  LongNote,
  Milestone,
  ReviewCoverage,
  StatsRange,
  TagLifecycle,
  TagRank,
  TrendGranularity,
  TrendPoint,
} from './types'

export {
  CHAR_BIN_UPPER,
  STATS_COLD_DAYS,
  STATS_LIFECYCLE_TOP,
  STATS_LOC_RANK_TOP,
  STATS_LONG_NOTE_CHARS,
  STATS_NEW_TAG_DAYS,
  STATS_TREND_MONTHS,
  STATS_WEEK_TREND_DAYS,
} from './constants'

export { computeStats } from './compute'
export { computeAttachmentStats } from './attachments'
export { computeReviewCoverage } from './coverage'
export { statsDrillDays, shiftDayCalls, resetShiftDayCalls } from './window'
