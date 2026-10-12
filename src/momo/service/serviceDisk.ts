import { normalizePinnedTags } from '../types'
import { boolOf, sanitizeTable } from '../types/sanitizeKit'
import {
  sanitizeEntitlements,
  sanitizeQuotas,
  isIso,
  ID_MAX,
  TOKEN_MAX,
  type Entitlements,
  type QuotaEntry,
} from '../account/entitlement'
import type { PremiumFeature } from '../core'
import { migrateFromDisk } from '../types/migrations'
import {
  CARD_FONT_SIZE,
  CARD_RADIUS,
  CARD_TITLE_SIZE,
  DEFAULT_BRAND_NAME,
  DEFAULT_DENSITY_VIEWS,
  DEFAULT_GLOBE_EARTH,
  DEFAULT_LOC_LEVEL,
  DEFAULT_LOC_TREE_EXPAND,
  DEFAULT_NEW_NOTE_LOCATIONS,
  DEFAULT_SECTIONS,
  DEFAULT_STATS_SECTIONS,
  DEFAULT_TAG_MATCH,
  DEFAULT_TAG_SORT,
  HEATMAP_MONTHS,
  REVIEW_COUNT,
  SIDEBAR_WIDTH,
  TITLE_MAX,
  clampHeatmapMonths,
  clampCardFontSize,
  clampCardRadius,
  clampCardTitleSize,
  clampReviewCount,
  clampTitleMaxChars,
  clampSidebarWidth,
  sanitizeBrandIcon,
  sanitizeBrandIconImage,
  sanitizeBrandIconImages,
  sanitizeBrandName,
  sanitizeCardStamp,
  sanitizeColorScheme,
  sanitizeCustomCss,
  sanitizeDensity,
  sanitizeDensityViews,
  sanitizeFontPref,
  sanitizeIconOverrides,
  sanitizeLangPref,
  sanitizeLocCoords,
  sanitizeGlobeEarth,
  sanitizeLocLevel,
  sanitizeLocPosition,
  sanitizeLocRegions,
  sanitizeLocTreeExpand,
  sanitizeNewNoteLocations,
  sanitizePinnedNotes,
  sanitizeSections,
  sanitizeSettings,
  sanitizeSortMode,
  sanitizeStatsCustomRange,
  sanitizeStatsRange,
  sanitizeStatsSections,
  sanitizeTagMatch,
  sanitizeTagPosition,
  sanitizeTagSort,
  sanitizeTrash,
  sanitizeUiScale,
  sanitizeWarmRatio,
  type MomoData,
  type UiScale,
  type MomoSettings,
} from '../types'

// data.json 的盘上形态与「读盘 → 内存形状」的全部 sanitize（obsidian-free：只碰
// 普通对象，所以可以单独测）。
//
// 分成三层，越往下越接近盘面：
// - `MomoDiskFile` / `DEFAULT_DATA`：形状与初值；
// - `prefsFromDisk`：单段 prefs 的逐字段兜底（每个字段的脏数据回退都写在那里）；
// - `readDiskFile`：整份盘面的读取，含旧版平铺兼容与一次性污染自愈。

/**
 * data.json 的盘上形态（v0.4.3 起）：`{ data, settings }` 两个字段分开放。
 * 旧版把 MomoData 与 settings **平铺混存**（`{ trash, prefs, settings }`），
 * 读取时兼容，写出一律走新形态——persist 不再用 `as unknown as` 绕类型。
 * P1 起带 `schemaVersion`（见 types/migrations.ts）：读盘先过迁移链，
 * 写盘由 persist 统一盖当前版本号。
 */
