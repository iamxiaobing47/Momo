import { regionOfLocation, type LocRegion } from '../locations'
import { compareTimeKey, parseDay } from '../dates'
import type { MomoEntry } from '../types'
import { DAY_MS, STATS_COUNT_BUCKET_MAX, STATS_LIFECYCLE_TOP, STATS_LOC_RANK_TOP } from './constants'
import type { EntryFact } from './window'
import type { ColdLocRank, LocLifecycle, LocRank, LocStats } from './types'

// 地点统计（v0.9.33）：与标签体系同形的三层投影——规模 / 分布 / 排行 / 洲际覆盖
// 是**范围**口径（locStatsOf），生命周期是**全库**口径（locLifecycleOf，与
// tag lifecycle 同纪律：首末次出现、绝对总量不受 range 影响）。
//
// 数据来源零加工：`MomoEntry.locations` 读侧已归一（momo/locations/locations.ts 的
// normalizeLocations：trim / 精确去重 / ≤20 字 / ≤8 个 / 滤洲名），这里只计数与
// 归属折算，不再解析。归属走 locations/locRegions.ts（内置 ~290 城 + 国家→大洲表，
// `prefs.locRegions` 手填压过）——与地点分组流 / 侧栏地点树同一把尺子，统计页的
// 「国家数」才可能和侧栏地点树的 chip 对得上。
//
// 两条与分组流对齐的裁决：
// - **查不到归属的地名只进地点总数**，不进国家 / 大洲 / 洲际覆盖——不造「未知
//   大洲」占位（分组流 v0.9.27 同款：「没数据」不被伪装成「有数据」）；
// - 洲际覆盖按**条目去重**：一条笔记标题了个东南亚行程（3 个地点同属亚洲），
//   亚洲只计 1 条——与分组流「一条进 N 个组、每个组各计一次」同口径。

/** 范围口径的地点统计（computeStats 的范围段调用；`scopedIdx` = 窗口内的条目下标） */
export function locStatsOf(
  entries: readonly MomoEntry[],
  scopedIdx: readonly number[],
  total: number,
  regions?: Readonly<Record<string, LocRegion>> | null,
): LocStats {
  const tally = new Map<string, number>()
  const countries = new Set<string>()
  const continents = new Set<string>()
  const continentTally = new Map<string, number>()
  const buckets = new Array<number>(STATS_COUNT_BUCKET_MAX + 1).fill(0)
  let noLocCount = 0
  let incidences = 0
  // 归属按地名缓存：regionOfLocation 是两次字典查找，一条目最多 8 个地点，
  // 不缓存时万条库就是 8 万次查找——摊到每个地名一次。
  const regionCache = new Map<string, LocRegion | null>()
  const regionOf = (loc: string): LocRegion | null => {
    let r = regionCache.get(loc)
    if (r === undefined) {
      r = regionOfLocation(loc, regions ?? null)
      regionCache.set(loc, r)
    }
    return r
  }
  for (const i of scopedIdx) {
    const e = entries[i]!
    const locs = e.locations
    if (locs.length === 0) {
      noLocCount++
      buckets[0]! += 1
      continue
    }
    incidences += locs.length
    buckets[Math.min(STATS_COUNT_BUCKET_MAX, locs.length)]! += 1
    // 条目级大洲去重：一条笔记的 N 个地点可能同属一洲，该洲只计这条 1 次
    const entryContinents = new Set<string>()
    for (const loc of locs) {
      tally.set(loc, (tally.get(loc) ?? 0) + 1)
      const region = regionOf(loc)
      const continent = region?.[0]?.trim() ?? ''
      const country = region?.[1]?.trim() ?? ''
      if (continent !== '') {
        continents.add(continent)
        entryContinents.add(continent)
      }
      if (country !== '') countries.add(country)
    }
    for (const c of entryContinents) continentTally.set(c, (continentTally.get(c) ?? 0) + 1)
  }
  // 排行与覆盖同一种排序：条数降序 → 名称 localeCompare（与侧栏树 / 分组流同口径）
  const byCountThenName = (a: LocRank, b: LocRank): number =>
    b.count - a.count || a.location.localeCompare(b.location)
  // T7：`map → sort` 这条收尾链条在 topLocs 与 continentCoverage 逐字符相同，
  // 收一个本地 helper（`top` 可选：覆盖那个要全量，不切）。
  const rankCounts = (counts: Map<string, number>, top?: number): LocRank[] => {
    const rows: LocRank[] = [...counts.entries()].map(([location, count]) => ({ location, count })).sort(byCountThenName)
    return top === undefined ? rows : rows.slice(0, top)
  }
  return {
    locCount: tally.size,
    countryCount: countries.size,
    continentCount: continents.size,
    noLocCount,
    noLocRatio: total > 0 ? noLocCount / total : 0,
    avgLocsPerEntry: total > 0 ? Math.round((incidences / total) * 10) / 10 : 0,
    topLocs: rankCounts(tally, STATS_LOC_RANK_TOP),
    continentCoverage: rankCounts(continentTally),
    locCountBuckets: buckets,
  }
}

