import type {
  AddLocationsResult,
  AddTagsResult,
  BrandIcon,
  CardStamp,
  ColorScheme,
  MomoEntry,
  Density,
  DensityViewPref,
  FontPackId,
  GlobeEarth,
  LangPref,
  LocLevel,
  LocTreeExpand,
  LocationPosition,
  RemoveLocationsResult,
  RemoveTagsResult,
  SidebarSections,
  SortMode,
  StatsRange,
  StatsSections,
  TagPosition,
  TagMatchMode,
  TagSortKey,
  TrashItem,
  UiScale,
  WarmRatio,
} from '../../momo/types'
import type { PremiumFeature } from '../../momo/core'
import type { Entitlements } from '../../momo/account/entitlement'
import type { ReviewMode } from '../../momo/review'
import type { TagFilterState } from '../../momo/tags'
import type { LatLon } from '../../momo/locations'
import type { LocRegion } from '../../momo/locations'
import type { LocTreeLevel, LocTreeLevels } from '../../momo/locations'
import type { IconOverrides } from '../../momo/icons'
import type { GlobePackFailure } from '../../momo/globe/pack'
import type { FontPackFailure } from '../../momo/fonts/pack'
import type { FontFaceSpec } from '../../momo/fonts/pack'
import type { LocPickerMode } from '../locations/picker/rows'
import type { TagPickerMode } from '../tags/picker/rows'

// UI store 的类型层（依赖锁定：ui/ 不直接 import obsidian，
// 渲染与文件能力由 views 层经 init() 注入的 caps 进入）。
//
// 拆 slices 之后这里仍是**唯一真源**：UiState 的字段 / 动作签名只在这一处声明，
// 各 slice 用 `Pick<UiState, ...>` 约束自己提供了哪些动作——少一个、签名不一致都编译不过。

/**
 * 视图偏好补丁（`data.json` 的 `prefs` 段）。caps.savePrefs 与 store.setPrefs
 * 共用同一份形状，两边不许各写一遍。
 */
export type PrefsPatch = {
  density?: Density
  /** 顶栏视图分段的显隐与顺序（v0.9.17）：数组顺序即顶栏顺序 */
  densityViews?: DensityViewPref[]
  sidebar?: boolean
  pinned?: string[]
  pinnedNotes?: string[]
  reviewSeen?: Record<string, string>
  /** 回顾抽法档位（2026-10-24 起持久化）：默认随机 = 本字段存在前每次重载后的实际档位 */
  reviewMode?: ReviewMode
  sortMode?: SortMode
  /** 侧栏标签区排序键（v0.9.18，持久化偏好；默认「数量」= 升级前写死的行为） */
  tagSort?: TagSortKey
  /** 多选标签组合方式（2026-10-12，持久化偏好；默认「并集」= 升级前写死的行为） */
  tagMatchMode?: TagMatchMode
  sidebarWidth?: number
  sidebarSide?: 'left' | 'right'
  sections?: SidebarSections
  statsSections?: StatsSections
  reviewCount?: number
  heatmapMonths?: number
  statsRange?: StatsRange
  statsCustomFrom?: string | null
  statsCustomTo?: string | null
  colorScheme?: ColorScheme
  customCss?: string
  uiFont?: string
  cardFont?: string
  titleFromFirstLine?: boolean
  titleMaxChars?: number
  readOnly?: boolean
  brandIcon?: BrandIcon
  brandName?: string
  tagPosition?: TagPosition
  locPosition?: LocationPosition
  cardFontSize?: number
  cardTitleSize?: number
  cardRadius?: number
  cardGap?: UiScale
  cardStamp?: CardStamp
  showCharCount?: boolean
  /** 卡片元信息行右上角那排操作按钮的显隐（v0.9.22，默认 true = 升级前写死的行为） */
  showCardCopy?: boolean
  showCardTag?: boolean
  showCardDelete?: boolean
  /** 切密度意图期的正文预热比例（v0.9.14 起可配） */
  warmRatio?: WarmRatio
  /** 界面语言（'auto' = 跟随 Obsidian；固定值 = 设置页手动选的） */
  lang?: LangPref
  /** 左上角自定义图标清单（v0.9.12 多图）：上传图片的 vault 相对路径 */
  brandIconImages?: string[]
  /** 左上角自定义图标（上传图片的 vault 相对路径）；空串 = 用预设形状 */
  brandIconImage?: string
  /** 用户手填的地点坐标（F7，v0.9.25）：地点名 → [纬度, 经度]。
   *  压过内置字典（coordOfLocation 的用户值优先分支），恢复默认刻意不清 */
  locCoords?: Record<string, LatLon>
  /** 用户手填的地点大洲 / 国家（v0.9.30）：地点名 → [大洲, 国家]。
   *  压过内置字典（regionOfLocation 的用户值优先分支），恢复默认刻意不清 */
  locRegions?: Record<string, LocRegion>
  /** 地点分组流显示 / 分组到哪一级（v0.9.30，默认 'name' = 全显） */
  locLevel?: LocLevel
  /** 侧栏「全部地点」树的展开方式（2026-10-01，默认 'all' = 全展开不画 twisty） */
  locTreeExpand?: LocTreeExpand
  /** 星球外观（2026-10-05，默认 'night'）：night = 夜灯贴图 + 球面暗示光照；
   *  day = globe.html 那套日地球 + 它的 ambient/key/边缘光配方。见 prefs.ts 的 GlobeEarth */
  globeEarth?: GlobeEarth
  /** 语义图标覆写表（v0.9.36）：语义名 → Lucide 库 id，稀疏（缺省 = Momo 原形） */
  icons?: IconOverrides
}

/**
 * 宿主 DOM 工厂面（BUG-235）：`src/ui/` 不许 import obsidian、也不许直接
 * `document.createElement` / `createDocumentFragment`——Obsidian 评审
 * `obsidianmd/prefer-create-el` 要的是宿主的 `createEl` / `createFragment`，
 * 而它们是**宿主全局**（jsdom 里没有），这一层的契约是「能脱离 Obsidian 单测」。
 * 于是「建元素」下沉到 views 侧，经这里注入：`src/views/caps.ts` 用 Obsidian 的
 * 全局助手实现它，测试侧的 mock 用 jsdom 的 document 实现它。
 *
 * 只管「建」：`document.createTextNode` / `createTreeWalker` 不在 prefer-create-el
 * 管辖内，仍由 ui/ 直接调。
 */
export interface MomoDomFactory {
  /** 建一个元素；`cls` 非空时**整体**设为 className（与旧的 `el.className = cls` 等价） */
  el<T extends keyof HTMLElementTagNameMap>(tag: T, cls?: string): HTMLElementTagNameMap[T]
  /** 建一个文档片段（`highlightMatches` 包 `<mark>` 时的中转容器） */
  fragment(): DocumentFragment
}

