/**
 * Date and time copy.
 *
 * Weekday names previously lived in four separate places with different
 * starting days and granularities; here they are grouped by "start + grain".
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const date = {
  /** Monday-first, full: stats weekday axis */
  weekdayMonFirst: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  /** Sunday-first, full: same indices as JS `getDay()` */
  weekdaySunFirst: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  /** Monday-first, single letters (compact stats axis) */
  weekdayCharMonFirst: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  /** Sunday-first, single letters (heatmap row labels) */
  weekdayCharSunFirst: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  /** Hour buckets (0–5 / 6–11 / 12–17 / 18–23) */
  hourBucket: ['Late night', 'Morning', 'Afternoon', 'Evening'],
  weekend: 'Weekend',

  /** `2026-09-19 · Fri` (list group titles) */
  groupTitle: (dayKey: string, weekday: string): string => (weekday ? `${dayKey} · ${weekday}` : dayKey),
  /** `Sep 2026` (heatmap year/month axis) */
  yearMonth: (year: number, month: number): string => `${MONTHS[month - 1] ?? month} ${year}`,
  /** `Sep` */
  month: (month: number): string => `${MONTHS[month - 1] ?? month}`,
  /** `Sep 19` short month-day label */
  monthDay: (month: number, day: number): string => `${MONTHS[month - 1] ?? month} ${day}`,
  /** `14:00` (hour filter chips) */
  hour: (hour: number): string => `${hour}:00`,
  /** `14:00–18:00` (hour ranges) */
  hourRange: (from: number, to: number): string => `${from}:00–${to}:00`,
  /** `9/14/20 h` (non-contiguous hour lists) */
  hourList: (list: string): string => `${list} h`,

  /** `wk of 9/14` (trend axis at week grain) */
  weekPoint: (month: number, day: number): string => `wk of ${month}/${day}`,

  /** Relative dates (review page header) */
  today: 'Today',
  yesterday: 'Yesterday',
  daysAgo: (days: number): string => `${days} days ago`,
  /** Future dates (pre-written / scheduled entries, BUG-125c) — never folded into "Today" */
  daysLater: (days: number): string => (days === 1 ? 'Tomorrow' : `In ${days} days`),
  monthsAgo: (months: number): string => `${months} months ago`,
  yearsAgo: (years: number): string => `${years} years ago`,
}
