// 视图偏好的**结构**：枚举、顺序、白名单、合法区间与默认值。
// 界面文案一律走 copy（src/momo/i18n）：这里只留结构，展示名 / 说明放字典的 meta 段
// （用 Record<枚举, …> 声明，漏一个成员编译不过）。
//
// 与 entry.ts（data.json 的条目 / 设置形状）的分工：这边是「一个偏好长什么样」，
// 那边是「整个 data.json 长什么样」。

/**
 * 内部侧栏宽度（px）：`prefs.sidebarWidth` 的合法区间与默认值。
 * 拖拽 / 键盘步进的钳制与 data.json 加载时的兜底共用这一套边界，别各写各的。
 */
export const SIDEBAR_WIDTH = { min: 150, max: 480, default: 232 } as const

/**
 * 卡片正文字号（px）：v0.9.1 起是三档刻度（sm/md/lg），v0.9.12 应用户要求
 * （「正文字号和卡片圆角，最好是拖拽的」）改成**连续滑杆**——三档里总有一档
 * 嫌大 / 一档嫌小。只存正文字号一个数：标题与标签按固定偏移从它折算
 * （`+0.5px` / `-1.5px`，styles.src 的 .momo-app 块里 calc），盘上只有一个数，
 * 用户拖到哪就是哪。
 *
 * 区间与三档的关系：旧 sm/md/lg = 13.5 / 14.5 / 16，正是新区间的中间三点；
 * `clampCardFontSize` 因此能把旧枚举值无损迁过来（见 types/sanitize.ts）。
 */
export const CARD_FONT_SIZE = { min: 12, max: 20, step: 0.5, default: 14.5 } as const

/**
 * 卡片圆角（px）：与正文字号同一轮从三档改成滑杆（旧 sm/md/lg = 10 / 16 / 22，
 * 区间把它们整个包住）。0 = 直角。卡片 / 回顾大卡共用这一个值。
 */
export const CARD_RADIUS = { min: 0, max: 24, step: 1, default: 16 } as const

/**
 * 「短首行作为标题」那行标题的字号（px，v0.9.12 新增，用户要求给它一个字号选项）。
 *
 * 默认 17 = `--momo-fs-6`，也就是**升级前卡片标题实际显示的大小**——那条规则
 * （60-design.css 的 `.momo-card > .momo-card-title`）一直用固定字阶盖住了
 * `--momo-ui-fs-title`，所以滑杆化只是把「谁说了算」从字阶改成偏好，
 * 默认值照旧，观感不变。随机回顾页的笔记预览标题同吃这一个值。
 */
export const CARD_TITLE_SIZE = { min: 14, max: 24, step: 0.5, default: 17 } as const

// ---- 视图密度 ----

/**
 * 列表密度（`prefs.density`）：同一份筛选结果的不同看法。
 * - `list`：按日期分组的卡片流（默认）
 * - `focus`（v0.8.0）：纵向滚动吸附，**一张占焦点**，上下相邻卡片毛玻璃
 *
 * 原 `compact` 紧凑档（一行一条标题速览）、`timeline` 节奏档（原「时间线」密度，
 * 日期行按真实间隔排布）与 **`grid` 网格档**（CSS 多列瀑布流，2026-10-12 用户裁定
 * 「没有收益、难度还高」整体移除，见 tasks/dev/building/2026-10-12-remove-grid-density.md）
 * 均已移除，相关代码一并删除；盘上旧值经 sanitize 白名单过滤后回落「列表」
 * （层①「只加字段、不改名」不受影响——这是**收窄合法值**）。
 */
export type Density = 'list' | 'focus'

/** 全部合法值（data.json 加载兜底与顶栏分段控件共用一套顺序） */
export const DENSITIES: readonly Density[] = ['list', 'focus']

/**
 * 顶栏「视图」分段的**全部档位**（2026-10-12 起四档）：两档密度（`Density`）
 * + 地点两档（`globe` 星球 / `group` 地点分组）。
 *
 * 后两档原是 `DensitySegmented` 里**写死追加**的两颗（旧 `withLocViews` 开关），于是设置页
 * 「视图」卡只列得出密度那几档——顶栏按钮比卡里多，用户报「目前有五个视图，这里
 * 只显示了三个视图」。收进同一个数组后，全部档位同一套开关 + 排序，卡与顶栏不再各说
 * 各话；`ListControls` 也不再自己 append 那两颗。
 *
 * 为什么不把两档并进 `Density`：`Density` 是**渲染档**（`registry/densityViews` 的
 * manifest、`prefs.density` 的取值、`sanitizeDensity` 的白名单），地点两档不是密度
 * ——它们是 `locView`（会话态）的两种呈现，`CardFlow` 走另一条分支。并进去会让
 * 「只认密度的那几处」平白多两个值。所以这里是**并集**，密度相关的代码继续只认
 * `DENSITIES`。
 */
export type ViewId = Density | 'globe' | 'group'

/**
 * 全部合法值（`sanitizeDensityViews` 的白名单 + 设置页「视图」卡的行序 + 顶栏
 * 默认顺序）。**顺序即默认顶栏顺序**：密度档在前、地点两档在末。
 */
export const VIEW_IDS: readonly ViewId[] = [...DENSITIES, 'globe', 'group']

/** 这个视图 id 是不是一档密度（地点两档不是） */
export const isDensity = (id: ViewId): id is Density => DENSITIES.includes(id as Density)