export interface MomoDiskFile {
  schemaVersion?: number
  data?: Partial<MomoData>
  settings?: Partial<MomoSettings>
  /**
   * **遗留段**（v3 起只读不写）：服务器状态的本地缓存（P3，commercialization.md §3.1）：
   * 登录态 / entitlement / 配额。2026-09-30（v3）起搬去 sidecar
   * `<configDir>/plugins/<插件 id>/account.json`——data.json 恢复 git 跟踪（用户的
   * 视图偏好要跟着库同步），token 不能住在会被提交的文件里。
   *
   * 读盘侧**新旧都读**：v2 老盘 / 别的设备旧版写的 account 段照常进内存
   * （本条类型的 `unknown` 就是给这种盘面留的口），readDiskFile 报
   * `accountMigrated` 让 service.init 把它搬去 sidecar 并从盘面擦掉。
   * 净化见 accountFromDisk（与 prefs 同款白名单）；缺失 / 空段 = 未登录。
   */
  account?: unknown
  /* 旧版平铺形态的残留字段（仅读取） */
  trash?: MomoData['trash']
  prefs?: MomoData['prefs']
}

/** 插件私有状态的初值：软删登记为空、视图偏好全部取默认 */
export const DEFAULT_DATA: MomoData = {
  trash: {},
  prefs: {
    density: 'list',
    // 顶栏视图分段的显隐与顺序（v0.9.17）：默认五档全开、顺序照 DENSITIES 声明序
    // （= 升级前顶栏写死的顺序）。数组要逐项拷贝——常量是共享的 readonly 表，
    // 直接把引用放进 data.json 的内存形状，之后任何就地改动都会污染那份默认表。
    densityViews: DEFAULT_DENSITY_VIEWS.map((v) => ({ ...v })),
    sidebar: true,
    pinned: [],
    pinnedNotes: [],
    reviewSeen: {},
    sortMode: 'createdDesc',
    // 侧栏标签区排序（v0.9.18）：默认「数量」= 升级前写死的那个顺序
    tagSort: DEFAULT_TAG_SORT,
    // 多选标签的组合方式（2026-10-12）：默认并集 = 本字段存在之前的行为
    tagMatchMode: DEFAULT_TAG_MATCH,
    sidebarWidth: SIDEBAR_WIDTH.default,
    sidebarSide: 'left',
    sections: { ...DEFAULT_SECTIONS },
    statsSections: { ...DEFAULT_STATS_SECTIONS },
    reviewCount: REVIEW_COUNT.default,
    heatmapMonths: HEATMAP_MONTHS.default,
    statsRange: 'all',
    statsCustomFrom: null,
    statsCustomTo: null,
    // 默认配色 = 雾蓝（2026-10-11 用户裁定「配色方案，默认是雾蓝，它排在第一个」——
    // 与 brandIcon 的 leaf 同款约定，排第一即是默认；此前 v0.9.44 起默认是墨夜）。
    // 只作用于**新装 / 盘上缺键**的读盘：已存了值的用户零变化
    colorScheme: 'mist-blue',
    customCss: '',
    // 面板 / 卡片字体（v0.9.16）：空串 = 跟随默认（面板走 --momo-sans 原栈，卡片
    // 从面板继承）；内置开源字体存 'bundled:<id>'，系统字体存字体名
    uiFont: '',
    cardFont: '',
    // 短首行默认**不**升为标题（v0.9.46 起，2026-10-06 用户裁定「卡片标题 - 默认项
    // 是：短首行不作为标题」——其原生就是并入正文）。只作用于**新装 / 盘上缺键**的读盘：
    // 已存了值的用户零变化，想要这行为的在设置里自己开
    titleFromFirstLine: false,
    // 标题字数上限（v0.9.12 起可配）：默认 = 写死时的 32
    titleMaxChars: TITLE_MAX.default,
    // 只读浏览默认**开**（v0.9.47 起，2026-10-06 用户裁定「卡片操作 - 默认项是开启
    // 只读浏览」）。只作用于**新装 / 盘上缺键**的读盘：已存了值的用户零变化，想要
    // 「点正文即开」的自己去设置里关
    readOnly: true,
    brandIcon: 'leaf',
    brandName: DEFAULT_BRAND_NAME,
    tagPosition: 'meta',
    // 地点标签位置（2026-10-01 从 tagPosition 拆出）：默认 meta = 拆分前地点 pill
    // 一直在的地方（旧 data.json 没这个键 → 回默认，升级后观感不变）
    locPosition: 'meta',
    // UI 微调三档与卡片信息细节（v0.9.1）：默认全部回到设计稿原值
    // 正文字号 / 卡片圆角（v0.9.12 起连续滑杆：默认 = 设计稿原值即旧中档）
    // 与卡片间距（仍是三档），v0.9.1
    cardFontSize: CARD_FONT_SIZE.default,
    // 「短首行作为标题」的字号（v0.9.12 新增）：默认 = 升级前卡片标题实际用的字阶
    cardTitleSize: CARD_TITLE_SIZE.default,
    cardRadius: CARD_RADIUS.default,
    cardGap: 'md' as UiScale,
    cardStamp: 'auto',
    showCharCount: true,
    // 卡片右上角操作按钮显隐（v0.9.22）：默认全开 = 升级前写死的行为
    showCardCopy: true,
    showCardTag: true,
    showCardDelete: true,
    // 正文预热比例（v0.9.14 起可配）：默认一半 = v0.9.13 起写死的行为
    warmRatio: 'half',
    // 界面语言：默认 auto = 跟随 Obsidian（设置页 §界面外观可手动固定）
    lang: 'auto',
    // 左上角自定义图标（v0.9.3 起）：单图升级为多图清单（v0.9.12），
    // 空清单 = 只用预设形状；brandIconImage 指向清单里当前生效那一张。
    brandIconImages: [],
    brandIconImage: '',
    // 用户手填的地点坐标（F7，v0.9.25）：空映射 = 只有内置字典（locations/locCoords.ts）
    locCoords: {},
    // 用户手填的地点大洲 / 国家（v0.9.30）：空映射 = 只有内置字典（locations/locRegions.ts）
    locRegions: {},
    // 地点分组 / 组头显示到哪一级（v0.9.30）：全显 = 用户要的「地点名前加
    // 大洲和国家」（老盘没有这个键，读侧回默认，升级后只多一级前缀）
    locLevel: DEFAULT_LOC_LEVEL,
    // 侧栏「全部地点」树的展开方式（2026-10-01）：默认 all = 三级全展开、
    // 不画 twisty（老盘没有这个键 → 读侧回默认，升级后那棵树逐像素不变）
    locTreeExpand: DEFAULT_LOC_TREE_EXPAND,
    // 星球外观（2026-10-05）：默认夜地球 = 插件一直在画的那颗（老盘没有这个键
    // → 回默认，升级后球逐像素不变）。日地球要另带一套六面贴图，见 prefs.ts
    globeEarth: DEFAULT_GLOBE_EARTH,
    // 新建笔记带不带空 locations 字段（v0.9.28）：默认开 = 「写点什么」/ 发布 /
    // 补记建出来的每篇笔记 frontmatter 里就有 locations: [] 一行。老盘没有这个键
    // → 回默认（升级后只影响新建，老笔记一个字节不动）
    newNoteLocations: DEFAULT_NEW_NOTE_LOCATIONS,
    // 语义图标覆写表（v0.9.36「每个图标可配置」）：空表 = 全 Momo 原形。
    // 老盘没有这个键 → 回默认（升级后界面逐像素不变）
    icons: {},
  },
}

