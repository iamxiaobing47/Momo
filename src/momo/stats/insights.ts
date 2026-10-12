import { localDay, parseDay, startOfToday, startOfWeek } from '../dates'

// 聚合洞察（ADR-005 本地智能第 2 项）：全部是**确定性统计**，纯本地、不联网、零依赖。
// 只读 Momo 内容与标签产出派生数字，不写任何文件；`now` 可注入，便于测试。
//
// 口径：
// - 日期键一律走 `dayKey`（本地日历日，与文件名一致；见工单 WO-1）。
// - 「连续记录」从今天往回数；今天还没写就从昨天起算（写日记的人白天看不该掉到 0）。
//   今天和昨天都没有记录 → 0。
// - 「本周」= 本周一 00:00 起到今天（本地日历日）；「本月」= 与今天同 `YYYY-MM`。
//
// 2026-09-19（用户裁决）：**去掉「常同行」标签对**。共现索引本身保留在
// `momo/tags/cooccur.ts`，继续服务「添加标签」弹层的候选建议排序（tags/derived.ts 的 `cooccurrenceOf`）。

export interface Insights {
  /** 连续记录天数 */
  streak: number
  /** 本周新增条数 */
  weekCount: number
  /** 本月新增条数 */
  monthCount: number
}

/**
 * 由**日期键序列**直接算洞察（P04：日期键只折算一次）。
 * `stats.ts` 已为每个 entry 一次性折算好 `dayKey`，直接喂进来，
 * 避免这里再历一遍 `new Date(createdAt)`。这是本模块唯一的生产入口——
 * 曾经还有个「收 entries 自己折算」的 `computeInsights` 包装，零生产调用方，
 * 2026-10-11 删掉（R5）：死入口还会逼着四处注释反复解释「为什么不走它」。
 */
export function insightsFromDays(days: Iterable<string>, now: Date = new Date()): Insights {
  const today = startOfToday(now)
  const todayStr = localDay(today)
  const weekStart = startOfWeek(now)
  // 本周窗口比较走**日期键字典序**：定宽 ASCII 下字典序即时间序（statsWindow 的
  // `day >= win.from` 同一口径）。旧实现给每条目 parseDay 建一个 Date 只为比大小——
  // P04 之后 day 键已在 facts 里折算好，这里再建就是 §4.2 的重复折算
  //（@3000 条白建 3000 个 Date；perf-guard 的构造计数抓到过）。
  const weekStartStr = localDay(weekStart)
  const monthPrefix = todayStr.slice(0, 7)

  const daySet = new Set<string>()
  let weekCount = 0
  let monthCount = 0

  for (const day of days) {
    if (!day) continue
    daySet.add(day)
    // 字典序比较的 precondition：day 必须是 localDay 产出的**定宽**日期键
    // （YYYY-MM-DD）。本函数的入参（compute.ts 喂的是 facts 的 dayOrNull——safeDay 口径）都满足；
    //  peek 定宽之外的值（如 "2026-9-5"）字典序会失真，不要直接喂外部输入。
    if (day >= weekStartStr && day <= todayStr) weekCount++
    if (day.startsWith(monthPrefix)) monthCount++
  }

  return {
    streak: computeStreak(daySet, today),
    weekCount,
    monthCount,
  }
}

/** 从今天（没有则昨天）往回数连续有记录的天数 */
function computeStreak(days: ReadonlySet<string>, today: Date): number {
  return streakOfDays(days, localDay(today))
}

/**
 * 同上，但入参是**日期键**（D-12）：统计页与回顾页都只需要「今天这一键」，
 * 不必先把 Date 传进来再折算一遍本地日。面板跨天时把 useTodayKey() 的新键喂
 * 进来即可刷新，见 src/ui/hooks/useTodayKey.ts。
 */
export function streakOfDays(days: ReadonlySet<string>, todayKey: string): number {
  const cursor = parseDay(todayKey)
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1) // 今天还没写 → 从昨天起算
  let n = 0
  while (days.has(localDay(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}
