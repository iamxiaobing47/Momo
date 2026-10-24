import type { LatLon } from '../locations'
import type { LocRegion } from '../locations'
import type { IconOverrides } from '../icons'
import type { ReviewMode } from '../review/review'
import type {
  BrandIcon,
  CardStamp,
  ColorScheme,
  Density,
  DensityViewPref,
  GlobeEarth,
  LangPref,
  LocLevel,
  LocationPosition,
  LocTreeExpand,
  SidebarSections,
  SortMode,
  StatsRange,
  StatsSections,
  TagPosition,
  TagMatchMode,
  TagSortKey,
  UiScale,
  WarmRatio,
} from './prefs'

// data.json 的**条目 / 设置 / 软删登记**形状与默认值。
// 与 prefs.ts（一个偏好长什么样）的分工：这边是「整个 data.json 长什么样」。

/**
 * Obsidian 视图类型常量。放在 momo/（而不是 views/）是因为 service.emit 要按它数
 * 「面板开了几个」——依赖方向是 views → ui → Momo → obsidian，Momo 不能反向 import views。
 */
export const VIEW_TYPE_MOMO = 'momo-main'

export interface MomoSettings {
  /** Momo 根目录（vault 相对路径），默认 Momo/ */
  root: string
  /** 小记目录（root 下相对），新建的小记落在这里；默认 notes */
  notesDir: string
  /** 附件目录（root 下相对），默认 attachments */
  attachmentsDir: string
  /** 回收目录（root 下相对），默认 trash */
  trashDir: string
  /**
   * 面板停靠侧：Ribbon / 命令打开 Momo 面板时落在左还是右侧边栏。
   * 不写死右侧；用户把面板拖到另一侧后由 main.ts 自动改写成实际所在侧。
   */
  panelSide: 'left' | 'right'
}

export const DEFAULT_SETTINGS: MomoSettings = {
  // 2026-10-12 用户裁定「默认 Momo 根目录是 Momo」：此前是旧代号 `danpen`。
  // 只作用于新装 / 盘上 settings 缺 `root` 键的读盘（sanitize 逐字段缺省化），
  // 已存了值的用户零变化——data.json 里的老 root 照旧生效，要改在设置页那一行。
  root: 'Momo',
  notesDir: 'notes',
  attachmentsDir: 'attachments',
  trashDir: 'trash',
  panelSide: 'right',
}

/** 软删登记：trash 目录内文件名 → 原相对路径 + 删除时间 */
export interface TrashRecord {
  /** vault 内原相对路径 */
  originalPath: string
  /** 删除时间（ISO） */
  deletedAt: string
}

/**
 * 回收站一行（`service.listTrash()` 的行形状，v0.9.26 起）：
 * 文件名 + 软删登记 + 该文件的**完整索引投影**。
 *
 * 为什么要带 entry：回收站行按正常卡片渲染（正文 / 标签 / 日期都读盘），
 * 筛选（搜索 / 标签 / 热力图选日）与列表同一套口径作用于它（消费路径见 ui/trash/Trash.tsx）。
 * `entry.path` 是**回收目录内**的路径；恢复 / 彻底删除仍按 `name` 递。
 */
export interface TrashItem {
  /** 回收站文件名（恢复 / 彻底删除都按它递） */
  name: string
  /** 软删登记：原相对路径 + 删除时刻 */
  record: TrashRecord
  /** 该文件的索引投影（内容 / 标签 / 日期；与列表里的 MomoEntry 同口径） */
  entry: MomoEntry
}