/**
 * data.json 里的回顾展示记录：只保留「非空路径 → 字符串时间」的合法项。
 * 数组要挡掉：`Object.entries(['a'])` 会把下标 `"0"` 当 key，reviewSeen 里就
 * 多出一个永远匹配不上任何路径的游离键（键是文件路径，"0" 只会白占位置）。
 * `__proto__` 同理：JSON.parse 会把它解析成自有键，直接赋值又会命中 setter
 * 而静默丢失（见 sanitizeTrash 的同类注释）。
 */
export function sanitizeSeen(raw: unknown): Record<string, string> {
  return sanitizeTable<string>(raw, (path, when) => (typeof when === 'string' && when ? [path, when] : null))
}

/**
 * 盘上的 prefs → 内存的 prefs：**白名单式重写**（P0，见
 * docs/design/data-schema-evolution.md §2.4）。
 * 返回对象只由两层构成：`DEFAULT_DATA.prefs` 的缺省 + 下面逐字段的显式 sanitize。
 * 盘上多出来的任何键（手改 / 同步写坏 / 历史退役残留）都**进不了内存**——
 * 此前裸 spread 会把它们带进来、再被整份落盘固化（v0.7.6 的 from/to 污染、
 * yearlyGoal / sortAsc / customSchemes 的残留都这么来的）；残留由 readDiskFile
 * 按 `STRAY_PREFS_KEYS` 对盘面探测并触发落盘自愈。
 * 新增 prefs 字段的固定工序（缺一行显式 sanitize 会在读盘时静默回默认，
 * 被 data-roundtrip 测试拦下）：DEFAULT_DATA.prefs 加缺省 → 这里加显式
 * sanitize → fixture / 往返测试（见 docs/design/data-schema-evolution.md §5）。
 */
