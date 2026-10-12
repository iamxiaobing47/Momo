/**
 * 活跃度热力图（侧栏滚动窗口）+ 统计页活跃度日历（自然年）共用。
 * 两者的数据与色阶本就是同一套口径（见 StatsHeatmap.tsx 顶部注释），文案没理由各写一份。
 */
export const heatmap = {
  /** 侧栏区块标题 */
  title: '活跃度',
  /**
   * 侧栏副标题：`最近 3 个月`。1 个月时写 `当前月份`——窗口铺满的是整个当月
   * （2026-10-09 用户要求「选 1 个月就完整展示当月的格子」），「最近 1 个月」
   * 读起来像只有一段残月，与屏幕上那一整张月份格子对不上。
   */
  range: (months: number): string => (months === 1 ? '当前月份' : `最近 ${months} 个月`),
  /** 统计页卡片标题 */
  calendarTitle: '活跃度日历',
  prevYear: '上一年',
  nextYear: '下一年',
  /** 色阶图例两端 */
  less: '少',
  more: '多',
  /** 格子悬浮提示：`9月28日 · 3 条`（日期 + 当日条数） */
  tip: (monthDay: string, count: number): string => `${monthDay} · ${count} 条`,
}
