import type { MomoEntry } from '../types'
import type { SortKey, SortMode } from '../types/prefs'
import { compareTimeKey } from '../dates'

// 排序的唯一逻辑层：顶栏那颗排序按钮打开一个两段式菜单——「排序依据」组换时间键、
// 「排序方向」组换方向，两组各改 SortMode 的一半，比较器只认 SortMode 一个值。
// 原来排序内联在 App.tsx 的 useMemo 里，加「按更新时间排序」时顺手抽成纯函数
// （momo/ 下，不 import obsidian，可单测）。

/** 时间键 → MomoEntry 上的时间字段 */
const FIELD_OF: Record<SortKey, 'createdAt' | 'updatedAt'> = {
  created: 'createdAt',
  updated: 'updatedAt',
}

/** 四个模式各自的时间键与方向（显式查表，不字符串嗅探——加成员时漏一处编译可过，查表漏了会红） */
const KEY_OF: Record<SortMode, SortKey> = {
  createdAsc: 'created',
  createdDesc: 'created',
  updatedAsc: 'updated',
  updatedDesc: 'updated',
}

/** 每个模式的方向：true = 由旧到新 */
const ASCENDING_OF: Record<SortMode, boolean> = {
  createdAsc: true,
  createdDesc: false,
  updatedAsc: true,
  updatedDesc: false,
}

/** 翻向另一半（方向按钮用：保时间键） */
const FLIPPED: Record<SortMode, SortMode> = {
  createdAsc: 'createdDesc',
  createdDesc: 'createdAsc',
  updatedAsc: 'updatedDesc',
  updatedDesc: 'updatedAsc',
}

/** 当前模式按哪个时间键排（顶栏「排序依据」分段的选中态） */
export function sortKeyOf(mode: SortMode): SortKey {
  return KEY_OF[mode]
}

/** 当前模式是否升序（由旧到新）——方向按钮文案跟着它走 */
export function sortAscendingOf(mode: SortMode): boolean {
  return ASCENDING_OF[mode]
}

/**
 * 翻转方向、保持时间键。
 *
 * v0.9.19 起顶栏不再有那颗方向按钮（改由两段式菜单的「排序方向」组直接设到目标态，
 * 见 `withSortDirection`），所以这个函数当前**没有 UI 消费者**，由 `sort.test.mts`
 * 守着四值的行为。留着它是因为「反序」是排序操作里独立于 UI 的一档语义
 * （将来做「一键反序」快捷键、或别的入口时是现成的），删掉就要连测试一起重写。
 */
export function flipSortDirection(mode: SortMode): SortMode {
  return FLIPPED[mode]
}

/**
 * 更换方向、保持时间键——与 `withSortKey` 恰好成对：一个「换键保方向」，
 * 一个「换向保键」。排序菜单的「排序方向」组用它**直接设到目标方向**，而不是
 * 调 `flipSortDirection`：菜单是「点哪项就是哪项」，点当前已选中的那项必须是
 * 空操作，翻转语义在这里会把它变成「反手一下」。
 */
export function withSortDirection(mode: SortMode, ascending: boolean): SortMode {
  if (KEY_OF[mode] === 'updated') return ascending ? 'updatedAsc' : 'updatedDesc'
  return ascending ? 'createdAsc' : 'createdDesc'
}

/** 更换时间键、保持方向（顶栏「排序依据」分段） */
export function withSortKey(mode: SortMode, key: SortKey): SortMode {
  if (key === 'updated') return ASCENDING_OF[mode] ? 'updatedAsc' : 'updatedDesc'
  return ASCENDING_OF[mode] ? 'createdAsc' : 'createdDesc'
}

/**
 * 列表排序：返回新数组（不改入参）。定宽 ISO 串走 compareTimeKey（字典序 = 时间序），
 * 别用 localeCompare——理由见 dates/dateGroups.ts 的 compareTimeKey 注释。
 *
 * **补记条目在两个键下故意错开**（这是预期，不加特例）：补记的 `createdAt` 落在
 * 补过去的那天、`updatedAt` 是落盘时刻，于是「按更新时间·由新到旧」下它出现在
 * 最前面。它确实是刚写的， hide 它才是撒谎——解释这件事靠卡片元信息行那枚
 * 「补」标记（`MomoEntry.backfilled`，见 types/entry.ts），不靠排序作弊。
 * 回归见 scripts/sort.test.mts 的同名用例。
 */
export function sortEntries(entries: readonly MomoEntry[], mode: SortMode): MomoEntry[] {
  const field = FIELD_OF[KEY_OF[mode]]
  const dir = ASCENDING_OF[mode] ? 1 : -1
  return [...entries].sort((a, b) => dir * compareTimeKey(a[field], b[field]))
}
