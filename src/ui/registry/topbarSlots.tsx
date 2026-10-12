import type { ComponentType } from 'react'
import type { MainMode } from '../store/types'
import { ListControls, type ListControlsProps } from '../shell/controls/ListControls'
import { ReviewControls } from '../shell/controls/ReviewControls'
import { TrashControls } from '../shell/controls/TrashControls'
import { StatsControls } from '../shell/controls/StatsControls'

// 顶栏控件组注册表（组件化 P4 的插槽之一，与 statsCards 样板同形）。
//
// 服务对象：`shell/Topbar` —— 它只留布局（发布框 / 侧栏按钮 / 多选态分支 /
// 批量标签弹层锚点），「这个模式顶栏右半出现哪套控件」查这张表：
// `TOPBAR_SLOTS[mode]`。四套控件（P3 拆的 controls/）各自只订自己要的 store 字段，
// 本表再把这层 if 链换成查表。
//
// 加一种模式 / 换一套控件：
//   ① `store/types.ts` 的 `MainMode` 加成员 —— 下面这条 `Record<MainMode,…>`
//      会立刻编译不过（缺键），顶栏与 CardFlow 同步报
//   ② 控件组放 `shell/controls/` 下（自管订阅，不推翻 props），本表挂到对应 mode 上
//   ③ 文案进 `i18n/zh/` 对应域，控件自己从 `copy` 读——注册表不碰文案
// （SelectModeControls **刻意不在表里**：它不是按 mode 选，是 selectMode 迭加上来的，
//   条件渲染留在 Topbar。）
//
// 2026-10-01 晚：地点模式撤除，`LocationControls` 随之删除——它相对列表模式
// 只多一颗星球图标（搜索 / 密度 / 排序 / 多选列表模式全有），那颗图标搬进
// `ListControls` 的 `DensitySegmented`，并多带一档「地点分组」。
// 2026-10-09：这两档与三档密度一样收进 `prefs.densityViews`（同一个开关 + 排序
// 集合），`DensitySegmented` 的 `withLocViews` 开关随之删除。

/**
 * 顶栏控件组的 props：四套里**只有列表那一组真的收**（搜索框草稿 + DOM 引用 +
 * 进入多选），另外三组签名不收参数。
 *
 * 收口方式不需要断言：TS 里「参数更少的函数」可以赋值给「参数更多的函数类型」，
 * 所以 `() => JSX.Element`（ReviewControls / TrashControls / StatsControls）天然
 * 符合 `ComponentType<ListControlsProps>`。表的值类型统一成这一份超集，
 * Topbar 才能用一个 `<ModeControls … />` 渲染四套。
 *
 * v0.9.31 ④：曾经挂在这儿的 `locGroups` / `locTree`（跳转浮层的组名表与三级树）
 * 随浮层一起搬去了侧栏「全部地点」区块（src/ui/locations/tree/LocTreeSection.tsx）——
 * 顶栏不为地点多收任何 prop（星球与地点分组两档在 ListControls 里）。
 */
export type TopbarControlProps = ListControlsProps

/**
 * mode → 控件组。
 *
 * `Record<MainMode,…>` 本身就是编译期守卫：新增模式忘了挂控件 = 缺键编译错误；
 * 反过来挂到不存在的 mode 上 = 对象字面量 excess property 错误。两条路都堵死，
 * 不需要再写 never 哨兵。
 */
export const TOPBAR_SLOTS: Record<MainMode, ComponentType<TopbarControlProps>> = {
  list: ListControls,
  review: ReviewControls,
  trash: TrashControls,
  stats: StatsControls,
}