// ---- 顶栏视图分段的显隐与顺序（v0.9.17，设置页「视图」块可配）----

/**
 * 顶栏「视图」分段的一档：`id` 命中哪一档视图，`on` = 这一档在顶栏出不出现。
 *
 * **数组顺序即顶栏按钮顺序**（用户在设置页上移 / 下移调整）。
 *
 * 为什么顺序与显隐合成一个数组，而不是 `order` + `hidden` 两张表：它们是同一件
 * 事的两面——「这一档摆第几位、要不要摆」。拆开就多出两种互相矛盾的状态
 * （顺序里有已隐藏的档、隐藏表里有顺序外的档），而合并后**只有一份真源**。
 *
 * 与 `sections`（侧栏功能显隐）同类：只决定「看不看得见」，不改变任何密度的
 * 渲染——各档的视图实现（registry/densityViews 的 DENSITY_VIEWS）永远全在。
 */
export interface DensityViewPref {
  id: ViewId
  on: boolean
}

/**
 * 默认：全部档位全开、顺序照 `VIEW_IDS` 的声明顺序——也就是 v0.9.17 之前顶栏
 * **写死**的那个顺序（密度档 + 末尾两颗地点档）。旧 data.json 没有
 * `densityViews` 键 → 回这一份，升级后顶栏逐像素不变。
 *
 * 用 `VIEW_IDS.map` 生成而不是手抄字面量：加一档视图时这里自动跟上
 * （顺序也与枚举声明一致），不会出现「枚举加了档、默认顺序里没有」。
 *
 * 名字里的 `DENSITY` 是沿革：盘上键叫 `densityViews`（层① **永不改名**，新旧都读
 * 那条纪律见 AGENTS.md §2.5），常量跟着键走。它装的是全部视图档、不只是密度。
 */
export const DEFAULT_DENSITY_VIEWS: readonly DensityViewPref[] = VIEW_IDS.map((id) => ({ id, on: true }))

// ---- 列表排序（顶栏「排序依据」分段 + 方向按钮；v0.9.15 起四值枚举） ----

/**
 * 排序依据的**时间键**：`createdAt`（创建时间）/ `updatedAt`（更新时间）。
 * `updatedAt` 取文件 mtime——用户绝大多数编辑发生在 Obsidian 原生编辑器里，
 * 插件看不见那些写入，frontmatter 里自维护的 `updatedAt` 必然漏更；mtime 任何
 * 编辑器改一次就变一次，与 Obsidian 自己的「修改时间」同源。
 */
export type SortKey = 'created' | 'updated'

/**
 * 排序模式 = 时间键 × 方向（v0.9.15 前是 `sortAsc: boolean` 布尔，只有创建时间
 * 两个方向；加「按更新时间排序」后布尔装不下，换成这一个枚举）。
 * `Asc` = 由旧到新，`Desc` = 由新到旧。
 *
 * 顶栏是两个控件共用这一个值：「排序依据」分段换键（保方向），方向按钮翻转
 * （保键）——不是把四个值摊成一颗四态按钮（点三下才能回到起点）。
 */
export type SortMode = `${SortKey}Asc` | `${SortKey}Desc`

/** 全部合法值（sanitize 白名单）。**这不是 UI 顺序**——顶栏是「依据 + 方向」两个控件 */
export const SORT_MODES: readonly SortMode[] = ['createdDesc', 'createdAsc', 'updatedDesc', 'updatedAsc']

// ---- 侧栏标签区的排序（v0.9.18）----

/**
 * 侧栏「全部标签」列表的排序键（2026-09-28 用户裁定：只留这三个）。
 *
 * 与上面的 SortMode（**主区笔记列表**的排序）是两码事，别混：
 * - `SortMode` 管卡片流的先后（时间键 × 方向，四值）；
 * - `TagSortKey` 管侧栏标签行的先后（三值，**方向由键自带**）。
 *
 * 方向为什么不做成可翻转的第二个控件：三个键的语义方向都是固定的（数量多→少、
 * 附件数多→少、名称 A→Z），没人想看「数量最少的标签」；侧栏 232px 也放不下第二个
 * 控件。真要扩展，加键比加控件干净。
 *
 * `count` = v0.9.18 之前 `buildTagTree` 里写死的那个顺序（totalCount 降序 + 名称并列），
 * 所以这个默认值对老用户是**逐行不变**的。
 */
export type TagSortKey = 'count' | 'attachments' | 'name'

/** 全部合法值（sanitize 白名单；排序浮层的行顺序照它） */
export const TAG_SORT_KEYS: readonly TagSortKey[] = ['count', 'attachments', 'name']

/** 默认排序键：数量（= v0.9.18 之前写死的行为） */
export const DEFAULT_TAG_SORT: TagSortKey = 'count'

// ---- 侧栏标签筛选的组合方式（2026-10-12）----

/**
 * 多选标签时主区卡片的匹配口径（过滤框右侧那枚「两圆交叠」按钮里切）：
 *
 * - `union`（默认）= **并集**：含任一已选标签（各含其子树，ADR-004）即显示。
 *   这是 2026-09-18 起的既定口径（ADR-004 §5），本类型只是把它从「写死」
 *   变成「默认值」——没这个字段之前的老盘行为逐字节不变；
 * - `intersection` = **交集**：必须同时含全部已选标签才显示。
 *
 * 与 `TagSortKey` 一样是**视图偏好**（ADR-003，落盘）：它是「怎么读我的选中」
 * 的口径，不是「我现在想找什么」的临时意图（后者是会话态，见 store 的
 * `tagFilter` / `filterTags`）。换面板、重开 Obsidian 都保持。
 *
 * 只影响标签这一维：与搜索 / 日期 / 地点等其余维度仍取交集（matched.ts）。
 * 只选一个标签时两个值等价（单元素的 some ≡ every），切换无可察差异。
 */
