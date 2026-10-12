import type { MomoEntry, StatsRange } from '../types'
import { dayRange, dayWindowStart, localDay, parseDay, startOfToday, startOfWeek } from '../dates'
import { DAY_MS } from './constants'
import { tagKey } from '../tags'

// 日期键折算与 per-entry 预折叠（P04）：`computeStats` 的窗口筛选、数数、主循环、
// 全库日期表、标签 lifecycle、insights 六趟共用这里算好的派生，`createdAt` 与标签
// 每条目只折算一次。此前六趟各自解析一遍（每趟 2 个 Date），@10k 白烧 ~10ms。

/**
 * 无效时间串的**回退日**：取前 10 位，round-trip 校验它是不是真实存在的定宽
 * 日期键（`localDay(parseDay(day)) === day`）。
 *
 * 这是 `safeDay` 与 `factsOf.dayOrNull` 共用的第二支（BUG-112d）：两条路此前
 * 各判各的——safeDay 靠这支收下 `'2026-09-18 bogus'` / `'...T25:00:00'` 的
 * 前 10 位，dayOrNull 却按 `new Date` 有效性直接 null，同一份数据、同一页上
 * 两把「有效日期」的尺（coverage 算它有日期、按天维度排除它）。
 *
 * 为什么回退而不是一票否决：日期键换算的既有口径就是「无效输入回退前 10 位」
 * （dayKey，见 dates/dateGroups.ts），前 10 位是真日历日时收下与主面板按天
 * 分组所见一致；但**滚动键**（`'2026-02-31'` → 3/3、`'2026-13-01'` → 次年）
 * 与非定宽脏键过不了 round-trip，必须返回 null，放过它们会让字典序比较失真。
 */
function fallbackDay(iso: string): string | null {
  const day = iso.slice(0, 10)
  const d = parseDay(day)
  return Number.isNaN(d.getTime()) || localDay(d) !== day ? null : day
}

/** 一条 Momo 的**日期键**（无效日期返回 null，调用方按口径跳过派生维度） */
export function safeDay(iso: string): string | null {
  // 单次折算（BUG-60）：合法时间串只 new Date 一次 + localDay 取键；回程校验
  // 只在 `new Date` 判 NaN 的**回退路径**上有存在意义，所以收进 fallbackDay。
  const ts = new Date(iso)
  if (!Number.isNaN(ts.getTime())) return localDay(ts)
  return fallbackDay(iso)
}

/** 两个日期键相差的整天数（a − b；本地日历日口径，与 `dayKey` 一致） */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / DAY_MS)
}

/**
 * 调用计数（仅给性能守卫用）：每次 `shiftDay` 自增一次。
 * AGENTS.md §3.2 要求「循环内不对常量重复解析」——周趋势曾把 `shiftDay(monday, i)`
 * 写在圈内（BUG-113a），该形状对 Date 构造上界透明（余量够大），由
 * `scripts/perf-guard.test.mts` 读这两个函数做断言。生产代码只付一次自增的代价。
 */
let shiftDayCallCount = 0

/** 当前进程内 `shiftDay` 的累计调用次数 */
export function shiftDayCalls(): number {
  return shiftDayCallCount
}

/** 计数清零（守卫用例之间调用；生产代码不需要） */
export function resetShiftDayCalls(): void {
  shiftDayCallCount = 0
}

/** 日期键平移（正数向后、负数向前；跨月跨年由 Date 自己处理） */
export function shiftDay(day: string, deltaDays: number): string {
  shiftDayCallCount += 1
  const d = parseDay(day)
  d.setDate(d.getDate() + deltaDays)
  return localDay(d)
}

/** 自定义区间归一：两端都合法才保留，倒挂时交换（store 落盘前已 sanitize，这里是纯逻辑兜底） */
export function normalizeCustom(
  custom: { from: string | null; to: string | null } | null | undefined,
): { from: string; to: string } | null {
  const from = custom?.from ?? null
  const to = custom?.to ?? null
  if (!from || !to) return null
  return from <= to ? { from, to } : { from: to, to: from }
}

interface EntryTag {
  /** 身份键（tagKey 口径）：点按下钻筛选用 */
  key: string
  /** 原样写法（条目内首次出现的 raw 写法，供标签 lifecycle 兜底显示） */
  raw: string
}

/**
 * 每条 Momo 的预折叠派生（P04）：日期键 / 时间戳 / 字数 / 去重标签只折算**一次**。
 *
 * 口径保真（与原逐趟解析逐字符一致）：
 * - `dayOrNull` 即 `safeDay(e.createdAt)`（无效且前 10 位不是真实日历键时 null，
 *   与 safeDay 共用 fallbackDay——BUG-112d 收敛同一把尺）；
 * - `ts` 即 `new Date(e.createdAt)`（无效输入 null）。
 */
export interface EntryFact {
  /** new Date(createdAt)；无效输入为 null */
  ts: Date | null
  /** safeDay 口径：无效日期为 null（统计侧取日期键的**唯一**入口，BUG-171） */
  dayOrNull: string | null
  /** 正文 trim 后字符数 */
  len: number
  /** 条目内按身份键去重后的标签（按出现序） */
  tags: EntryTag[]
}

