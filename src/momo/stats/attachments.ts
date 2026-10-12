import type { MomoEntry } from '../types'
import { hasImageMarkdown } from '../tags'
import { localDay, monthWindowStart, pad2, parseDay, startOfToday } from '../dates'
import type { AttachmentStats } from './types'
import { STATS_TREND_MONTHS } from './constants'

// v0.6.0 扩展维度（第二梯队 / 第三梯队；v0.6.3 裁掉共现 Top 与标签健康检查）。
// v0.6.9 裁掉字数深度（`MonthDepth` / `computeMonthDepth`）：「单篇越来越长还是越来越短」
// 由内容质量四格（平均 / 中位 / 长记录占比）与字数分布回答，月度双线是同一批数字的
// 时间切片——且月条目一少，均值就被单篇长文带飞，读不出趋势只读出噪音。

/**
 * 附件统计（需要附件文件列表，由 service 层传入）。
 * 输入两份：条目正文（数「几条 Momo 带图」）与附件目录清单（数总量 / 体积 / 月度趋势）——
 * 两边的键不同（正文 vs 文件），必须分开传，别想从一边推出另一边。
 *
 * `now` 可注入（BUG-111c 同族）：趋势窗口的「本月」是唯一吃墙钟的分量，传进来
 * 才测得住；调用方（store/refresh.ts）把**同一次**读钟同时用作缓存键与窗口——
 * 否则跨午夜那一瞬，「今天」与「本月」可能落在两天的两侧。
 */
export function computeAttachmentStats(
  entries: readonly MomoEntry[],
  attachmentFiles: { path: string; size: number; mtime: number }[],
  now: Date = new Date(),
): AttachmentStats {
  const today = localDay(startOfToday(now))
  const curMonth = today.slice(0, 7)
  let entriesWithImages = 0
  const monthGroups = new Map<string, { count: number; bytes: number }>()
  let total = 0
  let totalBytes = 0
  for (const f of attachmentFiles) {
    const d = new Date(f.mtime)
    const month = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    // 未来不进统计（BUG-112c，与 BUG-72 / BUG-96 同一把尺）：未来月的附件从
    // total / totalBytes / monthGroups 三处一并排除——旧实现只在趋势窗口收口，
    // 未来月文件计入总数却不落进任何桶（趋势合计 ≠ 总数），全未来时
    // earliestMonth 还会把窗口推到循环终点之后、趋势整段空白。闸门在**月**粒度：
    // 当月内「今天之后几天」的 mtime 只是几天的时钟偏差，照常计入。
    // （'YYYY-MM' 定宽 → 字典序即时间序，与 statsWindow 的日期键比较同口径。）
    if (month > curMonth) continue
    const cur = monthGroups.get(month) ?? { count: 0, bytes: 0 }
    cur.count++
    cur.bytes += f.size
    monthGroups.set(month, cur)
    total += 1
    totalBytes += f.size
  }
  for (const e of entries) {
    if (hasImageMarkdown(e.content)) entriesWithImages++
  }
  const curMonthStart = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1)
  let trendStart = monthWindowStart(curMonthStart, STATS_TREND_MONTHS)
  const earliestMonth = [...monthGroups.keys()].sort()[0]
  if (earliestMonth) {
    const earliestStart = parseDay(`${earliestMonth}-01`)
    if (earliestStart > trendStart) trendStart = earliestStart
  }
  const monthlyTrend: { month: string; count: number; bytes: number }[] = []
  for (let m = new Date(trendStart); m <= curMonthStart; m.setMonth(m.getMonth() + 1)) {
    const month = localDay(m).slice(0, 7)
    const cur = monthGroups.get(month) ?? { count: 0, bytes: 0 }
    monthlyTrend.push({ month, count: cur.count, bytes: cur.bytes })
  }
  return { total, totalBytes, entriesWithImages, monthlyTrend }
}
