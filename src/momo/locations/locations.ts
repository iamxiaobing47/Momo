import { copy } from '../i18n'
import { charLength } from '../core'
import { displayLocName } from './locDisplay'
import { canonicalLocName, isContinentName, regionOfLocation, type LocRegion } from './locRegions'
import type { LocLevel } from '../types/prefs'
import type { MomoEntry } from '../types'

// 地点（location）：与 tags 同级的**内容**概念（F1 一期，视觉稿 docs/design/mockups/location-view/）。
//
// 存储口径（ADR-003：文件是内容唯一事实源）：
// - 落在笔记 frontmatter 的 YAML 数组里，与 tags 同级（正文之外零存储，data.json 零改动）：
//     locations:
//       - 纽约
//       - 北京
// - **没有行内形态**（不像 #标签 能写在正文里）——地点是结构化元数据，只在 frontmatter。
//   所以读侧只看 frontmatter、写侧只动 frontmatter，不存在 tags 那套「行内 ∪ frontmatter」并集。
//
// 净化口径（normalizeLocations，读写同一函数，流氓数据不炸面板）：
// - 逐条 trim、去空串；
// - 全量去重（**精确匹配**，不折叠写法——「北京」与「beijing」是两个存储串）；
// - 每条 ≤ 20 字（LOCATION_MAX_CHARS），超长的整条丢弃（与 normalizeTags 丢非法标签同构：
//   截断会创造用户没写过的地名，丢弃可预期）；
// - 每篇 ≤ 8 个（LOCATIONS_MAX），超出按当前顺序保留前 8 个；
// - **大洲名整条丢弃**（v0.9.32「识别层级最低是国家」）：写「南美洲」不是写一处
//   地方，是把分组的第一级当地点——收下它会造出 `南美洲 · 南美洲` 的组头。
//   滤在读侧，盘上那一行**不删**（ADR-003：文件是唯一事实源，见下面 locListOf）；
// - 读：缺省 / 空数组 / 非数组 / 单串都按 normalizeLocations 归一（单串 = 一个地点）。
//
// **两种「去重」是两件东西**（BUG-110a，2026-10-07 用户裁定「纽约 / New York 两种
// 写法算同一地点身份」）：
// - `normalizeLocations` 是**存储口径**：按精确串去重、保留写法，写侧据此数可见
//   条数、判「加不进去」；
// - `locationsOf` 是**读侧身份**：在归一之上再过 `canonicalLocName`（纽约 / New
//   York / NewYork 合并成「纽约」），树 / 分组 / pill / 星球 / 弹层全按身份走。
//   盘上的字符串一个字节都不动（ADR-003）——身份是「怎么看」，不是「怎么写」。
//
// 这些是纯函数：只做字符串与分组，不碰文件、不 import obsidian（momo/ 层红线）。

/** 单个地名的字数上限（F6 规格 §frontmatter 与 sanitize） */
export const LOCATION_MAX_CHARS = 20

/** 每篇笔记的地点个数上限（F6 规格：超出按顺序保留前 8 个） */
export const LOCATIONS_MAX = 8

/**
 * 地点归一：所有入口共用（读侧 locationsOf、写侧 add/removeLocations 的前后态都过它）。
 * 入参容忍 frontmatter 的各种脏形态（数组 / 单串 / 缺省 / 非字符串项），
 * 输出永远是小写不折叠、保序、去重、限额内的字符串数组。
 *
 * 「洗掉洲名」这一条**只管看不见**（卡片、pill、分组、层级树、星球都不显示它），
 * 不是删盘上那一行的授权——写侧的纪律见 locListOf。
 */
export function normalizeLocations(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string'
      ? [raw]
      : []
  const out: string[] = []
  const seen = new Set<string>()
  // 限额数的是**身份**（BUG-118b）：旧实现按原始条数截 8，而写侧（addLocationsTo /
  // service.addLocations）按身份数判余量——盘上「纽约, New York, …」共 8 行、7 个身份时
  // 写侧判「还能加」、写盘成功报「已改 1 条」，读侧却截回 7 个身份，新加的那个永远看不见。
  // 现在读写同一把尺：满 8 个身份后不再收**新身份**，已收身份的别名写法照常收（读侧会合并）。
  const ids = new Set<string>()
  for (const item of items) {
    const s = item.trim()
    // 长度按**字符（码点）**数（charLength，BUG-112b）：旧实现用 s.length 数码元，
    // emoji / CJK 扩展区一个字符占两个码元，10 个 emoji 就压线、11 个判超长、
    // 12 个整条静默丢弃——而文案承诺的是「20 字」。
    if (s === '' || charLength(s) > LOCATION_MAX_CHARS) continue
    if (isContinentName(s)) continue
    if (seen.has(s)) continue
    const id = canonicalLocName(s)
    if (!ids.has(id)) {
      if (ids.size === LOCATIONS_MAX) continue
      ids.add(id)
    }
    seen.add(s)
    out.push(s)
  }
  return out
}

