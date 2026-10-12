import type { MainMode } from '../store'

// 支持多选的模式（UI-9：列表 / 回顾）。
// 顶栏（SelectModeControls 的条件渲染）与 App（进多选时落哪个模式）用同一份判定——
// 两处各写一遍 `mode === 'list' || mode === 'review'` 的话，加一个模式必然漏一边：
// 就会出现「顶栏给了全选钮、批量条却不出现」这种半残疾状态。
//
// 回收站与统计**刻意不在内**：前者是软删除的中间态（多选删除没有意义），
// 后者是聚合视图（没有「选中哪几条」的概念）。
// （2026-10-01 晚：地点模式撤除后从三值收窄回两值——地点视图只是全部笔记里的
//   一档，多选能力跟着列表模式走，不需要再单列。）

/** 支持多选的模式（顺序无意义） */
export const SELECTABLE_MODES = ['list', 'review'] as const satisfies readonly MainMode[]

export function supportsSelectMode(mode: MainMode): boolean {
  return (SELECTABLE_MODES as readonly MainMode[]).includes(mode)
}
