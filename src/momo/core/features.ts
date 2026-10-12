// 功能注册表（P2，docs/design/feature-registry-design.md）：一切功能的唯一登记处。
// 纯数据（obsidian-free、可测）；渲染组件在 ui/registry、命令实现在 views/commands。
//
// 可插拔语义：注册（本表）→ 启用（prefs 开关 × entitlement）→ 挂载（插槽渲染）。
// UI 只认插槽不认功能——加第三个付费功能时 App.tsx 一行不改。
// 免费功能也登记在本表（premium: false），证明模式并给守卫一个统一数据源。

export const PREMIUM_FEATURES = ['cloud.backup', 'plaza.share', 'agent.insight'] as const

export type PremiumFeature = (typeof PREMIUM_FEATURES)[number]

/** 功能可参与的插槽（feature-registry-design.md §3）。空对象 = 尚未接插槽（分期落地） */
export interface FeatureSlots {
  /** 侧栏分区（prefs.sections 的键；对应 ui/registry/sidebarSections / navItems） */
  sidebarSection?: string
  /** 设置页 tab（SECTION_IDS 锚点 id；P3 的「账户」tab 是第一个付费插槽） */
  settingsTab?: string
  /** 卡片操作行按钮（ui/registry/cardActions） */
  cardAction?: boolean
  /** 命令面板命令 id（views/commands 表） */
  command?: string
}

export interface FeatureDef {
  /** 唯一 id（守卫查重）；约定 `<域>.<动作>`，免费功能用单词 */
  id: string
  /** 是否需要权益（true = 过 PremiumGate + 服务端校验） */
  premium: boolean
  slots: FeatureSlots
}

// `as const satisfies`（components.md §3.3 的既有模式）：保住 slot 值的字面量类型，
// 各插槽拥有层的锚定守卫才能做 Exclude 差集（R1b：ui/registry/featureSlots.ts 的
// 侧栏锚定 + views/settings/sections.ts 的设置 tab 锚定 + views/commands.ts 的
// 命令锚定）。不让它 widening 成 `readonly FeatureDef[]`——那会让守卫恒真。
// 消费侧（featureById 等）拿到的是字面量联合，取值集合不变。
/**
 * 功能总表。**免费功能的 slots 已填全**（R1a）：每个用户可见能力都登记了它参与
 * 哪些插槽——`sidebarSection` = 侧栏分区（prefs.sections 的键，对应 registry 的
 * navItems / sidebarSections）、`settingsTab` = 设置页 tab（SECTION_IDS 锚点 id）、
 * `cardAction` = 卡片操作行有它的动作（对应 registry 的 cardActions 表）、
 * `command` = 命令面板主命令（完整「命令 ↔ 功能」映射以 views/ 的 COMMANDS 注册表
 * 为权威，这里是主命令索引）。2026-09-30 命令面板裁到四条（打开 / 新建 / 补记 /
 * 预写，全属 notes）之后，notes 之外的功能不再有命令面板入口：回顾走侧栏分区、
 * 面板搬家走标签页右键菜单与设置页——功能没少，只是不再各占一行命令。
 *
 * 付费功能仍然**全部锁死**（P2 只上锁点不实现功能）：slots 保持 `{}`，各期落地时
 * 填——cloud.backup → P4（设置页「账户」tab）、plaza.share → P5（卡片动作 / 命令）、
 * agent.insight → P6（侧栏 / 命令）。premium 锁点三件套（PremiumGate / billing·
 * cloud 文案 / 编译守卫）按 2026-09-29 与 09-30 两次裁定随 P4 一起落地，见
 * 2026-09-29-commercialization-refactor.md P4。
 */
export const FEATURES = [
  { id: 'notes', premium: false, slots: { command: 'open-Momo', settingsTab: 'momo-set-paths', cardAction: true } },
  // 地点（F1：2026-10-01 晚页面撤除，成了全部笔记的一个筛选维度 + 两档视图）：
  // 侧栏「全部地点」树有自己的开关（sections.locations ⇒ 这里登记 sidebarSection），
  // 视图分段那两颗图标跟着列表模式走、没有独立开关；设置项落在设置页「地点」tab。
  { id: 'location', premium: false, slots: { sidebarSection: 'locations', settingsTab: 'momo-set-loc' } },
  { id: 'quickStats', premium: false, slots: { sidebarSection: 'quickStats', settingsTab: 'momo-set-panel' } },
  { id: 'heatmap', premium: false, slots: { sidebarSection: 'heatmap', settingsTab: 'momo-set-panel' } },
  // 标签：侧栏标签区（可关）+ 设置页自己的「标签」页（失效标签体检与修复）。
  // 它的 settingsTab 原本挂在「面板与侧栏」（那里只有侧栏标签区那颗开关）；
  // 有了独立一页之后改指自己的 tab——一个功能一个落点。
  { id: 'tags', premium: false, slots: { sidebarSection: 'tags', settingsTab: 'momo-set-tags' } },
  { id: 'review', premium: false, slots: { sidebarSection: 'review', settingsTab: 'momo-set-review' } },
  { id: 'trash', premium: false, slots: { sidebarSection: 'trash' } },
  { id: 'stats', premium: false, slots: { sidebarSection: 'stats', settingsTab: 'momo-set-stats' } },
  { id: 'cloud.backup', premium: true, slots: {} },
  { id: 'plaza.share', premium: true, slots: {} },
  { id: 'agent.insight', premium: true, slots: {} },
] as const satisfies readonly FeatureDef[]

/** 按 id 取功能定义（守卫测试用；渲染路径走插槽过滤，不做逐 id 查表） */
export function featureById(id: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.id === id)
}

/**
 * premium 功能的默认配额（P2 三件套之一：每个付费功能必须有配额口径）。
 * null = 不限量（按订阅期收费，不按量）。数字 = 每计费周期次数（服务端权威，
 * 本表只是**默认值**，实际随 `account.quota` 缓存下发——见 commercialization.md §6）。
 */
export const DEFAULT_QUOTAS: Record<PremiumFeature, number | null> = {
  'cloud.backup': null,
  'plaza.share': null,
  'agent.insight': 3, // 免费试用 3 次 = 漏斗（commercialization.md §6 的口径）
}