export type TagMatchMode = 'union' | 'intersection'

/** 全部合法值（sanitize 白名单；浮层两行的顺序照它） */
export const TAG_MATCH_MODES: readonly TagMatchMode[] = ['union', 'intersection']

/** 默认组合方式：并集（= 本字段存在之前的行为） */
export const DEFAULT_TAG_MATCH: TagMatchMode = 'union'

// ---- 侧栏功能显隐与可配数量（v0.4.6 配置项扩展，prefs 的结构化偏好）----

/**
 * 侧栏功能显隐。强相关的绑成一项（用户裁决）：「置顶区 + 全部标签树」合并为 `tags`；
 * 「全部笔记」是基础视图，常驻不可关。
 * 统计页（`stats`）与侧栏速览数字（`quickStats`）是两件事，各自独立开关（用户裁决 v0.4.9）。
 * `locations`（v0.9.31 ④；2026-10-01 晚起常驻）：侧栏「全部地点」层级树
 * （回收站下方），与 `tags` 平级——一个是按标签筛选、一个是按地点筛选，
 * 两套树各自开关。
 */
export interface SidebarSections {
  /** 统计页（菜单入口 + 页面：累计 / 记录习惯 / 标签排行） */
  stats: boolean
  /** 侧栏速览数字（笔记 / 标签 / 天） */
  quickStats: boolean
  /** 活跃度热力图 */
  heatmap: boolean
  /** 菜单 · 随机回顾入口 */
  review: boolean
  /** 菜单 · 回收站 */
  trash: boolean
  /** 置顶标签区 + 全部标签树——强相关（置顶入口就在树 chip 的右键里），绑定开关 */
  tags: boolean
  /** 「全部地点」层级树（常驻，回收站菜单项下方）：点节点 = 地点筛选条件 */
  locations: boolean
}

export const DEFAULT_SECTIONS: SidebarSections = {
  stats: true,
  quickStats: true,
  heatmap: true,
  review: true,
  trash: true,
  tags: true,
  locations: true,
}

/** 统计页区块键（= prefs.statsSections 的键）。注册表 / i18n Record / 设置页共用 */
export type StatsSectionKey = keyof StatsSections

/**
 * 统计页各区块的显隐（v0.5.3，v0.5.4 增日历热力图 / 记录间隔，v0.6.3 裁掉
 * 标签共现 / 标签健康检查 / 历史快照）：统计是数据的纯粹展示，这里只控制
 * 「显示哪些卡片」，不含任何跳转行为。每张卡独立开关，全部默认开。
 */
export interface StatsSections {
  /** 核心指标行：总笔记（含累计走势）/ 标签 / 记录天数（含 30 天活跃环） */
  kpi: boolean
  /** 内容质量：平均字数 / 中位字数 / 长记录占比 / 无标签 */
  quality: boolean
  /** 趋势行：月度趋势 + 记录时间（按小时 / 星期分布） */
  trend: boolean
  /** 记录习惯 + 里程碑进度 */
  habits: boolean
  /** 标签排行 + 标签生命周期 */
  tags: boolean
  /** 字数分布（新维度）：按正文字符数分五档 */
  lengthDist: boolean
  /** 最长笔记 Top 3（v0.6.3 起「记录之最」只留最长一半，最高产日 Top 3 已裁） */
  records: boolean
  /** 标签数分布（新维度）：每条 0 / 1 / 2 / 3+ 个标签的占比 */
  tagDist: boolean
  /** 活跃度日历（新维度）：整年热力图，点格子按日期筛选并跳列表 */
  heatmap: boolean
  /** 附件统计（v0.6.0）：带图 Momo 占比、附件总量/体积趋势 */
  attachments: boolean
  /** 回顾（v0.6.0，v0.7.3 扩容）：近 7 / 30 天回顾条数、最久未回顾 + 已回顾 / 未回顾 / 覆盖率 */
  reviewCoverage: boolean
  /** 足迹规模（v0.9.33）：地点总数 / 国家 / 大洲 / 平均每条 / 无地点 + 各大洲条数 */
  locScale: boolean
  /** 地点排行（v0.9.33）：Top 10 地名，点行跳地点模式选中该地点 */
  locRank: boolean
  /** 地点数分布（v0.9.33）：每条 0 / 1 / 2 / 3+ 个地点的条数 */
  locDist: boolean
  /** 地点生命（v0.9.33）：新开 / 冷掉 / 最近去过 + 一次性与 Top 3 集中度（全库口径） */
  locLifecycle: boolean
}

export const DEFAULT_STATS_SECTIONS: StatsSections = {
  kpi: true,
  quality: true,
  trend: true,
  habits: true,
  tags: true,
  lengthDist: true,
  records: true,
  tagDist: true,
  heatmap: true,
  attachments: true,
  reviewCoverage: true,
  locScale: true,
  locRank: true,
  locDist: true,
  locLifecycle: true,
}

