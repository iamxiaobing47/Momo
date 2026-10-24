import { copy } from '../i18n'
import type { MomoEntry } from '../types'

// 卡片按日期分组（列表密度用）：**一天一组，标题就是那天的日期**（`dayKey`，
// 与卡片上的日期、文件名同源）+ **星期后缀**（`2026-09-19 · 周五`；星期由日期本身
// 决定、纯确定性，不违背「具体日期、不显示统计数字」的裁决）。纯函数、不 import obsidian。
//
// 口径：
// - 日期键走 `dayKey`（本地日历日；见工单 WO-1）。
// - **组顺序 = 传入顺序**（即当前排序）：新→旧时今天在最上，切成旧→新时自动反过来。
// - 组内保持传入顺序。
//
// 历史：2026-09-19 之前是「今天 / 昨天 / 本周 / 月份」的相对标题 + 条数；
// 用户看到后要求「改成具体日期、不显示统计数字」——相对标题（尤其「本周」）无法用单个日期表达，
// 因此改为按**自然日**分组；同日再补星期后缀（2026-09-19 UI review），读起来更省力。

export interface DateGroup {
  /** 分组键 = 日期（供 React key） */
  key: string
  /** 展示标题 = 该日期的 `YYYY-MM-DD · 周X` */
  label: string
  entries: MomoEntry[]
}

/** 两位补零：日期键 / 月键 / 文件名时间戳共用的那一个原语（原先在 review 与 serviceFiles 各有一份私有副本） */
export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 本地日历日 `YYYY-MM-DD` */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 往回 `daysBack` 天的那个**本地日历日**键（滚动窗口起点：近 7 天 / 近 30 天 / 冷掉界限…）。
 *
 * 为什么单独一个函数：这条算式原先在 `compute.ts` / `coverage.ts` / `window.ts` 里
 * 手抄了六份，每份都要自己写 `new Date(y, m, d - N)` 那三参数。更要紧的是**不许**
 * 有人换成 `new Date(t.getTime() - N * 86400000)`：按毫秒回退会在夏令时那两天
 * 少算或多算一小时，凌晨前后就落到前一天/后一天，窗口边界跟着漂；而按 `getDate() - N`
 * 走的是日历日算术，本地日界由 `localDay` 自己保证。
 *
 * `daysBack` 由调用点原样给出（`29` = 含今天往回数满 30 天、`STATS_COLD_DAYS` = 不含
 * 当天的界限……），**刻意不做 `inclusive` 开关**：那几处的边界语义本来就不同，
 * 统一成一种会把其中一种改错。
 */
export function dayWindowStart(from: Date, daysBack: number): string {
  return localDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() - daysBack))
}

/**
 * 一条 Momo 的**日期键** = `createdAt` 折算到**本地日历日**。
 *
 * 不能直接取 ISO 前 10 位：`createdAt` 存的是 UTC ISO，而文件名是本地时间生成的，
 * UTC+8 凌晨 0–8 点写的 Momo 两者会差一天（工单 WO-1）。本地日历日与文件名 / 用户日历一致。
 * 无效输入回退到旧口径（前 10 位），不退化为 NaN。
 */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : localDay(d)
}

/** 今天 00:00（本地） */
export function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** 本周一 00:00（本地） */
export function startOfWeek(now: Date): Date {
  const d = startOfToday(now)
  const dow = (d.getDay() + 6) % 7 // 周一 = 0
  d.setDate(d.getDate() - dow)
  return d
}

/** 由 `YYYY-MM-DD` 造本地 Date（用于与周界比较） */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  // BUG-206：先按安全年构造再 setFullYear——new Date(y,…) 对 0≤y≤99 有 legacy
  // 年份映射（'0026-01-01' 与 dayKey 的短键 '26-01-01' 都会落 1926），
  // 与 sanitizeStatsDay 同一把尺（sanitize.ts 先例）。
  const dt = new Date(2000, (m ?? 1) - 1, d ?? 1)
  dt.setFullYear(y ?? 0)
  return dt
}