/** frontmatter 的 `locations` → 归一（+ 身份）后的地点数组（缺省 / 空 / 非数组 → 空数组）。
 *  在归一之上再过**身份**（canonicalLocName）：纽约 / New York / NewYork 是同一处，
 *  合并成「纽约」，序按首次出现；盘上的字符串不动（读侧口径，ADR-003）。 */
export function locationsOf(frontmatter: Record<string, unknown>): string[] {
  return canonicalizeLocations(normalizeLocations(frontmatter.locations))
}

/** 身份归一（BUG-110a 的读侧口径）：逐条过 canonicalLocName、按身份去重、保序。
 *  与 normalizeLocations 一样是纯读侧——不碰盘、也不用于写回（写侧见下面两个 To 函数）。 */
function canonicalizeLocations(list: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const id = canonicalLocName(raw)
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 输入侧拒绝原因（UI 出红字用）；null = 可接受。见 locationInputIssue。 */
export type LocationInputIssue = 'tooLong' | 'continent' | 'limit'

/**
 * 地点输入校验（两个弹层共用同一道闸门）。
 *
 * 与写侧 `normalizeLocations` 同真源：超 20 字、大洲名、超 LOCATIONS_MAX 三条
 * 都是写侧会**静默丢掉**的情形（README BUG-52）。UI 若各写一份判断，就会
 * 「预告改 N 条、实际改 0 条且零反馈」。`currentVisibleCount` = 加上这一条之前
 * 该篇 / 该队列的可见地点数（超限时不接受新增，摘除不受影响）。
 */
export function locationInputIssue(raw: string, currentVisibleCount: number): LocationInputIssue | null {
  const s = raw.trim()
  if (s === '') return null
  if (charLength(s) > LOCATION_MAX_CHARS) return 'tooLong'
  if (isContinentName(s)) return 'continent'
  if (currentVisibleCount >= LOCATIONS_MAX) return 'limit'
  return null
}

/**
 * frontmatter 原值 → 可写回的数组（**只做形状归一**：单串当一项、非数组当空）。
 *
 * 与 `normalizeLocations` 的分工是写侧唯一要紧的一条纪律：**那个是读侧口径**
 * （净化 + 三条限额，用来「看」与「比」），不是写侧的删除授权。用户手写在盘上的
 * 第 9 个地点、超 20 字的怪地名、被 YAML 解析成数字的项，读侧不显示是一回事，
 * 借一次「加/摘地点」把它们从文件里抹掉是另一回事（ADR-003：文件是唯一事实源）。
 */
export function locListOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return [...raw]
  if (typeof raw === 'string') return [raw]
  return []
}

/**
 * 写侧「追加」：已有项**原样保留**，只往后追 `add`（去重按**身份**：canonicalLocName
 * 相同 = 同一处地点，盘上是「纽约」时「New York」不再追一行），并且**只在身份数
 * 还有余量时**追加（`LOCATIONS_MAX`）——满了就不写、不删，调用方据此计 skipped。
 *
 * 返回数组与入参原数组「逐项相同」= 无事可做（调用方可以据此跳过写盘）。
 */
export function addLocationsTo(raw: unknown, add: readonly string[]): unknown[] {
  const cur = locListOf(raw)
  const out = [...cur]
  const seen = new Set(
    cur
      .filter((x): x is string => typeof x === 'string')
      .map((s) => canonicalLocName(s.trim()))
      .filter((id) => id !== ''),
  )
  let visible = canonicalizeLocations(normalizeLocations(cur)).length
  for (const loc of add) {
    if (visible >= LOCATIONS_MAX) break
    const id = canonicalLocName(loc)
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    out.push(loc)
    visible += 1
  }
  return out
}

