import type { MomoEntry } from '../../momo/types'
import { entryMatchesTagKey } from '../../momo/tags'
import { entryAtLocNode } from '../../momo/locations'
import type { LocRegion } from '../../momo/locations'
// safeDay 直接引 window.ts（不从 barrel 引）：它没被 stats/index.ts 导出，
// 而为一个纯函数去扩 barrel 的公开面不值得——coverage.ts 也是这么引的。
import { safeDay } from '../../momo/stats/window'
import { recentReviewWindows } from '../../momo/stats/coverage'
import { lowerOf, safeDayOf, tagCountOf, trimLenOf, tsOf } from './caches'
import { dayOfCached } from './dates'
import type { StoreActions } from './slice'
import type { ReviewedFilter, UiState } from './types'

// 组合筛选的唯一实现：标签 / 地点之间为并集、与搜索 / 日期 / 下钻维度取交集。
// 拆成三层，让「读取面」成为可编译检查的契约（BUG-67，根治 BUG-48/49 那类漏依赖）：
//   MatchedInputs  —— 筛选规则**恰好**读取的 store 字段清单；
//   pickMatchedInputs(state) —— 从 store 快照取出这份输入（少给字段 = 编译错）；
//   matchEntries(inputs, list) —— 纯筛选（可单独测）；
//   matchedEntries(state, list) = matchEntries(pickMatchedInputs(state), list)（slice 动作沿用）。
// 派生消费方一律 `useMatchedInputs()`（hooks/useMatchedInputs.ts）订阅整份输入、整份进
// useMemo 依赖——不再手抄依赖数组，漏一个字段从静默用的是旧列表变成编译不过。
//
// v0.9.26：入参加上**要筛哪份条目**——列表与回收站共用同一套规则（回收站的真实
// 消费路径是 Trash.tsx 自订 useMatchedInputs + matchEntries(trash.map(t => t.entry))，
// matchedTrash 死成员已随 Q13 摘除），差别只在语料。
// 默认值 = `s.entries`（列表那份）：既有调用方与测试的味道不变。

/** `matchEntries` 的输入面：恰好是筛选规则读取的 store 字段（新增维度先加这里）。 */
export interface MatchedInputs {
  filterTags: string[]
  filterLocations: string[]
  filterDates: string[]
  search: string
  untaggedOnly: boolean
  filterHours: number[]
  filterWeekdays: number[]
  filterLength: { min: number; max: number } | null
  filterTagCount: { min: number; max: number } | null
  filterReviewed: ReviewedFilter | null
  /** BUG-181a：下钻会话的「今天及以前」闸（统计侧计数排除未来条目，列表同集合） */
  drillPastOnly: boolean
  reviewSeen: Record<string, string>
  locRegions: Record<string, LocRegion>
}

/** store 快照 → 筛选输入。返回值类型即契约：漏一个字段编译不过。 */
export function pickMatchedInputs(s: UiState): MatchedInputs {
  return {
    filterTags: s.filterTags,
    filterLocations: s.filterLocations,
    filterDates: s.filterDates,
    search: s.search,
    untaggedOnly: s.untaggedOnly,
    filterHours: s.filterHours,
    filterWeekdays: s.filterWeekdays,
    filterLength: s.filterLength,
    filterTagCount: s.filterTagCount,
    filterReviewed: s.filterReviewed,
    drillPastOnly: s.drillPastOnly,
    reviewSeen: s.reviewSeen,
    locRegions: s.locRegions,
  }
}

