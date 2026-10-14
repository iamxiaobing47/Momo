import { copy } from '../../momo/i18n'
import type { MomoEntry, SidebarSections } from '../../momo/types'
import type { TagNode } from '../../momo/tags'
import type { LocTreeNode } from '../../momo/locations'
import { Heatmap } from '../calendar/Heatmap'
import { TagTree } from '../tags/TagTree'
import { LocTreeSection } from '../locations/tree/LocTreeSection'
import type { MainMode } from '../store/types'
import type { IconName } from '../shared/icons'

/**
 * 侧栏插槽注册表（R7：原 navItems.tsx 的五条菜单项 + 本文件的四块可开关区块
 * 合成**一张表**）。数组顺序即侧栏顺序——菜单项（nav）与可开关区块（section）
 * 可以任意混排， Sidebar 只做一次遍历，连续的 nav 条目自动包进 `<nav>`。
 *
 * 为什么不再分两张表：旧结构里「菜单上方 / 菜单 / 菜单下方」被两张表 + afterNav
 * 布尔写死，新插槽（例如 P4 之后的洞察入口）想插在菜单旁边就得同时改两张表；
 * 合成一张后，加内容 = 在数组里加一条，Sidebar 的 JSX 一行不动。
 *
 * 门控收进条目语义（原消费者里的 inline 过滤）：nav 项的 `section` 开关与
 * section 块的 `id` 开关都表达为「这个键为 false 就不渲染」；`section: undefined`
 * 的 nav 项是常驻入口（「全部笔记」）。（2026-10-01 晚：曾有一条 `modes` 模式门控
 * 专供「全部地点」树只在地点模式出现——地点页面撤除、那棵树改成常驻之后，这个
 * 机制没有消费者了，连同它的过滤一起删掉；要恢复只是两行事。）
 *
 * 注册表自己不订 store：渲染入参（派生数）由 shell/Sidebar.tsx 折算一次传进来
 * （AGENTS.md §4.2：每条目的时间戳只折算一次、复用到底）。
 */

export interface SidebarSectionData {
  /** 速览三格：条目总数（= entries.length） */
  notes: number
  /** 速览三格：标签键数 */
  tags: number
  /** 速览三格：记录天数（本地日历日，dayOf 口径） */
  days: number
  /** 标签树：tagTreeOf(entries) */
  tagTree: TagNode[]
  /** 全库条目：标签树的时间 / 附件筛选要**逐条目**判（BUG-110c 起节点聚合值不参与筛） */
  entries: readonly MomoEntry[]
  /** 地点层级树（v0.9.31）：buildLocTree，侧栏「全部地点」区块的数据源 */
  locTree: readonly LocTreeNode[]
}

/** 菜单项（.momo-menu 里的一颗按钮） */
export interface SidebarSlotNav {
  kind: 'nav'
  /** 目标模式：点菜单项就是切到这个模式（store 的 MainMode，同一个联合类型） */
  mode: MainMode
  /** 显隐开关（prefs.sections 的键）；undefined = 常驻不可关 */
  section?: keyof SidebarSections
  /** 菜单文字（`copy.panel.nav`，字典仍是唯一真源；地点那一项已随地点页面撤除）。
   *  **写成函数、在渲染时现读**：模块级快照会把求值那一刻的语言（恒为 zh，
   *  setLocale 全部晚于模块求值）冻进字符串，en/ja 下侧栏各项永远是中文——
   *  与设置页 tab 的 BUG-04 同款（见 views/settings/sections.ts 的 SECTION_NAV_KEY）。 */
  label: () => string
  icon: IconName
}

/** 可开关区块（速览三格 / 活跃度 / 标签树 / 全部地点） */
export interface SidebarSlotSection {
  kind: 'section'
  /** 显隐开关（prefs.sections 的键） */
  id: keyof SidebarSections
  /** 渲染在导航菜单（.momo-menu）下方。v0.5 版面里只有标签树在菜单下方，
   *  缺省 = 菜单上方。新增区块按想落的位置打这个标记。 */
  afterNav?: boolean
  /** 这块里的控件会改列表筛选（活跃度点日期 / 地点树 / 标签树）。回顾档下这类区块整块
   *  锁住并给一句说明（BUG-123b：回顾批次是进档那一刻的快照，筛选变了它不重抽——
   *  不锁的话用户点了没反应，退出回顾列表才突然被筛） */
  filters?: true
  /** 区块 JSX（类名 / 文案与改造前逐字一致）。允许返回 null：「全部地点」树
   *  0 地点时连外壳一起不渲染（空 wrapper 会留一道孤零零的顶线）。 */
  render: (data: SidebarSectionData) => React.JSX.Element | null
}

export type SidebarSlot = SidebarSlotNav | SidebarSlotSection