export interface MomoCaps {
  renderMarkdown(container: HTMLElement, markdown: string): Promise<void>
  /**
   * 释放某个容器的正文渲染生命周期（BUG-218）：渲染时给 `MarkdownRenderer.render`
   * 传的 Component 是**按容器**建的（评审口径 `obsidianmd/no-plugin-as-component`：
   * 传主插件实例会让渲染期登记的子组件永不释放）。容器不再用（React 摘掉卡片 /
   * 预热容器用完即弃）时调它，登记过的子组件才跟着卸载。
   * 可选：缺省实现（老 mock / 无渲染需求的宿主）不调也不影响正文上屏。
   */
  releaseMarkdown?(container: HTMLElement): void
  /** 宿主 DOM 工厂（BUG-235，理由见 MomoDomFactory）：渲染路径建游离容器 / 高亮 `<mark>` 用 */
  dom: MomoDomFactory
  /**
   * 剪贴板**写入**的唯一出口（BUG-235，评审 Recommendation「Clipboard Access」的
   * 收敛落点）。全仓只有两个写入点，都走它：卡片操作行的「复制」按钮
   * （`ui/card/CopyButton.tsx`）与 `views.tsx` 的 document 级 Ctrl/Cmd+C 兜底。
   * `attachmentPaste.ts` 读的是用户自己粘贴事件的 `clipboardData`，不是剪贴板
   * 读取，与这里无关。
   *
   * 契约（三条，写死在这里）：
   * ① **只在用户手势里写**——点击复制按钮、按下 Ctrl/Cmd+C；不在 effect /
   *    定时器 / 渲染路径里调；
   * ② **永不读剪贴板**——本能力只有 write 一个方向；
   * ③ **失败静默**——写失败（document 失焦 / 权限拒绝 / 环境没有 clipboard API）
   *    时 reject 由调用方处理：Ctrl+C 兜底整条吞掉、让原生复制兜底（同一文本被
   *    写两遍，后果良性），CopyButton 照常显示失败态（B12 / BUG-155 的语义）。
   *    两处都不弹 Notice、不重试。
   */
  writeClipboard(text: string): Promise<void>
  /** 发布一条 Momo（刷新列表；失败时抛错由调用方恢复文本） */
  publish(content: string, tags: string[]): Promise<void>
  /** 新建 Momo 并打开编辑器 */
  openNew(): void
  openInEditor(path: string): void
  /**
   * 补记到 `day`（YYYY-MM-DD 本地日）：建空白 Momo 到那天并在 Obsidian 编辑器打开（失败抛错）。
   * （pickBackfillDay 已随 Q14 摘除：全仓无消费者——补记入口走 backfillNew，日期
   * 来自筛选胶囊；命令面板那条路直调 views 侧的模块级函数、不经 caps。）
   */
  backfillNew?(day: string): Promise<void>
  /** 就地编辑保存：写回原文件正文（保留 frontmatter），刷新列表 */
  saveEntry(path: string, content: string): Promise<void>
  /**
   * 批量添加标签（多选工具栏）：只写 frontmatter `tags`，正文不动；
   * 已含该标签的 Momo 跳过（不写盘）。写操作串行、单条失败不中断，
   * 汇总提示由本层负责（ui/ 不 import obsidian）。
   */
  addTags(paths: string[], tags: string[]): Promise<AddTagsResult>
  /**
   * 批量移除标签（多选工具栏「去标签」）：从这批 Momo 里摘掉指定标签，
   * frontmatter 与正文行内两处一起改（只改一处会被另一处读回来），
   * 精确匹配、不连带子标签。串行、单条失败不中断，汇总提示由本层负责。
   */
  removeTags(paths: string[], tags: string[]): Promise<RemoveTagsResult>
  /**
   * 批量添加地点（多选工具栏「设地点」的追加态，F1 一期）：只写 frontmatter
   * `locations`，已含该地点（**按身份**：纽约 / New York 是同一处，BUG-110a）的
   * Momo 跳过。串行、单条失败不中断，汇总提示由本层负责（ui/ 不 import obsidian）。
   */
  addLocations(paths: string[], locations: string[]): Promise<AddLocationsResult>
  /**
   * 批量移除地点（「设地点」的移除态，F1 一期）：从这批 Momo 的 frontmatter
   * `locations` 里摘掉指定地点（**按身份**匹配，不留异写法幽灵 pill），串行、
   * 单条失败不中断，汇总提示同上。
   */
  removeLocations(paths: string[], locations: string[]): Promise<RemoveLocationsResult>
  /**
   * 标签改名 / 合并（读取侧维护）：把 from 及其整棵子树改写成 to，
   * 同时改 frontmatter tags 与正文行内 #标签；串行、单条失败不中断，
   * 汇总提示由本层负责。
   */
  renameTag(from: string, to: string): Promise<{ updated: number; failed: number }>
  /** 删除标签：只删精确匹配的那一个（不连带子标签），提示同上 */
  deleteTag(tag: string): Promise<{ updated: number; failed: number }>
  /**
   * 批量软删（多选工具栏「删除到回收站」；单卡删除按钮传单元素数组）：
   * service 层一次批量 rename + 一次落盘，成功条数汇总提示由 caps 层负责。
   * 保留「单个失败即停」：抛错时错误信息含已删条数，已删部分照常生效。
   * 返回实际落盘的回收文件名（供 caps 层的一步撤销用）。
   */
  trashMany(paths: readonly string[]): Promise<{ count: number; names: string[] }>
  restore(name: string): Promise<void>
  /** 全部恢复（UI 提供入口）；把回收站里的 Momo 一次性移回 */
  restoreAll(): Promise<void>
  purge(name: string): Promise<void>
  /** 清空回收站（UI 负责二次确认） */
  purgeAll(): Promise<void>
  /**
   * 二次确认弹窗（Obsidian Modal，views 层注入 —— ui/ 不 import obsidian）。
   * resolve true = 用户点了确认按钮；Esc / 点关闭 / 取消都是 false。
   * 2026-10-10 起没有 title 字段（BUG-160：所有 dialog 左上角都不放标题——
   * 标题和主动作按钮是同一句话的第二遍）。
   */
  confirmDialog(options: { message: string; confirmText?: string; danger?: boolean }): Promise<boolean>
  /** 图片落盘到附件目录，返回 vault 路径 */
  attachImage(name: string, data: ArrayBuffer): Promise<string>
  /** 列出附件目录的文件 */
  listAttachmentFiles?(): Promise<{ path: string; size: number; mtime: number }[]>
  /**
   * vault 内路径 → 可放进 `<img src>` 的 URL（views 层包 Obsidian 的
   * `vault.adapter.getResourcePath`，app:// 协议，移动端也认）。左上角自定义图标
   * 用它把盘上的图片显示进品牌标。
   */
  resourceUrl(path: string): string
  /**
   * 星球贴图的六面 URL（`blob:`，**异步**）—— **cube map 六面**，固定顺序
   * px/nx/py/ny/pz/nz（three.js CubeTexture 的构造顺序，2026-10-04 起）。旧版是单张
   * 2048×1024 等距圆柱（在极点有几何奇异），换成 cube 后极点落在 +Z/-Z 面正中。
   * 2026-10-02 起不再内联进 main.js（内联把 onload 的 parse+eval 抬一大截）。
   *
   * 2026-10-13 起给的**不是** `app://` 资源 URL，而是 caps 自己读字节包出来的
   * `blob:` URL：资源 URL 对文档（app://obsidian.md）是跨源的，`<img>` 不带 CORS
   * 装载会把 canvas 污染成跨源 → `getImageData` 抛 SecurityError → 六面全解不出
   * （现场：星球黑卡 + 「下载资源包」说明条，而下载毫无用处）。blob URL 与文档
   * 同源，画布干净。可选：没有 caps 的环境（jsdom 测试）拿不到 URL，星球只留
   * SVG 叠层，功能不炸。
   *
   * 入参 `earth` = `prefs.globeEarth`（贴图与光照**一起**按档切，见
   * momo/types/prefs.ts 的 GlobeEarth）；文件名口径只此一处（momo/globe/pack.ts）。
   */
  globeCubeUrls?(earth: GlobeEarth): Promise<string[]>
  /**
   * 星球资源包的状态（v1.0.0）：`installed` = 12 件贴图文件齐全（本地构建也会把它们
   * 直接铺进插件目录，那条路不经过下载）；`version` = 记账版本（'' = 没有记账，例如
   * 手动拷进来的完整包）；`current` = 当前插件版本；`missing` = 缺的文件名。
   * `version !== current` = 升级插件后需重下。
   *
   * 2026-10-13（BUG-219）：资源包从 13 件变 12 件——三维库 globe3d.js 退役（three 随
   * main.js 发布），包里只剩两套 cube 贴图各六面。
   */
  globePackStatus?(): Promise<{ installed: boolean; version: string; current: string; missing: string[] }>
  /**
   * 下载星球资源包（v1.0.0）：两套 cube 贴图共 12 张。这是插件**唯一**的
   * 联网动作，用户显式点击才触发。逐件校验后写盘，全部成功才写记账文件；返回失败件名
   * 清单（空 = 成功）与失败**口径**（`missing` = 这一版还没发资源包 / `corrupt` = 字节
   * 被改写 / `network` = 其余）。`onProgress(done, total)` 供 UI 报进度。
   */
  downloadGlobePack?(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ ok: boolean; failed: string[]; reason: GlobePackFailure }>
  /**
   * 开源字体包（2026-10-13，按需下载复活的内置字体）的状态：每套装没装
   * （`<插件目录>/fonts/` 里文件齐不齐；没有记账版本——字体资产名与内容不随
   * 插件版本变）。设置页的字体格子据此分「已下载 / 未下载」两态。
   */
  fontPackStatus?(): Promise<{ packs: Record<FontPackId, boolean> }>
  /**
   * 下载一套字体包（2026-10-13）：用户显式点击才触发（与星球资源包同为白名单内
   * 的联网动作）。逐件校验后写盘，全部成功这套才算装上；返回失败件名清单与失败
   * 口径（`missing` = 这一版还没发字体资产 / `corrupt` = 字节被改写 / `network` =
   * 其余）。`onProgress(done, total)` 供 UI 报进度。
   */
  downloadFontPack?(
    id: FontPackId,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ ok: boolean; failed: string[]; reason: FontPackFailure }>
  /**
   * 读回一套字体包的全部字节（供 `fontStyle.registerFontFaces` 注册 FontFace）。
   * 缺件即 reject——调用方按「没装上」处理，字体栈自己回落。
   */
  fontPackFontFaces?(id: FontPackId): Promise<FontFaceSpec[]>
  savePrefs(prefs: PrefsPatch): Promise<void>
  listEntries(): Promise<MomoEntry[]>
  /** 回收站行（文件名 + 软删登记 + 完整索引投影，见 `TrashItem`） */
  listTrash(): Promise<TrashItem[]>
  // ---- premium caps（P2 锁点，docs/design/feature-registry-design.md §4）----
  // 可选成员（先例 listAttachmentFiles?）：免费构建 buildCaps **不组装**它们 =
  // 键不存在，UI 摸不到（编译期边界）。各成员的实现与 entitlement 组装在
  // P4–P6（备份 / 广场 / 洞察）落地；签名在那几期按真实形状修订。
  /** 云端备份（P4）：把全库单向备份到服务端 */
  cloudBackup?(): Promise<void>
  /** 分享到广场（P5）：把一条 Momo 以快照分享 */
  plazaShare?(path: string): Promise<void>
  /** 洞察（P6）：Agent 分析一条 / 一组笔记，返回文本结果 */
  agentInsight?(path: string): Promise<string>
}