/** 一条 Momo 的索引投影（随 vault 事件重建，不缓存正文） */
export interface MomoEntry {
  /** vault 内相对路径 */
  path: string
  /** 文件名（不含目录），如 2026-09-08-142233.md */
  name: string
  /** ISO 时间戳，日期归类唯一权威（frontmatter createdAt） */
  createdAt: string
  /** ISO 时间戳，文件 mtime（= Obsidian 的「修改时间」）：「按更新时间排序」的依据 */
  updatedAt: string
  /**
   * 补记痕迹（frontmatter `backfilled: true`）：这条是从过去某天**补**回来的
   * （`service.create(content, tags, at)` 传了 `at`）。老文件没有这个字段 = false。
   *
   * 日期归类仍然只认 `createdAt`——补记正是要落在补的那天；这个字段只回答
   * 「这条是不是补的」：卡片上一枚「补」标记、统计将来要不要区别对待，都看它。
   * 注意它与 `updatedAt` 故意错开：补记的 `createdAt` 在过去、`updatedAt` 是落盘
   * 时刻，所以「按更新时间」排序下它出现在最前——这是预期（它确实是刚写的），
   * 卡片上的「补」标记负责向用户解释这件事（见 core/sort.ts 的说明）。
   */
  backfilled: boolean
  /**
   * 预写痕迹（frontmatter `scheduled: true`）：这条是**写到未来**某天的
   * （`service.create(content, tags, at)` 传了 `at`，且 `at` 的本地日在今天之后）。
   * 与 `backfilled` 是同一条路的两个方向：两者互斥、都由 `create(at)` 落盘，
   * 判据是 `dayKey(at)` 与今天的先后（见 service.create 的 JSDoc）。
   *
   * 存在的理由与 backfilled 逐条对应：日期归类只认 `createdAt`（这条本来就该
   * 落在未来那天），这个字段回答「这条为什么排在这儿」——卡片上一枚小时钟；
   * 空白预写文件同样不被启动清扫清掉（用户显式选了日子，见 sweepOneDraft）。
   * 老文件没有这个字段 = false。
   */
  scheduled: boolean
  /** 标签全集 = 正文行内 #标签 ∪ frontmatter tags（去重） */
  tags: string[]
  /**
   * 地点（frontmatter `locations`，F1 一期）：归一后的字符串数组（口径见
   * momo/locations/locations.ts 的 normalizeLocations）。与 tags 的分工：
   * tags 有行内形态（#标签），**locations 只活在 frontmatter**——读写都只动它。
   * 老文件没有这个字段 = 空数组；流氓数据（非数组 / 超长 / 超量）在读取时已被归一。
   */
  locations: string[]
  /** 正文 Markdown（轻渲染用；每次事件现读，不入 data.json） */
  content: string
  /**
   * 读失败降级标记（BUG-95）：true = 这是一份**读不到盘上内容**的占位投影
   * （读盘抛错，或目录里列出了名字但文件不可得），不代表文件本身为空。
   * 只在回收站这一路出现——列表路的读失败条目整个跳过（下次刷新重试即可），
   * 回收站行要保住「恢复 / 彻底删除」的处置入口、不能跳过，于是改用可见的
   * 降级形态。
   *
   * 标记放在 entry 上而不是行对象：卡片只拿到 entry（回收站筛选投影的
   * 也是它），不随它走卡片就分不出「读不到」与「本来就空」——旧表现正是一张
   * 能诱导用户「彻底删除」的空白卡。读失败的行不入 `trashCache`，每次刷新
   * 重试，成功即恢复真身；正常条目没有这个字段。
   */
  readFailed?: boolean
}

/** 批量添加标签的结果计数（service.addTags → caps.addTags → 调用方汇总提示） */
export interface AddTagsResult {
  /** 实际改写并落盘的文件数 */
  updated: number
  /** 已含全部待加标签、无需改动而跳过的文件数 */
  skipped: number
  /** 读取 / 写入失败的文件数（串行执行，单条失败不中断） */
  failed: number
}

/** 批量移除标签的结果计数（service.removeTags → caps.removeTags → 调用方汇总提示） */
export interface RemoveTagsResult {
  /** 实际改写并落盘的文件数 */
  updated: number
  /** 一个待移除标签都没有、无需改动而跳过的文件数 */
  skipped: number
  /** 读取 / 写入失败的文件数（串行执行，单条失败不中断） */
  failed: number
}

