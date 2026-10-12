import { tagKey } from '../../../momo/tags'
import type { MomoEntry } from '../../../momo/types'

// 「点下去会发生什么」的预算（纯函数）：待处理标签 → 会改几条、有几条空操作。
// 两种模式的空操作判定**不同**（这是 service 两套写入逻辑的直接投影）：
//   加 = 待加标签**全都已含**的 Momo（service.addTags 的 missing.length === 0）；
//   去 = **一个待摘标签都没有**的 Momo（service.removeTags 的两处都没命中）。
// 两边一旦对不上，就会出现「UI 说已含、文件其实没写」这类静默不一致。

export interface ApplyPreview {
  /** 空操作（不会落盘）的条数 */
  willSkip: number
  /** 真会改写的条数 */
  willWrite: number
  /** 有待处理标签、但一条都不会改（按钮禁用） */
  nothingToDo: boolean
}

export function applyPreview(
  picked: readonly MomoEntry[],
  pending: readonly string[],
  isRemove: boolean,
): ApplyPreview {
  const pendingKeys = pending.map((t) => tagKey(t))
  const willSkip = picked.filter((e) => {
    const owned = new Set(e.tags.map(tagKey))
    return isRemove
      ? !pendingKeys.some((k) => owned.has(k))
      : pendingKeys.every((k) => owned.has(k))
  }).length
  const willWrite = picked.length - willSkip
  return { willSkip, willWrite, nothingToDo: pending.length > 0 && willWrite === 0 }
}
