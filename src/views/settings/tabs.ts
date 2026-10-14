// 设置页分页注册表（R8a 插槽化）：SECTION_IDS 的每个区段都必须在这里有一条
// { id, label, build }——「加了 tab id 却忘了写建造函数」从「静默回落第一页」
// （paintTab 的兜底）变成**编译不过**（本文件末尾的 _AssertNever 守卫）。
//
// P4 的「账户」tab 是第一个付费插槽：往表里加一条、（将来）带 visible? 即可，
// settings.ts 的 chip 循环与建造循环都不用改。
//
// 模式照 components.md §3.3：私有 `as const` 数组保住 id 字面量给守卫数数，
// 对外放宽成 `readonly SettingsTabDef[]`——消费侧当宽类型用（不跟着 literal 变窄），
// 守卫数的是 as const 那张私有表（宽了 Exclude 会恒真）。
import type { SettingsCtx } from './context'
import { sectionLabel, type SectionId } from './sections'
import { buildPathsTab } from './PathsTab'
import { buildLookTab } from './LookTab'
import { buildPanelTab } from './PanelTab'
import { buildReviewTab } from './ReviewTab'
import { buildStatsTab } from './StatsTab'
import { buildLocTab } from './LocTab'
import { buildTagsTab } from './TagsTab'

export interface SettingsTabDef {
  id: SectionId
  /** 导航 chip 文案（**延迟求值**）：模块表若存字符串，会把求值时刻的语言冻结住
   *  （setLocale 全部晚于模块求值），en/ja 的导航永远停在 zh（BUG-04） */
  label: () => string
  /** 显隐（entitlement 门，P4 起用）：缺省 = 常驻。设置页只渲染可见的 tab */
  visible?: () => boolean
  build: (ctx: SettingsCtx) => void
}

const _SECTION_TABS = [
  // ① 文件路径
  { id: 'momo-set-paths', label: () => sectionLabel('momo-set-paths'), build: buildPathsTab },
  // ② 界面外观
  { id: 'momo-set-look', label: () => sectionLabel('momo-set-look'), build: buildLookTab },
  // ③ 面板与侧栏
  { id: 'momo-set-panel', label: () => sectionLabel('momo-set-panel'), build: buildPanelTab },
  // ④ 回顾与活跃度
  { id: 'momo-set-review', label: () => sectionLabel('momo-set-review'), build: buildReviewTab },
  // ⑤ 统计页
  { id: 'momo-set-stats', label: () => sectionLabel('momo-set-stats'), build: buildStatsTab },
  // ⑥ 地点
  { id: 'momo-set-loc', label: () => sectionLabel('momo-set-loc'), build: buildLocTab },
  // ⑦ 标签（失效标签体检：识别含空白的标签 + 清除空格修复）
  { id: 'momo-set-tags', label: () => sectionLabel('momo-set-tags'), build: buildTagsTab },
] as const satisfies readonly SettingsTabDef[]

/** 数组顺序即 tab 顺序（= SECTION_IDS 的声明序） */
export const SECTION_TABS: readonly SettingsTabDef[] = _SECTION_TABS

// R8a 编译守卫：SECTION_IDS 的每个 id 都必须在表里有建造函数。反向由
// `id: SectionId` 的类型约束保证（表里出现表外 id = excess property 错误）。
// `export` 只为消掉「defined but never used」（本仓 eslint 按 `^_` 忽略，评审平台那份
// 不忽略）：导出即「被使用」，漏建造函数照旧编译不过。
type _AssertNever<T extends never> = T
type _TabIds = (typeof _SECTION_TABS)[number]['id']
type _MissingTab = Exclude<SectionId, _TabIds>
export type _EverySectionHasTab = _AssertNever<_MissingTab>
