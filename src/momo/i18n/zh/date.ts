/**
 * 日期与时间口径的文案。
 *
 * 抽出来的直接动因：星期名此前在**四处各写一份**（dateGroups 的 WEEKDAY_NAMES、
 * stats.ts 的 WEEKDAY_LABELS、Stats.tsx 的 WEEKDAY_SHORT、StatsHeatmap 的 WEEKDAY_ROWS），
 * 而且下标起点各不相同（周日开头 / 周一开头 / 单字 / 全称）。这里按「起点 + 粒度」
 * 分开放，谁用哪份一目了然，别再各自 new 一个数组。
 */
export const date = {
  /** 周一开头、全称：`['周一', … '周日']`（stats.ts 的星期分布轴） */
  weekdayMonFirst: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  /** 周日开头、全称：`['周日', '周一', …]`（与 JS `getDay()` 同下标） */
  weekdaySunFirst: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  /** 周一开头、单字（统计页紧凑轴） */
  weekdayCharMonFirst: ['一', '二', '三', '四', '五', '六', '日'],
  /** 周日开头、单字（热力图左侧行标） */
  weekdayCharSunFirst: ['日', '一', '二', '三', '四', '五', '六'],
  /** 时段档名（凌晨 0–5 / 上午 6–11 / 下午 12–17 / 晚上 18–23） */
  hourBucket: ['凌晨', '上午', '下午', '晚上'],
  weekend: '周末',

  /** `2026-09-19 · 周五`（列表分组标题） */
  groupTitle: (dayKey: string, weekday: string): string => (weekday ? `${dayKey} · ${weekday}` : dayKey),
  /** `2026 年 9 月`（热力图年份/月度轴） */
  yearMonth: (year: number, month: number): string => `${year} 年 ${month} 月`,
  /** `9 月` */
  month: (month: number): string => `${month} 月`,
  /** `9/19` 这类「月/日」短标签 */
  monthDay: (month: number, day: number): string => `${month}月${day}日`,
  /** `14 点`（时段筛选 chip） */
  hour: (hour: number): string => `${hour} 点`,
  /** `14–18 点`（时段区间） */
  hourRange: (from: number, to: number): string => `${from}–${to} 点`,
  /** `9/14/20 点`（不连续的时段罗列） */
  hourList: (list: string): string => `${list} 点`,

  /** `9/14 周`（趋势按周时的报告标签与页面 label 同口径） */
  weekPoint: (month: number, day: number): string => `${month}/${day} 周`,

  /** 相对日期（回顾页头部） */
  today: '今天',
  yesterday: '昨天',
  daysAgo: (days: number): string => `${days} 天前`,
  /** 未来日期（预写 / 定时条目，BUG-125c）：`3 天后`——别并进「今天」 */
  daysLater: (days: number): string => `${days} 天后`,
  monthsAgo: (months: number): string => `${months} 个月前`,
  yearsAgo: (years: number): string => `${years} 年前`,
}