/**
 * 统计页分组（v0.6.1，v0.6.3 / v0.6.5 / v0.6.8 / v0.6.9 随裁剪同步，v0.9.33 增
 * 「地点」组）：统计卡按「语义域」聚成五组，页面
 * （ui/stats）与设置面板的区块开关共用这一份定义，数组顺序即
 * 页面顺序、keys 顺序即组内顺序。分组只影响「在哪里出现」：StatsSections 的
 * 存取结构不变，sanitize 逻辑不变。
 *
 * 「我的产出」组随年度目标卡移除后只剩内容质量一张：组本身保留——组标题与编译
 * 守卫仍按五组建模，未来往这组加卡不必再动结构。
 */
export interface StatsGroup {
  key: StatsGroupKey
  /** 组内区块开关（顺序即组内展示顺序）。readonly：`as const` 推断字面量的前提 */
  keys: readonly (keyof StatsSections)[]
}

/** 五个语义域的键。组标题在 `copy.meta.statsGroup`（按这个联合类型声明成 Record → 漏一个编译不过）。
 *  v0.6.7 起组标题不再带副标题：用户裁决「这些提示语文全部都去掉」。
 *  v0.9.33 起第五组「地点」（locations）：与 tagSystem 平级的内容元数据维度。 */
export type StatsGroupKey = 'output' | 'rhythm' | 'tagSystem' | 'locations' | 'content'

export const STATS_GROUPS = [
  {
    key: 'output',
    keys: ['kpi', 'quality'],
  },
  {
    key: 'rhythm',
    keys: ['heatmap', 'trend', 'habits'],
  },
  {
    key: 'tagSystem',
    keys: ['tags', 'tagDist'],
  },
  {
    key: 'locations',
    keys: ['locScale', 'locRank', 'locDist', 'locLifecycle'],
  },
  {
    key: 'content',
    keys: ['lengthDist', 'records', 'reviewCoverage', 'attachments'],
  },
] as const satisfies readonly StatsGroup[]

/**
 * 编译期守卫：StatsSections 新增键时必须同步加进 STATS_GROUPS，否则下一行
 * （目标类型 never）编译失败。防「加了新区间却忘了归组，页面不显示」。
 *
 * 两个容易踩的空转坑（2026-09-26 修）：
 * ① 旧写法 `const _x: T = undefined as never`——never 可赋给任何类型，恒成立、
 *    从不报错；改用 `_AssertNever<T extends never>` 形参约束才真拦。
 * ② 数组必须保持 `as const`——被 `readonly StatsGroup[]` 注解后 `keys`  widening
 *    成 keyof 全集，Exclude 退化成 never，漏键也看不出来。
 * 配套的运行时守卫见 scripts/registry-guard.test.mts（注册表覆盖那两条）。
 */
type _GroupedKeys = (typeof STATS_GROUPS)[number]['keys'][number]
type _AssertNever<T extends never> = T
type _AllSectionsGrouped = _AssertNever<Exclude<keyof StatsSections, _GroupedKeys>>

/** 随机回顾每批条数：合法区间与默认值 */
export const REVIEW_COUNT = { min: 1, max: 50, default: 10 } as const

/** 活跃度热力图滚动窗口（月）：合法区间与默认值 */
export const HEATMAP_MONTHS = { min: 1, max: 12, default: 3 } as const

// ---- 统计页时间范围（v0.4.17，v0.5.4 增自定义区间；prefs 的结构化偏好）----

/**
 * 统计页顶部的时间范围切换：范围只作用于「数数」的卡片（累计 / 记录习惯 / 标签排行）；
 * 月度趋势、标签生命周期、里程碑是全史概念，永远按全部历史算（见 stats.ts）。
 * `custom` = 用户自选的日期区间，起止存 `prefs.statsCustomFrom / statsCustomTo`。
 */
export type StatsRange = 'all' | '90d' | 'ytd' | 'custom'

/** 全部合法值（data.json 加载兜底与统计页分段控件共用一套顺序） */
export const STATS_RANGES: readonly StatsRange[] = ['all', '90d', 'ytd', 'custom']

// ---- 配色方案（v0.5.1，prefs.colorScheme；v0.9.7 起一个方案一个文件）----
//
// 加一套配色要动三处，缺一处构建就失败（scripts/check-themes.mjs）：
//   ① styles.src/themes/<id>.css —— 令牌色值（复制 mist-blue.css 改，README 有步骤）
//   ② 本文件的 ColorScheme 联合类型 + COLOR_SCHEMES 一行
//   ③ src/momo/i18n/zh/meta.ts 的 colorScheme 名字与说明
// 运行时切换只是换宿主上的 .momo-theme-<id>，不需要重新编译 CSS。

