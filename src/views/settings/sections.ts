import type { MomoService } from '../../momo/service'
import { FEATURES } from '../../momo/core'
import { copy } from '../../momo/i18n'
import {
  BRAND_NAME_MAX,
  CARD_FONT_SIZE,
  CARD_RADIUS,
  CARD_TITLE_SIZE,
  DEFAULT_BRAND_NAME,
  DEFAULT_DENSITY_VIEWS,
  DEFAULT_SECTIONS,
  DEFAULT_STATS_SECTIONS,
  HEATMAP_MONTHS,
  REVIEW_COUNT,
  SIDEBAR_WIDTH,
  TITLE_MAX,
  type MomoData,
} from '../../momo/types'

// 设置页的分页定义与默认值（七个区段是**分页**，不是一张长页面的锚点：同一时刻只有
// 一个区段可见）。SECTION_IDS 同时是 DOM 锚点 id 与 card() 的入参，两边共用一份。

/** main.ts 注入的能力：views/ 不反向 import main.ts，避免循环依赖 */
export interface MomoHost {
  service: MomoService
  moveViewTo(side: 'left' | 'right'): Promise<void>
}

/** 七个区段的锚点 id（文案在 `copy.settingsPage.nav`；顺序即页面顺序） */
export const SECTION_IDS = [
  'momo-set-paths',
  'momo-set-look',
  'momo-set-panel',
  'momo-set-review',
  'momo-set-stats',
  'momo-set-loc',
  'momo-set-tags',
] as const

export type SectionId = (typeof SECTION_IDS)[number]

// 插槽锚定（R1b）：core/features.ts 里声明过 settingsTab 的功能，其值必须是真 tab id。
// 放在本文件（SECTION_IDS 的拥有者）——src/momo/ 不许向上 import，锚定只能由
// 拥有插槽的这一层反向做。守卫形式与 ui/registry/featureSlots.ts 的侧栏锚定同款
// （分布式条件提取 + 形参约束；_AssertNever 本文件末尾已有一份，不重复声明）。
// `export` 只为消掉「defined but never used」：本仓 eslint 按 `^_` 忽略未用变量，
// 评审平台那份配置不带这条忽略，13 处编译守卫全被它报出来。导出即「被使用」，
// 守卫本身一字未动——插槽指向不存在的 tab 照旧编译不过。
type _AssertSlotNever<T extends never> = T
type _SettingsTabOf<T> = T extends { slots: { settingsTab: infer V } } ? V : never
type _DeclaredSettingsTab = _SettingsTabOf<(typeof FEATURES)[number]>
type _UnknownSettingsTab = Exclude<_DeclaredSettingsTab, SectionId>
export type _EverySettingsTabIsReal = _AssertSlotNever<_UnknownSettingsTab>

/** 锚点 id → 导航 chip 文案（**调用时**现读字典）：模块级快照会把求值时刻（恒为
 *  zh，setLocale 全部晚于模块求值）的语言冻结进字符串，en/ja 永远半中半英（BUG-04） */
const SECTION_NAV_KEY = {
  'momo-set-paths': 'paths',
  'momo-set-look': 'look',
  'momo-set-panel': 'panel',
  'momo-set-review': 'review',
  'momo-set-stats': 'stats',
  'momo-set-loc': 'loc',
  'momo-set-tags': 'tags',
} as const satisfies Record<SectionId, keyof typeof copy.settingsPage.nav>

export function sectionLabel(id: SectionId): string {
  return copy.settingsPage.nav[SECTION_NAV_KEY[id]]
}

/** 设置页覆盖到的 prefs 默认值（卡片级「恢复默认」用；视图状态如 pinned / sortMode 不动）。
 *  `satisfies` 而不是类型标注：保住每个字段的字面量类型（消费方按字面量收窄），
 *  同时把「键名打错」纳入 excess property 检查——旧写法整对象无标注，多写一个
 *  colorSchem 要等 LookTab 读不到时才报错，出错点隔了一个文件（L1）。 */
