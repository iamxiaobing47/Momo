/**
 * Activity heatmap (sidebar rolling window) + stats-page activity calendar.
 * Same data, same color scale, so one copy serves both.
 */
export const heatmap = {
  /** Sidebar section title */
  title: 'Activity',
  /**
   * Sidebar subtitle: `Last 3 months`. With months === 1 it reads `Current month` —
   * the window covers the whole current month, so "Last 1 month" (a partial stub of
   * a month) no longer matches what is on screen.
   */
  range: (months: number): string => (months === 1 ? 'Current month' : `Last ${months} months`),
  /** Stats page card title */
  calendarTitle: 'Activity calendar',
  prevYear: 'Previous year',
  nextYear: 'Next year',
  /** Color scale legend ends */
  less: 'Less',
  more: 'More',
  /** Cell hover tip: `Sep 28 · 3 notes` (date + that day's count) */
  tip: (monthDay: string, count: number): string => `${monthDay} · ${count} notes`,
}