/** 纯筛选：与 store 无关，入参给全（测试直接喂 MatchedInputs + 语料）。 */
export function matchEntries(m: MatchedInputs, list: readonly MomoEntry[]): MomoEntry[] {
  const {
    filterTags,
    filterLocations,
    filterDates,
    search,
    untaggedOnly,
    filterHours,
    filterWeekdays,
    filterLength,
    filterTagCount,
    filterReviewed,
    drillPastOnly,
    reviewSeen,
    locRegions,
  } = m
  const q = search.trim().toLowerCase()
  // 下钻维度（v0.7.0）是否要算时间戳 / 长度：都空就跳过，别为不需要的维度白付一趟
  const needTs = filterHours.length > 0 || filterWeekdays.length > 0
  // 回顾时间窗（v0.9.37）：单一真源在 coverage.ts 的 recentReviewWindows（Q5）——
  // 同一构造喂本函数与 computeReviewCoverage 两侧，「改一处必须改另一处」的手抄约束
  // 从注释变成编译事实（D-03：格子数字 = 列表条数）。按调用时刻现算：跨过零点后的
  // 首次调用即拿到新窗口（D-12 的翻页由订阅方 useTodayKey 触发重渲带动）。
  const { todayStr, recent7Start, recent30Start } = recentReviewWindows(new Date())
  const recent7 = filterReviewed === 'recent7'
  const recent30 = filterReviewed === 'recent30'
  return list.filter((e) => {
    // 日期多选为并集（热力图点选）：命中任一选中日期即显示
    // N11：走 dayOfCached——同一 entries 引用下连续几次筛选不再重复解析 Date
    if (filterDates.length && !filterDates.includes(dayOfCached(e))) return false
    // BUG-181a：下钻会话的「今天及以前」闸——统计侧每个计数都排除未来（预写）条目
    // （isFuture / allDayCounts / lifeCounts 同尺，BUG-96 裁定），下钻列表必须同集合，
    // 「柱上写 5、点过去 6 张」才不复现（D-03）。无效日期照旧不算未来（safeDay = null）。
    if (drillPastOnly) {
      // Q1：safeDay 按条目身份缓存（caches.ts）——无效日期 = null 的语义保留
      // （不能换 dayOfCached：dayKey 对无效输入回退前 10 位）
      const day = safeDayOf(e)
      if (day !== null && day > todayStr) return false
    }
    // 「无标签」模式（统计页下钻）：与搜索可叠加（交集），与标签 / 日期互斥（见各动作）
    if (untaggedOnly && e.tags.length !== 0) return false
    // 标签多选为并集（ADR-004 §2.4，2026-09-18 起）：命中任一已选标签（含其子树）即显示
    if (filterTags.length && !filterTags.some((k) => entryMatchesTagKey(e, k))) return false
    // 地点多选为并集（2026-10-01，地点从浏览模式降级为筛选维度）：命中任一已选
    // 层级节点的覆盖范围即显示（`entryAtLocNode`：任一路径落在该节点下就算，
    // 多地点条目在哪个节点的地盘里就归哪儿）。集合为空 = 不过滤。
    if (filterLocations.length && !filterLocations.some((k) => entryAtLocNode(e, k, locRegions))) return false
    if (q && !(lowerOf(e).includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)))) return false
    // ---- v0.7.0 统计页下钻维度：与上面全部取交集 ----
    if (needTs) {
      // Q1：折叠 Date 按条目缓存——小时与星期从同一份取（§3.2 一次折算复用到底）
      const ts = tsOf(e)
      // 本地小时 / 本地星期（周一 = 0）：与统计页的时段图、星期分布同一口径
      if (filterHours.length > 0 && !filterHours.includes(ts.getHours())) return false
      if (filterWeekdays.length > 0 && !filterWeekdays.includes((ts.getDay() + 6) % 7)) return false
    }
    // 正文字符数：trim 后长度（与字数分布五档、长记录占比同口径，别一个页面两个算法）
    if (filterLength) {
      const len = trimLenOf(e)
      if (len < filterLength.min || len > filterLength.max) return false
    }
    // 标签个数：按身份键去重（与标签数分布同口径）
    if (filterTagCount) {
      const n = tagCountOf(e)
      if (n < filterTagCount.min || n > filterTagCount.max) return false
    }
    if (filterReviewed === 'reviewed' && !reviewSeen[e.path]) return false
    if (filterReviewed === 'unreviewed' && reviewSeen[e.path]) return false
    // 时间窗两档（v0.9.37）：「近 7 天 / 近 30 天回顾」。判据是**回顾时间**
    // （reviewSeen 的 ISO 串），不是创建时间；窗口起算是 coverage.ts 的单一真源
    // （Q5），并带上界 seenDay <= today：时钟快了一天的「明天的回顾」不算进窗口
    // （与 coverage.ts 的 BUG-26 同口径）。
    if (recent7 || recent30) {
      const seenAt = reviewSeen[e.path]
      if (!seenAt) return false
      const seenDay = safeDay(seenAt)
      if (!seenDay || seenDay > todayStr) return false
      if (recent7 && seenDay < recent7Start) return false
      if (recent30 && seenDay < recent30Start) return false
    }
    return true
  })
}

export function matchedEntries(s: UiState, list: readonly MomoEntry[] = s.entries): MomoEntry[] {
  return matchEntries(pickMatchedInputs(s), list)
}

export type MatchedSlice = Pick<UiState, 'matched'>

export function createMatchedSlice(store: StoreActions): MatchedSlice {
  return {
    matched: () => matchedEntries(store.get()),
  }
}