/**
 * 面板配色方案。id 同时是 `styles.src/themes/<id>.css` 的文件名与运行时挂的
 * class 后缀。每个方案只换一组设计令牌，版面与组件不动；用户在设置里写自定义
 * CSS 可以逐条覆盖。**默认 `mist-blue`「雾蓝」**（2026-10-11 用户裁定「配色方案，
 * 默认是雾蓝，它排在第一个」——与 `brandIcon`「leaf 排第一即是默认」同款约定：
 * 默认项不必靠选中态去找，第一个就是它。此前 v0.9.44 起默认 `ink-night`「墨夜」，
 * 再往前近三十个版本默认 `stone`）。
 *
 * **2026-10-12 改名**（用户裁定 id 用方案名本身的英文，不再借产品名）：`notion` →
 * `mist-blue`、`flomo` → `moss-green`、`gewu` → `clam-white`、`graphite` →
 * `ink-night`（`stepfun` 不变）。下文的旧 id 一律按此映射读；盘上旧值由
 * `sanitizeColorScheme` 的改名映射读成同色新 id——不失用户选择、不清数据、
 * 不需要迁移函数。
 *
 * 历史：v0.9.9 起六套、v0.9.10 起十套、v0.9.37 起十一套、v0.9.38 删「暖米深林」
 * 回十套；**2026-10-04 用户裁定收编到四套**（色卡要一眼分得清，差异不只在签名色，
 * 底色家族也得拉开）；2026-10-07 加 `qingmang`「青芒」与 `clam-white`「蛤白」成六套；
 * **2026-10-09 用户裁定删 `qingmang` 与 `stone`「石白墨黑古铜」，回到四套**：
 *   moss-green 近白 / mist-blue 纯白 / clam-white 暖蛤白 / ink-night **暗色**（唯一一套深底，
 *   墨阶反相、实底控件「亮底深字」）。**同日加 `stepfun`「StepFun」成五套**：
 *   淡晴空青纸面 + 纯白卡 + 阶跃蓝签名色 + 一点活力橙，方案卡名称行带 StepFun 标
 *   （设计源：用户给的六张 StepFun 品牌图，见 styles.src/themes/stepfun.css 头注）。
 *
 * 退役的九个 id（`qingmang` / `stone` / `dusk` 藕紫 / `celadon` 影青 /
 * `morandi` 灰粉 / `crimson` 绛红 / `sepia` 米黄纸 / `eink` 电子纸 /
 * `sage` 暖米深林）已从联合类型与白名单移除：盘上还留着旧值的
 * data.json 读盘时走 `sanitizeColorScheme` 回落默认 `mist-blue`（层①「只加字段、不改名」
 * 不受影响——这是**收窄合法值**，旧值静默回退，不清数据、不需要迁移函数）。
 */
export type ColorScheme = 'mist-blue' | 'moss-green' | 'clam-white' | 'stepfun' | 'ink-night'

/**
 * 配色方案的**结构**元数据（顺序即展示顺序；id 同时是 sanitize 白名单）。
 * **顺序即表达默认**（2026-10-11 起，用户裁定「默认是雾蓝，它排在第一个」，
 * 与 `brandIcon` 的 leaf 同款约定）：默认方案 `mist-blue` 排第一，其余按加入次序
 * 在后，唯一的暗色 `ink-night` 收尾（v0.9.10 起它就是这套位置，2026-10-07 加
 * `clam-white`、2026-10-09 加 `stepfun` 时位置保持不变）。此前（v0.9.44 起）默认是
 * `ink-night` 且刻意不排第一，「顺序不表达默认、由选中态标出」——那条规矩随本次
 * 裁定作废，见上方 `ColorScheme` 注释。
 * `swatch` = 该方案的签名色，取值与
 * `styles.src/themes/<id>.css` 里的 `--momo-accent` 一致——色块的唯一真源在这张表里，
 * 不在设置页里再抄一遍。全名 / 说明是文案，在 `copy.meta.colorScheme`（同一个 id 取）。
 */
export const COLOR_SCHEMES: ReadonlyArray<{
  id: ColorScheme
  swatch: string
}> = [
  { id: 'mist-blue', swatch: '#1762aa' },
  { id: 'moss-green', swatch: '#017f3b' },
  { id: 'clam-white', swatch: '#17567f' },
  { id: 'stepfun', swatch: '#0a58d0' },
  { id: 'ink-night', swatch: '#d9a441' },
]

/** 自定义 CSS 片段的长度上限：data.json 是配置文件，不该被当成编辑器存超大文本 */
export const CUSTOM_CSS_MAX = 200_000

// ---- 字体角色（v1.0.0，取代内置开源字体）----
//
// v0.9.16–v0.9.50 插件自带四套开源字体（SIL OFL 1.1，随构建部署进插件目录 fonts/，
// 运行时 @font-face 注入）。代价：发布包背 ~70MB，而 Obsidian 社区商店安装器（以及
// BRAT）只下发 main.js / manifest.json / styles.css 三件——重字体到不了自动安装的
// 用户手里，只剩「手动装完整包」一条路。
//
// 现在改为**直接用 Obsidian 自己提供的字体**：Obsidian「外观」里配的界面字体 /
// 正文字体 / 等宽字体本身就是挂在 body 上的 CSS 变量（--font-interface /
// --font-text / --font-monospace），插件引用它们即可——用户在 Obsidian 里改一次，
// 面板与卡片自动跟着变，且发布包不再背 70MB。
//
// 取值空间三段（兜底见 sanitizeFontPref）：
//   · `''`                —— 跟随默认（不注入字体变量，CSS 令牌走原栈）；
//   · `obsidian:<role>`   —— Obsidian 的三种字体角色（FontRole）；
//   · 其余                —— 历史遗留的手输系统字体名（界面入口早已移除，
//                            盘上旧值继续读，不把人打回默认）。
//
// 加一个新角色的三处：
//   ① 本表 FONT_ROLES 加一条；
//   ② fontStyle.ts 的 ROLE_CSS 补一条映射；
//   ③ i18n 三语言的 copy.meta.fontRole 补名字（Record 全键覆盖，漏一个编译不过）。

/** Obsidian 提供的字体角色：界面 / 正文 / 等宽（对应 --font-interface 等三个宿主变量） */
export type FontRole = 'interface' | 'text' | 'monospace'

