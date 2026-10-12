// 统计页入口（barrel）。页面组合在 StatsPage.tsx，卡片按 STATS_GROUPS 的四个
// 语义域放在 cards/，图表在 charts.tsx，「一格」级零件在 cells.tsx。
//
// 数据口径全在 momo/stats/（ADR-005）：本目录只做展示，不做任何统计计算——
// 唯一的例外是趋势点「展示化」（把粒度语义翻译成 label / title），那是纯文案映射。

export { StatsPage } from './StatsPage'
export { RangeEditor } from './RangeEditor'
