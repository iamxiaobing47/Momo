// 插槽锚定（R1b）：core/features.ts 登记的 slot 值必须落在真实插槽表里——
// 「注册了一个功能、却指向一个不存在的插槽」要**编译不过**，而不是运行时静默丢失。
//
// 锚定放在**拥有该插槽的层**（src/momo/ 不许向上 import）：侧栏两张表
// （navItems / sidebarSections）住在 ui/registry/，所以侧栏锚定在本文件；
// 设置 tab 锚定在 views/settings/sections.ts（SECTION_IDS 的拥有者）；
// 命令 / 卡片动作两个锚定随 R6 / R8b 的 COMMANDS / cardActions 表落地时补——
// 表建出来才有锚可对，提前建空壳只是假结构。
//
// 机制照 components.md §3.3 的既有模式，两个坑都在那里记着：
//   ① 源数组必须 as const 保住字面量（FEATURES 已是），被注解成宽类型后
//      Exclude 退化成 never，守卫恒真；
//   ② 必须写成形参约束 `_AssertNever<T extends never>`，`const _x: T = undefined as never`
//      恒成立、守不住任何东西。
import { FEATURES } from '../../momo/core'
import type { SidebarSections } from '../../momo/types'

type _AssertNever<T extends never> = T

/** 侧栏插槽：FEATURES 里声明过 sidebarSection 的功能，其值必须都是 prefs.sections 的真键。
 *  分布式条件提取：没有该属性的条目（如 premium 的 `slots: {}`）自然落到 never，
 *  不会把 unknown 漏进并集——直接索引联合会撞「属性不存在」的 TS2339。 */
type _SidebarSlotOf<T> = T extends { slots: { sidebarSection: infer V } } ? V : never
type _DeclaredSidebarSection = _SidebarSlotOf<(typeof FEATURES)[number]>
type _UnknownSidebarSection = Exclude<_DeclaredSidebarSection, keyof SidebarSections>
type _EverySidebarSlotIsReal = _AssertNever<_UnknownSidebarSection>