export type MainMode = 'list' | 'review' | 'trash' | 'stats'

/**
 * 回顾筛选的档位（v0.9.37 起四档）。
 *
 * `reviewed` / `unreviewed` 是**有无**两档（回顾过一次 / 从没回顾过）；
 * `recent7` / `recent30` 是**时间窗**两档（近 7 天 / 近 30 天内回顾过），
 * 为「回顾」卡那两格加的——它们此前与「最久未回顾」一样没绑事件，点了没反应。
 *
 * 窗口起算与 `momo/stats/coverage.ts` 的 `last7Start` / `last30Start` 同源：
 * 含今天往前推 6 / 29 天。**两处必须同步**，否则格子上的数字与点下去看到的条数
 * 对不上（D-03：所见即所得）。`recent7` ⊂ `recent30`，但两档各自独立筛选、
 * 不做包含关系推理——用户点哪格就精确看哪档。
 */
export type ReviewedFilter = 'reviewed' | 'unreviewed' | 'recent7' | 'recent30'

/**
 * 「全部笔记」里的**地点视图**档位（2026-10-01：地点页面撤掉后，星球与地点分组流
 * 都成了全部笔记的一种看法，不再是独立模式）：
 * - `off` = 按密度看常规卡片流（默认）；
 * - `globe` = 球 + 下方常规列表（球是筛选输入面，点光点加/减一个地点筛选）；
 * - `group` = 按地点连成一条连续分组流（原地点模式的主体，组头不吸顶——跟着本组卡片滚走，与日期组头同形制）。
 *
 * 会话内 transient，不入 data.json：跨密度 / 跨模式保留（位姿与选中项同此）。
 */
export type LocViewMode = 'off' | 'globe' | 'group'