export function prefsFromDisk(raw: Record<string, unknown>): MomoData['prefs'] {
  // 入口处先按形状收敛：读盘侧（readDiskFile）是把盘上的 prefs 无条件
  // `as Record<string, unknown>` 交进来的，手改 / 同步写坏时它可能是字符串或数组。
  // 非对象一律按「没有这个字段」处理（白名单重写下 = 全字段回默认）；字符串 /
  // 数组的逐字符 / 逐项自有键（"0"…"n"）也因此进不了返回值。
  const view: Record<string, unknown> =
    !raw || typeof raw !== 'object' || Array.isArray(raw) ? {} : raw
  const base = DEFAULT_DATA.prefs
  // 自定义区间（v0.5.4）：sanitizeStatsCustomRange 返回的是 **{ from, to }**，
  // 必须显式映射到 prefs 的 statsCustomFrom / statsCustomTo。曾把它直接 spread
  // 进 prefs——合法区间会把游离键 from/to 写进 data.json（盘上可见的污染），
  // 且注释承诺的「倒挂交换」对真字段从未生效（v0.7.6 修复）。
  const customRange = sanitizeStatsCustomRange(
    view.statsCustomFrom as string | null | undefined,
    view.statsCustomTo as string | null | undefined,
  )
  // 上传的左上角图标（v0.9.12 起多图）：老盘上只有 brandIconImage 一张图、
  // 没有清单键，把那张路径补进清单第一格——升级后图不丢。盘上**有**清单键就
  // 照清单来：两个键不一致（手改 data.json）时宁可让生效位回空串（显示预设
  // 形状），也不把一张清单外的路径塞回清单——清单是「用户传过什么」的记录，
  // 不是生效位的兜底桶。
  const brandIconImage = sanitizeBrandIconImage(view.brandIconImage)
  const brandIconImages = sanitizeBrandIconImages(view.brandIconImages)
  if (!Array.isArray(view.brandIconImages) && brandIconImage !== '') {
    brandIconImages.unshift(brandIconImage)
  }
  return {
    ...base,
    // 白名单式重写：刻意**没有** `...view`——盘上值只许经下面的显式 sanitize 进内存。
    // 视图密度（v0.8.0 前是裸 spread）：只认合法枚举，脏数据 / 旧 data.json 回「列表」
    density: sanitizeDensity(view.density),
    // 顶栏视图分段的显隐与顺序（v0.9.17）：旧 data.json 无此键 → 五档全开、
    // 顺序照 DENSITIES（升级后顶栏与升级前逐像素一致）；详见 sanitizeDensityViews
    densityViews: sanitizeDensityViews(view.densityViews),
    // 兼底 0.2.1 的 data.json（无 pinned）；并归一（剃非法项、按身份键去重）
    pinned: normalizePinnedTags(view.pinned),
    // 置顶笔记（v0.8.3）：旧 data.json 无此字段 → 空数组（不置顶任何东西）；
    // 脏数据剃掉非字符串项、按路径去重但**保留先后**（顺序即展示顺序）
    pinnedNotes: sanitizePinnedNotes(view.pinnedNotes),
    // 回顾展示记录：只保留「路径 → 字符串时间」的合法项
    reviewSeen: sanitizeSeen(view.reviewSeen as Record<string, string> | undefined),
    // 排序模式（v0.9.15 起四值枚举）：合法 sortMode 直接用；旧 data.json 只有
    // sortAsc 布尔，按方向无损迁移（sanitizeSortMode 的第二参数）
    sortMode: sanitizeSortMode(view.sortMode, view.sortAsc),
    // 侧栏标签区排序（v0.9.18）：旧 data.json 无此键 → 回「数量」（升级前后逐行一致）
    tagSort: sanitizeTagSort(view.tagSort),
    // 多选标签组合方式（2026-10-12）：旧 data.json 无此键 → 回「并集」（= 升级前行为）
    tagMatchMode: sanitizeTagMatch(view.tagMatchMode),
    // 内部侧栏宽度：旧 data.json 无此字段 → 默认；脏数据夹回合法区间
    sidebarWidth: clampSidebarWidth(view.sidebarWidth as number | undefined),
    // 内部侧栏停靠侧（v0.4.6）：非 'right' 一律回左
    sidebarSide: view.sidebarSide === 'right' ? 'right' : 'left',
    // 侧栏功能显隐（v0.4.6）：非布尔脏值回默认（开）。漏了这一条的话，手改 /
    // 同步写坏的 "sidebar": "false" / 0 会穿透 `...view` 进内存，之后每次
    // persist 又整份写回——string "false" 是 truthy 侧栏照常显示、0 则侧栏消失，
    // 而且用户改任何别的偏好都会把这个脏值再写一遍，永远不自愈。
    sidebar: boolOf(view.sidebar, true),
    // 侧栏功能显隐 / 回顾数量 / 热力图月数（v0.4.6）：结构化兜底
    sections: sanitizeSections(view.sections as unknown),
    // 统计页区块显隐（v0.5.3）：旧 data.json 无此字段 → 全开
    statsSections: sanitizeStatsSections(view.statsSections as unknown),
    reviewCount: clampReviewCount(view.reviewCount as number | undefined),
    heatmapMonths: clampHeatmapMonths(view.heatmapMonths as number | undefined),
    // 统计页时间范围（v0.4.17）：只认合法枚举，脏数据回「全部」
    statsRange: sanitizeStatsRange(view.statsRange as string | undefined),
    // 统计页自定义范围（v0.5.4）：两端都合法才生效，倒挂交换；缺端 → 未设置
    statsCustomFrom: customRange?.from ?? null,
    statsCustomTo: customRange?.to ?? null,
    // 配色方案 / 自定义 CSS（v0.5.1）：只认合法枚举 + 字符串上限；
    // 自定义 CSS 还要按语法拦网络原语（@import / 远程 url()，BUG-102）
    colorScheme: sanitizeColorScheme(view.colorScheme as string | undefined),
    customCss: sanitizeCustomCss(view.customCss as string | undefined),
    // 面板 / 卡片字体（v0.9.16）：三段取值空间的兜底见 sanitizeFontPref——
    // 空 = 跟随默认；bundled:<id> 必须在 BUNDLED_FONTS 里；手输字体名收白名单
    uiFont: sanitizeFontPref(view.uiFont),
    cardFont: sanitizeFontPref(view.cardFont),
    // 短首行标题 / 只读浏览（v0.5.3）：非布尔值回默认。两个默认值后来都翻过——
    // 标题 v0.9.46 翻成「关」，只读 v0.9.47 翻成「开」，见各自字段处的裁决记录
    titleFromFirstLine: boolOf(view.titleFromFirstLine, false),
    titleMaxChars: clampTitleMaxChars(view.titleMaxChars),
    readOnly: boolOf(view.readOnly, true),
    // 品牌图标 / 名称 / 标签位置（v0.7.4）：脏数据回默认
    brandIcon: sanitizeBrandIcon(view.brandIcon as string | undefined),
    brandName: sanitizeBrandName(view.brandName as string | undefined),
    tagPosition: sanitizeTagPosition(view.tagPosition as string | undefined),
    // 地点标签位置（2026-10-01 拆出）：旧 data.json 无此键 → 'meta'（拆分前的位置）
    locPosition: sanitizeLocPosition(view.locPosition as string | undefined),
    // 正文字号 / 卡片圆角（v0.9.12 起连续滑杆，旧三档枚举无损迁移）与卡片
    // 间距（仍是三档）；卡片时间粒度 / 字数开关（v0.9.1）：旧 data.json 无这些
    // 字段 → 默认值（版面与升级前一致）
    cardFontSize: clampCardFontSize(view.cardFontSize),
    cardTitleSize: clampCardTitleSize(view.cardTitleSize),
    cardRadius: clampCardRadius(view.cardRadius),
    cardGap: sanitizeUiScale(view.cardGap),
    cardStamp: sanitizeCardStamp(view.cardStamp),
    showCharCount: boolOf(view.showCharCount, true),
    // 卡片右上角操作按钮显隐（v0.9.22）：旧 data.json 无这三个键 → 回默认（全开），
    // 升级后按钮与升级前逐像素一致；非布尔脏值同样回默认
    showCardCopy: boolOf(view.showCardCopy, true),
    showCardTag: boolOf(view.showCardTag, true),
    showCardDelete: boolOf(view.showCardDelete, true),
    // 正文预热比例（v0.9.14 起可配）：旧 data.json 没这个键 → 'half'，
    // 与 v0.9.13 写死 0.5 的行为一致
    warmRatio: sanitizeWarmRatio(view.warmRatio),
    // 界面语言：只认合法枚举，旧 data.json / 脏数据 → 'auto'（跟随 Obsidian）
    lang: sanitizeLangPref(view.lang),
    // 当前生效的那张图标：不在清单里一律回空串（用预设形状）——手改 data.json
    // 把两张键改得不一致时，宁可显示叶子也不挂一个清单外的死引用。
    brandIconImage: brandIconImages.includes(brandIconImage) ? brandIconImage : '',
    brandIconImages,
    // 用户手填的地点坐标（F7，v0.9.25）：旧 data.json 无此键 → 空映射；
    // 脏项整条剃（越界 / NaN / 形状不对），两位小数吸合，见 sanitizeLocCoords
    locCoords: sanitizeLocCoords(view.locCoords),
    // 用户手填的地点大洲 / 国家（v0.9.30）：旧 data.json 无此键 → 空映射
    // （只有内置字典）；脏项整条剃（两项得是字符串），见 sanitizeLocRegions
    locRegions: sanitizeLocRegions(view.locRegions),
    // 地点分组 / 组头显示到哪一级（v0.9.30）：旧 data.json 无此键 → 'name'
    // （大洲 · 国家 · 地点名全显 = 用户要的「地点名前加大洲和国家」）
    locLevel: sanitizeLocLevel(view.locLevel),
    // 侧栏「全部地点」树的展开方式（2026-10-01）：旧 data.json 无此键 → 'all'
    // （三级全展开不画 twisty = 换造型时那棵树的行为，升级后观感零变化）
    locTreeExpand: sanitizeLocTreeExpand(view.locTreeExpand),
    // 星球外观（2026-10-05）：旧 data.json 无此键 → 'night'（= 插件原本画的那颗球，
    // 升级后逐像素不变）；白名单外的值（含大小写错的 'Day'）一律回默认
    globeEarth: sanitizeGlobeEarth(view.globeEarth),
    // 新建笔记带不带空 locations（v0.9.28）：旧 data.json 无此键 → 默认（开）；
    // 只影响新建那一刻的 frontmatter，老盘读侧行为零变化
    newNoteLocations: sanitizeNewNoteLocations(view.newNoteLocations),
    // 语义图标覆写表（v0.9.36）：旧 data.json 无此键 → 空表（全 Momo 原形，
    // 升级后界面逐像素不变）；脏键 / 脏值整条丢，见 sanitizeIconOverrides
    icons: sanitizeIconOverrides(view.icons),
  }
}

