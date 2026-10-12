/**
 * 侧栏「全部标签」的筛选逻辑（纯函数，可单测、不依赖 DOM / React）。
 *
 * 这里有两件事：
 * ① `matchesFilter` / `filterTagNodes`（原有）—— 名称过滤：大小写不敏感，
 *    匹配 `name` 或 `displayPath`；自身或任意后代命中即保留该节点，但子级仍被
 *    递归过滤，只留下真正命中的后代。
 * ② `applyTagFilter`（v0.9.18；BUG-110c 起换口径）—— 筛选**管道**：时间 → 附件 → 名称。
 *
 * 前两道是**逐条目**的（BUG-110c，2026-10-07）：一个节点留下 ⇔ 它的子树里至少
 * 有一条条目的标签能到达它，且那条条目**同时**满足两项谓词（时间窗口 ∧ 附件）。
 * 满足条目的完整标签前缀链（`tagKeyPrefixes`）收进一个保留键集，节点按
 * 「key 在集合里」剪枝。
 *
 * 为什么不按节点上的聚合值筛（旧实现，BUG-110c 的根因）：`withImageCount` 是子树
 * sum、当年还有的 `lastUsedAt` 是子树 max，两道谓词按聚合值分别过筛再取交集时，两个
 * 聚合值可以来自**不同条目**——「近 7 天」的 max 与「有配图」的 sum 各说各话，
 * 父节点带着零个同时满足的子条目存活下来，成为幽灵行（最刺眼的一例见
 * tag-filter.test.mts 的幽灵行回归）。逐条目算没有这个问题：交集在**条目**这一
 * 层取，节点是命中集合的投影；旧实现「递增 + 递减两套剪枝手法」（BUG-02）也随
 * 之消失——一套保留键集同时对两个方向成立。
 *
 * 节点上的聚合字段（totalCount / withImageCount）是**全量口径**的
 * 显示值：筛选**只剪枝、不改数**（tag-filter.test.mts 的不变量盯着这条）。
 *
 * 名称那一道（③）不是逐条目谓词，也不是聚合属性——它仍是原来「自身或后代命中
 * 即保留父级」的递归语义（`filterTagNodes`），在剪枝之后收尾。
 *
 * 管道**只剪枝、不改变树形**：v0.9.18 曾有过第四道「层级筛选」（把树拉平成一维，
 * 只留一级 / 只留末级），v0.9.19 按用户裁决移除——库里没嵌套标签时三个选项长得一样，
 * 有嵌套时又没人说得清「顶层 / 叶子」是啥。它的副作用是列表得切一套「拉平渲染」
 * （不缩进、不出箭头、显完整路径），那套渲染随之删掉了。
 */

import type { TagNode } from './tagTree'
import { tagKeyPrefixes } from './tagTree'
import { hasImageMarkdown, tagKey } from './parse'
import type { MomoEntry } from '../types'
import { startOfToday } from '../dates'

export function matchesFilter<T extends { name: string; displayPath: string; children: T[] }>(node: T, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (node.name.toLowerCase().includes(q) || node.displayPath.toLowerCase().includes(q)) return true
  return node.children.some((child) => matchesFilter(child, q))
}

export function filterTagNodes<T extends { name: string; displayPath: string; children: T[] }>(nodes: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return nodes
  return nodes
    .filter((node) => matchesFilter(node, q))
    .map((node) => ({
      ...node,
      children: filterTagNodes(node.children, q),
    }))
}

// ---- 结构化筛选（v0.9.18，**会话内 transient**，不入 data.json）----
//
// 每组都是**单选互斥**：一组里同时选「7 天」和「90 天」没有意义（并集就是 90 天），
// 侧栏也摆不下多选。组与组之间取**交集**（见 applyTagFilter）。

/** 最近使用维度：按子树内最新一条 Momo 的 createdAt 落在哪个窗口 */
export type TagTimeFilter = 'all' | '7d' | '30d' | '90d' | 'older'

/** 附件维度：子树内有没有带图的 Momo */
export type TagAttachmentFilter = 'all' | 'with' | 'without'

/** 两组的全部合法值（顺序 = 筛选浮层里 chip 的顺序） */
export const TAG_TIME_FILTERS: readonly TagTimeFilter[] = ['all', '7d', '30d', '90d', 'older']
export const TAG_ATTACHMENT_FILTERS: readonly TagAttachmentFilter[] = ['all', 'with', 'without']

/** 两组筛选的当前取值（`all` = 不限） */
export interface TagFilterState {
  time: TagTimeFilter
  attachments: TagAttachmentFilter
}

/** 默认：两组全「全部」—— 也就是 v0.9.18 之前没有这套筛选时的样子 */
export const DEFAULT_TAG_FILTER: TagFilterState = { time: 'all', attachments: 'all' }

/**
 * 是否偏离默认。筛选按钮的高亮态与摘要条的出现都读它 —— 别在组件里各写一遍两个
 * `!== 'all'`（将来加组时必漏一处）。
 */
export function isTagFilterActive(filter: TagFilterState): boolean {
  return filter.time !== 'all' || filter.attachments !== 'all'
}

/** 「更早」的分界：多久没动过算冷标签。与 `'90d'` 共用同一个界，两边必须一致 */
const STALE_DAYS = 90

/**
 * 时间窗口 → 截止时间戳（ms）；`'all'` → null。**入口处算一次**，
 * 别在节点循环里重复构造 Date（AGENTS §3.2）。
 *
 * 窗口用 `setDate` 链式回退**本地日历日**，不做时间戳除法：夏令时那天不是 24 小时，
 * 除法会在边界上差一天（与 stats/compute.ts 的 30 天窗口同一个理由）。
 */