export interface UiState {
  caps: MomoCaps | null
  /**
   * premium 权益判定（P2 锁点）：所有付费入口经 `premiumActive(feature)` 过闸。
   * P3 接 `account` 段的 entitlement 缓存（含离线宽限期口径）后才有真值；
   * 在那之前恒 false = 一切付费门锁死（免费用户行为零变化）。
   * 它**不是 prefs**：由 account 段回灌，不走 caps.savePrefs。
   */
  premiumActive(feature: PremiumFeature): boolean
  /**
   * entitlement 缓存与它的验证新鲜度（R2a：`service.account` → store 的回灌目标）。
   * `premiumActive` 的判据 = 这两个值 + account/entitlement.ts 的离线宽限口径
   * （`entitlementActive`，缓存超 72h 未验证成功即回落锁死）。
   * **它们不是 prefs**：由 account 段回灌（views.tsx 构造处，模式同旁边 60 个
   * prefs 回灌），不走 caps.savePrefs；未登录 = 空权益 + null ⇒ 全部付费门锁死。
   */
  entitlements: Entitlements
  accountCachedAt: string | null
  entries: MomoEntry[]
  /**
   * 回收站行（v0.9.26 起带完整索引投影 `entry`）：回收站页按正常卡片渲染它们，
   * 筛选口径与列表一致（消费路径见 Trash.tsx 的 useMatchedInputs + matchEntries）。
   * 引用守卫在 store/refresh.ts（N02）。
   */
  trash: TrashItem[]
  loading: boolean
  /**
   * 最近一次**读盘**失败的用户可读文案；任何一轮读成功即清回 null。
   *
   * 会话态，不落 prefs。存在的理由：读失败时用户眼前是**上一次的旧数据**，
   * 界面与数据都自洽、没有任何破绽——只有控制台知道这一轮没读成（M3）。
   * 消费面是 `ui/shell/ReadErrorBanner`（自订阅，不占 App.tsx 的 15 个 selector）。
   */
  readError: string | null
  mode: MainMode
  density: Density
  /**
   * 顶栏「视图」分段的显隐与顺序（持久化偏好，v0.9.17）：数组顺序即顶栏按钮顺序，
   * `on` = 这一档显不显示，至少保留一项开着（收口见 momo/types 的 sanitizeDensityViews）。
   *
   * 与下面的 `density`（此刻在看哪一档）是两件事：这个管「顶栏摆哪几个、什么顺序」，
   * 那个管「现在看的是哪一档」。设置页关掉当前正在看的那一档时会顺带回退 `density`。
   */
  densityViews: DensityViewPref[]
  sidebar: boolean
  /** 列表排序（排序键 × 方向四值枚举，持久化到 data.json；默认 createdDesc = 新→旧） */
  sortMode: SortMode
  /**
   * 侧栏标签区排序键（v0.9.18，持久化偏好）：管「全部标签」列表里标签行的先后。
   * 默认 `count`（数量多→少）= v0.9.18 之前写死的那个顺序，老盘逐行不变。
   * 别与上面的 `sortMode` 混：那个管主区卡片流。
   */
  tagSort: TagSortKey
  /**
   * 多选标签时主区卡片的匹配口径（2026-10-12，**持久化偏好**，同 tagSort 的路子）：
   * `union` = 并集（含任一已选标签即显示，默认）、`intersection` = 交集（同时含全部才显示）。
   * 在侧栏「过滤标签」输入框右侧那枚按钮的浮层里切，动作是 `setTagMatchMode`。
   *
   * 与 `tagFilter`（会话内 transient）的分工：那个定「侧栏显示哪些标签行」，
   * 这个定「主区怎么组合用户点中的那些行」——一个是挑选候选，一个是读命中口径。
   */
  tagMatchMode: TagMatchMode
  /**
   * 侧栏标签区的两组筛选（v0.9.18，**会话内 transient，不入 data.json**）：
   * 时间 / 附件，组内单选互斥、跨组取交集（管道见 momo/tags/tagFilter.ts）。
   *
   * 与下面的 `filterTags` 是**两层不同的筛选**，别混：
   * - `tagFilter` 决定「侧栏显示哪些标签行」；
   * - `filterTags` 决定「主区显示哪些笔记」（点了标签行之后才生效）。
   * 两者唯一的关系是「左侧筛完，用户从可见的行里点一个」。
   *
   * 不落盘的理由同 v0.7.0 的下钻维度：它是「我现在想找点东西」的临时意图，
   * 重开面板还留着会让人莫名其妙少了半屏标签。
   */
  tagFilter: TagFilterState
  /** 筛选：搜索词 + 多日（来源为热力图点击，内部为并集）+ 标签，三类条件互相取交集 */
  search: string
  /** 热力图选中的日期集（并集：命中任一即显示）。空数组 = 不限日期，不清空搜索 */
  filterDates: string[]
  /** 标签筛选：存**身份键**（ADR-004），每个键命中整棵子树；多选为**并集**（任一命中即显示） */
  filterTags: string[]
  /**
   * 地点筛选（2026-10-01 起，多选为**并集**）：存**层级树节点键**——完整路径的
   * 前缀段（`亚洲\u0000中国`，见 momo/locations/locTree.ts），命中该节点覆盖的**任一路径**
   * 即算（`entryAtLocNode`）。与其他维度取**交集**；与标签筛选同一个位置、同一个
   * 味道——地点从「一个浏览模式」降级成「一个筛选维度」就是这个字段（v0.9.31 的
   * 单值 `locFilter` 是它的前身）。
   *
   * 规范化：集合里**永不出现祖先-后代关系**（加新节点时先剔掉它的祖先与后代，
   * 见 filters.ts 的 toggleLocation，与 ADR-004 的 toggleTag 同一条纪律）。
   * 会话内 transient，不入 data.json（地点是内容、在 frontmatter；这里只是
   * 「此刻筛哪几个地区」的 UI 状态）。
   */
  filterLocations: string[]
  /**
   * 只看无标签 Momo（统计页「无标签」下钻）：与搜索可叠加（交集），但与标签 / 日期筛选互斥——
   * 选了任何标签或日期即自动退出本模式（结果集必为空，没有并存的意义）。
   */
  untaggedOnly: boolean
  /**
   * v0.7.0 统计页下钻新增的四个维度。设计原则：**与既有条件全部取交集**（不互斥），
   * 各自在筛选条里是一枚可移除的胶囊——「深夜 + 本周」「301–800 字 + 2 个标签」
   * 这类组合正是下钻想看到的。会话内 transient，不入 data.json。
   */
  /** 按小时（0–23，本地小时；并集，命中任一即显示） */
  filterHours: number[]
  /** 按星期（0 = 周一 … 6 = 周日；并集） */
  filterWeekdays: number[]
  /** 按正文字符数（trim 后长度，闭区间）——与字数分布 / 长记录占比同口径 */
  filterLength: { min: number; max: number } | null
  /** 按标签个数（按身份键去重后，闭区间）——与标签数分布同口径 */
  filterTagCount: { min: number; max: number } | null
  /**
   * 按回顾记录（`reviewSeen` 口径）。
   *
   * v0.9.37 起从两档扩到四档：`recent7` / `recent30` 是**带时间窗**的两档，
   * 对应「回顾」卡的「近 7 天回顾 / 近 30 天回顾」两格下钻（此前这两格与
   * 「最久未回顾」一样没绑事件，点了没反应）。窗口口径与
   * `momo/stats/coverage.ts` 的 `last7Start` / `last30Start` 同源——
   * 两处必须一致，否则点下去看到的条数与格子上的数字对不上（D-03）。
   */
  filterReviewed: ReviewedFilter | null
  /**
   * 下钻会话的「今天及以前」闸（BUG-181a）：统计侧每个计数都把未来（预写）条目排除在外
   * （`isFuture` / `allDayCounts` / `lifeCounts` 同一把尺，BUG-96 裁定），下钻列表必须
   * 同集合——否则「柱上写 5、点过去 6 张」。由统计页下钻动作置位；用户任何手动筛选动作
   * （toggleTag / toggleLocation / 清筛选 / 切模式）即撤掉本闸——之后的列表不再承诺
   * 与某个格子的数字相等，预写条目照常显示（带 scheduled 徽标）。
   */
  drillPastOnly: boolean
  /** 置顶标签（身份键列表，ADR-004）：侧栏导航入口，顺序即展示顺序 */
  pinned: string[]
  /**
   * 置顶笔记（Momo 路径列表，v0.8.3）：列表密度顶部那个「置顶」组，
   * 顺序即组内展示顺序（先置顶的在前）。
   *
   * 与上面的 `pinned`（置顶**标签**，侧栏那套）是两件不相干的事，字段也不共用——
   * 这个管 Momo 怎么排，那个管标签怎么排。同属视图偏好（ADR-003）：只决定排列，
   * 不写进 Momo 文件。
   */
  pinnedNotes: string[]
  /** 回顾模式（随机 / 一周未看 / 一月未看 / 很久没看 / 往年今日）。2026-10-24 起
   *  持久化偏好（此前是会话态，重载插件后静默掉回「随机」）。 */
  reviewMode: ReviewMode
  /** 回顾展示记录（路径 → 上次展示时间 ISO）：被「很久没看」用来排序、「一周 / 一月未看」用来过滤 */
  reviewSeen: Record<string, string>
  /** 内部侧栏宽度（px，持久化偏好）：拖拽手柄 / 双击重置 / 左右方向键调整 */
  sidebarWidth: number
  /** 内部侧栏停靠侧（面板内）：'left' 默认 | 'right'（持久化偏好） */
  sidebarSide: 'left' | 'right'
  /** 侧栏功能显隐（持久化偏好）：统计+洞察绑定、置顶+标签树绑定，「全部笔记」常驻 */
  sections: SidebarSections
  /** 统计页区块显隐（v0.5.3） */
  statsSections: StatsSections
  /** 随机回顾每批条数（持久化偏好，1–50） */
  reviewCount: number
  /** 活跃度热力图滚动窗口月数（持久化偏好，1–12） */
  heatmapMonths: number
  /** 统计页时间范围（持久化偏好）：页面顶部切换，关面板后保持 */
  statsRange: StatsRange
  /** 自定义范围起点（YYYY-MM-DD，v0.5.4）；statsRange==='custom' 时生效 */
  statsCustomFrom: string | null
  /** 自定义范围止点（YYYY-MM-DD，双闭）；statsRange==='custom' 时生效 */
  statsCustomTo: string | null
  /** 自定义日期编辑条是否展开（会话内 transient，不入 data.json）：顶栏「自定义」按钮翻开，
   *  应用 / 切到其它范围时收起。statsRange==='custom' 时编辑条常驻。 */
  statsRangeEditing: boolean
  /**
   * 多选模式（会话内 transient，**不入 data.json**）：顶栏「多选」进入，整张卡片
   * 都是勾选热区，底部浮起批量条。默认 false。
   *
   * 卡片按**布尔量**选（`useUi((s) => s.selected.has(entry.path))`），所以进 / 出
   * 多选只带重渲「进多选前渲染操作行、进之后渲染勾选圈」的那些卡——同值选择器
   * zustand 直接 bail out。这里曾经是 App 的 useState + 卡片作用域 Context
   * （CardScope），Context 的 value 每次勾选都换新引用，几百张卡全重跑 render，
   * v0.9.10 迁进 store 修掉（见 store/selection.ts）。
   */
  selectMode: boolean
  /**
   * 选中路径集合（会话内 transient，**不入 data.json**）：存 vault 路径，
   * 与 entries 的对账（剔死路径）由 App 负责。
   */
  selected: ReadonlySet<string>
  /**
   * 批量标签弹层（卡片操作行与底部批量条共用一份）：null = 关闭；否则 = 作用在
   * 这批路径上、用哪种模式（add / remove）。会话内 transient，不入 data.json。
   *
   * `at`（2026-10-14 起）= 唤起它的那颗卡片操作按钮相对 `.momo-app` 的落点，
   * **只有单卡那一路给**：弹层据此改走 free 变体、portal 到 `.momo-app` 根，
   * 开在卡片自己的按钮旁边（与单卡地点弹层同一路数）。不给（批量条那一路）=
   * 旧的 below 锚点变体，挂在 `.momo-batchtag-wrap` 下方。
   * 为什么单卡必须带落点：below 锚点在**顶栏**，而按钮在卡片上——两者隔着半屏，
   * 点下面的卡、弹层却开在面板顶端（窄面板更像一张贴底整宽面板）；用户报
   * 「dialog 出现的位置，偶尔距离卡片很远」。
   */
  tagPicker: { paths: string[]; mode: TagPickerMode; at?: { x: number; y: number } } | null
  /**
   * 侧栏「全部地点」树的**层级过滤档位集合**（2026-10-01 单选，2026-10-10 起
   * **多选**；会话内 transient，不入 data.json）：`['all']`（缺省）= 完整三级树；
   * 其余 = **只显示勾中的那几级**，树形照旧（没勾的级收走、子孙顶上父级位，
   * 见纯函数 `filterLocTreeByLevels`，momo/locations/locTree.ts；档位表
   * `LOC_TREE_LEVELS`，集合口径 `normalizeLocTreeLevels`）。
   *
   * 与上面的 `filterLocations` 是**两件事**，别混：
   * - `filterLocations` = 「主区筛哪几个地区」——改的是卡片流显示哪些条目；
   * - 本字段 = 「侧栏这棵树显示哪几级」——改的只是侧栏显示哪些行，
   *   **不动主区**（分级并组是落盘 pref `locLevel` 的口径，同样正交）。
   * 勾选的级看不到某个已选节点时（筛着「中国」却只看大洲）也不清筛选。
   * 不落盘的理由同 tagFilter：「我现在想怎么翻这棵树」是临时意图，重开面板
   * 回到完整树。
   */
  locTreeLevels: LocTreeLevels
  /**
   * 过滤序号：每次 `toggleLocation` 都 +1（即使集合内容与结果相同）。地点分组流
   * 的「滚过去」effect 认它不认集合值——同值重点也要从当前位置再滚一次，
   * 只靠数组相等判断会漏掉第二次（`filterLocations` 每次都是新数组，但 effect
   * 的依赖比对仍以序号为唯一信号，读的是同一个道理：意图，不是值）。
   */
  locJumpSeq: number
  /**
   * 这次选中要星球**转到哪一点**（v0.9.32 修「粗档点球转错城市」）：
   * 由星球那侧（点球上光点）在 `toggleLocation` 时一并递进来，
   * 别的入口（侧栏树 / pill）不传 = null。
   *
   * 为什么需要它：粗档（大洲 / 国家）下筛选集合存的是**组键**，一组含多枚
   * 锚点——光凭组键只能在组里挑第一枚（条数最多的那枚），用户点上海的点却转去北京。
   * 与筛选同一次选中、同一个记忆位：不是 `null` 节点时才有值。
   * 会话内 transient，不入 data.json。
   */
  locGlobeFocus: { lat: number; lon: number } | null
  /**
   * 单卡地点编辑弹层（F3）：null = 关闭；否则 = 在改哪一篇 + 弹层落点
   * （x / y 已由调用方换算成「相对 .momo-app」的偏移）。会话内 transient。
   */
  locEditor: { path: string; x: number; y: number } | null
  /**
   * 批量「设地点」弹层（F4，与 tagPicker 平行）：null = 关闭；否则 = 作用在这批
   * 路径上、加还是摘。会话内 transient，不入 data.json。
   */
  locPicker: { paths: string[]; mode: LocPickerMode } | null
  /**
   * 地点视图档位（2026-10-01，会话内 transient，**不入 data.json**）：
   * `off`（默认）= 按密度看常规卡片流，`globe` = 星球视图，`group` = 地点分组流。
   *
   * 与 `filterLocations` 同一个记忆位：**切模式 / 切密度都不清空**——进回顾再回
   * 全部笔记，还停在星球上（位姿同样保留，见下面两个字段）。地点视图是「全部笔记」
   * 的一种看法，不是新的 MainMode（v0.9.25 的 `locGlobe: boolean` 是它的前身：
   * 那时地点分组流是默认、星球是唯一的额外档，「关掉星球回分组流」的 toggle 语义
   * 现在由三值档位显式表达）。
   */
  locView: LocViewMode
  /**
   * 星球位姿（F7，与会话态 locGlobe 同在）：rotLat = 观测倾角（度，北正），
   * rotLng = 绕竖轴转角（度，东正）。拖拽 / 回正 tween / 选中转向都改这两个数，
   * 投影纯函数在 ui/globe/globeMath.ts。默认 28 / −8 = 设计稿 F7a 的初始角
   * （北京 / 纽约 / 上海 三锚点可见）。
   */
  locGlobeLat: number
  locGlobeLng: number
  /** 配色方案（持久化偏好）：内置方案的 id；默认 mist-blue（雾蓝，2026-10-11 起，排第一即是默认） */
  colorScheme: ColorScheme
  /** 自定义 CSS 片段（持久化偏好）：设置页不再提供编辑，盘上残留仍注入；空串 = 不用 */
  customCss: string
  /** 面板字体（持久化偏好，v0.9.16）：'' = 默认 | 'bundled:<id>' | 系统字体名 */
  uiFont: string
  /** 卡片字体（持久化偏好，v0.9.16）：'' = 跟随面板字体；取值空间同 uiFont */
  cardFont: string
  /** 短首行是否升为标题（持久化偏好）：卡片与回顾页一起生效 */
  titleFromFirstLine: boolean
  /** 「短首行作为标题」的字数上限（持久化偏好，v0.9.12 起可配）：首行超过它就不升标题 */
  titleMaxChars: number
  /** 只读浏览（持久化偏好）：卡片无 hover、点击正文不打开 Obsidian，操作里提供「在 Obsidian 中打开」 */
  readOnly: boolean
  /** 左上角品牌图标（持久化偏好）：icons.tsx 白名单，默认 leaf */
  brandIcon: BrandIcon
  /** 左上角品牌名称（持久化偏好）：默认「Momo」 */
  brandName: string
  /** 全部笔记卡片标签位置（持久化偏好）：'meta' = 元信息行右侧（默认）| 'bottom' = 卡片底部 */
  tagPosition: TagPosition
  /** 全部笔记卡片**地点标签**位置（持久化偏好，2026-10-01 从 tagPosition 拆出）：
   *  'meta' = 元信息行右侧（默认）| 'bottom' = 卡片底部；只作用于 locations pill，
   *  与正常 #标签（tagPosition）互不影响 */
  locPosition: LocationPosition
  /** 正文字号（px，持久化偏好，v0.9.12 起滑杆）：App.tsx 挂 --momo-ui-fs-body 内联 var */
  cardFontSize: number
  /** 「短首行作为标题」的标题字号（px，持久化偏好，v0.9.12 新增）：挂 --momo-ui-fs-title 内联 var */
  cardTitleSize: number
  /** 卡片圆角（px，持久化偏好，v0.9.12 起滑杆）：App.tsx 挂 --momo-ui-r-card 内联 var */
  cardRadius: number
  /** 卡片间距档位（持久化偏好，v0.9.1）：sm / md / lg，仍是三档（根节点挂 momo-ui-gap-* class） */
  cardGap: UiScale
  /** 卡片元信息行日期粒度（持久化偏好，v0.9.1）：auto = 默认行为 | day | full */
  cardStamp: CardStamp
  /** 卡片元信息行是否显示字数（持久化偏好，v0.9.1，默认 true） */
  showCharCount: boolean
  /**
   * 卡片元信息行右上角那排操作按钮的显隐（持久化偏好，v0.9.22，默认 true = 升级前
   * 写死的行为）。只决定按钮出不出现：加标签 / 删除在多选批量条里仍有入口，复制
   * 没有第二个入口；只读态的「在 Obsidian 中打开」不受这里管（见 entry.ts 同段）。
   */
  showCardCopy: boolean
  showCardTag: boolean
  showCardDelete: boolean
  /** 切密度意图期的正文预热比例（持久化偏好，v0.9.14 起可配，默认 'half'） */
  warmRatio: WarmRatio
  /** 界面语言（持久化偏好）：App 根节点以它为 key，语言切换即整树重挂、copy 全部重读 */
  lang: LangPref
  /**
   * 左上角自定义图标（持久化偏好）：上传图片的 vault 相对路径；空串 = 用 brandIcon
   * 那枚预设形状。非空时它盖过预设（侧栏品牌标显示这张图）。
   */
  brandIconImage: string
  /**
   * 上传的左上角图标清单（持久化偏好，v0.9.12 多图，上限 BRAND_ICONS_MAX）：
   * 顺序即上传顺序；brandIconImage 指向清单里当前生效那一张。点预设形状只把
   * 生效位切回形状，**不清清单**——想换回哪张点哪张格子。
   */
  brandIconImages: string[]
  /**
   * 用户手填的地点坐标（F7 星球视图，v0.9.25，持久化）：地点名 → [纬度, 经度]。
   * 星球渲染与设置页「地点」卡共用这一个入口（coordOfLocation 里用户值压过
   * 内置字典 BUILTIN_LOC_COORDS）。属于用户数据而非视图偏好——恢复默认
   * 不动它（PREFS_DEFAULTS 里没有这一项），要清在设置页逐项删。
   */
  locCoords: Record<string, LatLon>
  /**
   * 用户手填的地点大洲 / 国家（v0.9.30，持久化）：地点名 → [大洲, 国家]。
   * 压过内置字典 BUILTIN_LOC_REGIONS（regionOfLocation 的用户值优先分支）。
   * 分组流 / 跳转 / pill / 地点弹层 / 星球 / 设置页共用这一个入口。
   * 属于用户数据而非视图偏好——恢复默认不动它（同 locCoords）。
   */
  locRegions: Record<string, LocRegion>
  /**
   * 地点分组流显示 / 分组到哪一级（v0.9.30，持久化，默认 'name'）：
   * 组头写什么、分组按什么并，一个旋钮（LocLevel 三档见 momo/types/prefs.ts）。
   */
  locLevel: LocLevel
  /**
   * 侧栏「全部地点」树的展开方式（2026-10-01，持久化，默认 'all'）：
   * `all` = 三级全展开、不画 twisty；`fold` = 行首带 twisty、可收可放。
   * 只决定「能不能收」，不决定任何一级的可见性（那是 locLevel /
   * 标题行漏斗 LocTreeLevel 的事）。
   */
  locTreeExpand: LocTreeExpand
  /**
   * 星球外观（2026-10-05，持久化，默认 'night'）：夜地球 / 日地球。
   * 两档共用同一套渲染器（几何 / 采样 / 位姿全共用），差别只有贴图与光照配方——
   * 夜档只补球面暗示（只有临边衰减），日档走 globe.html 的
   * ambient + key + 背面边缘光。取舍见 momo/types/prefs.ts 的 GlobeEarth。
   */
  globeEarth: GlobeEarth
  /**
   * 语义图标覆写表（v0.9.36，持久化）：语义名 → Lucide 库 id，**稀疏**——
   * 表里没有的键 = 用 Momo 原形（PATHS）。Icon 组件按它取形
   * （momo/icons/icons.ts 的 iconPaths：脏值兜底回落原形），设置页「图标」卡改它
   * （P3）。属于视图偏好（ADR-003）：只改形状，不写进任何 Momo 文件。
   */
  icons: IconOverrides
  /** 随机回顾批次（抽批快照；「刷新」重抽） */
  reviewBatch: MomoEntry[]
  /**
   * 回顾游标（v0.5 起回顾页改成**单张聚焦**）：指向 reviewBatch 里的当前一张。
   * 等于 reviewBatch.length 即「本轮已看完」，页面切到收尾态。
   * 不入 data.json —— 它是一轮会话内的位置，重开面板从第一张开始更合理。
   */
  reviewIndex: number
  /**
   * 当前批次的盖章时间戳（抽批那一刻的 ISO，整批共用）。翻页盖章写的就是它：
   * 同一张来回翻只会落一次盘（幂等），整批的 reviewSeen 也因此共享同一时刻——
   * 与窗口 / 排序的日粒度口径一致。'' = 当前没有批次（空批 / 未抽过）。
   * 会话态，不入 data.json。
   */
  reviewEpoch: string
  /** 附件统计（全库口径） */
  attachmentStats: { total: number; totalBytes: number; entriesWithImages: number; monthlyTrend: { month: string; count: number; bytes: number }[] }