export interface DiskReadResult {
  data: MomoData
  settings: MomoSettings
  /** 是否撞见并清掉了退役键残留（调用方据此决定要不要顺手落盘） */
  strayPrefsCleaned: boolean
  /**
   * data.json 顶层还带着 `account` 段 = v2 及以前的盘面 / 别的设备旧版写的
   * （2026-09-30 v3 起该段搬去 sidecar）。**不管净化后是不是 null**——脏段
   * （半截写入）也该擦。调用方（service.init）据此先写 sidecar 再重写
   * data.json，与 strayPrefsCleaned 同一模式。
   */
  accountMigrated: boolean
  /** 登录态与权益缓存；null = 未登录（盘上没有 account 段或全空） */
  account: MomoAccount | null
}

/**
 * 账号段（P3，commercialization.md §3.1）：服务器权威数据的本地缓存。
 * **它不是 prefs**——退出登录 = 删 sidecar（v3 起，见 readDiskFile 上方
 * MomoDiskFile.account 的注释），用户偏好一条不丢；这个干净边界靠
 * 「单独一个文件」成立。token 明文存放是诚实取舍（无 keychain 现实可依赖），
 * 缓解：匿名 userId、access token 短 TTL、设备列表可撤销（§3.3）。
 */
export interface MomoAccount {
  /** 服务端发的匿名 id，不是邮箱 */
  userId: string
  /** 每台设备一个，服务端可单独撤销（「我的设备」页） */
  deviceId: string
  accessToken: string
  refreshToken: string
  /** 权益缓存：服务器权威，删了能重拉（净化与判定见 account/entitlement.ts） */
  entitlements: Entitlements
  /** 配额缓存：随每次操作由服务端返回（§6） */
  quota: Partial<Record<PremiumFeature, QuotaEntry>>
  /** 最近一次成功验证的时间（ISO）——离线宽限期的判据；null = 从未验证成功 */
  cachedAt: string | null
}