/**
 * 写侧「移除」：只摘掉点名的那几个（**按身份**：canonicalLocName 相同 = 同一处，
 * 点名「纽约」时盘上的「New York」同去——不许留下幽灵 pill），**其余项原样留下**
 * （含超长 / 非字符串项——理由同 addLocationsTo）。
 */
export function removeLocationsFrom(raw: unknown, kill: readonly string[]): unknown[] {
  const killSet = new Set(
    kill.map((k) => canonicalLocName(k.trim())).filter((id) => id !== ''),
  )
  return locListOf(raw).filter((x) => !(typeof x === 'string' && killSet.has(canonicalLocName(x.trim()))))
}

/** 地点分组档里的一条分组（连续分组流的一截，见 ui/ 的 LocationFlow） */
export interface LocationGroup {
  /**
   * 组键：路径以 `\u0000` 连接（组头点亮态、跳转锚点 locAnchor、DOM 的 data-loc、
   * React key 都用它）。**不是给人看的**——见下面 KEY_SEP 旁的说明。
   */
  key: string
  /**
   * 组头显示名：路径按当前语言的连接符拼（`亚洲 · 中国 · 北京`）。组排序、
   * 读屏名都用它。
   */
  label: string
  /**
   * 组由哪些**地点**组成（按组内条数降序、同数按地名排）。`name` 档恒为 1 个；
   * 粗档（大洲 / 国家）下一组会收进多个地点——星球视图的锚点是地点级的
   * （球上画的是城市，不是行政区），靠这一份把组拆回地点。
   */
  locations: readonly LocCount[]
  /** 该组下的条目（组内顺序 = 入参顺序，由调用方按 sortMode 预排） */
  entries: MomoEntry[]
}

/** 组里的一个地点与该地点在本组的条数（name 档下 = 组条数） */
export interface LocCount {
  location: string
  count: number
}

/**
 * 条数降序 → 名称 localeCompare 的排行收尾（T7）。分组流的 `locations` 与
 * `locationTallies` 曾各写一遍逐字符相同的链条；D5 判「比较器家族不并」在这两站
 * 不成立（同文件同制），收一个文件私有 helper，不进 core（跨文件共要过 bench）。
 */
const sortedLocCounts = (counts: Map<string, number>): LocCount[] =>
  [...counts.entries()]
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))

/**
 * 分组与显示的**层级视角**（v0.9.30「地点名前加大洲和国家」）：
 * `level` = 显示 / 分组到哪一级（prefs.locLevel），`regions` = 用户手填的大洲 /
 * 国家（prefs.locRegions，压过内置字典）。不给 = 老口径：按地名分组、组名就是
 * 地名本身（设置页「地点」卡的地点清单走这一支）。
 */
export interface LocView {
  level: LocLevel
  regions?: Readonly<Record<string, LocRegion>> | null
  /**
   * 只在这些**节点**（筛选集合 `filterLocations`，`亚洲\u0000中国` 这类路径前缀段；
   * v0.9.31「选中即过滤」起、2026-10-01 从单值扩成多选）下分组。给了非空集合：
   * 完整路径不被其中任何节点覆盖的地点**不参与分组**——否则「筛北京」之后
   * night（[北京, 上海]）还会把「上海」组撑起来，用户筛了一个地区却看见别的地区的
   * 组头。条目的去留仍由 `entryAtLocNode` 管（任一路径命中就算），这里只管
   * 「哪些地点进组」。空数组 / null = 不限（与「集合为空 = 不过滤」同一个口径）。
   */
  within?: readonly string[] | null
}

/**
 * 组键的分段连接符：用户数据里**不可能出现**的控制字符。
 *
 * 为什么不用连接符本身（`·`）或 `/` 当键：地名是用户输入（≤20 字，什么都能写），
 * 一个叫「亚洲 · 中国」的地点在 name 档会造出与 `['亚洲', '中国']` 路径**同一个
 * 标签**却不同的组。键只要求唯一、不要求可读，所以挑一个用户名不出来的字符；
 * 可读的那一份是 label。
 */
const KEY_SEP = '\u0000'