export const PREFS_DEFAULTS = {
  sidebarWidth: SIDEBAR_WIDTH.default,
  sidebarSide: 'left' as const,
  sections: { ...DEFAULT_SECTIONS },
  // 顶栏视图分段的显隐与顺序（v0.9.17）：恢复默认 = 全部档位全开、顺序回
  // DENSITIES 声明序。逐项拷贝——常量是共享的 readonly 表，直接塞引用会让
  // 「恢复默认」与运行时那份状态指向同一个对象。
  densityViews: DEFAULT_DENSITY_VIEWS.map((v) => ({ ...v })),
  statsSections: { ...DEFAULT_STATS_SECTIONS },
  reviewCount: REVIEW_COUNT.default,
  heatmapMonths: HEATMAP_MONTHS.default,
  // 配色（2026-10-11 用户裁定「默认是雾蓝，它排在第一个」）：恢复默认 = 回雾蓝，
  // 与 COLOR_SCHEMES 排第一的那个一致（brandIcon 的 leaf 同款约定）
  colorScheme: 'mist-blue',
  // `customCss` **刻意不在这个表里**（BUG-119a，同 BUG-88 的裁决）：v0.9.11 起它没有任何编辑入口，
  // 值只能来自用户手改 data.json——恢复默认清掉它，界面上再无入口补回来（类型契约见
  // types/entry.ts 的 customCss 注释：「恢复默认同样不清它」）。
  // 字体（v0.9.16）：恢复默认 = 两格回空串（面板走 --momo-sans 原栈，卡片跟面板）
  uiFont: '',
  cardFont: '',
  // 短首行不作为标题（v0.9.46 起）：恢复默认 = 回到「关」
  titleFromFirstLine: false,
  titleMaxChars: TITLE_MAX.default,
  // 只读浏览默认开（v0.9.47 起）：恢复默认 = 回到「开」
  readOnly: true,
  brandIcon: 'leaf',
  brandName: DEFAULT_BRAND_NAME,
  tagPosition: 'meta',
  // 地点标签位置（2026-10-01 从 tagPosition 拆出）：恢复默认 = 回 meta
  locPosition: 'meta',
  // UI 微调三档 / 卡片时间粒度 / 字数开关 / 左上角自定义图标（v0.9.1）
  cardFontSize: CARD_FONT_SIZE.default,
  cardTitleSize: CARD_TITLE_SIZE.default,
  cardRadius: CARD_RADIUS.default,
  cardGap: 'md',
  cardStamp: 'auto',
  showCharCount: true,
  // 卡片右上角操作按钮显隐（v0.9.22）：恢复默认 = 三枚全开（升级前写死的行为）
  showCardCopy: true,
  showCardTag: true,
  showCardDelete: true,
  // 正文预热比例（v0.9.14 起可配）：默认一半 = v0.9.13 起写死的行为
  warmRatio: 'half',
  // 界面语言：恢复默认 = 回「跟随 Obsidian」
  lang: 'auto',
  // 左上角自定义图标（v0.9.12 起多图）：恢复默认 = 生效位回空串。
  // `brandIconImages`（上传清单）**刻意不在这个表里**（BUG-88）：那些图是 vault
  // 里的用户文件，恢复默认清掉引用之后界面上再无入口加回来，等于替用户删了图标
  // （同 locCoords / pinnedNotes 的口径：用户数据不进 PREFS_DEFAULTS）。删文件
  // 只能走格子角上的 ×。
  brandIconImage: '',
  // 「地点」卡的纯设置四项（newNoteLocations / locTreeExpand / locLevel /
  // globeEarth）**刻意不在这个表里**（BUG-126g）：这张卡的卡头没有「恢复默认」
  // 按钮——卡上同时住着 locCoords / locRegions 这类用户数据，同在卡头的按钮
  // 没法只清设置不清数据，与「恢复默认不清手填」自相矛盾（LocTab.ts 头部注释）。
  // 于是这四项没有任何消费恢复默认的路径，留在表里是永远不会被读的死值（旧注释
  // 说「同卡三行两行回默认一行不回的裂缝」——那个裂缝的前提是卡头真有按钮）。
  // 盘上缺省仍由 DEFAULT_DATA.prefs 与 sanitize 兜底（types/entry.ts / serviceDisk.ts）。
} satisfies Partial<MomoData['prefs']>

