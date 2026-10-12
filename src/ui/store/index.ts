import { create } from 'zustand'
import { CARD_FONT_SIZE, CARD_RADIUS, CARD_TITLE_SIZE, DEFAULT_BRAND_NAME, DEFAULT_DENSITY_VIEWS, DEFAULT_GLOBE_EARTH, DEFAULT_LOC_LEVEL, DEFAULT_LOC_TREE_EXPAND, DEFAULT_SECTIONS, DEFAULT_STATS_SECTIONS, DEFAULT_TAG_MATCH, DEFAULT_TAG_SORT, HEATMAP_MONTHS, REVIEW_COUNT, SIDEBAR_WIDTH, TITLE_MAX } from '../../momo/types'
import { DEFAULT_TAG_FILTER } from '../../momo/tags'
import { DEFAULT_LOC_TREE_LEVELS } from '../../momo/locations'
import { GLOBE_DEFAULT_POSE } from '../globe/globeMath'
import type { UiState } from './types'
import { createFilterSlice } from './filters'
import { createLocationSlice } from './location'
import { createMatchedSlice } from './matched'
import { createPrefsSlice } from './prefs'
import { createRefreshSlice } from './refresh'
import { createReviewSlice } from './review'
import { createPremiumSlice } from './premium'
import { createSelectionSlice } from './selection'

// UI store（依赖锁定：ui/ 不直接 import obsidian，
// 渲染与文件能力由 views 层经 init() 注入的 caps 进入）。
//
// 拆 slices 之后本文件只剩两件事：
//   1. 初值 + 组合各 slice —— 每个 slice 用 `Pick<UiState, …>` 约束自己提供哪些动作，
//      少一个 / 签名对不上，下面这行直接编译不过；
//   2. 再导出公开面 —— `useUi` / `MomoCaps` / `dayOf` / `pinnedNotesSetOf`，
//      保持 `from './store'` / `from '../ui/store'` 的既有引用不变。
//
// 业务规则分散在各 slice 文件里，改什么去哪看：
//   筛选与下钻 → filters.ts · 偏好与置顶 → prefs.ts · 刷新管道 → refresh.ts
//   回顾会话 → review/review.ts · matched() → matched.ts · 多选会话态 → selection.ts
//   引用守卫与输入缓存 → caches.ts · 日期键缓存 → dates.ts
//   地点筛选与树状态 → filters.ts / location.ts（filterLocations = 筛哪几个地区、
//   locView = 看星球还是分组流、locTreeLevels = 侧栏树显示哪几级）

