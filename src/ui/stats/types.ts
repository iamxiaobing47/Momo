// 统计页组件之间共享的类型。卡片只管「把一个数字讲清楚」，跳模式与打筛选
// 全部收到 `StatsDrill` 一个对象里——组件从此不需要认识 store 的动作清单。

import type { ReviewedFilter } from '../store/types'

/** 趋势柱的一列（展示化后的点：粒度语义已在 StatsPage 翻译成 label / drillLabel / days） */
export interface TrendBarPoint {
  key: string
  count: number
  /** 轴 / 柱底短标签：月粒度「9 月」、周粒度「9/14 周」 */
  label: string
  /**
   * 下钻说明（aria-label，带统一前缀）：月粒度「跳转到全部笔记 · 筛选：2026 年 9 月（N 条）」、
   * 周粒度「跳转到全部笔记 · 筛选：2026-09-14 起当周（N 条）」。
   * v0.9.2 起口径长句不进原生 title，这是柱子上唯一的文字说明（见 drill.tsx）。
   */
  drillLabel: string
  /** 这根柱子覆盖的日期键（YYYY-MM-DD）：点柱即按这组日期筛列表——与格子上的数字同源 */
  days: string[]
}

/**
 * 下钻（v0.7.0 用户要求「能点击跳转到全部笔记进行筛选的都尽可能做到」）：
 * 统计数字从此不只是展示——点一下带着对应的筛选跳回全部笔记，看到底是哪些 Momo
 * 算出了这个数。所有筛选维度与列表既有口径同源（小时 / 星期 / 字数 / 标签个数 /
 * 回顾记录 / 日期 / 标签 / 地点），在筛选条里各是一枚可移除的胶囊，条件之间取交集。
 *
 * v0.9.33 的地点维度一开始是唯一的例外（跳地点模式）；2026-10-01 晚地点模式撤除后
 * 它也回到这条主路：`filterByLocation` = 回全部笔记 + 把该地点设成唯一地点筛选。
 */
export interface StatsDrill {
  filterByTag: (key: string) => void
  filterUntagged: () => void
  filterByDates: (days: string[]) => void
  filterByHours: (hours: number[]) => void
  filterByWeekdays: (days: number[]) => void
  filterByLength: (min: number, max: number) => void
  filterByTagCount: (min: number, max: number) => void
  /** v0.9.37 起四档（新增近 7 / 近 30 天两个时间窗） */
  filterByReviewed: (which: ReviewedFilter) => void
  filterByLocation: (loc: string) => void
}