/**
 * 全库口径的地点生命周期。阈值串由 computeStats 按与标签同一批常量算好传入
 * （`newTagStart` / `coldBefore` / `todayMs` / `todayStr`）——窗口定义只在 compute.ts
 * 一处，两个维度不会各算一份。
 *
 * `facts` 与 `entries` 同序（factsOf 的下标即 entries 的下标）：首末次出现的
 * 日期键直接复用已折算的 `dayOrNull`，不再为地点维度重解析一遍 createdAt
 * （§3.2：每条目的时间戳只折算一次）。
 */
export function locLifecycleOf(
  entries: readonly MomoEntry[],
  facts: readonly EntryFact[],
  thresholds: { newTagStart: string; coldBefore: string; todayMs: number; todayStr: string },
): LocLifecycle {
  const counts = new Map<string, number>()
  const firstSeen = new Map<string, string>()
  const lastSeen = new Map<string, string>()
  let incidences = 0
  for (let i = 0; i < facts.length; i++) {
    const day = facts[i]!.dayOrNull
    // BUG-96：「全库」= 今天及以前，与标签 lifecycle / isFuture 同一把尺子——预写
    // （未来日期）行程不进任何份额（旧实现只在首末次出现处挡了无效日期，未来条目
    // 会把末现推到未来、把地点挤出「冷掉」，也把只活在预写里的地方判成「新开」）。
    // 无效日期维持既有口径：无法归日、不进首末次出现，但照进打点次数与每键计数。
    if (day !== null && day > thresholds.todayStr) continue
    for (const loc of entries[i]!.locations) {
      incidences++
      counts.set(loc, (counts.get(loc) ?? 0) + 1)
      if (!day) continue
      const first = firstSeen.get(loc)
      if (!first || day < first) firstSeen.set(loc, day)
      const last = lastSeen.get(loc)
      if (!last || day > last) lastSeen.set(loc, day)
    }
  }
  // 新开：首次出现在新开窗口内（含当天）；排序 = 条数降序 → 首现日升序（与标签同）
  const newLocs = [...firstSeen]
    .filter(([, day]) => day >= thresholds.newTagStart)
    .map(([location, day]) => ({ location, day, count: counts.get(location) ?? 0 }))
    .sort((a, b) => b.count - a.count || compareTimeKey(a.day, b.day))
    .slice(0, STATS_LIFECYCLE_TOP)
    .map(({ location, count }) => ({ location, count }))
  // 冷掉：距最后一次出现 ≥ STATS_COLD_DAYS 天（含当天，与标签同一把尺子）且
  // 条数 ≥ 2——只去过一次的地方没有「冷掉」可言（与 coldTags 的 count ≥ 2 同条件）。
  // days 的 parseDay 挪到 slice 之后（BUG-59，与标签 coldTags 同款）：只对最终展示的
  // Top N 付，冷掉名单再长也不全量建 Date；排序键只有 count / day，数值不变。
  const coldLocs: ColdLocRank[] = [...lastSeen]
    .filter(([location, day]) => day <= thresholds.coldBefore && (counts.get(location) ?? 0) >= 2)
    .map(([location, day]) => ({ location, day, count: counts.get(location) ?? 0 }))
    .sort((a, b) => b.count - a.count || compareTimeKey(a.day, b.day))
    .slice(0, STATS_LIFECYCLE_TOP)
    .map(({ location, day, count }) => ({
      location,
      days: Math.round((thresholds.todayMs - parseDay(day).getTime()) / DAY_MS),
      count,
    }))
  // 最近去过：lastSeen 倒序——「 lately 去了哪」是 lastSeen 的展示位，与冷掉
  // 互为两端。同一天先去得多的，再去得多的同名按地名。
  const recentLocs = [...lastSeen]
    .map(([location, day]) => ({ location, day, count: counts.get(location) ?? 0 }))
    .sort((a, b) => compareTimeKey(b.day, a.day) || b.count - a.count || a.location.localeCompare(b.location))
    .slice(0, STATS_LIFECYCLE_TOP)
    .map(({ location, count }) => ({ location, count }))
  let singleVisitCount = 0
  for (const c of counts.values()) if (c === 1) singleVisitCount++
  // Top 3 集中度：Top 3 地名条数合计 ÷ 全部打点次数（与标签 top3Share 同口径）；
  // 分子按 counts 的全量排序取前三——排序前必须拿全量（与标签同款纪律）。
  const top3 = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .reduce((s, [, c]) => s + c, 0)
  const top3Share = incidences > 0 ? Math.min(1, top3 / incidences) : 0
  return {
    newLocs,
    coldLocs,
    recentLocs,
    singleVisitCount,
    singleVisitTotal: counts.size,
    top3Share,
  }
}
