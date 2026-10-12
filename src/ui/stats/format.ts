import { copy } from '../../momo/i18n'
import { dayRange, localDay, parseDay } from '../../momo/dates'
import type { TrendGranularity } from '../../momo/stats'

// 统计页的纯格式化函数（无 JSX、无副作用）。页面卡片、趋势轴、报告共用同一份
// 口径——百分比几位小数、月份怎么写，只在这里决定一次。

/**
 * 一位小数的百分比（0–1 → '23%' / '23.5%'）。
 * 「有没有小数位」按**四舍五入后的差**判，不按 `Number.isInteger(v)`——`ratio * 100`
 * 是二进制浮点乘法，7/100 乘出来是 7.000000000000001、29/100 是 28.999999999999996，
 * 于是完全正常的整数比例被送进 `toFixed(1)`，统计卡上出现 `7.0%` / `29.0%`
 * 和 `70%` 并列（同一个数还会被 QualityCell 拼进 aria-label）。
 */
export function pct(ratio: number): string {
  const v = ratio * 100
  const rounded = Math.round(v)
  return `${Math.abs(v - rounded) < 1e-9 ? rounded : v.toFixed(1)}%`
}

/** `YYYY-MM` → `2026 年 9 月` */
export function monthAxis(month: string): string {
  return copy.date.yearMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))
}

/** `YYYY-MM` → `9 月` */
export function monthShort(month: string): string {
  return copy.date.month(Number(month.slice(5, 7)))
}

/**
 * 趋势柱覆盖的日期键（v0.9.5：记录趋势柱可下钻——点柱 = 按这组日期筛列表）。
 * 粒度语义与 `computeStats.trend` 同源：周粒度 `key` = 该周周一的 `YYYY-MM-DD`（7 天）；
 * 月粒度 `key` = `YYYY-MM`（当自然月，28–31 天）。
 *
 * BUG-181a：当期柱（本周 / 本月）的区间伸到未来时**钳到今天**——柱上的计数本来就排除
 * 未来（预写）条目（BUG-96），下钻列表必须同集合。旧注释的前提「未来日期匹配不到任何
 * 条目」不成立：预写条目正是未来日期，会多出卡片（柱写 5、点过去 6 张）。
 */
export function trendBarDays(key: string, granularity: TrendGranularity, today: string): string[] {
  if (granularity === 'week') {
    const monday = parseDay(key)
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
    const end = localDay(sunday) > today ? parseDay(today) : sunday
    return dayRange(monday, end)
  }
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const monthEnd = new Date(year, month, 0)
  const end = localDay(monthEnd) > today ? parseDay(today) : monthEnd
  return dayRange(new Date(year, month - 1, 1), end)
}

/** 字节单位档（升序；越界钳到末档，见 formatBytes） */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * 字节格式化。BUG-125d 两处：① 旧档表止于 GB、越界 `?? 'B'` 把索引越界咽成合法单位——
 * `1 TB` 显示成 `1 B`，少三个数量级却看不出异常；现在补到 PB、越界**钳到末档**。
 * ② 舍入进位：1048575 B = 1023.999 KB，toFixed(1) 进成 `1024 KB`；舍入后满一档就升一档。
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const last = BYTE_UNITS.length - 1
  let i = Math.min(last, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))))
  let v = Number((bytes / Math.pow(k, i)).toFixed(1))
  if (v >= k && i < last) {
    i += 1
    v = Number((bytes / Math.pow(k, i)).toFixed(1))
  }
  return `${v} ${BYTE_UNITS[i]}`
}

/**
 * 分布条宽度：以组内最大值为 100%（全 0 时全 0 宽），保底 4% 让 0 值也看得见轴线
 * ——字数分布与标签数分布两处同一口径。
 */
export function binWidth(count: number, bins: readonly number[]): number {
  const max = Math.max(...bins)
  return max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0
}
