import type { MomoEntry } from '../types'
import { compareTimeKey, dayKey, localDay, pad2 } from '../dates'

// 随机回顾的五档抽取（concept-momo-review）：
// - random    ：纯随机一批（历史行为）
// - week      ：一周未看——上次展示 ≥7 天前（或从没展示过），洗牌取 N
// - month     ：一月未看——上次展示 ≥30 天前（或从没展示过），洗牌取 N
// - stale     ：优先推「很久没回顾过」的（按 lastShown 升序，从没回顾过的排最前）
// - onthisday ：往年今日（同月同日、年份更早）
// 纯函数、不 import obsidian —— ui/ 与 momo/ 都能用；`now` 可注入，便于测试。
// 日期一律走 `dayKey`（本地日历日，与文件名一致；见工单 WO-1）。

export type ReviewMode = 'random' | 'week' | 'month' | 'stale' | 'onthisday'

/** 每批条数（各档一致的批大小） */
export const REVIEW_SIZE = 10

/** 「一周 / 一月未看」两档的回看窗口（天） */
const MODE_MIN_DAYS: Partial<Record<ReviewMode, number>> = { week: 7, month: 30 }

/** 无放回洗牌（返回新数组，不改动入参） */
function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 从池子里抽一批回顾条目。
 * `seen` = 路径 → 上次展示时间（ISO），被 stale 排序、被 week / month 当过滤门槛；
 * 缺失即「从没回顾过」（对所有档都视为「该看了」）。
 */
export function pickReview(
  pool: readonly MomoEntry[],
  mode: ReviewMode,
  seen: Record<string, string> = {},
  size = REVIEW_SIZE,
  now: Date = new Date(),
): MomoEntry[] {
  if (mode === 'onthisday') {
    const md = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    const year = now.getFullYear()
    return pool
      .filter((e) => {
        const d = dayKey(e.createdAt)
        return d.slice(5) === md && Number(d.slice(0, 4)) < year
      })
      // 越近的年份排越前（「去年今日」第一时间看到）
      .sort((a, b) => compareTimeKey(b.createdAt, a.createdAt))
      .slice(0, size)
  }

  if (mode === 'stale') {
    // 从没展示过的（seen 缺失 → ''）排最前；同为空时按 createdAt 升序（先补老的）。
    // 两列都是定宽时间串，走 compareTimeKey（字典序 = 时间序，且比 localeCompare 快）
    return [...pool]
      .sort((a, b) => {
        const sa = seen[a.path] ?? ''
        const sb = seen[b.path] ?? ''
        return compareTimeKey(sa, sb) || compareTimeKey(a.createdAt, b.createdAt)
      })
      .slice(0, size)
  }

  const minDays = MODE_MIN_DAYS[mode]
  if (minDays !== undefined) {
    // 一周 / 一月未看：只留「够久没展示」的（从没展示过的也算），窗口内再洗牌。
    // 窗口按**本地日历日**算（setDate 回退 + 日期键比较），不做毫秒除法：D-06 同款
    // 理由——夏令时那天不是 24 小时，除法在边界上差一天，且「同一天早些时刻展示过」
    // 会被误判成还没看够 N 天（now=15:00、7 天前 20:00 展示过时漏推）。与 tagFilter
    // 的 timeCutoff、stats 的 30/90 天窗口同一个口径（工单 WO-1）。
    // 比的是**日期键**（dayKey(shown) <= T−minDays），不是「早于 T−minDays 的 00:00」：
    // 后者只放进 ≤ T−minDays−1 的条目，恰好 N 天前那一天整个被漏掉。
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    start.setDate(start.getDate() - minDays)
    const cutoffDay = localDay(start)
    return shuffle(
      pool.filter((e) => {
        const shown = seen[e.path]
        if (!shown) return true
        // 时间串只折算一次（BUG-60）：旧实现 new Date(shown) 之后又调 dayKey(shown)
        // （内部再 new Date 一遍）。损坏的时间串（脏 reviewSeen / 旧版本遗留）只算
        // 「回顾过」、不进窗口；一并判成「该看了」，否则条目永远抽不回来且没有任何报错。
        const d = new Date(shown)
        return Number.isNaN(d.getTime()) || localDay(d) <= cutoffDay
      }),
    ).slice(0, size)
  }
  return shuffle(pool).slice(0, size)
}