/** 字体角色偏好值的前缀：偏好值 = `${FONT_ROLE_PREFIX}${role}` */
export const FONT_ROLE_PREFIX = 'obsidian:'

/** 全部字体角色（顺序即设置页格子顺序） */
export const FONT_ROLES: readonly FontRole[] = ['interface', 'text', 'monospace']

/** 角色 → 偏好取值（写入 data.json 的字面值） */
export function fontRoleValue(role: FontRole): string {
  return `${FONT_ROLE_PREFIX}${role}`
}

/**
 * 字体偏好值的长度上限（uiFont / cardFont）：`obsidian:<role>` 十余字符，
 * 历史手输的字体名也没有超过 60 字符的——超了必是脏数据。
 */
export const FONT_VALUE_MAX = 60

// ---- 品牌与卡片细节（v0.7.4，用户要求「UI 都是可配置的」）----

/**
 * 左上角品牌图标。只收 icons.tsx 里已有的路径（PATHS 的键），不新画图标——
 * 候选挑「当 mark 好看」的几个：单笔画的叶子 / 堆叠 / 火苗，以及带功能的铅笔 /
 * 标签 / 时钟 / 洗牌 / 柱状图。默认 `leaf`（v0.5 设计稿那枚）。
 */
export type BrandIcon = 'leaf' | 'stack' | 'flame' | 'pencil' | 'tag' | 'clock' | 'shuffle' | 'chart'

/** 设置页下拉的**结构**选项（顺序即展示顺序；id 同时是 sanitize 白名单）；名字在 `copy.meta.brandIcon` */
export const BRAND_ICONS: ReadonlyArray<{ id: BrandIcon }> = [
  { id: 'leaf' },
  { id: 'stack' },
  { id: 'flame' },
  { id: 'pencil' },
  { id: 'tag' },
  { id: 'clock' },
  { id: 'shuffle' },
  { id: 'chart' },
]

/** 品牌名称字数上限：侧栏品牌位只有 ~180px，超长会挤爆布局 */
export const BRAND_NAME_MAX = 20

/**
 * 品牌名称默认值（也是留空时的回退值）。
 *
 * **刻意不进 i18n 字典**（scripts/lint-copy.mjs 白名单里唯一一个文案类例外）：
 * 它是写进 data.json 的**数据**，不是界面文案。本地化它会随语言悄悄改写用户已存的
 * 品牌名，还多出一个「盘上值 vs 显示值」的双真源。真要按语言给默认名，得先改存储语义
 * （存空串表示「用当前语言的默认」），那是独立工单。
 */
export const DEFAULT_BRAND_NAME = 'Momo'

/**
 * 全部笔记卡片里 #标签 的排布（v0.7.3 起标签上移进元信息行，v0.7.4 做成可配）：
 * `meta` = 元信息行右侧（与随机回顾卡一致，默认）；`bottom` = 卡片底部单独一行（旧排布）。
 * 只影响「全部笔记」的卡片；随机回顾卡固定 meta。
 */
export type TagPosition = 'meta' | 'bottom'

/**
 * 「全部笔记」卡片里**地点标签**（frontmatter `locations`）的排布
 * （2026-10-01 用户要求把原来的「标签位置」拆成两档：标签指正常 #标签、
 * 地点指地点标签）。取值空间与 `TagPosition` 相同，但两者**互不影响**：
 *  `meta`   = 元信息行右侧（默认，= 拆分前地点 pill 一直待的地方，升级后观感不变）
 *  `bottom` = 卡片底部单独一行
 * 只影响「全部笔记」的卡片；随机回顾卡固定 meta（与 #标签 同一条规矩）。
 */
export type LocationPosition = 'meta' | 'bottom'

// ---- UI 微调与卡片信息细节（v0.9.1）----

/**
 * 卡片间距的三档刻度：正文字号 / 卡片圆角 v0.9.12 起改连续滑杆（见
 * CARD_FONT_SIZE / CARD_RADIUS），间距仍是三档——紧凑 / 标准 / 宽松是**名字**
 * 不是尺寸，且它一次影响三种密度的卡片流，给连续值不如给三个想好的数。
 */
export type UiScale = 'sm' | 'md' | 'lg'

/** 全部合法值（data.json 加载兜底与设置页分段控件共用一套顺序） */
export const UI_SCALES: readonly UiScale[] = ['sm', 'md', 'lg']

/**
 * 卡片元信息行的日期粒度（v0.9.1）：
 * `auto` = 默认行为（列表 / 焦点只显示时刻，地点分组档补月日——
 *         前者日期在分组标题上，后者组头是地名、没有日期可依附）；
 * `day`  = 一律「月日 + 时刻」；`full` = 一律「YYYY-MM-DD + 时刻」。
 */
export type CardStamp = 'auto' | 'day' | 'full'

/** 全部合法值（顺序即展示顺序） */
export const CARD_STAMPS: readonly CardStamp[] = ['auto', 'day', 'full']

/**
 * 「短首行作为标题」的字数上限（v0.9.12 新增选项，用户要求「允许自定义字数」）：
 * 首行剥掉行内标记后**不超过这么多个字**才升为标题，超过就整段当正文
 * （避免把上百字的整段首行变成一行粗体大字）。默认 32 = 写死时的旧行为，
 * 老用户升上来的观感不变。
 */
export const TITLE_MAX = { min: 8, max: 120, step: 1, default: 32 } as const