/** 统计卡区块的名字与说明在字典 `copy.settingsPage.stats.section`（Record 全键覆盖，漏一个编译不过）。
 *  说明里可能带品牌词（BUG-105c：`Momo 侧栏里…` → `<品牌> 侧栏里…`），所以 desc 允许是
 *  吃 brand 的函数；BUG-126e 起 desc 也可能是吃数字的函数（档数 / Top N 由调用方传真源常量，
 *  如 `CHAR_BIN_UPPER.length + 1` / `STATS_LONGEST_TOP` / `STATS_LOC_RANK_TOP`）。
 *
 *  L6：本 helper 只回 `{ name }`。desc 的消费者已全部退场（v0.9.2 移除 chip.title、
 *  2026-10-09 删掉 statsMock），它继续活在三语字典里备查，但不再经过这里广告——
 *  旧返回类型把「裸串 / 吃 brand / 吃 number」并成一个联合，`typeof desc === 'function'`
 *  只能窄化到两个没有共同形参的签名，`desc(x)` 直接编译不过：一个谁也调不了的联合，
 *  却在随 BUG-105a/b 的派生要求持续维护。 */
export const statsSectionMeta = (key: keyof MomoData['prefs']['statsSections']): { name: string } => {
  const { name } = copy.settingsPage.stats.section[key]
  return { name }
}

/**
 * 侧栏功能开关的渲染顺序。**顺序即主面板侧栏的自上而下视觉顺序**（用户 2026-10-06
 * 点名要求「配置页面侧栏功能的顺序，和主页面面板里的顺序保持一致」）：
 * 速览数字 → 热力图 → 菜单（随机回顾 / 统计页 / 回收站）→ 地点树 → 标签树。
 *
 * 真源是 `ui/registry/sidebarSections.tsx` 的 `SIDEBAR_SLOTS` 数组顺序（nav 项与
 * section 块按序混排那一张表）；本表是它在设置页里的投影——nav 项取各自 `section`
 * 键，「全部笔记」常驻无键故不出现。**两边改一头就会漂**：回归守卫见
 * `scripts/settings-page.test.mts` 的「侧栏功能开关的排序与主面板侧栏的视觉顺序一致」。
 *
 * 键的完整性与文案由 `copy.settingsPage.panel.sidebarToggle` 守住。
 */
export const SIDEBAR_TOGGLE_KEYS = ['quickStats', 'heatmap', 'review', 'stats', 'trash', 'locations', 'tags'] as const

/**
 * 编译期守卫：SidebarSections 新增键时必须同步加进 SIDEBAR_TOGGLE_KEYS，
 * 否则下一行（目标类型 never）编译失败——防「加了侧栏区块却没有开关」。
 * 形式是 `_AssertNever<T extends never>`：旧写法 `const _x: T = undefined as never`
 * 恒成立（never 可赋给任何类型），从不报错；形参约束才真拦。
 * `export` 只为消掉「defined but never used」（理由见本文件插槽锚定那一段的注释）：
 * 导出即「被使用」，漏键照旧编译不过。
 */
type _MissingToggle = Exclude<keyof MomoData['prefs']['sections'], (typeof SIDEBAR_TOGGLE_KEYS)[number]>
type _AssertNever<T extends never> = T
export type _AllTogglesListed = _AssertNever<_MissingToggle>

/** 品牌名的字数上限与回退值：LookTab 的输入框与 service 的 sanitize 共用 */
export { BRAND_NAME_MAX, DEFAULT_BRAND_NAME }
