import type { TagNode } from './tagTree'
import type { TagSortKey } from '../types/prefs'

// 侧栏标签树的排序（v0.9.18，自 tagTree.ts 的 finalize 里拆出来）。
//
// 为什么要拆：`buildTagTree` 产出的顺序原本**写死**是「totalCount 降序 + 名称并列」，
// 而排序是**视图偏好**（ADR-003：只决定排列，不写进任何 Momo），留在数据层会让
// 「换个排序」等于「重算整棵树」。现在数据层只负责结构正确（谁是谁的子级），
// 顺序在渲染前这一步决定。
//
// 但 `buildTagTree` 里那个排序**不能删**：统计页的「Top 3 集中度」直接取根节点的
// 前三个（`compute.ts` 的 `top3Roots`），读的就是那份顺序。所以两边是「数据层保底 +
// 视图层覆盖」，不是搬家。
//
// 层级不可被排序打破：排序只在**同级（兄弟）之间**生效。最活跃的子标签不会冒到
// 父标签前面。v0.9.18 曾靠筛选的「仅顶层 / 仅叶子」把树拉平来换全局排名，
// 那组筛选 v0.9.19 已移除（见 tagFilter.ts），所以现在**没有**跨层级的全局排名——
// 这是刻意的：树形结构本身就是信息，不该为了排名把它推平。

/** 同级比较器：三个键，并列一律回落到「名称升序」，保证结果稳定可复现。 */
function comparatorOf(key: TagSortKey): (a: TagNode, b: TagNode) => number {
  switch (key) {
    case 'attachments':
      return (a, b) => b.withImageCount - a.withImageCount || a.name.localeCompare(b.name)
    case 'name':
      return (a, b) => a.name.localeCompare(b.name)
    case 'count':
      return (a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name)
  }
}

/**
 * 按排序键重排标签树，**返回新数组**。
 *
 * 为什么必须返回新数组（不能就地排）：`buildTagTree` 的结果被 `derived.ts` 按
 * `entries` 引用做了单槽 memo，就地排序会污染那份缓存——下一个拿到同一份 entries
 * 的调用方会看到上一次的排序结果，表现为「换了排序键却不生效」。
 *
 * 只在 children 非空时浅拷贝节点（叶子直接复用原引用），一趟 O(n log n)。
 */
export function sortTagTree(nodes: readonly TagNode[], key: TagSortKey): TagNode[] {
  const cmp = comparatorOf(key)
  return [...nodes]
    .sort(cmp)
    .map((node) => (node.children.length === 0 ? node : { ...node, children: sortTagTree(node.children, key) }))
}