/**
 * 两个日期键相差几个**日历日**（`to − from`：`dayDiff('2026-10-17', '2026-10-24')` → 7）。
 *
 * 随机回顾按「距上次展示几天」加权（momo/review）要的就是这个整数。不能把两个
 * `Date.getTime()` 裸除 86400000（`dayWindowStart` 注释同款理由：本地日不总是
 * 24 小时）——这里两端都取**本地午夜**（`parseDay`），差值离整天最多差夏令时那
 * 1 小时，`Math.round` 抹平。
 */
export function dayDiff(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000)
}

/**
 * `end` 往前 `months` 个自然月的**同一天**；目标月没这一天就夹到该月最后一天。
 *
 * 不能直接 `setMonth(getMonth() - months)`：Date 会向下月溢出——3/31 往前 1 个月
 * 变成 2/31 → 3/3，10/31 往前 1 个月变成 9/31 → 10/1（侧栏热力图踩过这个：
 * 窗口起点莫名晚一个月，「跨月」的那一周整段不见了，2026-09-28 修）。
 * 做法：先落 1 号（任何月都有 1 号）再换月，最后夹回目标月最后一天。
 *
 * 注意口径：这里是「N 个月前的今天」，只要 `end` 不是当月 1 号，它和
 * `monthWindowStart` 差整一个月——热力图滚动窗 2026-10-01 起改走后者
 * （「最近 N 个月」要的是当月 + 前 N−1 个月，见下）。
 */
export function monthsBefore(end: Date, months: number): Date {
  const d = new Date(end.getFullYear(), end.getMonth() - months, 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(end.getDate(), lastDay))
  return d
}

/**
 * 活跃度热力图滚动窗的起点：**含当月在内 `months` 个自然月的 1 号**。
 *
 * 「最近 N 个月」在日历语境下 = 当月 + 前 N−1 个月：今天 2026-10-01、N=3 → 8/1 起，
 * 窗口正好铺 8/9/10 三个自然月。`monthsBefore`（N 个月前的今天）只要今天不是
 * 当月 1 号，窗口就横跨 N+1 个自然月，首月还只露一两天——用户报障
 * 「写最近 3 个月，实际显示 4 个月」（2026-10-01，截图 7/8/9/10 四列月标签）。
 * 落在 1 号还顺带消灭了「目标月没这一天」的下月溢出（裸 setMonth 把 3/31 −1月
 * 变成 3/3、窗口起点晚一个月，2026-09-28 那个 bug）：任何月都有 1 号。
 *
 * 与终点 `monthWindowEnd`（当月最后一天）配对：起点只看 end 的年月，终点换成
 * 月末不改变它——两头都是自然月界，窗口才是 N 个**完整**的自然月。
 */
export function monthWindowStart(end: Date, months: number): Date {
  return new Date(end.getFullYear(), end.getMonth() - (months - 1), 1)
}

/**
 * 活跃度热力图滚动窗的终点：**当月最后一天**。
 *
 * 2026-10-09 用户要求「选 1 个月就完整展示当月的格子」：旧口径终点是**今天**，
 * 10 月 9 日看过去窗口只有 9 天、两三列，读不出「这个月」的形状。改成月落后
 * N=1 铺满一张当月日历、N=2 是当月 + 前一月两张，以此类推；当月 1 号出发、
 * 月末收尾，两头都是自然月界。
 *
 * 今天之后的日子照常出格（色阶仍按条数——预写 / 定时到未来的条目不凭空消失），
 * 但**不可点**：点未来日只会筛出一张空列表。判定与交互在 Heatmap.tsx 的
 * HeatGrid（与统计页日历同一契约，见 CalendarGrid / stats-calendar-future）。
 *
 * 落在月末同样没有「目标月没这一天」的溢出：`getMonth() + 1, 0` 就是当月最后一天。
 */
export function monthWindowEnd(end: Date): Date {
  return new Date(end.getFullYear(), end.getMonth() + 1, 0)
}