function timeCutoff(mode: TagTimeFilter, now: Date): number | null {
  if (mode === 'all') return null
  const days = mode === '7d' ? 7 : mode === '30d' ? 30 : STALE_DAYS
  const d = startOfToday(now)
  // BUG-181c：窗口是**含今天往回 N−1 天**（与 stats/compute.ts 的近 N 天、coverage.ts 的
  // recentN 同尺）——旧实现减 N 天再判 `>= cutoff`，比全库同口径宽一天：末现恰在 T−N 的
  // 标签会同时出现在「N 天内」筛选与统计页「冷掉」列表里（一个标签两个互斥结论）。
  d.setDate(d.getDate() - (days - 1))
  return d.getTime()
}

/**
 * 按保留键集剪枝：key 不在集合里 ⇒ 该节点**整棵**剪掉（集合已收满足条目的全部
 * 标签前缀链，键不在 = 子树里没有一条同时满足两组的条目能到达它）。
 * children 非空时才浅拷贝，叶子直接把原引用放进结果；节点字段一个都不动
 * （聚合是全量口径的显示值，见文件头）。
 */
function prune(nodes: readonly TagNode[], keep: (node: TagNode) => boolean): TagNode[] {
  const out: TagNode[] = []
  for (const node of nodes) {
    if (!keep(node)) continue
    out.push(node.children.length === 0 ? node : { ...node, children: prune(node.children, keep) })
  }
  return out
}

/**
 * 一条条目是否**同时**满足两组谓词（两组都非 all 时才检查；cutoff = null = 时间不限）。
 * 时间不可解析的 createdAt 哪一边都不算——手写 frontmatter 的怪格式既不在
 * 「最近 N 天」里、也不在「更早」里（与旧口径一致）。
 */
function entrySatisfies(entry: MomoEntry, filter: TagFilterState, cutoff: number | null): boolean {
  if (cutoff !== null) {
    const at = Date.parse(entry.createdAt)
    if (Number.isNaN(at)) return false
    if (filter.time === 'older' ? at >= cutoff : at < cutoff) return false
  }
  if (filter.attachments !== 'all' && hasImageMarkdown(entry.content) !== (filter.attachments === 'with')) {
    return false
  }
  return true
}

/** 逐条目算保留键集（冷路径）：满足条目的每条标签，整条前缀链（含自身）收进集合 */
function computeSurvivingKeys(entries: readonly MomoEntry[], filter: TagFilterState, cutoff: number | null): Set<string> {
  const keys = new Set<string>()
  for (const entry of entries) {
    if (!entrySatisfies(entry, filter, cutoff)) continue
    for (const raw of entry.tags) {
      const key = tagKey(raw)
      if (!key) continue
      for (const prefix of tagKeyPrefixes(key)) keys.add(prefix)
    }
  }
  return keys
}

/**
 * 保留键集的**单槽 memo**（手法同 tags/derived.ts）：按 entries 数组**引用** +
 * 两组取值 + 截止时间戳命中。TagTree 的渲染路径上名称框每击键都会重调
 * applyTagFilter 一次，冷扫描是 O(条目数 × 标签数)，不该跟着输入框里的一个字重付。
 * cutoff 用算好的时间戳而不是 `now` 对象：跨零点前同一窗口的两次调用（不同 Date
 * 实例）也能命中——memo 的键是**语义**，不是对象身份。
 */
let survivedCache: {
  entries: readonly MomoEntry[]
  time: TagTimeFilter
  attachments: TagAttachmentFilter
  cutoff: number | null
  keys: ReadonlySet<string>
} | null = null

function survivingKeys(entries: readonly MomoEntry[], filter: TagFilterState, cutoff: number | null): ReadonlySet<string> {
  const c = survivedCache
  if (
    c !== null &&
    c.entries === entries &&
    c.time === filter.time &&
    c.attachments === filter.attachments &&
    c.cutoff === cutoff
  ) {
    return c.keys
  }
  const keys = computeSurvivingKeys(entries, filter, cutoff)
  survivedCache = { entries, time: filter.time, attachments: filter.attachments, cutoff, keys }
  return keys
}

/**
 * 筛选管道：**时间 → 附件 → 名称**。
 *
 * 前两道在**条目**这一层取交集（每次本函数调用至多扫一遍条目，结果按 memo 复用），
 * 满足条目的标签前缀链 = 保留键集；树按保留键集剪枝。三道都不改变树形（只剪枝），
 * 所以列表永远按树渲染：子级缩进、有子级的行带展开箭头。
 *
 * `now` 由调用方传入（不在函数里 `new Date()`）：同一次渲染里所有节点必须用同一个
 * 「今天」，否则跨零点那一瞬间，前后两行可能落进不同窗口。
 */
export function applyTagFilter(
  entries: readonly MomoEntry[],
  nodes: readonly TagNode[],
  filter: TagFilterState,
  query: string,
  now: Date,
): TagNode[] {
  // 两组全不限：前两道整段跳过（连条目都不看），只有名称那一道跑
  if (!isTagFilterActive(filter)) return filterTagNodes([...nodes], query)

  // ①+② 时间 ∧ 附件：一条条目要同时满足两组才把它的标签前缀链收进保留键集
  const keys = survivingKeys(entries, filter, timeCutoff(filter.time, now))
  const pruned = prune(nodes, (node) => keys.has(node.key))

  // ③ 名称：不是逐条目谓词（父级命中不代表子级命中），走原来那套
  //    「保留命中后代的父级」的实现，别改成 prune。
  return filterTagNodes(pruned, query)
}