/**
 * account 段 → 内存：逐字段白名单净化（照 prefsFromDisk 的孪生模式）。
 * 入参两处来：v3 sidecar `account.json` 的主路径，与 data.json 的遗留段
 * （搬迁用，见 readDiskFile 的 accountMigrated）——同一把尺子。
 * 返回 null = 未登录：段缺失、不是对象、或净化后连 userId 都没有（空段）。
 */
export function accountFromDisk(raw: unknown): MomoAccount | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const view = raw as Record<string, unknown>
  const str = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.trim().slice(0, max) : ''
  const userId = str(view.userId, ID_MAX)
  const account: MomoAccount = {
    userId,
    deviceId: str(view.deviceId, ID_MAX),
    accessToken: str(view.accessToken, TOKEN_MAX),
    refreshToken: str(view.refreshToken, TOKEN_MAX),
    entitlements: sanitizeEntitlements(view.entitlements),
    quota: sanitizeQuotas(view.quota),
    cachedAt: isIso(view.cachedAt) ? (view.cachedAt as string) : null,
  }
  // 全空段（手改把字段清了 / 半截写入）视为未登录，而不是带着空串 token 的假登录态
  if (!userId || !account.accessToken || !account.refreshToken) return null
  return account
}

/** 账号段的写盘序列化（sidecar 用；读侧 accountFromDisk 是白名单重写，键序不依赖这里） */
export function serializeAccount(account: MomoAccount): string {
  return JSON.stringify(account)
}

