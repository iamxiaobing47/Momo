import type { EntryFact } from './window'
import { STATS_LONG_NOTE_CHARS } from './constants'

// 窗口内的「数数」标量。compute.ts 只负责「遍历一遍把它们喂饱」，
// 具体怎么算集中在这里——同一批数字只有一份实现，日子久了不会两处口径漂移。

/**
 * 窗口内的「数数」指标：当前窗口的**唯一口径真值**，主返回值的规模层字段
 * （total / activeDays / tagCount / avgLength / medianLength / longRatio / untaggedCount）
 * 全部由它算出，避免同一批数字在遍历里再算一遍。
 */
export interface WindowScalars {
  total: number
  activeDays: number
  untaggedCount: number
  longCount: number
  /** 去重后的标签身份键数（与主循环的 tagCounts.size 同口径） */
  tagCount: number
  avgLength: number
  medianLength: number
}

export function windowScalars(facts: readonly EntryFact[]): WindowScalars {
  const days = new Set<string>()
  const tagKeys = new Set<string>()
  const lengths: number[] = []
  let total = 0
  let totalChars = 0
  let untagged = 0
  let longCount = 0
  for (const f of facts) {
    total++
    const len = f.len
    totalChars += len
    lengths.push(len)
    if (len >= STATS_LONG_NOTE_CHARS) longCount++
    if (f.tags.length === 0) untagged++
    const day = f.dayOrNull
    if (day) days.add(day)
    for (const t of f.tags) tagKeys.add(t.key)
  }
  lengths.sort((a, b) => a - b)
  const mid = Math.floor(lengths.length / 2)
  const medianLength = lengths.length
    ? lengths.length % 2 === 1
      ? lengths[mid]
      : Math.round((lengths[mid - 1] + lengths[mid]) / 2)
    : 0
  return {
    total,
    activeDays: days.size,
    untaggedCount: untagged,
    longCount,
    tagCount: tagKeys.size,
    avgLength: total ? Math.round(totalChars / total) : 0,
    medianLength,
  }
}