/** 批量添加地点的结果计数（service.addLocations → caps.addLocations → 汇总提示）。
 *  与 AddTagsResult 同构：locations 只写 frontmatter，没有「行内并集」那层。 */
export interface AddLocationsResult {
  /** 实际改写并落盘的文件数 */
  updated: number
  /** 已含全部待加地点、无需改动而跳过的文件数 */
  skipped: number
  /** 读取 / 写入失败的文件数（串行执行，单条失败不中断） */
  failed: number
}

/** 批量移除地点的结果计数（service.removeLocations → caps.removeLocations → 汇总提示） */
export interface RemoveLocationsResult {
  /** 实际改写并落盘的文件数 */
  updated: number
  /** 一个待移除地点都没有、无需改动而跳过的文件数 */
  skipped: number
  /** 读取 / 写入失败的文件数（串行执行，单条失败不中断） */
  failed: number
}

export interface MomoData {
  trash: Record<string, TrashRecord>
  prefs: {
    density: Density
    /**
     * 顶栏「视图」分段的显隐与顺序（v0.9.17，结构见 DensityViewPref）：
     * 数组顺序即顶栏按钮顺序，`on` = 这一档显不显示；**至少保留一项开着**
     * （收口规则见 sanitizeDensityViews）。
     *
     * 与上面的 `density` 是两件事，别混：这个管「摆在顶栏的是哪几个、按什么顺序
     * 摆」，那个管「此刻正在看的是哪一档」。用户关掉当前正在看的那一档时，
     * 设置页会把 `density` 一并回退到第一个还开着的档（一次落盘）。
     */
    densityViews: DensityViewPref[]
    /** 统计页各区块显隐（v0.5.3） */
    statsSections: StatsSections
    sidebar: boolean
    /** 列表排序模式（排序键 × 方向四值枚举；v0.9.15 前是 sortAsc 布尔，
     *  旧盘按方向无损迁移，见 types/sanitize.ts 的 sanitizeSortMode） */
    sortMode: SortMode
    /**
     * **侧栏标签区**的排序键（v0.9.18，三值枚举）—— 别和上面的 sortMode 混：
     * 那个管主区卡片流的先后，这个管侧栏标签行的先后。
     *
     * 同属视图偏好（ADR-003）：只决定排列，不写进任何 Momo。默认 'count' =
     * v0.9.18 之前写死的顺序（totalCount 降序 + 名称并列），老盘逐行不变。
     *
     * 注意与「两组筛选」的分工：排序**落盘**（换面板后还要保持），
     * 两组筛选是**会话内 transient**（不入这个文件，见 store 的 tagFilter）。
     */
    tagSort: TagSortKey
    /**
     * **多选标签**时主区卡片的匹配口径（2026-10-12，两值枚举）：
     * `union` = 并集（含任一已选标签即显示，默认 = ADR-004 §5 的既定口径）、
     * `intersection` = 交集（同时含全部已选标签才显示）。在侧栏「过滤标签」
     * 输入框右侧那枚按钮的浮层里切。
     *
     * 与 `tagSort` 同属**视图偏好**（落盘）：它定「怎么读我的选中」，不是
     * 「此刻筛哪几个」的临时意图（那是会话态，不入这个文件）。只影响标签
     * 这一维，与其余筛选维度仍取交集。
     */
    tagMatchMode: TagMatchMode
    /** 置顶标签（身份键列表，ADR-004）：只影响侧栏展示顺序，不是 Momo 内容 */
    pinned: string[]
    /**
     * 置顶笔记（Momo 路径列表，v0.8.3）：列表密度顶部那个「置顶」组，
     * 数组顺序即组内展示顺序（先置顶的在前）。
     *
     * 注意别和上面的 `pinned`（**置顶标签**，侧栏那套）混了：那个管标签怎么排，
     * 这个管 Momo 怎么排，两者互不相干、字段不共用。
     *
     * 同样是**视图偏好而非内容**（ADR-003）：它只决定列表的排列，不写进 Momo 文件——
     * 文件仍是内容与标签的唯一权威源。
     */
    pinnedNotes: string[]
  /** 回顾展示记录（路径 → 上次展示时间 ISO）：只被「很久没看」档用来排序。
    *  属于视图偏好（不是正文 / 标签 / 图片），随 refresh 自愈清理已消失的路径。 */
    reviewSeen: Record<string, string>
    /** 回顾抽法档位（random / week / month / stale / onthisday，2026-10-24 起持久化）。
    *  视图偏好（ADR-003）：此前是会话态，重载插件后静默掉回「随机」——用户选的
    *  「一周未看」以为还在生效，实际抽法一直没跟上。旧 data.json 无此键 →
    *  'random'（= 升级前每次重载后的实际档位），零迁移。 */
    reviewMode: ReviewMode
    /** 内部侧栏宽度（px）：拖拽手柄可调（clamp 到 SIDEBAR_WIDTH 区间），关面板 / 重开后保持 */
    sidebarWidth: number
    /** 面板内的内部侧栏停靠侧：'left'（默认，flomo 风）| 'right' */
    sidebarSide: 'left' | 'right'
    /** 侧栏功能显隐（结构见 SidebarSections；「全部笔记」常驻） */
    sections: SidebarSections
    /** 随机回顾每批条数（1–50，默认 10） */
    reviewCount: number
    /** 活跃度热力图滚动窗口（1–12 个月，默认 1） */
    heatmapMonths: number
    /** 统计页时间范围（'all' | '90d' | 'ytd' | 'custom'，默认 'all'）：页面顶部切换，关面板后保持 */
    statsRange: StatsRange
    /** 自定义范围起点（YYYY-MM-DD 本地日期键）；statsRange==='custom' 时生效，否则忽略 */
    statsCustomFrom: string | null
    /** 自定义范围止点（YYYY-MM-DD 本地日期键，双闭）；statsRange==='custom' 时生效，否则忽略 */
    statsCustomTo: string | null
    /** 配色方案（v0.5.1）：只换设计令牌，见 COLOR_SCHEMES；默认 mist-blue（雾蓝，2026-10-11 起，排第一即是默认） */
    colorScheme: ColorScheme
    /** 自定义 CSS 片段（v0.5.1）：**v0.9.11 起设置页不再提供编辑**（当时的自建配色
     *  已于 v0.9.16 移出设置页、转入 roadmap），但盘上已有的片段仍会读取并注入，
     *  老用户的覆盖不丢；恢复默认同样不清它（PREFS_DEFAULTS 不收这个键） */
    customCss: string
    /** 面板字体（v0.9.16）：面板界面文字（侧栏 / 弹层 / 设置页）用哪套字。取值空间
     *  与兜底见 sanitizeFontPref：'' = 跟随默认 | 'obsidian:<role>' = Obsidian 的字体
     *  角色（v1.0.0 起，内置开源字体已退役；2026-10-13 起界面只剩等宽一个角色，
     *  退役的界面 / 正文旧值继续读）| 其余 = 盘上遗留的系统已装字体名 */
    uiFont: string
    /** 卡片字体（v0.9.16）：卡片正文与标题用哪套字，取值空间同 uiFont。
     *  空串 = 跟随面板字体（卡片本来就从面板继承字体） */
    cardFont: string
    /** 短首行是否升为标题（v0.5.3）：首行不超过 titleMaxChars 字且非块级 Markdown 时
     *  显示为卡片标题；false = 首行按正文渲染。**默认 false**（v0.9.46 起用户裁定
     *  「卡片标题 - 默认项是：短首行不作为标题」：默认并入正文，升格是 opt-in） */
    titleFromFirstLine: boolean
    /** 「短首行作为标题」的字数上限（v0.9.12 起可配，此前写死 32）：
     *  首行剥掉行内标记后超过这么多字就整段当正文。合法区间 TITLE_MAX */
    titleMaxChars: number
    /** 只读浏览（v0.5.3）：卡片无 hover、点击正文不再自动打开 Obsidian，右上角操作里提供「在 Obsidian 中打开」按钮。
     *  **默认 true**（v0.9.47 起用户裁定「卡片操作 - 默认项是开启只读浏览」） */
    readOnly: boolean
    /** 左上角品牌图标（v0.7.4）：icons.tsx 白名单内挑一个，默认 leaf。
     *  brandIconImage 非空（用户上传了图片）时由那张图盖过，见下。 */
    brandIcon: BrandIcon
    /** 左上角品牌名称（v0.7.4）：默认「Momo」，空串 / 脏值回默认 */
    brandName: string
    /** 全部笔记卡片标签位置（v0.7.4）：'meta' = 元信息行右侧（默认）| 'bottom' = 卡片底部 */
    tagPosition: TagPosition
    /**
     * 全部笔记卡片**地点标签**位置（2026-10-01 从 tagPosition 拆出，用户要求
     * 「标签位置分成标签位置和地点位置」）：只作用于本条的 locations 地点 pill，
     * 与上面的正常 #标签（tagPosition）互不影响。取值空间同 TagPosition。
     */
    locPosition: LocationPosition
    /** 正文字号（px，v0.9.12 起连续滑杆；此前是三档 UiScale）：只缩放卡片阅读区的正文，
     *  标签按固定偏移从它折算（styles.src 的 .momo-app 块）。合法区间 CARD_FONT_SIZE */
    cardFontSize: number
    /** 「短首行作为标题」那行标题的字号（px，v0.9.12 新增选项）：只在
     *  titleFromFirstLine 开着时有东西可缩。合法区间 CARD_TITLE_SIZE */
    cardTitleSize: number
    /** 卡片圆角（px，v0.9.12 起连续滑杆）：完整卡片 / 回顾大卡共用。合法区间 CARD_RADIUS */
    cardRadius: number
    /** 卡片间距档位（v0.9.1）：sm / md / lg，卡片流的纵向与横向间隙 */
    cardGap: UiScale
    /** 卡片元信息行的日期粒度（v0.9.1）：'auto' = 默认行为 | 'day' = 一律带月日 | 'full' = 一律带完整日期 */
    cardStamp: CardStamp
    /** 卡片元信息行是否显示字数（v0.9.1，默认 true；关掉后只剩时间戳） */
    showCharCount: boolean
    /**
     * 卡片元信息行右上角那排操作按钮的显隐（v0.9.22，用户要求「加标签、复制正文、
     * 删除都可以在配置页面开启和关闭」）：三个布尔，**默认全开** = 升级前写死的行为，
     * 旧 data.json 无这三个键 → 回默认（升级后按钮逐像素不变）。
     *
     * 同属视图偏好（ADR-003）：只决定按钮出不出现，不改变能力本身——
     * 加标签 / 删除在多选批量条里仍有入口，单条入口消失不影响批量；
     * **复制没有第二个入口**（正文在文件里，手动选也行），关掉即从卡片上消失。
     * 只读态那枚「在 Obsidian 中打开」**不受这里管**：它是 prefs.readOnly
     * 开启后唯一的打开入口，关掉等于把用户锁在面板外。
     */
    showCardCopy: boolean
    showCardTag: boolean
    showCardDelete: boolean
    /** 切密度意图期的正文预热比例（v0.9.14 起可配，默认 'half' = v0.9.13 写死的行为）：
     *  悬停顶栏视图分段时提前渲染可见列表前这么多比例的正文。off = 不预热 */
    warmRatio: WarmRatio
    /** 界面语言（设置页 §界面外观可配）：'auto' = 跟随 Obsidian 的界面语言（默认），
     *  'zh' / 'en' / 'ja' = 手动固定。启动时与设置页切换时由 main / LookTab 调
     *  i18n 的 setLocale 应用；结构见 types/prefs.ts 的 LangPref */
    lang: LangPref
    /**
     * 左上角自定义图标（v0.9.12 起**多图**）：用户上传图片的 vault 相对路径清单，
     * 顺序即上传顺序（新的在尾），上限 BRAND_ICONS_MAX 张。
     * 只存路径不存数据：图片是 vault 里的普通文件，随手可换。
     * 空清单 = 只用 brandIcon 那枚预设形状；点任一预设形状**不清这张清单**
     * （这正是这一轮修的反馈：传了图再点别的形状，图不该消失——点回哪张图格子
     * 就切回哪张）。
     * **「恢复默认」也不清这张清单**（BUG-88）：清单与 locCoords / pinnedNotes
     * 同属用户数据，`PREFS_DEFAULTS` 刻意不收这个键——清掉引用之后界面上再无
     * 入口把图加回来，等于替用户删了图标。要删逐张点格子角上的 ×。
     */
    brandIconImages: string[]
    /**
     * 左上角自定义图标里**当前生效**的那张：brandIconImages 清单中的一条路径，
     * 或空串 = 用 brandIcon 那枚预设形状。移除 / 清空生效那张时它跟着收窄
     * （回退到清单里最新的那一张，没有就回空串）。
     */
    brandIconImage: string
    /**
     * 用户手填的地点坐标（F7 星球视图，v0.9.25）：地点名 → [纬度, 经度]（两位
     * 小数，北正东正）。设置页「地点」卡里填，**压过内置字典**（BUILTIN_LOC_COORDS，
     * 见 locations/locCoords.ts）——那是明确的一次覆盖，不是缓存。
     *
     * 属于**用户数据**而不是视图偏好（ADR-003 之外）：内置字典命中即上球，手填
     * 只为「家」这类自定义地点；所以恢复默认刻意不清它（同 pinnedNotes
     * 一类的用户 curation），要清得在设置页逐项删。
     *
     * 旧 data.json 无此键 → 空映射（无手填，只有内置字典）。
     */
    locCoords: Record<string, LatLon>
    /**
     * 新建 Momo 时在 frontmatter 里带上空 `locations: []`（v0.9.28，用户要求
     * 「写点什么打开的模板里应该有 locations」）：与 `tags: []` 并排的一行，
     * 在 Obsidian 属性面板里点开就能直接填地点。
     *
     * 开（**默认**）= 每篇新笔记（写点什么 / 发布 / 补记三条 create 路）都带这行；
     * 关 = 与 v0.9.27 之前逐字节一致，只有真用过地点的笔记才有 `locations` 键
     * （`removeLocations` 清空时按 removeTags 同口径**保留空数组键**，见 service/index.ts）。
     *
     * 只改**新建那一刻**：老笔记一个字节都不动。读侧 `locationsOf` 对缺省与空数组
     * 一视同仁（都算「没有地点」），所以开与关对列表 / 地点分组流 / 统计没有可感知
     * 差异——它决定的是新笔记 frontmatter 的第一眼长相。默认值与口径见 prefs.ts 的
     * DEFAULT_NEW_NOTE_LOCATIONS，设置页开关在「地点」卡（docs/design/reference/settings.md）。
     */
    newNoteLocations: boolean
    /**
     * 用户手填的地点大洲 / 国家（v0.9.30「地点名前加大洲和国家」）：地点名 →
     * [大洲, 国家]。设置页「地点」卡里填，**压过内置字典**（BUILTIN_LOC_REGIONS，
     * 见 locations/locRegions.ts）——与 locCoords 同一条规矩：明确的一次覆盖，不是缓存。
     *
     * 属于**用户数据**（同 locCoords / pinnedNotes 一类的 curation）：「全部恢复
     * 默认」刻意不清它，要清在设置页逐项删。旧 data.json 无此键 → 空映射
     * （只有内置字典）。
     */
    locRegions: Record<string, LocRegion>
    /**
     * 地点分组流显示 / 分组到哪一级（v0.9.30，默认 `name` = 大洲 · 国家 · 地点名
     * 全显）：一个旋钮同时管组头写什么、分组按什么并。三档与退化口径见 prefs.ts
     * 的 LocLevel，设置页分段在「地点」卡（docs/design/reference/settings.md）。
     */
    locLevel: LocLevel
    /**
     * 侧栏「全部地点」树的展开方式（2026-10-01，用户要求「在设置里添加配置，
     * 有两种：全展开不画展开按钮 / 可以展开和折叠」，默认值取了前者）：
     * `all` = 三级一次铺开、一颗 twisty 都不画（默认）；`fold` = 有子级的节点
     * 行首带一颗 twisty，默认态仍是全展开。两档与取舍见 prefs.ts 的
     * LocTreeExpand，设置页分段在「地点」卡（docs/design/reference/settings.md）。
     *
     * 与同卡的 `locLevel` / 标题行漏斗的 `locTreeLevels` 都不同：那两个管
     * 「显示到哪一级」，这个只管「能不能收」，连一级的可见性默认值都不动。
     */
    locTreeExpand: LocTreeExpand
    /**
     * 星球外观（2026-10-05，用户「一个夜地球和一个日地球」）：`night`（默认）=
     * Black Marble 夜灯贴图 + 球面暗示光照；`day` = globe.html 那套日地球 +
     * globe.html 的 ambient/key/边缘光配方。两档共用同一套渲染器，只差贴图与
     * 光照函数。两档的取舍与参数见 prefs.ts 的 GlobeEarth。
     *
     * 旧 data.json 无此键 → 读侧回 `night`，升级后球逐像素不变（夜地球正是插件
     * 一直在画的那颗）。
     */
    globeEarth: GlobeEarth
    /**
     * 语义图标覆写表（v0.9.36「每个图标可配置」）：语义图标名 → Lucide 库 id，
     * **稀疏**——表里没有的键 = 用 Momo 原形（momo/icons/icons.ts 的 PATHS）。
     * 取值空间 = LUCIDE_IDS（2111 枚，锁定 lucide-static@1.50.0）；`leaf` 品牌位
     * 不进本系统（有自己的 8 预设 + 上传体系，见 icons/icons.ts 的
     * CONFIGURABLE_ICON_NAMES 注释）。旧 data.json 无此键 → 空表（全原形，
     * 升级后界面逐像素不变）；脏键 / 脏值整条丢（sanitizeIconOverrides）。
     * 属于**视图偏好**（ADR-003）：只决定形状，不写进任何 Momo 文件。
     */
    icons: IconOverrides
    /**
     * 首次自动开面板的**记账**（2026-10-13，用户要求「安装完插件后，Momo 可以
     * 出现在右侧侧边栏」）：`false`（默认）= 还没替用户开过——插件加载完
     * （`main.ts` 的 `onLayoutReady`）时若仍是 `false`，就把面板按
     * `settings.panelSide`（默认右栏）开出来，然后置 `true` 落盘。
     *
     * **只开这一次**（同日用户裁定选项 A）：用户自己关掉后，重载插件 / 重启
     * Obsidian 都不会再弹回来——「关不掉的侧栏」比不自动开更烦。布局恢复里已经
     * 有面板时（上次就是开着退出的）只记账、不再开第二个。
     *
     * 与 `settings.panelSide` 的分工：那个是「面板停哪一侧」（用户拖动会改写），
     * 这个只回答「自动开这一次做完没有」。它不是界面偏好、设置页没有行，与
     * `reviewSeen` 同属「只服务行为的记账」，所以住 prefs 而不是 settings。
     * 旧 data.json 无此键 → 回 false：升级后的**第一次**启动也会自动开一次
     * （这正是要的「装完就能看见」），此后归用户自己管。
     */
    panelAutoOpened: boolean
  }
}