/**
 * 时间位移建档的落点：目标本地日 `YYYY-MM-DD` 的**中午 12:00**（本地时间）。
 * 「补记到过去」与「写到未来」两条路共用它（都只从日期尺拿到一个日期键）。
 *
 * 为什么固定中午：时间位移的「意图单位」是一整天，日期尺给出的也只是日期键，
 * 而 `createdAt` 存 UTC ISO、`dayKey` 折算回本地日历日（WO-1）。时刻放在中午，
 * 任何时区、任何夏令时偏移都翻不过日界，`dayKey` 必然落回目标日；0 点前后
 * 则正好压在 WO-1 的雷区上。附带好处：所有时间位移的条目共享 120000 这一刻，
 * 文件名自带可识别性（`2026-09-20-120000.md`），在 vault 里一眼能认出是补的 /
 * 提前写的。
 */
export function dayMoment(day: string): Date {
  const d = parseDay(day)
  d.setHours(12, 0, 0, 0)
  return d
}

/**
 * 定宽时间串的比较器（升序）：`createdAt` 的 ISO 串、`YYYY-MM-DD` 日期键都能用。
 *
 * **别改回 `localeCompare`**：入参是定宽 ASCII 时字典序就是时间序，逐字符权重
 * 与 Intl 完全一致（差异只可能是数字位），而 localeCompare 每次都要走 Intl
 * 排序器，慢一个数量级。这两处都在热路径上：
 * - `service.listEntries` 每次刷新都对全库排一遍；
 * - `App` 的 `entriesSorted` 每次筛选 / 切排序也排一遍；
 * @10k 就是每次几毫秒的纯浪费。
 *
 * 反例（这里**不**管）：标签显示名、`tagTree` 的节点名排序仍用 localeCompare——
 * 那些是可能含中文的展示串，需要依赖语言的排序规则。
 */
export function compareTimeKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 闭区间 `[from, to]` 内的全部本地日期键（升序）。from > to 时返回空数组。
 * v0.7.0 统计页下钻用：把「本周 / 本月 / 最近 30 天」这类**范围**翻译成日期集，
 * 复用列表既有的多日筛选（`filterDates` 并集）——不为下钻新造一套范围筛选口径。
 */
export function dayRange(from: Date, to: Date): string[] {
  const out: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  while (cursor <= end) {
    out.push(localDay(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** 分组标题：`YYYY-MM-DD · 周X`（星期由日期本身决定；非法日期不拼后缀） */
export function dayLabel(day: string): string {
  const dow = parseDay(day).getDay()
  const weekday = copy.date.weekdaySunFirst[dow] ?? ''
  return copy.date.groupTitle(day, weekday)
}

/** 按自然日分组：一天一组，标题 = `dayLabel`；组顺序 = 传入顺序 */
export function groupByDate(entries: readonly MomoEntry[]): DateGroup[] {
  const groups = new Map<string, DateGroup>()
  for (const e of entries) {
    const day = dayKeyCached(e)
    if (!day) continue
    let group = groups.get(day)
    if (!group) {
      group = { key: day, label: dayLabel(day), entries: [] }
      groups.set(day, group)
    }
    group.entries.push(e)
  }
  return [...groups.values()]
}

/** N11（Q3）：`dayKey(createdAt)` 按条目身份缓存。列表密度的 groupByDate 与两张
 *  热力图的 byDay 都逐条目折算——entries 引用只在内容变化时换新（refresh 的稳定
 *  数组检查），换新才全量重付；未变条目在 service/index.ts 复用旧对象，身份缓存
 *  吃得着。缓存放 momo 层（ui/store/dates.ts 的 dayOfCached 是本函数的别名），
 *  momo 与 ui 共用一份、不破分层（momo 不反向依赖 ui）。 */
const dayKeyCache = new WeakMap<MomoEntry, string>()
export function dayKeyCached(e: MomoEntry): string {
  let d = dayKeyCache.get(e)
  if (d === undefined) {
    d = dayKey(e.createdAt)
    dayKeyCache.set(e, d)
  }
  return d
}