export const useUi = create<UiState>((set, get) => ({
  caps: null,
  entries: [],
  trash: [],
  loading: true,
  // 读盘失败的常驻提示（会话态）：默认没有失败 = 不显示（ReadErrorBanner 自订阅它）
  readError: null,
  mode: 'list',
  // 多选会话态（v0.9.10 从 App 的 useState + CardScope 迁进 store，见 selection.ts）：
  // 默认不进多选、无选中、无弹层。**会话态，不落盘**——data.json 一个字段都不加
  selectMode: false,
  selected: new Set<string>(),
  tagPicker: null,
  // 地点筛选（2026-10-01 起，多选并集，会话态，不落盘）：空数组 = 不过滤；其余 =
  // 层级树节点键（`亚洲\u0000中国`）。**与标签筛选同一个位置、同一个味道**——地点
  // 从「一个浏览模式」降级成「一个筛选维度」就是这个字段（前身是 v0.9.31 的单值
  // locFilter）。切换 / 去重纪律见 filters.ts 的 toggleLocation。
  filterLocations: [],
  // 侧栏「全部地点」树的层级过滤（2026-10-01 单选，2026-10-10 起多选；会话态，
  // 不落盘）：['all'] = 完整三级树；其余 = 只显示勾中的那几级（树形照旧）。
  // 只动侧栏显示，不动 filterLocations、不动主区分组。
  locTreeLevels: DEFAULT_LOC_TREE_LEVELS,
  // 跳转计数器：地点分组流的滚动 effect 认它不认筛选集合值，同值重筛也能再滚一次
  locJumpSeq: 0,
  // 这次选中要星球转到的那一点（只有星球自己的入口传）：粗档下一个组含多枚锚点，
  // 光凭组键只挑得到组里条数最多的那枚。null = 让星球按节点键自己挑。
  locGlobeFocus: null,
  // 两个地点弹层（F3 单卡 / F4 批量，均会话态，不落盘）：null = 关。
  // 关面板即丢，下次打开面板不带任何弹层——与 tagPicker 同一待遇。
  locEditor: null,
  locPicker: null,
  // 地点视图档位（2026-10-01，会话态 transient）：off = 常规卡片流（默认），
  // globe = 星球，group = 地点分组流。跨模式 / 密度切换保留——与上面的筛选
  // 同一个记忆位（v0.9.25 的 locGlobe: boolean 是它的前身）。
  locView: 'off',
  // 星球位姿（倾角 / 绕竖轴转角，度）。默认值取 globeMath 的 GLOBE_DEFAULT_POSE
  //（= 设计稿 F7a 的初始角：北京 / 纽约 / 上海 三个示例锚点都可见）——
  // 常量只有那一份定义，这里的初值是它的拷贝，拖拽与选中转向只改这两个数
  locGlobeLat: GLOBE_DEFAULT_POSE.lat,
  locGlobeLng: GLOBE_DEFAULT_POSE.lng,
  density: 'list',
  // 顶栏视图分段的显隐与顺序（v0.9.17）：默认全开、顺序照 DENSITIES 声明序。
  // 逐项拷贝常量表——直接放引用会让后面对这一项的改动污染那份共享默认值。
  densityViews: DEFAULT_DENSITY_VIEWS.map((v) => ({ ...v })),
  sidebar: true,
  sortMode: 'createdDesc',
  // 侧栏标签区排序（v0.9.18，落盘偏好）：默认「数量」= v0.9.18 之前写死的那个顺序
  tagSort: DEFAULT_TAG_SORT,
  // 多选标签组合方式（2026-10-12，落盘偏好）：默认并集 = 本字段存在之前的行为
  tagMatchMode: DEFAULT_TAG_MATCH,
  // 侧栏标签区两组筛选（v0.9.18，会话态，不落盘）：默认两组全「全部」
  tagFilter: { ...DEFAULT_TAG_FILTER },
  search: '',
  filterDates: [],
  /** 标签筛选：存身份键，初始为空（ADR-004） */
  filterTags: [],
  untaggedOnly: false,
  // v0.7.0 统计页下钻维度（默认全空 = 不限）
  filterHours: [],
  filterWeekdays: [],
  filterLength: null,
  filterTagCount: null,
  filterReviewed: null,
  // 下钻会话的「今天及以前」闸（BUG-181a）：默认关，统计页下钻动作置位
  drillPastOnly: false,
  pinned: [],
  pinnedNotes: [],
  reviewMode: 'random',
  reviewSeen: {},
  reviewBatch: [],
  reviewIndex: 0,
  sidebarWidth: SIDEBAR_WIDTH.default,
  sidebarSide: 'left',
  sections: { ...DEFAULT_SECTIONS },
  statsSections: { ...DEFAULT_STATS_SECTIONS },
  reviewCount: REVIEW_COUNT.default,
  heatmapMonths: HEATMAP_MONTHS.default,
  statsRange: 'all',
  statsCustomFrom: null,
  statsCustomTo: null,
  statsRangeEditing: false,
  colorScheme: 'mist-blue',
  customCss: '',
  uiFont: '',
  cardFont: '',
  // 短首行默认不作为标题（v0.9.46 起）：首行并入正文，要升格去设置里开
  titleFromFirstLine: false,
  titleMaxChars: TITLE_MAX.default,
  // 只读浏览默认开（v0.9.47 起）：点正文不打开 Obsidian，右上角多一枚「在 Obsidian 中打开」
  readOnly: true,
  brandIcon: 'leaf',
  brandName: DEFAULT_BRAND_NAME,
  tagPosition: 'meta',
  // 地点标签位置（2026-10-01 从 tagPosition 拆出）：默认 meta（拆分前地点 pill 的位置）
  locPosition: 'meta',
  cardFontSize: CARD_FONT_SIZE.default,
  cardTitleSize: CARD_TITLE_SIZE.default,
  cardRadius: CARD_RADIUS.default,
  cardGap: 'md',
  cardStamp: 'auto',
  showCharCount: true,
  // 卡片右上角操作按钮显隐（v0.9.22）：默认全开 = 升级前写死的行为
  showCardCopy: true,
  showCardTag: true,
  showCardDelete: true,
  // 正文预热比例（v0.9.14 起可配）：默认一半 = v0.9.13 起写死的行为
  warmRatio: 'half',
  // 界面语言：默认 auto = 跟随 Obsidian（views.tsx 回灌 + 设置页切换时覆盖）
  lang: 'auto',
  brandIconImages: [],
  brandIconImage: '',
  // 用户手填的地点坐标（F7，v0.9.25，落盘偏好）：空映射 = 只有内置字典。
  // 星球视图与设置页「地点」卡读写这一份（用户值压过 BUILTIN_LOC_COORDS）
  locCoords: {},
  // 用户手填的地点大洲 / 国家（v0.9.30，落盘偏好）：空映射 = 只有内置字典
  // （用户值压过 BUILTIN_LOC_REGIONS）。默认档位 = 全显（大洲 · 国家 · 地点名）
  locRegions: {},
  locLevel: DEFAULT_LOC_LEVEL,
  // 侧栏「全部地点」树的展开方式（2026-10-01，落盘偏好）：默认 all = 三级全
  // 展开、不画 twisty（`fold` 才有展开 / 收起钮）
  locTreeExpand: DEFAULT_LOC_TREE_EXPAND,
  // 星球外观（2026-10-05，落盘偏好）：默认 night = Black Marble 夜灯贴图 + 球面
  // 暗示光照（= 插件一直在画的那颗）；day = globe.html 那套日地球 + 它的光照配方
  globeEarth: DEFAULT_GLOBE_EARTH,
  // 语义图标覆写表（v0.9.36，落盘偏好）：空表 = 全 Momo 原形。Icon 组件按
  // 它取形（momo/icons/icons.ts 的 iconPaths），设置页「图标」卡改它
  icons: {},
  attachmentStats: { total: 0, totalBytes: 0, entriesWithImages: 0, monthlyTrend: [] },

  ...createRefreshSlice({ set, get }),
  ...createPrefsSlice({ set, get }),
  ...createFilterSlice({ set, get }),
  ...createReviewSlice({ set, get }),
  ...createMatchedSlice({ set, get }),
  ...createPremiumSlice({ set, get }),
  ...createSelectionSlice({ set, get }),
  ...createLocationSlice({ set, get }),
}))

// ---- 公开面 ----

export type { MomoCaps, LocViewMode, MainMode, PrefsPatch, ReviewedFilter, UiState } from './types'
export { pinnedNotesSetOf } from './caches'
export { dayOf, dayOfCached } from './dates'