  init(this: void, caps: MomoCaps): void
  refresh(this: void): Promise<void>
  setPrefs(this: void, prefs: PrefsPatch): void
  /** 设置排序模式（顶栏「排序依据」分段与方向按钮共用；写偏好，关面板后不丢） */
  setSortMode(this: void, mode: SortMode): void
  /** 设置侧栏标签区排序键（排序浮层用；写偏好，关面板后不丢） */
  setTagSort(this: void, key: TagSortKey): void
  /**
   * 设置多选标签的组合方式（过滤框右侧浮层用；写偏好，关面板后不丢）。
   * `union` = 并集（任一已选标签命中即显示）、`intersection` = 交集（全部命中才显示）。
   */
  setTagMatchMode(this: void, mode: TagMatchMode): void
  /** 改一组 / 几组标签区筛选（筛选浮层的 chip 用；会话内，不落盘） */
  setTagFilter(this: void, patch: Partial<TagFilterState>): void
  /** 清空两组标签区筛选（筛选浮层「清除全部」与空态按钮用；一次 set 改完） */
  clearTagFilter(this: void): void
  /** 切换视图模式并刷新派生（回顾模式顺带重抽一批） */
  setMode(this: void, mode: MainMode): void
  /** 进 / 出多选（进出都清空选中集，见 store/selection.ts） */
  setSelectMode(this: void, on: boolean): void
  /** 勾选 / 取消勾选某一条 */
  toggleSelected(this: void, path: string): void
  /** 整组替换选中集（「与 entries 对账、剔死路径」用） */
  setSelected(this: void, paths: readonly string[]): void
  /** 清空选中集 */
  clearSelected(this: void): void
  /** 全选：入参 = 当前可见列表的路径（列表 = 筛选结果，回顾 = 当前批次） */
  selectAll(this: void, paths: readonly string[]): void
  /**
   * 卡片操作行「加标签」（单条）：打开批量标签弹层。
   * `at` = 那颗按钮相对 `.momo-app` 的落点（调用方在按钮的 click 里量好）——
   * 给了弹层就开在按钮旁边（free 变体），不给就是 below 锚点（批量条那一路）。
   */
  openTagPicker(this: void, paths: string[], mode: TagPickerMode, at?: { x: number; y: number }): void
  /** 批量条「加标签 / 去标签」：同模式再点一次 = 收起，换模式按当前选中集重绑 */
  toggleTagPicker(this: void, mode: TagPickerMode): void
  /** 关闭批量标签弹层 */
  closeTagPicker(this: void): void
  /**
   * 切换一个地点筛选节点（侧栏「全部地点」树 / 交叉引用 pill / 星球光点共用）：
   * 已在集合里 = 移除，否则 = 加入（加入时先剔掉它的祖先与后代，与 `toggleTag`
   * 同一条 ADR-004 纪律：集合里永不出现祖先-后代关系）。地点筛选是**多选并集**，
   * 与标签 / 日期 / 时段的筛选取交集。
   *
   * `focus`（可选）= 这次要星球转到的那一点：只有星球自己的入口知道用户点的是
   * 哪一枚锚点（粗档下同一组有多枚），其余入口不传 = null → 星球自己挑。
   */
  toggleLocation(this: void, key: string, focus?: { lat: number; lon: number } | null): void
  /**
   * 侧栏「全部地点」树的层级过滤（标题行那颗漏斗的浮层直调，2026-10-10 起多选）：
   * `'all'` = 回完整三级树；其余档 = 在集合里加上 / 去掉那一级（去掉后一级不剩
   * = 回 `['all']`，同筛选 chip 的常例）。只改侧栏这棵树显示哪几级，
   * **不动 filterLocations**、不碰主区筛选（见 locTreeLevels 注释）。
   */
  toggleLocTreeLevel(this: void, level: LocTreeLevel): void
  /**
   * 打开单卡地点编辑弹层（F3）：x / y 由调用方按 mappin 按钮相对 .momo-app 的位置
   * 换算好再传进来——弹层自己再也不去摸真实 DOM。
   */
  openLocEditor(this: void, path: string, x: number, y: number): void
  /** 关闭单卡地点编辑弹层（「完成」/ Esc / 点到别处） */
  closeLocEditor(this: void): void
  /**
   * 批量条「设地点 / 去地点」（F4，与 toggleTagPicker 同构）：同模式再点一次
   * = 收起，换模式按当前选中集重绑。mode = 'add' 加地点 / 'remove' 摘地点。
   * （单卡编辑走 openLocEditor——它要带按钮落点，弹层形状也不一样。）
   */
  toggleLocPicker(this: void, mode: LocPickerMode): void
  /** 关闭批量地点弹层（Esc / 写完 / 选中集归零由调用方决定是否调） */
  closeLocPicker(this: void): void
  /**
   * 切地点视图档位（2026-10-01，全部笔记视图分段里的星球 / 地点分组两颗图标）：
   * `off` = 回常规卡片流，`globe` = 星球，`group` = 地点分组流。位姿不动——关掉
   * 再开回到离开时的角度。地点视图是「全部笔记」的一种看法，不是新的 MainMode。
   */
  setLocView(this: void, view: LocViewMode): void
  /** 星球位姿（拖拽 / 回正 tween / 选中转向）：倾角与绕竖轴转角，单位度 */
  setGlobePose(this: void, lat: number, lng: number): void
  setSearch(this: void, search: string): void
  /** 热力图选日（多选，并集）：点一下加入筛选集，再点一下移除；加入时退出「无标签」 */
  toggleFilterDate(this: void, day: string): void
  /** 清空日期筛选（筛选条「清除」/ 空态按钮用） */
  clearFilterDates(this: void): void
  /** N06：一次清掉全部筛选（搜索 + 日期 + 无标签 + 标签 + 地点 + v0.7.0 五个下钻维度） */
  clearFilters(this: void): void
  /** 统计页下钻：单标签筛选（含子树）并跳回列表，清掉日期与搜索 */
  filterByTag(this: void, key: string): void
  /**
   * 统计页下钻（v0.9.33 地点维度；2026-10-01 改落回全部笔记）：把该地点设为
   * **唯一的**地点筛选并跳回列表。与上面那些下钻同一条 D-03 纪律——这一次点击
   * 是全新起点，其余维度（含搜索与其它地点）一并清掉，不把上一轮的筛选带进来。
   *
   * `loc` = 地名（或洲名：洲名本身就是顶级节点）；节点键按 `locFullKey` 折算
   * （用户手填的 prefs.locRegions 压过内置字典，与侧栏树同一把尺子）。
   */
  filterByLocation(this: void, loc: string): void
  /** 统计页下钻：只看无标签 Momo 并跳回列表，清掉标签 / 日期 / 搜索 */
  filterUntagged(this: void): void
  /**
   * v0.7.0 统计页下钻：一次打上一组日期（本周 / 本月 / 最近 30 天 / 最高产的一天）
   * 并跳回列表。与 `toggleFilterDate` 的区别：这里是**整组替换**（点一个统计数字
   * 就该看到那一组），不是逐日加减。
   */
  filterByDates(this: void, days: string[]): void
  /** 下钻：按小时（并集）跳回列表 */
  filterByHours(this: void, hours: number[]): void
  /** 下钻：按星期（0=周一…6=周日，并集）跳回列表 */
  filterByWeekdays(this: void, days: number[]): void
  /** 下钻：按正文字符数闭区间跳回列表 */
  filterByLength(this: void, min: number, max: number): void
  /** 下钻：按标签个数闭区间跳回列表 */
  filterByTagCount(this: void, min: number, max: number): void
  /**
   * 下钻：按回顾记录跳回列表。v0.9.37 起收四档（`ReviewedFilter`）：
   * 「已回顾 / 未回顾」两格走有无两档，「近 7 天 / 近 30 天回顾」两格走时间窗两档。
   */
  filterByReviewed(this: void, which: ReviewedFilter): void
  /** 清掉某一维下钻筛选（筛选条胶囊的 ✕ 用）：不跳模式、不动其它维度 */
  clearDrill(this: void, dim: 'hours' | 'weekdays' | 'length' | 'tagCount' | 'reviewed'): void
  /** 退出 / 进入「无标签」模式（顶栏 chip 的 ✕ 用 false） */
  setUntaggedOnly(this: void, value: boolean): void
  /** 统计页时间范围（写偏好，关面板后不丢） */
  setStatsRange(this: void, range: StatsRange): void
  /** 自定义范围（v0.5.4）：写两端 + 切到 custom + 收起编辑条，一次落盘 */
  setStatsCustom(this: void, from: string, to: string): void
  /** 展开 / 收起自定义日期编辑条（transient） */
  setStatsRangeEditing(this: void, editing: boolean): void
  toggleTag(this: void, key: string): void
  /** 切换回顾模式并立即重抽一批 */
  setReviewMode(this: void, mode: ReviewMode): void
  /** 置顶**标签**到末尾（标签右键菜单「置顶」）；index 省略即追加 */
  pin(this: void, key: string, index?: number): void
  /** 取消置顶**标签**（标签右键菜单「取消置顶」） */
  unpin(this: void, key: string): void
  /**
   * 置顶 / 取消置顶一条**Momo**（v0.8.3，卡片上的图钉按钮）：已置顶则取消，
   * 否则追加到「置顶」组末尾。与标签那套 `pin` / `unpin` 是两件事，字段也不共用。
   */
  toggleNotePin(this: void, path: string): void
  newReviewBatch(this: void): void
  /** 回顾 · 下一个（看完并前进；已展示时间在抽批时登记） */
  reviewNext(this: void): void
  /** 回顾 · 上一个 */
  reviewPrev(this: void): void
  /** 组合筛选（标签之间为并集，与搜索/日期取交集）后的全部匹配 */
  matched(this: void): MomoEntry[]
  // matchedTrash 已随 Q13 摘除（生产侧零调用）：回收站的真实消费路径是
  // Trash.tsx 自订的 matchEntries(pickMatchedInputs(s), trash.map(t => t.entry))。
}
