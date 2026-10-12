// 设置页入口（barrel）。main.ts 只认这一个路径：`import { MomoSettingTab } from './views/settings'`。
//
// 拆分：sections.ts 分页定义与默认值 · dom.ts DOM 基建 · fields.ts 控件库 ·
// context.ts 各分页的共享上下文 · PathsTab / LookTab / PanelTab / ReviewTab / StatsTab /
// LocTab / TagsTab 七个分页各一个文件 · settings.ts 只剩编排（display 跑一遍）。

export { MomoSettingTab } from './settings'
export type { MomoHost } from './sections'
export { PREFS_DEFAULTS, SECTION_IDS, sectionLabel } from './sections'
export type { SectionId } from './sections'
export { SECTION_TABS } from './tabs'
export type { SettingsTabDef } from './tabs'
