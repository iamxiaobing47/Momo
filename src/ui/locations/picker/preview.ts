import type { MomoEntry } from '../../../momo/types'
import { LOCATIONS_MAX, canonicalLocName, normalizeLocations } from '../../../momo/locations'

// 「点下去会改动几条」的预算（纯函数）：待处理地点 → 会改几条、是否无事可做。
// 与 tagPicker/preview.ts 同一分工——两种模式的空操作判定是 service 两套写入
// 逻辑的直接投影，两边一旦对不上，就会出现「UI 说将改动 N 条、Notice 说改了
// M 条」这类静默不一致：
//   加 = 该条 Momo 已含**全部**待加地点（service.addLocations 的 missing.length === 0）；
//   去 = 该条 Momo **一个**待摘地点都没有（service.removeLocations 的 next.length === cur.length）。
//
// 口径注意：数的是**条**（Momo 条目），不是「个」（地点）——底栏摘要写的是
// 「将改动 N 条」，与 caps 层 Notice 的「改动 N 条」同源（service 的 updated
// 数的就是文件数）。早期实现按待处理地点过滤，10 条全加同一批地点时会把
// 「将改动 2 条」显示成 Notice 里的「改动 10 条」，回归测试见
// scripts/loc-preview.test.mts。

export interface LocApplyPreview {
  /** 真会改写并落盘的条数（= service 侧 updated，假设无失败） */
  willWrite: number
  /** 有待处理地点、但一条都不会改（按钮禁用） */
  nothingToDo: boolean
}

export function applyLocPreview(
  picked: readonly MomoEntry[],
  pending: readonly string[],
  isRemove: boolean,
): LocApplyPreview {
  // BUG-52：待处理队列先过**与 service 同一道归一闸门**（大洲名 / 超长 / 超 8 个
  // 写侧会静默丢掉）。UI 若拿原始 pending 算 willWrite，就会出现「预告改 10 条、
  // 实际改 0 条」。输入侧已拦住绝大多数，这里再兜一层，保证两个数同源。
  const gate = normalizeLocations(pending)
  // BUG-110a：两边再过**身份**（canonicalLocName）——盘上是「纽约」时待加
  // 「New York」= 已含，与 service 的按身份判定逐字对齐（entry 的 locations
  // 读侧本来就是身份形，这里对双保险：直接构造的 MomoEntry 也吃得住）
  const ids = gate.map((l) => canonicalLocName(l)).filter((id) => id !== '')
  const willWrite = picked.filter((e) => {
    const own = new Set(e.locations.map((l) => canonicalLocName(l)))
    // 已满 8 个身份：service.addLocations 计 skipped、一个字节不写（BUG-118b 后读写同按身份数）
    if (!isRemove && own.size >= LOCATIONS_MAX) return false
    return isRemove ? ids.some((id) => own.has(id)) : ids.some((id) => !own.has(id))
  }).length
  return { willWrite, nothingToDo: pending.length > 0 && willWrite === 0 }
}