export function factsOf(entries: readonly MomoEntry[]): EntryFact[] {
  const out: EntryFact[] = new Array(entries.length)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!
    const ts = new Date(e.createdAt)
    const valid = !Number.isNaN(ts.getTime())
    const day = valid ? localDay(ts) : e.createdAt.slice(0, 10)
    const tags: EntryTag[] = []
    const seen = new Set<string>()
    for (const t of e.tags) {
      const key = tagKey(t)
      if (seen.has(key)) continue
      seen.add(key)
      tags.push({ key, raw: t })
    }
    out[i] = {
      ts: valid ? ts : null,
      dayOrNull: valid ? day : fallbackDay(e.createdAt),
      len: e.content.trim().length,
      tags,
    }
  }
  return out
}

/**
 * 当前统计窗口（**双闭**日期键）：
 * - `ytd` = 今年 1 月 1 日 → 今天；`90d` = 含今天往回 89 天 → 今天；
 * - `custom` = 用户区间原样（止点可以是今天，也可以是过去某天）；
 * - `all` 的起点收敛到**库内最早有记录的一天**（没有记录时 null）。
 */
export function statsWindow(
  facts: readonly EntryFact[],
  now: Date,
  range: StatsRange,
  custom: { from: string | null; to: string | null } | null,
): { from: string; to: string } | null {
  const today = localDay(startOfToday(now))
  if (range === 'all') {
    let earliest: string | null = null
    for (const f of facts) {
      const day = f.dayOrNull
      if (day && (!earliest || day < earliest)) earliest = day
    }
    return earliest ? { from: earliest, to: today } : null
  }
  if (range === 'custom') {
    const c = normalizeCustom(custom)
    return c ? { from: c.from, to: c.to } : null
  }
  const from =
    range === 'ytd'
      ? `${now.getFullYear()}-01-01`
      : dayWindowStart(now, 89)
  return from <= today ? { from, to: today } : null
}

/**
 * 统计页「本周 / 本月」两格的下钻**日期集**（双闭、止于今天）。
 *
 * BUG-55 口径：**ytd = 本年内**。元旦所在自然周的周一起点落在上一年
 * （如 2027-01-03 那周从 2026-12-28 起），若下钻照自然周取，会把上年的
 * 12/29–12/31 也捞进列表——而格子（insights 吃 ytd 范围过滤后的集合）只数
 * 1/1 以后，年初首周于是「格子 +2、列表 5 条」。这里把 ytd 下两个自然起点都
 * 收敛到 1/1（max(自然起点, 本年 1/1)，与 gapAnchor 的 min 钳制同思路），
 * 保证下钻条数与格子数字同口径；同理 ytd 的「上周 / 上月」对照只数本年内
 * 条目，年初首周为 0 是口径本身而非缺数。
 *
 * custom 历史区间（D-03）：不覆盖当前周 / 月时两组日期组作废（返回空），
 * 格子退化为纯展示——与平均 / 中位数同款「聚合口径刻意不可点」。
 * BUG-77b：覆盖了也不再把**完整**周 / 月日期组交出去——与 [c.from, c.to]
 * 求交后再返回。旧实现放行三天窗口外的日期：自定义区间 9/1–9/30、今天
 * 10/2（周一起 9/28）时，「本周节奏」格只数 9/28–9/30，点下钻却把 10/1、
 * 10/2 也捞进列表（格子口径吃的是窗口裁剪后的集合，两边对不上）。
 */
export function statsDrillDays(
  now: Date,
  range: StatsRange,
  custom: { from: string | null; to: string | null } | null,
): { weekDays: string[]; monthDays: string[] } {
  const ytdFrom = `${now.getFullYear()}-01-01`
  const clampStart = (start: Date): Date =>
    range === 'ytd' && localDay(start) < ytdFrom ? parseDay(ytdFrom) : start
  const week = dayRange(clampStart(startOfWeek(now)), now)
  const month = dayRange(clampStart(new Date(now.getFullYear(), now.getMonth(), 1)), now)
  if (range !== 'custom') return { weekDays: week, monthDays: month }
  const c = normalizeCustom(custom)
  // 缺端 = statsWindow 退化为全部（见 normalizeCustom），不必守
  if (!c) return { weekDays: week, monthDays: month }
  const today = localDay(startOfToday(now))
  const covers = (start: string): boolean => c.from <= today && c.to >= start
  // 交集保持字典序即时间序（dayRange 升序、c.from/c.to 同为 YYYY-MM-DD），
  // 空数组 = 该组整体落在窗口外，格子退化纯展示（调用方据 undefined 回调）
  const within = (days: string[]): string[] => days.filter((d) => d >= c.from && d <= c.to)
  return {
    weekDays: covers(week[0]!) ? within(week) : [],
    monthDays: covers(month[0]!) ? within(month) : [],
  }
}