/**
 * 一个地点在选定层级下的**路径**（组键与组名的共同原料）。
 *
 * - `name`：`[大洲, 国家, 地名]`（缺的环跳过——「外婆家」这类查不到归属的地点
 *   路径只有它自己，组头没有前缀，与升级前一致）；
 * - `country`：`[大洲, 国家]`；
 * - `continent`：`[大洲]`。
 *
 * 后两档有个共同的退化：**那一级查不到时按地名自成一组**。选「大洲」而某个
 * 地点没有归属时，把它并进一个「未知大洲」虚拟组更糟——那会把「没数据」伪装成
 * 「有数据」，用户得猜这颗组头是什么意思。宁可它单独一组、组头就是地名。
 *
 * **同名的环只留一个**（v0.9.32）：有了国家表之后这不是假想——写「中国」查到的
 * 就是 `['亚洲', '中国']`。`name` 档末尾本来就要拼上地名，那一环与地名相同时必须
 * 跳过，否则组头写成 `亚洲 · 中国 · 中国`；`country` 档则**要留着**（路径里没有
 * 地名，`亚洲 · 中国` 正是这一档该给中国这组的名字，去了它中国与北京就落进两个
 * 组）。手填的脏值同理（`['北京', '华北']`、`['中国', '中国']`）。
 */
export function locPartsOf(loc: string, level: LocLevel, region: LocRegion | null): string[] {
  const continent = region?.[0]?.trim() ?? ''
  const country = region?.[1]?.trim() ?? ''
  if (level === 'name') {
    const rings: string[] = []
    for (const p of [continent, country]) {
      if (p === '' || p === loc || rings.includes(p)) continue
      rings.push(p)
    }
    return [...rings, loc]
  }
  if (level === 'country') {
    const parts = [continent, country].filter((p) => p !== '')
    return parts.length > 0 ? [...new Set(parts)] : [loc]
  }
  const parts = [continent].filter((p) => p !== '')
  return parts.length > 0 ? parts : [loc]
}

/**
 * 一个地点在选定层级下的组键 / 组名（跳转、pill、弹层、星球都走这一个入口）。
 *
 * **键恒是规范形**（`亚洲\u0000中国\u0000北京`，比对 / 过滤 / 落盘全靠它，一个字
 * 都不许随语言变）；**名按当前界面语言**（`displayLocName`，2026-10-06 起三级都
 * 跟随）。两者分开正是这一层的全部意义：切语言改的是屏幕，不是数据。
 *
 * ⚠️ 因为组名带语言，**把它的结果 memo 住的地方要把 `lang` 放进依赖**——现已补齐
 * 的六处：useListDerivations 的 locTree / locGroups、GlobeView 的 anchors、
 * locPills 的 all、两个地点弹层的 rows（LocEditPop / LocBatchPicker）、
 * FilterBar 的活动筛选胶囊。AppShell 的 `key={lang}` 整树重挂兜底之外的第二道
 * 保险：将来哪层被提到重挂边界之外，或某个 memo 不再随重挂重建，标签也不会停在
 * 旧语言。
 */
export function locGroupOf(loc: string, view: LocView): { key: string; label: string } {
  const parts = locPartsOf(loc, view.level, regionOfLocation(loc, view.regions))
  return { key: parts.join(KEY_SEP), label: locPathLabel(parts) }
}

/** 路径段 → 组名：逐段过 `displayLocName` 再用本地化连接符拼起来 */
export function locPathLabel(parts: readonly string[]): string {
  return parts.map((p) => displayLocName(p)).join(copy.location.pathSep)
}

/**
 * 地点的**完整路径键**（恒按 name 档：大洲 · 国家 · 地名，缺环跳过）。
 *
 * 什么时候用它而不是 locGroupOf：要做「节点覆盖」判定时——层级树（大洲 → 国家 →
 * 城市）与「选中即过滤」的节点键都是**完整路径的前缀段**，与被过滤的组键按什么
 * 档位分组无关。用当前档位的组键去比，会把 country 档的「亚洲\u0000中国」与
 * name 档的「亚洲\u0000中国\u0000北京」判成两个不相干的东西。
 */
export function locFullKey(loc: string, regions?: Readonly<Record<string, LocRegion>> | null): string {
  return locPartsOf(loc, 'name', regionOfLocation(loc, regions)).join(KEY_SEP)
}

/**
 * 层级树节点 `node` 是否**覆盖**组键 `key`（按 KEY_SEP 分段的真前缀，不是字符
 * 串前缀——「亚」不是「亚洲\u0000中国」的前缀段）。选中即过滤（v0.9.31）的
 * 判定式：分组流里凡完整路径落在该节点下的组，都属于这次过滤的结果。
 */
