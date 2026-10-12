import type { MomoEntry } from '../types'
import { buildTagTree, flattenTagTree, type TagNode } from './tagTree'
import { buildCooccurrence } from './cooccur'

// 派生结果共享缓存（工单 WO-3）。
//
// 背景：标签树 / 共现索引都是「由 entries 派生」的纯计算结果，但此前在 App、TagTree、
// Insights、BatchTagPicker、TagEditMenu、store 里各算了一遍——每次 vault 事件都会重复跑。
// 这里按**入参引用**缓存：入参（`entries` 数组）引用不变就直接复用上一次结果。
//
// 为什么按引用就够：索引层已保证「内容一致就不换数组引用」（store.refresh），
// 而每次真正变化（vault 事件 / 批量操作）都会产出新数组 → 缓存自动失效。
//
// 只保留**最近一次**入参（单槽缓存）：面板同一时刻只有一份当前 `entries`，
// 多槽只会白占内存。派生结果不持有 Momo 正文之外的东西，无泄漏风险。

function memoByRef<A, R>(compute: (arg: A) => R): (arg: A) => R {
  let last: A | undefined
  let result: R | undefined
  let primed = false
  return (arg: A): R => {
    if (!primed || arg !== last) {
      last = arg
      result = compute(arg)
      primed = true
    }
    return result as R
  }
}

const treeOf = memoByRef((entries: readonly MomoEntry[]) => buildTagTree(entries))
const mapOf = memoByRef((tree: readonly TagNode[]) => flattenTagTree(tree))
const coocOf = memoByRef((entries: readonly MomoEntry[]) => buildCooccurrence(entries))

/** 标签树（由 entries 派生，按 entries 引用缓存） */
export const tagTreeOf = (entries: readonly MomoEntry[]): TagNode[] => treeOf(entries)

/** 身份键 → 节点（复用同一棵树，供筛选 / 置顶 / 展示反查） */
export const tagNodeMapOf = (entries: readonly MomoEntry[]): Map<string, TagNode> =>
  mapOf(treeOf(entries))

/** 标签共现索引（目前只服务「添加标签」弹层的候选建议排序） */
export const cooccurrenceOf = (entries: readonly MomoEntry[]): Map<string, number> =>
  coocOf(entries)
