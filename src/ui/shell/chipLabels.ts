import { copy } from '../../momo/i18n'

// 筛选条胶囊的文案（v0.7.0 统计页下钻维度）。 hour / weekday / 区间三类各自
// 「压缩成区间，零散的就罗列」——三处同一套思路，纯函数不依赖 store，可单独测。

/** 小时集 → 「22 点」/「0–5 点」/「9/14/20 点」：连续段压缩成区间，零散的就罗列 */
export function hourChipLabel(hours: readonly number[]): string {
  const hs = [...hours].sort((a, b) => a - b)
  if (hs.length === 1) return copy.date.hour(hs[0]!)
  const contiguous = hs.every((h, i) => i === 0 || h === hs[i - 1]! + 1)
  return contiguous ? copy.date.hourRange(hs[0]!, hs[hs.length - 1]!) : copy.date.hourList(hs.join('/'))
}

/** 星期集（0=周一…6=周日）→ 「周二」/「周末」/「周二/周四」 */
export function weekdayChipLabel(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 2 && sorted[0] === 5 && sorted[1] === 6) return copy.date.weekend
  return sorted.map((d) => copy.date.weekdayMonFirst[d] ?? '').join('/')
}

/** 闭区间 → 「301–800 字」/「≥ 801 字」/「≤ 50 字」；上界用 Infinity 表「以上」 */
export function rangeChipLabel(range: { min: number; max: number }, unit: string): string {
  const r = copy.panel.chip.range
  const open = !Number.isFinite(range.max)
  if (range.min <= 0 && !open) return r.atMost(range.max, unit)
  if (open) return r.atLeast(range.min, unit)
  return r.between(range.min, range.max, unit)
}