export function locNodeCovers(node: string, key: string): boolean {
  if (node === key) return true
  return key.startsWith(node + KEY_SEP)
}

/**
 * 两个键（节点键 / 组键）是否**互相覆盖**：任一边是另一边的真前缀段。
 *
 * 为什么需要「双向」：树上的节点键恒是 name 档完整路径（`亚洲\u0000中国`），
 * 而分组流的组键是**当前档位**的路径——筛「中国」在 name 档下命中三节的组
 * （节点是组的前缀），在 continent 档下命中一节的「亚洲」组（组是节点的祖先）。
 * 只判相等的话，粗档 / 粗节点这两侧都会一处不亮、一处不跳。三个消费者共用这一个
 * 判定：组头与星球行的点亮、分组流的滚动落点、星球转向的目标锚点。
 */
export function locKeysOverlap(a: string, b: string): boolean {
  return locNodeCovers(a, b) || locNodeCovers(b, a)
}

/**
 * 筛选集合里有没有一个节点与 `key` 互相覆盖——「这个东西正被筛着吗」的唯一判定。
 *
 * 三个消费者共用（2026-10-01 多选化之后）：分组流的组头点亮、星球锚点点亮、
 * 卡片 pill 的选中态。树行不读它——树的节点键恒是 name 档完整路径、集合又按
 * 「祖先 / 后代去重」规范化过，`includes` 精确比对即可（见 filters.ts 的
 * toggleLocation）。
 */
export function locKeyActive(keys: readonly string[], key: string): boolean {
  return locOverlappingFilterKey(keys, key) !== null
}

/**
 * 筛选集合里**让这个路径亮着的那一个节点**（没有则 null）——`locKeyActive` 的
 * 那张底牌，单独取出来是给「点一枚亮着的光点该收回哪一个节点」用的（BUG-136d）。
 *
 * 为什么星球那一侧需要它：球上光点的「亮」由 locKeyActive 决定（覆盖判定），而
 * 「再点一次 = 取消」旧实现按 `filterLocations.includes(hit.key)` 判（等值）——
 * 两把尺子之下，选中粗节点（侧栏点「中国」）时城市点是**亮的**、等值判定却说
 * 「没选」，于是那一下走加法支、再经 toggleLocation 的祖先-后代规范化，把国家
 * **收窄成一座城**（脏档 / 粗档反向：把城市放宽成整个国家）。现在两边共用这一把尺：
 * 亮着 → 收回让它亮的那个节点；没亮 → 加入点到的这一枚。
 *
 * 集合按祖先-后代规范化过（filters.ts 的 toggleLocation），与一条完整路径重叠的
 * 节点至多一枚；真的出现多枚（外部写坏的状态）时取**集合末位**——与
 * 「这次要转向哪一个」同一口径（集合顺序即加入顺序）。
 */
export function locOverlappingFilterKey(keys: readonly string[], key: string): string | null {
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i]
    if (k !== undefined && locKeysOverlap(k, key)) return k
  }
  return null
}

/**
 * 节点键 → 可读路径（筛选条胶囊 / 读屏名用）：`亚洲\u0000中国` → `亚洲 · 中国`。
 *
 * 键本身是给比对用的（分隔符是用户名不出来的控制字符），给人看的那一份必须
 * 换成本地化连接符——与 `locGroupOf` 的 label 同一个口径。
 */
export function locKeyLabel(key: string): string {
  return locPathLabel(key.split(KEY_SEP).filter((p) => p !== ''))
}

/**
 * 过滤节点在分组流里该落到哪一组：第一个与它互相覆盖的组键（按调用方给的顺序
 * = 文档顺序 = 视觉顺序），一个都不覆盖时 null。
 *
 * `scrollToLocGroup` 是按 `data-loc === 组键` 精确比对的，直接把节点键递进去，
 * 粗节点（大洲 / 国家）在 name 档下一个组都对不上——用户点了「亚洲」，筛选生效了，
 * 视图却停在原地。
 */
export function firstLocGroupKey(keys: readonly string[], node: string): string | null {
  for (const key of keys) if (locKeysOverlap(node, key)) return key
  return null
}

