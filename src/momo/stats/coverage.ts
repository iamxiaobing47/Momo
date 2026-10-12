import type { MomoEntry } from '../types'
import { dayWindowStart, localDay, startOfToday } from '../dates'
import type { ReviewCoverage } from './types'
import { dayDiff, safeDay } from './window'

/**
 * 回顾覆盖率（全库口径）。
 * v0.7.3 起同时输出「回顾节奏」：`reviewSeen` 的值本就是 ISO 时间串（回顾时写
 * `new Date().toISOString()`），此前只被当布尔用——近 7 / 30 天回顾条数与
 * 最久未回顾天数都由它派生，回答「最近还在回看吗、旧笔记积压多老」。
 * 只数**现存条目**的回顾（`reviewSeen` 里已删除 Momo 的登记不计），无效时间串
 * 只算「回顾过」、不进节奏窗口。
 */
/**
 * 近 7 / 30 天回顾窗的**单一真源**（Q5）：matched.ts 的 filterReviewed 两档与
 * `computeReviewCoverage` 的 recent7 / recent30 共用同一份构造——含今天、往前推
 * 6 / 29 天（dayWindowStart 的 DST 安全算法）。matched 侧曾自抄一份、注释自认
 * 「改一处必须改另一处」；T5 共享了原语，本函数把窗口集合也收成一份——
 * D-03「格子数字 = 列表条数」的契约从注释约束变成编译事实。
 */
export function recentReviewWindows(now: Date = new Date()): {
  /** 今天的本地日键（上界：时钟快了一天的「明天的回顾」不算） */
  todayStr: string
  /** 近 7 天的起始日键（含今天往前推 6 天） */
  recent7Start: string
  /** 近 30 天的起始日键（含今天往前推 29 天） */
  recent30Start: string
} {
  const today = startOfToday(now)
  const todayStr = localDay(today)
  return { todayStr, recent7Start: dayWindowStart(today, 6), recent30Start: dayWindowStart(today, 29) }
}

export function computeReviewCoverage(
  entries: readonly MomoEntry[],
  reviewSeen: Record<string, string>,
  now: Date = new Date(),
): ReviewCoverage {
  const total = entries.length
  const { todayStr, recent7Start: last7Start, recent30Start: last30Start } = recentReviewWindows(now)
  let reviewed = 0
  let recent7 = 0
  let recent30 = 0
  let oldestUnreviewed: string | null = null
  for (const e of entries) {
    const seenAt = reviewSeen[e.path]
    if (seenAt) {
      reviewed++
      const seenDay = safeDay(seenAt)
      if (seenDay) {
        // 上界 seenDay <= todayStr：时钟快了一天，「明天的回顾」不算进近 7/30 天
        // （BUG-26）。本文件下方 oldestUnreviewedDays 的 Math.max(0, …) 与
        // compute.ts 的 isFuture 都是这条口径——唯独这两处曾漏了上界。
        if (seenDay <= todayStr) {
          if (seenDay >= last30Start) recent30++
          if (seenDay >= last7Start) recent7++
        }
      }
      continue
    }
    // 未回顾：记下最早的一条（无效日期不进——与按天维度同口径）
    const day = safeDay(e.createdAt)
    if (day && (!oldestUnreviewed || day < oldestUnreviewed)) oldestUnreviewed = day
  }
  return {
    total,
    reviewed,
    unreviewed: total - reviewed,
    ratio: total > 0 ? reviewed / total : 0,
    recent7,
    recent30,
    // 与 compute.ts 里「距今天数」的同类计算同样夹一次：dayDiff 是 round(a−b)，
    // 最旧未回顾条目若是未来日期（时钟偏移）时算出负数，「最久 N 天未回顾」不能是负的。
    oldestUnreviewedDays: oldestUnreviewed ? Math.max(0, dayDiff(todayStr, oldestUnreviewed)) : 0,
  }
}