// ---- 正文预热比例（v0.9.14，用户要求「预热多少让我自己选，还要能全量」）----

/**
 * 切密度意图期的正文预热比例（`prefs.warmRatio`，默认 `half`）。
 *
 * 鼠标悬停顶栏视图分段（还没点下去）时，App 提前把当前可见列表前这么多比例的
 * 正文烘进渲染缓存（`warmBodyCache`），点击切换后首屏同步回填、紧接着快滚的那
 * 一大片也已就位。比例越高切换后越顺，**悬停期预付的渲染越多**（鼠标划过不点
 * 也照付；已缓存的条目会跳过）。
 *
 * `off` = 不预热：切换后只靠 IntersectionObserver 的 600px 邻近带逐张渲染
 * （v0.5.3 起的老行为，首屏要等内容逐个蹦出来）。`full` = 整个可见列表全预热，
 * 大库里悬停那一秒会比较忙，但切完怎么滚都不等。
 *
 * v0.9.13 起这里写死 `half`，v0.9.14 提成可配——默认值不变，老用户升上来的
 * 观感一致。
 */
export type WarmRatio = 'off' | 'quarter' | 'half' | 'full'

/** 全部合法值（顺序即设置页分段顺序；也是 sanitize 白名单） */
export const WARM_RATIOS: readonly WarmRatio[] = ['off', 'quarter', 'half', 'full']

/** 预热比例 → 0..1 的数（App 的 hover 预热按它取列表前 N 条；0 = 不预热） */
export function warmRatioValue(ratio: WarmRatio): number {
  switch (ratio) {
    case 'off':
      return 0
    case 'quarter':
      return 0.25
    case 'half':
      return 0.5
    case 'full':
      return 1
  }
}

// ---- 地点层级（v0.9.30「地点名前加大洲和国家」，2026-09-30 用户裁定）----

/**
 * 地点分组流**显示 / 分组到哪一级**（`prefs.locLevel`）。一个旋钮同时管两件事：
 * 组头写什么、分组按什么并——选粗一级，同粗度的地点就并成一组：
 *
 * - `name`（默认）：按地点分组，组头 = `大洲 · 国家 · 地名`（`亚洲 · 中国 · 北京`）。
 *   老用户升上来的观感 = 升级前多一个大洲 / 国家前缀；
 * - `country`：按国家分组，组头 = `大洲 · 国家`（`亚洲 · 中国`）；
 * - `continent`：按大洲分组，组头 = `大洲`（`亚洲`）。
 *
 * 为什么不是三个复选框（大洲 / 国家 / 地名各自勾）：勾掉中间那一级会得到
 * `亚洲 · 北京` 这种断层级路径，而用户举的两个例子（「大洲和国家」「大洲」）
 * 都是**逐级收窄**。一级一档没有非法组合，也天然覆盖「全显」。
 *
 * 大洲 / 国家**查不到的地点**（内置字典没收录、用户也没手填）在这种档位下
 * 按地名自成一组——见 locations.ts 的 locPartsOf：宁可退化，也不造
 * 「未知大洲」虚拟组把没数据伪装成有数据。
 */
export type LocLevel = 'continent' | 'country' | 'name'

/** 全部合法值（顺序 = 设置页分段控件的顺序：粗 → 细） */
export const LOC_LEVELS: readonly LocLevel[] = ['continent', 'country', 'name']

/** 默认档位：全显（大洲 · 国家 · 地点名）= 用户要的「地点名前加大洲和国家」 */
export const DEFAULT_LOC_LEVEL: LocLevel = 'name'

// ---- 侧栏「全部地点」树的展开方式（2026-10-01，用户要求「在设置里添加配置，有两种」）----

/**
 * 侧栏「全部地点」那棵树的展开方式（`prefs.locTreeExpand`）——管的是
 * **要不要有展开 / 收起这颗钮**，与树长什么样（大洲分组卡）无关：
 *
 * - `all`（**默认**）：三级一次铺开，**一颗 twisty 都不画**。大洲卡 / 国家行
 *   的行首因此也不用留那 18px 的空位，地名直接顶到左缘，最窄档下多出几个字的
 *   宽度。代价是用户没法只留「大洲」那一层——想少看几行就把侧栏拉窄，
 *   或者用标题行那颗漏斗平铺到某一级（`locTreeLevels`，那是**另一个维度**）。
 * - `fold`：每个有子级的节点行首带一颗 twisty，点它收 / 放它那一支；
 *   默认仍是**全展开**的状态（收起集恒以空集起步），所以切到这一档不会
 *   让内容突然消失——变的只是「多了一颗可以按的钮」。
 *
 * 为什么默认 `all`：树是「挑一个地点去筛」的入口，不是「浏览我的地点分布」的
 * 地方（分布归统计页的地点四张卡）。默认把地点露出到底，点一下就到；需要
 * 注意力集中时（比如在同一个大洲里翻城市）再自己切到 `fold`。
 *
 * 与 `locTreeLevels`（标题行漏斗勾的那几级）的分工：那个把树**砍**到某几级显示
 * （是视图，只动侧栏），这个只决定**能不能收**（是交互，不动任何一级的可见性
 * 默认值）。两个都是纯视图偏好（ADR-003），都不写进任何 Momo。
 */
export type LocTreeExpand = 'all' | 'fold'

/** 全部合法值（顺序 = 设置页分段控件的顺序：铺开在前、可收在后；也是 sanitize 白名单） */
export const LOC_TREE_EXPANDS: readonly LocTreeExpand[] = ['all', 'fold']