/**
 * prefs 的退役 / 污染键清单（**清单即数据**，P0 机制化）。
 * `prefsFromDisk` 白名单重写后这些键进不了内存；这里只用来对**盘面原文**探测
 * 残留并报 `strayPrefsCleaned`，让下一次落盘把残留擦掉。新退役一个 prefs 键时：
 * ① 键名进这张表；② 若它还要当迁移源读（如 `sortAsc` → `sortMode`），
 * 在 `prefsFromDisk` 里显式读 `view.<key>`；③ `prefs-whitelist.test.mts` 守
 * 「清单键 ≠ 在役键」，防止把在役键标成退役（那会把合法盘面判成污染）。
 */
export const STRAY_PREFS_KEYS = [
  'from',
  'to', // v0.7.6：sanitizeStatsCustomRange 的返回值 { from, to } 被误 spread 进 prefs
  'yearlyGoal',
  'yearlyGoalType', // 年度目标卡与设置两行配置移除的那一轮
  'ribbonIcon', // v0.9.1 的 Ribbon 自定义图标：上传搬到「左上角图标」，改名 brandIconImage
  'sortAsc', // v0.9.15 布尔换成 sortMode 四值枚举（仍是 sanitizeSortMode 的迁移源）
  'customSchemes',
  'customSchemeId', // v0.9.16 自建配色移出设置页、转入 roadmap
  'gapLabel',
  'axisTime', // 节奏（timeline）密度档移除的那一轮：两个只服务该视图的偏好随之退役
] as const