/** 数组顺序 = 菜单上方区块 → 菜单 → 菜单下方区块（v0.5 版面序） */
const _SIDEBAR_SLOTS = [
  // —— 菜单上方：速览三格 + 活跃度（sections 开关）——
  {
    kind: 'section',
    id: 'quickStats',
    render: (d: SidebarSectionData) => (
      <div className="momo-quickstats">
        <div className="momo-qs">
          <span className="momo-qs-num">{d.notes}</span>
          <span className="momo-qs-label">{copy.panel.quickStats.notes}</span>
        </div>
        <div className="momo-qs">
          <span className="momo-qs-num">{d.tags}</span>
          <span className="momo-qs-label">{copy.panel.quickStats.tags}</span>
        </div>
        <div className="momo-qs">
          <span className="momo-qs-num">{d.days}</span>
          <span className="momo-qs-label">{copy.panel.quickStats.days}</span>
        </div>
      </div>
    ),
  },
  {
    kind: 'section',
    id: 'heatmap',
    filters: true,
    render: (): React.JSX.Element => (
      <div className="momo-sidebar-section">
        <Heatmap />
      </div>
    ),
  },
  // —— 菜单（.momo-menu）：「全部笔记」常驻不可关（关了就再进不去），
  //    回顾 / 统计 / 回收站挂各自开关 ——
  //    （2026-10-01 晚撤掉第 2 项「地点」：地点不再是浏览模式，它成了全部笔记的
  //     一个筛选维度 + 两档视图，入口在侧栏「全部地点」树与视图分段里。）
  { kind: 'nav', mode: 'list', section: undefined, label: () => copy.panel.nav.allNotes, icon: 'stack' },
  { kind: 'nav', mode: 'review', section: 'review', label: () => copy.panel.nav.review, icon: 'shuffle' },
  { kind: 'nav', mode: 'stats', section: 'stats', label: () => copy.panel.nav.stats, icon: 'chart' },
  { kind: 'nav', mode: 'trash', section: 'trash', label: () => copy.panel.nav.trash, icon: 'trash' },
  // —— 菜单下方：「全部地点」层级树 → 标签树 ——
  //    地点树紧跟回收站（用户点名的位置），标签树仍是最后一块。两个 afterNav
  //    区块的相对顺序 = 数组顺序，别为了「标签更重要」把地点树挪到它下面。
  //    2026-10-01 晚起它**常驻**（与「全部标签」同门槛：sections 开关管显隐），
  //    地点筛选在回收站页也吃，那里同样需要入口。
  {
    kind: 'section',
    id: 'locations',
    afterNav: true,
    filters: true,
    // 0 个地点连外壳一起不渲染：空 wrapper 会留下一道孤零零的顶线（组件内部
    // 的 nodes.length 守卫只挡内容，挡不住这条 margin + border-top）
    render: (d) =>
      d.locTree.length === 0 ? null : (
        <div className="momo-sidebar-section momo-locs-section">
          <LocTreeSection nodes={d.locTree} />
        </div>
      ),
  },
  // —— 菜单下方：标签树（置顶区 + 标签树强相关绑成一项开关；它不再是唯一 afterNav
//    区块——「全部地点」树 v0.9.31 ④ 起也挂在菜单下，见上一条）——
  {
    kind: 'section',
    id: 'tags',
    afterNav: true,
    filters: true,
    render: (d: SidebarSectionData) => (
      <div className="momo-sidebar-section momo-tags-section">
        <TagTree nodes={d.tagTree} entries={d.entries} />
      </div>
    ),
  },
] as const satisfies readonly SidebarSlot[]

/**
 * 对外给 SidebarSlot 视角（判别联合：消费侧按 kind 收窄都好用）；
 * `as const` 保下来的字面量只留给文件末尾的守卫数数用。
 */
export const SIDEBAR_SLOTS: readonly SidebarSlot[] = _SIDEBAR_SLOTS

/** 菜单项视图（Topbar 窄档模式分段、registry-guard 的合盖断言用）。
 *  过滤走**放宽后**的表：谓词类型必须窄于参数类型，拿 as const 私有表滤会 TS2677。 */
export const NAV_ITEMS: readonly SidebarSlotNav[] = SIDEBAR_SLOTS.filter(
  (s): s is SidebarSlotNav => s.kind === 'nav',
)

/** 编译期断言形参：「必须是 never」。实参不是 never 时约束不满足、声明处即报错。 */
type _AssertNever<T extends never> = T

type _NavModeOf<T> = T extends { kind: 'nav'; mode: infer M } ? M : never
type _SectionIdOf<T> = T extends { kind: 'section'; id: infer I } ? I : never
type _NavSectionOf<T> = T extends { kind: 'nav'; section: infer S } ? (S extends undefined ? never : S) : never

/**
 * 编译期守卫一：MainMode 的每个值都必须在这张表里有 nav 条目。
 * 防「加了新模式却忘了在侧栏给入口」。（数的是 as const 那张私有表：放宽后的
 * 联合每个 mode 都是整个 MainMode，守卫会恒真。）
 * `export` 只为消掉「defined but never used」（本仓 eslint 按 `^_` 忽略未用变量，
 * 评审平台跑的那份配置没有这条忽略）：导出即「被使用」，漏 nav 条目照旧编译不过。
 * 守卫本身一字未动。
 */
export type RegisteredNavMode = _NavModeOf<(typeof _SIDEBAR_SLOTS)[number]>
export type RegisteredNavSection = _NavSectionOf<(typeof _SIDEBAR_SLOTS)[number]>
type _ModesWithoutNavItem = Exclude<MainMode, RegisteredNavMode>
export type _EveryModeHasNavItem = _AssertNever<_ModesWithoutNavItem>

/**
 * 编译期守卫二：SidebarSections 的每个键都必须有归属——section 块的 id
 * （quickStats / heatmap / locations / tags）或 nav 项的 section（review / stats / trash；
 * 「全部笔记 / 地点」常驻无键）。一张表里漏一个键，下一行的约束就不满足。
 * 防「加了开关却没人渲染，设置里拨不动」。
 * `export` 同为消掉 unused 报告（本仓 eslint 按 `^_` 忽略，评审平台那份不忽略）：
 * 导出即「被使用」，漏归属照旧编译不过。守卫本身一字未动。
 */
export type RegisteredSectionId = _SectionIdOf<(typeof _SIDEBAR_SLOTS)[number]>
type _UnregisteredSections = Exclude<keyof SidebarSections, RegisteredSectionId | RegisteredNavSection>
export type _EverySectionHasOwner = _AssertNever<_UnregisteredSections>