/** 默认档位：三级全展开、不画 twisty（2026-10-01 用户裁定，也是换造型时的现状） */
export const DEFAULT_LOC_TREE_EXPAND: LocTreeExpand = 'all'

// ---- 星球外观（v0.9.x，2026-10-05「一个夜地球、一个日地球」）----

/**
 * 星球视图那颗球长什么样（`prefs.globeEarth`）——**贴图与光照配方一起切**：
 *
 * - `night`（默认）：NASA Black Marble 夜灯原图（随插件发布的六面 cube）。光照只补
 *   「这是个球」的暗示——**只有临边衰减**（球缘比盘心暗，盘因此鼓起来），
 *   **不加边缘光**（2026-10-06 用户定案「外层不要加光圈」），也**刻意不加方向光**：
 *   夜地球本身是「全球夜景合成」，加晨昏线等于宣布一半地球是白天，
 *   会平白抹掉半个世界的城市灯光。
 * - `day`：`outputs/polefix_v2/globe.html` 自己读的那套日地球（真彩色、无云）。
 *   走 globe.html 的原配方（ambient 0.85 + 主光 0.9 + 背面边缘光 0.35）——日地球的
 *   贴图本来就该有受光面与背光面，那套配方正是它的正解，代价是彻底没有「夜」。
 *
 * 为什么做成偏好而不是二选一写死：两档是**同一套渲染器**（几何 / 采样 / 位姿全共用），
 * 差别只有贴图与光照函数，工程上就是多带一套六面图（≈3.6MB）。纯视图偏好（ADR-003），
 * 不写进任何 Momo。两档的参数与对比稿见 `docs/design/mockups/globe-lighting/`。
 */
export type GlobeEarth = 'night' | 'day'

/** 全部合法值（顺序 = 设置页分段控件的顺序；也是 sanitize 的键白名单） */
export const GLOBE_EARTHS: readonly GlobeEarth[] = ['night', 'day']

/** 默认档：夜灯贴图（日地球那套要另装六面图，且升级前用户看到的一直是夜地球） */
export const DEFAULT_GLOBE_EARTH: GlobeEarth = 'night'

/**
 * 左上角自定义图标（用户上传图片）的体积上限（字节）：data.json 只存路径，
 * 文件本体在 vault 里。侧栏那枚 mark 只有 30px（图标约 18px），太大的图没有意义。
 */
export const BRAND_ICON_MAX = 1_000_000

/**
 * 左上角自定义图标的扩展名白名单。svg 走 `<img src>` 渲染（不执行脚本），
 * 与 png/jpg/webp/gif 同级的静态资源。
 */
export const BRAND_ICON_EXTS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif']

/**
 * 左上角自定义图标的**张数**上限（v0.9.12 起多图）：与自建配色的
 * CUSTOM_SCHEMES_MAX 同一量级。这些图都躺在 vault 里跟着同步，攒得越多
 * 盘上越沉；「想切换就切换」八张足够挑。到顶后设置页的上传格变暗，
 * 点了给一句人话（见 copy.settingsPage.look.brandIconUpload.maxed）。
 */
export const BRAND_ICONS_MAX = 8

// ---- 新建笔记的 frontmatter 带不带空 locations（v0.9.28 起）----

/**
 * 新建 Momo 时要不要在 frontmatter 里直接写一行 `locations: []`
 * （与 `tags: []` 并排；字段形状见 types/entry.ts 的 newNoteLocations）。
 *
 * 开（**默认**）= 点「写点什么」/ 发布 / 补记建出来的每篇新笔记都带着这个空字段，
 * 在 Obsidian 的属性面板里点开就能直接填地点——不必先有第一篇带地点的笔记，
 * 才在「加属性」的建议里认出 `locations` 这个名字；
 * 关 = 与 v0.9.27 之前逐字节一致，只有真的用过地点（批量「设地点」/ 手写
 * frontmatter）的笔记才有这一行。
 *
 * 只影响**新建那一刻的模板**：老笔记一个字节都不动。读侧对「缺省」与「空数组」
 * 一视同仁（`locationsOf` 都归成「没有地点」，见 momo/locations.ts），
 * 所以开与关对列表 / 地点分组流 / 统计没有任何可感知差异——它改的是
 * 用户打开新笔记时第一眼见到的那几行 frontmatter。
 */
export const DEFAULT_NEW_NOTE_LOCATIONS = true

// ---- 界面语言（设置页可手动选择；'auto' = 跟随 Obsidian 的界面语言）----

/**
 * `prefs.lang`：界面语言。'auto'（默认）= 跟随 Obsidian（`getLanguage()` 的主语言
 * 子标签，见 i18n 的 resolveLocale）；固定值 = 用户在设置页手动挑的，启动与切换时
 * 直接 setLocale，不再看 Obsidian。'zh' | 'en' | 'ja' 与 i18n 的 Locale 一一对应——
 * 本模块不能 import i18n（i18n 反向引 types），所以这里独立声明，两边的一致性由
 * LookTab 的 Record<Locale, string> 语言名表守住（Locale 加成员而这里没加，编译不过）。
 */
export type LangPref = 'auto' | 'zh' | 'en' | 'ja'

/** 全部合法值（顺序即设置页分段顺序；也是 sanitize 白名单） */
export const LANG_PREFS: readonly LangPref[] = ['auto', 'zh', 'en', 'ja']
