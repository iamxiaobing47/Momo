import type { MomoEntry } from '../types'
import { tagKey } from './parse'

// 标签共现索引（ADR-005 本地智能）：纯本地、确定性、零依赖。
// 目前**唯一消费方**是「添加标签」弹层的候选建议排序（`derived.cooccurrenceOf` → `suggestScore`）。
// （曾用于侧栏「洞察」的常同行，2026-09-19 用户裁决移除。）
// 抽成独立模块是为了让 `derived.ts` 能对它做「按 entries 引用」的缓存，不形成循环依赖。

/** 共现索引里一对标签的分隔符（标签身份键不含控制字符，安全） */
export const PAIR_SEP = '\u0000'

/** 一对身份键的索引键；`a < b` 保证同一对只有一个键 */
export function pairKey(a: string, b: string): string {
  return a < b ? a + PAIR_SEP + b : b + PAIR_SEP + a
}

/**
 * 标签共现索引：`pairKey → 一起出现的 Momo 数`（同一 Momo 内按身份键去重后两两组合）。
 */
export function buildCooccurrence(entries: readonly MomoEntry[]): Map<string, number> {
  const pairCount = new Map<string, number>()
  for (const e of entries) {
    // 身份键去重后排序（与 tagTree 同一口径：空身份键不入索引）
    const keys = new Set<string>()
    for (const t of e.tags) {
      const k = tagKey(t)
      if (k) keys.add(k)
    }
    const sorted = [...keys].sort()
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = pairKey(sorted[i]!, sorted[j]!)
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
      }
    }
  }
  return pairCount
}

/**
 * 候选标签对「一组已有标签」的共现支持度：Σ 与每个已有标签的共现次数。
 * 用于「添加标签」弹层的建议排序——分值越高越该排在前面。
 * 自己与自己不计分（候选已在所选集合里时，那一项没有意义）。
 */
export function suggestScore(
  index: ReadonlyMap<string, number>,
  candidate: string,
  others: Iterable<string>,
): number {
  let score = 0
  for (const other of others) {
    if (other === candidate) continue
    score += index.get(pairKey(candidate, other)) ?? 0
  }
  return score
}
