/**
 * 随机回顾（Review.tsx + App.tsx 顶栏的回顾方式分段）。
 * 回顾档那张卡就是主页面的 Card（2026-10-13），卡内文案（时间戳 / 操作行 /
 * 「在 Obsidian 中打开」）走 `copy.card`，这里只管回顾页自己的框与键。
 */
import type { ReviewMode } from '../../review'

/** 抽不出东西的唯一成因是**池子空**（没有笔记，或当前筛选没命中）：random 与 stale
 *  都是这一种（stale 是 sort + slice，池子非空就必出结果，见 `momo/review/review.ts`），
 *  所以两句共用一句实话，不说「还没到时候」。 */
const emptyPool = (brand: string): string => `暂无${brand}可回顾`

export const review = {
  /** 空批次时的标题（按抽法不同）——品牌词走入参 */
  empty: {
    onthisday: (brand: string): string => `往年今日没有${brand}`,
    stale: emptyPool,
    week: '最近一周内都看过了',
    month: '最近一月内都看过了',
    random: emptyPool,
  },

  backToAll: '回到全部笔记',
  /** 顶栏：重抽一批 / 结束回顾 */
  refresh: '刷新',
  end: '结束回顾',
  /** 回顾页顶部的**筛选回显**（只读，BUG-123b 的可见面）：回顾批次是进档那一刻
   *  `matched()` 的快照，而回顾档的侧栏筛选区块整块锁着、顶栏也没有搜索框——
   *  「这批是按什么筛出来的」只剩这一行说得清，所以在这里原样摆出来（不可修改）。
   *  `search` 那枚是回顾档专属的补贴：筛选条刻意不出搜索胶囊（顶栏搜索框就近
   *  看得见），而回顾档没有搜索框，搜过的词不留痕迹就是「筛了却看不见」。 */
  filters: {
    label: '当前筛选',
    search: (q: string): string => `搜索「${q}」`,
  },
  /** 一批看完：`这批 10 张已看完`（单位全仓只叫「批」，不再另起一个「轮」） */
  doneBatch: (count: number): string => `这批 ${count} 张已看完`,
  newBatch: '再抽一批',
  /** 进度：`第 3 张 / 共 10 张` */
  step: (d: { index: number; total: number }): string => `第 ${d.index} 张 / 共 ${d.total} 张`,
  /** 连续记录：`连续 12 天` */
  streak: (days: number): string => `连续 ${days} 天`,
  prev: '上一个',
  next: '下一个',

  /** 回顾方式（顶栏分段控件的可选值与显示名） */
  mode: {
    random: '随机',
    week: '一周未看',
    month: '一月未看',
    stale: '很久没看',
    onthisday: '往年今日',
  } satisfies Record<ReviewMode, string>,
  /** 分段控件容器的 aria-label */
  modeAria: '回顾方式',
}