/**
 * 按地点分组（F6 ④「多地点每条都出现」；v0.9.30 起按 `view.level` 的层级分组）：
 * - 一条笔记有 N 个地点，就在 N 个组里各出现一次（同一条实例，不是副本）；
 * - 组排序 = 条数降序，同数按**组名**排（localeCompare，与侧栏标签树同口径
 *   ——用户看见的是组名，排序得跟着看见的走）；
 * - **一个地点都没有的笔记整条丢弃**（v0.9.27 起）——分组档是「按地点看」，
 *   无地点的笔记在这里没有归处；它们照旧出现在常规列表 / 时间等其他视图里；
 * - 组内顺序 = 入参顺序（置顶跟随组由调用方在入参里预先排好，见 App 的派生链）。
 */
export function groupByLocation(
  entries: readonly MomoEntry[],
  view: LocView = { level: 'name' },
): LocationGroup[] {
  interface Acc {
    key: string
    label: string
    entries: MomoEntry[]
    /** 地点名 → 本组条数（组内按它拆回地点，见 LocationGroup.locations） */
    counts: Map<string, number>
  }
  const byKey = new Map<string, Acc>()
  // 归属缓存（BUG-58，与 stats/locations.ts 的 regionCache 同款）：每个唯一地名只查
  // 一次 regionOfLocation（内含两次字典查找 + isBlankLocRegion 的 trim），并把当前
  // 档位的组键 / 组名与恒按 name 档的完整路径一起摊好——旧实现每条 incidence 各查一次
  // locGroupOf + locFullKey，万条库 × 平均 2 地点 ≈ 4 万次查找 + 10 万级临时串。
  interface LocInfo {
    key: string
    label: string
    fullKey: string
  }
  const locInfoCache = new Map<string, LocInfo>()
  const infoOf = (loc: string): LocInfo => {
    let info = locInfoCache.get(loc)
    if (info === undefined) {
      const region = regionOfLocation(loc, view.regions)
      const parts = locPartsOf(loc, view.level, region)
      info = {
        key: parts.join(KEY_SEP),
        label: locPathLabel(parts),
        fullKey: locPartsOf(loc, 'name', region).join(KEY_SEP),
      }
      locInfoCache.set(loc, info)
    }
    return info
  }
  for (const e of entries) {
    // 一条笔记的 N 个地点在粗档下可能落进**同一个组**（[北京, 上海] 在 country 档
    // 都是「中国」）：先按组键收拢，entry 只进组一次——否则同一张卡会在组里出现
    // 两遍（React key 撞车、条数虚高）。地点计数仍按地名各计一次。
    const slots = new Map<string, { label: string; locs: string[] }>()
    for (const loc of e.locations) {
      const info = infoOf(loc)
      // within：落在过滤节点集合外的地点不进组（见 LocView.within）——判定用**完整
      // 路径**（name 档），与档位无关：按 country 档筛「中国」时，name 档的
      // 「亚洲\0中国\0北京」仍被它覆盖。集合为空 = 不过滤（多选集合的自然语义）。
      if (view.within != null && view.within.length > 0 && !view.within.some((n) => locNodeCovers(n, info.fullKey))) continue
      let slot = slots.get(info.key)
      if (!slot) {
        slot = { label: info.label, locs: [] }
        slots.set(info.key, slot)
      }
      slot.locs.push(loc)
    }
    for (const [key, slot] of slots) {
      let g = byKey.get(key)
      if (!g) {
        g = { key, label: slot.label, entries: [], counts: new Map() }
        byKey.set(key, g)
      }
      g.entries.push(e)
      for (const loc of slot.locs) g.counts.set(loc, (g.counts.get(loc) ?? 0) + 1)
    }
  }
  return [...byKey.values()]
    .map((g) => ({
      key: g.key,
      label: g.label,
      locations: sortedLocCounts(g.counts),
      entries: g.entries,
    }))
    .sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label))
}

/**
 * 全库地点清单（**不带任何归属**）：按条数降序、同数按地名 localeCompare。
 *
 * 什么时候用它而不是 groupByLocation：要的是「一个地名的元数据」而不是「一组
 * 笔记」——设置页地点卡的坐标 / 归属两块就是这种（那里的行按地名增删，粗档下
 * 的组键是大洲 / 国家，对手填表来说是个不存在的键）。地点弹层的候选行排序
 * 也走这条口径（两边见过的顺序才一致）。
 */
export function locationTallies(entries: readonly MomoEntry[]): LocCount[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    for (const loc of e.locations) counts.set(loc, (counts.get(loc) ?? 0) + 1)
  }
  return sortedLocCounts(counts)
}