/** 探测盘上 prefs 是否带着退役 / 污染键（只碰原文对象，不做任何改写） */
function diskPrefsHaveStrays(rawPrefs: unknown): boolean {
  if (!rawPrefs || typeof rawPrefs !== 'object' || Array.isArray(rawPrefs)) return false
  const view = rawPrefs as Record<string, unknown>
  return STRAY_PREFS_KEYS.some((k) => k in view)
}

/**
 * 读整份 data.json。
 * `loaded` 为 null = 首次安装 / loadData 返回 undefined：给默认值，不写盘。
 * 返回时 `settings` 已 sanitize，`data.prefs` 已逐字段兜底。
 */
export function readDiskFile(loaded: MomoDiskFile | null): DiskReadResult {
  if (!loaded) {
    return {
      // BUG-146：首次安装不走 `{ ...DEFAULT_DATA.prefs }`（只拷一层，嵌套数组 / 对象
      // 与模块级默认表共享引用）。改成与盘上缺省同一个入口 prefsFromDisk({})——
      // 白名单重写天然逐项新建，两条默认值路径收成一条。
      data: { trash: {}, prefs: prefsFromDisk({}) },
      settings: sanitizeSettings(undefined),
      strayPrefsCleaned: false,
      accountMigrated: false,
      account: null,
    }
  }
  // 兼容旧版平铺盘面：顶层有 trash/prefs 就是旧格式，新格式从 data 字段取。
  // P1：读盘第一站先过 schema 迁移链（老版本逐级补、未来版本容忍读原样返回），
  // 之后的平铺兼容与逐字段 sanitize 都只在「当前版本的形状」上工作。
  // `data === undefined` 这个前提不能省：盘上同时有 data 段与顶层 trash/prefs 时
  // （外部合成 / 手改 / 同步合并），只凭顶层两键就判 legacy 会把整份现代盘面
  // 丢掉——persist 永不写这两个顶层键，所以是真出现了两份时才救旧盘。
  const migrated = migrateFromDisk(loaded) as MomoDiskFile
  const legacy =
    migrated.data === undefined && (migrated.trash !== undefined || migrated.prefs !== undefined)
  const diskData = legacy ? { trash: migrated.trash, prefs: migrated.prefs } : migrated.data
  const data: MomoData = {
    trash: sanitizeTrash(diskData?.trash),
    prefs: prefsFromDisk((diskData?.prefs ?? {}) as Record<string, unknown>),
  }
  // settings 也读**迁移后**视图（R0c 修读盘不对称）：此前这里读的是未迁移的
  // `loaded.settings`，而 data / account 读的是 migrated——将来任何 settings 段的
  // 迁移（键改名 / 形状变更）都会被这条不对称悄悄吞掉，只对一半字段生效。
  // 今天 SCHEMA_MIGRATIONS 没有 settings 迁移，两者行为一致；改这一行是给未来铺轨。
  const settings = sanitizeSettings(migrated.settings)
  // v3 迁移探测：data.json **顶层**还带着 account 键（不管净化后是不是 null——
  // 半截写入的脏段也要擦；`in` 对非对象入参会抛，手改坏档时先挡形状）。
  // v3 起这一段的唯一真源是 sidecar，见 service.init 的搬迁与本条类型的注释。
  const accountMigrated =
    typeof loaded === 'object' && loaded !== null && !Array.isArray(loaded) && 'account' in loaded
  // 自愈历史污染（v0.7.6 起；P0 白名单化后只探测、不改写）：
  // prefsFromDisk 白名单重写后，盘上的退役 / 污染键根本进不了内存——这里对
  // **盘面原文**按 STRAY_PREFS_KEYS 探测残留，命中就报 strayPrefsCleaned，
  // 让调用方顺手落盘一次把残留擦掉。各键的来历见 STRAY_PREFS_KEYS 的注释表。
  const strayPrefsCleaned = diskPrefsHaveStrays(diskData?.prefs)
  return {
    data,
    settings,
    strayPrefsCleaned,
    accountMigrated,
    account: accountFromDisk(migrated.account),
  }
}
