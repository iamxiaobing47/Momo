import { normalizeTags, tagKey } from '../tags'
import { isValidLatLon, type LatLon } from '../locations'
import { isValidLocRegion, type LocRegion } from '../locations'
import { CONFIGURABLE_ICON_NAMES, LUCIDE_ID_SET, type IconOverrides } from '../icons'
import { truncateChars } from '../core'
import {
  BRAND_ICONS,
  BRAND_ICON_EXTS,
  BRAND_ICONS_MAX,
  BRAND_NAME_MAX,
  CARD_FONT_SIZE,
  CARD_RADIUS,
  CARD_TITLE_SIZE,
  CUSTOM_CSS_MAX,
  COLOR_SCHEMES,
  DEFAULT_BRAND_NAME,
  DEFAULT_DENSITY_VIEWS,
  DEFAULT_GLOBE_EARTH,
  DEFAULT_LOC_LEVEL,
  DEFAULT_LOC_TREE_EXPAND,
  DEFAULT_NEW_NOTE_LOCATIONS,
  DEFAULT_REVIEW_MODE,
  DEFAULT_SECTIONS,
  DEFAULT_STATS_SECTIONS,
  DEFAULT_TAG_MATCH,
  DEFAULT_TAG_SORT,
  DENSITIES,
  FONT_ROLE_PREFIX,
  READABLE_FONT_ROLES,
  FONT_VALUE_MAX,
  GLOBE_EARTHS,
  HEATMAP_MONTHS,
  LANG_PREFS,
  LOC_LEVELS,
  LOC_TREE_EXPANDS,
  REVIEW_COUNT,
  REVIEW_MODES,
  SIDEBAR_WIDTH,
  SORT_MODES,
  STATS_RANGES,
  TAG_SORT_KEYS,
  TAG_MATCH_MODES,
  CARD_STAMPS,
  TITLE_MAX,
  UI_SCALES,
  VIEW_IDS,
  WARM_RATIOS,
  isDensity,
  type BrandIcon,
  type CardStamp,
  type ColorScheme,
  type Density,
  type DensityViewPref,
  type GlobeEarth,
  type LangPref,
  type LocLevel,
  type LocationPosition,
  type LocTreeExpand,
  type SidebarSections,
  type SortMode,
  type StatsRange,
  type StatsSections,
  type TagPosition,
  type TagMatchMode,
  type TagSortKey,
  type UiScale,
  type ViewId,
  type WarmRatio,
} from './prefs'
import type { ReviewMode } from '../review/review'
import { DEFAULT_SETTINGS, type MomoSettings, type TrashRecord } from './entry'
import { boolOf, clampNumber, enumOr, pickEnum, sanitizeTable, uniqueList } from './sanitizeKit'

// data.json 的**逐字段兜底**：每一个 sanitize 只回答「这个字段盘上是脏的怎么办」。
// 与 prefs.ts（结构）/ entry.ts（形状）合起来才是完整的 types 层。
//
// 这里刻意**不 import obsidian**：sanitizeSettings 自备 normalizePath 的口径
// （见 dir() 内注释），整层因此可以在 node 里单独测（scripts/prefs.test.mts）。

/** 把任意输入夹回侧栏宽度的合法区间；非数字回退默认值 */
export function clampSidebarWidth(value: unknown): number {
  return clampNumber(value, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max, SIDEBAR_WIDTH.default)
}

/** 只认合法枚举，脏数据 / 旧 data.json 回 'list' */
export const sanitizeDensity: (value: unknown) => Density = enumOr(DENSITIES, 'list')

/**
 * 顶栏视图分段（v0.9.17）的兜底：只收白名单内的视图 id、按 id 去重（**保留先后**，
 * 顺序即顶栏顺序），条目形状不对就丢，`on` 只认布尔（缺 / 脏 → 当开）。
 *
 * 白名单是 `VIEW_IDS`（2026-10-12 起四档：两档密度 + 星球 / 地点分组），不是
 * `DENSITIES`——地点两档也是顶栏上的视图按钮，设置页「视图」卡里各有各的一行。
 *
 * 四条收口规则，各有各的来由：
 * ① **补新档**：`VIEW_IDS` 里有、盘上数组没有的档，追加到末尾并默认开。
 *    将来加一档视图时，老用户的盘上数组缺这一条——补上它，新档就像默认一样
 *    出现在顶栏，而不是要用户先去设置页把它找出来；
 * ② **至少一档密度开着**：全关会让顶栏那排视图一个按钮都不剩（列表页就再没有
 *    切视图的入口），所以全关时整体回默认（全开）而不是留一个空分段。2026-10-09
 *    起这条从「至少一项」收紧成「至少一档**密度**」：星球 / 地点分组是 `locView`
 *    的两种呈现，进得去出不来——`DensitySegmented` 的 onChange 里，离开地点视图
 *    只能靠「点任何一档密度」。密度档全关时顶栏只剩那两颗，点进去就再也回不到
 *    常规卡片流，「现在看的是什么」没有出口；
 * ③ **脏值整体回默认**：不是数组（旧 data.json 没这个键 / 手改坏）→ 回默认，
 *    升级后行为与升级前逐像素一致；
 * ④ 空数组同样落到 ①：补齐全部档 = 默认。
 *
 * 历史：v0.9.23 曾有第 ⑤ 条「旧默认盘顺序迁移」——`timeline` 当日在 `DENSITIES`
 * 里从第三位挪到末尾，靠 `LEGACY_DENSITY_IDS` 认出「没调过顺序的旧盘」再按新序
 * 重排一次。`compact` 与 `timeline` 相继移除后，旧盘经上面的白名单过滤剩下的
 * 序列**恒等于** `DENSITIES` 声明序（这两档都不在枚举里了），重排随之成为恒等
 * 运算——整套机制（常量 + 比较 + 重排）一并删除，只留「过滤 + 补档 + 至少一档密度」。
 */
export function sanitizeDensityViews(value: unknown): DensityViewPref[] {
  const fallback = (): DensityViewPref[] => DEFAULT_DENSITY_VIEWS.map((v) => ({ ...v }))
  if (!Array.isArray(value)) return fallback()
  const out: DensityViewPref[] = []
  const seen = new Set<ViewId>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    const id = rec.id as ViewId
    if (!VIEW_IDS.includes(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, on: typeof rec.on === 'boolean' ? rec.on : true })
  }
  for (const id of VIEW_IDS) if (!seen.has(id)) out.push({ id, on: true })
  const anyDensityOn = out.some((v) => v.on && isDensity(v.id))
  return anyDensityOn ? out : fallback()
}

/**
 * 排序模式兜底（v0.9.15 起四值枚举，替代原 `sortAsc: boolean`）。
 *
 * 两级兜底：盘上有合法 `sortMode` 就用它；没有（旧 data.json / 刚升级）时按旧
 * 布尔**无损迁移**——`false` = 新→旧 → `createdDesc`，`true` = 旧→新 →
 * `createdAsc`，升级后用户看到的顺序与升级前逐字节一致。连旧布尔都没有
 * （全新安装 / 手改坏）→ 默认 `createdDesc`（新→旧，与旧默认同）。
 */
export function sanitizeSortMode(value: unknown, legacyAsc: unknown): SortMode {
  const known = pickEnum(SORT_MODES, value)
  if (known) return known
  if (typeof legacyAsc === 'boolean') return legacyAsc ? 'createdAsc' : 'createdDesc'
  return 'createdDesc'
}

/**
 * 侧栏标签区排序键兜底（v0.9.18）：只认白名单里的三个值，其余（旧 data.json 没这个键 /
 * 手改坏 / 将来删掉的键）一律回「数量」—— 那是升级前写死的顺序，对老盘逐行不变。
 */
export const sanitizeTagSort: (value: unknown) => TagSortKey = enumOr(TAG_SORT_KEYS, DEFAULT_TAG_SORT)

/**
 * 多选标签组合方式兜底（2026-10-12）：只认白名单里的两个值，其余（旧 data.json
 * 没这个键 / 手改坏）一律回「并集」—— 那是本字段存在之前的行为，对老盘零变化。
 */
export const sanitizeTagMatch: (value: unknown) => TagMatchMode = enumOr(TAG_MATCH_MODES, DEFAULT_TAG_MATCH)

/**
 * 回顾抽法档位兜底（2026-10-24 起持久化）：只认白名单里的五个值，其余（旧
 * data.json 没这个键 / 手改坏 / 将来删掉的档）一律回「随机」—— 那是本字段存在
 * 之前**每次重载后**的实际档位，老盘升级后行为零变化、零迁移。
 */
export const sanitizeReviewMode: (value: unknown) => ReviewMode = enumOr(REVIEW_MODES, DEFAULT_REVIEW_MODE)

/**
 * 新建笔记带不带空 `locations` 字段的兜底（v0.9.28）：只认布尔，其余（旧
 * data.json 没这个键 / 手改坏）一律回默认（开）。
 *
 * 默认开 = 新点「写点什么」建出来的笔记就带着 `locations: []`；**脏值回落默认**
 * 不改变读侧行为（locationsOf 对缺省与空数组一视同仁），只改新建时的 frontmatter
 * 长相，所以回默认是安全的一侧。
 */
export const sanitizeNewNoteLocations: (value: unknown) => boolean = (value: unknown): boolean =>
  boolOf(value, DEFAULT_NEW_NOTE_LOCATIONS)

/** 只认布尔值，缺省项回退默认（旧 data.json / 脏数据兜底） */
export function sanitizeSections(value: unknown): SidebarSections {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const out = { ...DEFAULT_SECTIONS }
  for (const key of Object.keys(DEFAULT_SECTIONS) as Array<keyof SidebarSections>) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  return out
}

/** 只认布尔值，缺省项回退默认（旧 data.json 无此字段 → 全开） */
export function sanitizeStatsSections(value: unknown): StatsSections {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const out = { ...DEFAULT_STATS_SECTIONS }
  for (const key of Object.keys(DEFAULT_STATS_SECTIONS) as Array<keyof StatsSections>) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  return out
}

/** 随机回顾每批条数的兜底钳制 */
export const clampReviewCount = (value: unknown): number =>
  clampNumber(value, REVIEW_COUNT.min, REVIEW_COUNT.max, REVIEW_COUNT.default)

/** 热力图月数的兜底钳制 */
export const clampHeatmapMonths = (value: unknown): number =>
  clampNumber(value, HEATMAP_MONTHS.min, HEATMAP_MONTHS.max, HEATMAP_MONTHS.default)

/** 只认合法枚举，脏数据回 'all'（旧 data.json 无此字段 → 默认全部） */
export const sanitizeStatsRange: (value: unknown) => StatsRange = enumOr(STATS_RANGES, 'all')

/** `YYYY-MM-DD` 且是真实存在的日期（防 2026-02-31 这类盘面脏值） */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** 只收合法日期键，其余回 null（无自定义区间时的「未设置」） */
export function sanitizeStatsDay(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY_KEY_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  // 必须用 setFullYear 而不是构造函数的年份参数：`new Date(y, …)` 对 0≤y≤99 有
  // legacy 映射（new Date(50,…) → 1950），getFullYear() 永远 ≠ y，于是 "0050-06-15"
  // 这种格式合法、真实存在的日期被误判成非法。先按 1 月 1 日构造再把年扣上去，
  // 比较的是同一个年，百年内的合法键不再被拒。
  const dt = new Date(2000, (m ?? 1) - 1, d ?? 1)
  dt.setFullYear(y ?? 0)
  return dt.getFullYear() === y && dt.getMonth() === (m ?? 1) - 1 && dt.getDate() === d ? value : null
}

/** 自定义区间：两端都合法才生效，from > to 时交换（半开区间永远有序，比较口径见 stats.ts） */
export function sanitizeStatsCustomRange(from: unknown, to: unknown): { from: string; to: string } | null {
  const f = sanitizeStatsDay(from)
  const t = sanitizeStatsDay(to)
  if (!f || !t) return null
  return f <= t ? { from: f, to: t } : { from: t, to: f }
}

/**
 * 2026-10-12 配色改名（`notion` → `mist-blue` / `flomo` → `moss-green` /
 * `gewu` → `clam-white` / `graphite` → `ink-night`）：盘上的旧值照常读、
 * 映射到**同色**的新 id——不失用户选择、不清数据。映射只活在这一个函数里，
 * 写盘自然发生在下一次 prefs 保存，不需要迁移函数。
 */
const RENAMED_COLOR_SCHEMES: Record<string, ColorScheme> = {
  notion: 'mist-blue',
  flomo: 'moss-green',
  gewu: 'clam-white',
  graphite: 'ink-night',
}

/** 只认合法枚举：改名前的旧 id 映射到新 id；其余脏数据 / 退役值回默认（`mist-blue`「雾蓝」，2026-10-11 起） */
export function sanitizeColorScheme(value: unknown): ColorScheme {
  if (typeof value === 'string') {
    const renamed = RENAMED_COLOR_SCHEMES[value]
    if (renamed) return renamed
  }
  return COLOR_SCHEMES.some((s) => s.id === value) ? (value as ColorScheme) : 'mist-blue'
}

/**
 * 自定义 CSS 的网络原语扫描（BUG-102）：`prefs.customCss` 的值会原样进
 * `<style>`（`ui/shell/CustomCss.tsx`），而 CSS 语法里的 `@import` 与 `url(...)`
 * 就是网络原语——盘上一个值就能让插件对外发请求，与 manifest.json 对用户
 * 承诺的「纯本地、无网络」相违，所以 sanitize 不能只截长度。
 *
 * **按 CSS tokenizer 的口径扫，而不是对字符串 match**：注释里提一嘴
 * `@import url(…)` 的片段不产生规则（放行）、`content: "https://…"` 的字符串
 * 是纯文本（放行）；而 `@IMPORT` 大小写、`@\69 mport` / `url(\68 ttps://…)` /
 * 字符串里的换行拼接这类写法，浏览器解析后就是原语，必须命中。只收 CSS 里
 * 会真的发起远程加载的三处语法位置：
 * ① at-keyword `@import`（后接 url(...) 还是字符串，都是「加载」宣告）；
 * ② `url()` token 的值（未加引号 / 带引号两种形态）；
 * ③ `image-set()` / `-webkit-image-set()` 的字符串参数——CSS 里另一处
 *    「字符串即 URL」的位置。
 * 值转义还原、按 URL 标准预处理后以 `http:` / `https:` / `//`（协议相对）开头
 * 即命中。`data:` / `blob:` / 相对路径 / `#片段` 都不触网，放行。
 *
 * 命中即让 sanitizeCustomCss **整段回退 ''**：半剥半留会产出语法残缺的残段，
 * 与 sanitizeFontPref 的「宁可回退默认」保持同一把尺子。
 */
const CSS_HEX_ESCAPE_RE = /\\([0-9a-fA-F]{1,6}[ \t\n\r\f]?|[\s\S])/g

/** CSS 转义还原：`\XXXXXX `（1–6 位十六进制 + 一个可选空白终止符）取该码点，
 *  `\x`（其余）取字面 x；`\` + 换行是行拼接（丢弃换行符）。名字与 URL 前缀的
 *  判断必须按还原后的文本做，否则 `\69 mport` 这类合法写法会绕过检查。 */
function unescapeCss(text: string): string {
  return text.replace(CSS_HEX_ESCAPE_RE, (_m, esc: string) => {
    if (esc === '\n' || esc === '\r' || esc === '\f') return ''
    const hex = esc.replace(/[ \t\n\r\f]$/, '')
    if (hex.length > 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      const code = parseInt(hex, 16)
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD'
      return String.fromCodePoint(code)
    }
    return esc
  })
}

function isCssNameChar(c: string): boolean {
  return /[A-Za-z0-9_-]/.test(c) || c.charCodeAt(0) > 0x7f
}

function isCssNameStart(c: string): boolean {
  return /[A-Za-z_-]/.test(c) || c.charCodeAt(0) > 0x7f
}

const CSS_WS_RE = /[ \t\n\r\f]/

/** 从 i 处读一个字符串 token（i 指向引号）。返回原文（保留转义序列，交给
 *  unescapeCss）与下一位置；未闭合时就地截断（与解析器同向：坏字符串内容
 *  仍可能被部分消费，保守地按已读内容检查）。 */
function readCssString(css: string, i: number): { raw: string; next: number } {
  const quote = css[i]
  let j = i + 1
  let raw = ''
  while (j < css.length) {
    const c = css[j]
    if (c === '\\') {
      raw += css.slice(j, j + 2)
      j += 2
      continue
    }
    if (c === quote) return { raw, next: j + 1 }
    raw += c
    j += 1
  }
  return { raw, next: j }
}

/** 从 i 处读一个 ident / at-keyword 的名字（CSS name sequence，含转义）。
 *  返回原文与下一位置。 */
function readCssName(css: string, i: number): { raw: string; next: number } {
  let j = i
  let raw = ''
  while (j < css.length) {
    const c = css[j]
    if (c === '\\') {
      let k = j + 1
      let hexLen = 0
      while (k < css.length && hexLen < 6 && /[0-9a-fA-F]/.test(css[k])) {
        k += 1
        hexLen += 1
      }
      if (hexLen > 0) {
        if (k < css.length && CSS_WS_RE.test(css[k])) k += 1
        raw += css.slice(j, k)
        j = k
      } else if (k < css.length) {
        raw += css.slice(j, k + 1)
        j = k + 1
      } else {
        raw += c
        j += 1
      }
      continue
    }
    if (isCssNameChar(c)) {
      raw += c
      j += 1
      continue
    }
    break
  }
  return { raw, next: j }
}

/** 读 `url(` 括号内的值（i 指向 `(` 之后）：跳过前导空白与注释；带引号读字符串，
 *  否则读到 `)` 为止。返回原文（未还原，交给 unescapeCss）与**闭括号之后**的
 *  位置——整段消费掉括号对，主循环的 image-set 深度计数才不会错位。 */
function readCssUrl(css: string, i: number): { raw: string; next: number } {
  let j = i
  for (;;) {
    if (j < css.length && CSS_WS_RE.test(css[j])) {
      j += 1
      continue
    }
    if (css[j] === '/' && css[j + 1] === '*') {
      const end = css.indexOf('*/', j + 2)
      j = end === -1 ? css.length : end + 2
      continue
    }
    break
  }
  if (css[j] === '"' || css[j] === "'") {
    const { raw, next } = readCssString(css, j)
    let k = next
    for (;;) {
      if (k < css.length && CSS_WS_RE.test(css[k])) {
        k += 1
        continue
      }
      if (css[k] === '/' && css[k + 1] === '*') {
        const end = css.indexOf('*/', k + 2)
        k = end === -1 ? css.length : end + 2
        continue
      }
      break
    }
    return { raw, next: css[k] === ')' ? k + 1 : k }
  }
  let raw = ''
  let k = j
  while (k < css.length && css[k] !== ')') {
    raw += css[k]
    k += 1
  }
  return { raw, next: k < css.length ? k + 1 : k }
}

/**
 * 剥掉首尾的 ASCII 控制（C0）与空格。逐字符扫而**不写成正则字面量**：
 * `\u0000` / `\x00` 这类控制转义会被 `no-control-regex` 拦下（BUG-224），
 * 而本函数的判定区间就是字面上的 0x00–0x20。
 */
function stripEdgeAsciiControls(value: string): string {
  let from = 0
  let to = value.length
  while (from < to && value.charCodeAt(from) <= 0x20) from += 1
  while (to > from && value.charCodeAt(to - 1) <= 0x20) to -= 1
  return value.slice(from, to)
}

/** 还原后的 URL 值是否指向远程（`http:` / `https:` / 协议相对 `//`，大小写不敏感）。
 *  先按 URL 标准预处理：移除全部 ASCII tab / 换行，再剥首尾 C0 控制与空格——
 *  不这么做，`"ht\ntp://…"` 这类（浏览器会拼接成 http://）就能绕过前缀比对。 */
function isRemoteUrlValue(value: string): boolean {
  const cleaned = stripEdgeAsciiControls(value.replace(/[\t\n\r]/g, ''))
  const lower = cleaned.toLowerCase()
  return lower.startsWith('http:') || lower.startsWith('https:') || lower.startsWith('//')
}

/** 是否存在会发起远程加载的语法原语（扫描口径见上方大注释）。 */
function hasRemoteCssPrimitive(css: string): boolean {
  let i = 0
  let imageSetDepth = 0 // > 0 = 在 image-set 参数区内（那里的字符串按 URL 检查）
  while (i < css.length) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 2
      continue
    }
    if (c === '"' || c === "'") {
      const { raw, next } = readCssString(css, i)
      if (imageSetDepth > 0 && isRemoteUrlValue(unescapeCss(raw))) return true
      i = next
      continue
    }
    if (c === '@') {
      const { raw, next } = readCssName(css, i + 1)
      if (unescapeCss(raw).toLowerCase() === 'import') return true
      i = next
      continue
    }
    if (isCssNameStart(c)) {
      const { raw, next } = readCssName(css, i)
      if (css[next] === '(') {
        const name = unescapeCss(raw).toLowerCase()
        if (name === 'url') {
          const { raw: value, next: after } = readCssUrl(css, next + 1)
          if (isRemoteUrlValue(unescapeCss(value))) return true
          i = after
          continue
        }
        if (name === 'image-set' || name === '-webkit-image-set') {
          imageSetDepth += 1
          i = next + 1
          continue
        }
      }
      i = next
      continue
    }
    if (imageSetDepth > 0) {
      if (c === '(') imageSetDepth += 1
      else if (c === ')') imageSetDepth -= 1
    }
    i += 1
  }
  return false
}

/** 只接受字符串；超上限截断；**按 CSS 语法拦网络原语**（见 hasRemoteCssPrimitive：
 *  `@import` / 远程 `url()` / image-set 字符串命中即整段回退空串，脏数据回空串） */
export function sanitizeCustomCss(value: unknown): string {
  if (typeof value !== 'string') return ''
  const css = value.length > CUSTOM_CSS_MAX ? truncateChars(value, CUSTOM_CSS_MAX) : value
  return hasRemoteCssPrimitive(css) ? '' : css
}

/**
 * 字体偏好（v1.0.0）的取值兜底。取值空间三段：
 *   · `''` —— 跟随默认（不注入字体变量，CSS 令牌走原栈）；
 *   · `obsidian:<role>` —— Obsidian 自己的字体角色（role 必须在
 *     READABLE_FONT_ROLES 内：在用的 monospace + 2026-10-13 退役的 interface /
 *     text——退役角色继续放行，老 data.json 不被打回默认，见 prefs.ts）；
 *   · 其余 —— 历史遗留的**系统已装字体名**（手输入口早已移除，盘上旧值继续读）。
 *
 * 第三段要当 CSS 值注入 head 的 <style>（`--momo-sans / --momo-font-card`），
 * 所以这里按「字体名能出现的字符」收白名单（拉丁 / CJK / 空格 / 连字符），
 * 引号、分号、花括号这类能改写 CSS 语法的字符一律拒绝——宁可回退默认，
 * 也不让 data.json 里的一个脏值变成样式注入。收完再折叠空格、截断到上限。
 * `bundled:<id>` 是 v0.9.50 及以前的内置字体取值，随内置字体一起退役 → 回默认。
 */
export function sanitizeFontPref(value: unknown): string {
  if (typeof value !== 'string') return ''
  const s = value.trim()
  if (s === '') return ''
  if (s.startsWith(FONT_ROLE_PREFIX)) {
    const role = s.slice(FONT_ROLE_PREFIX.length)
    return READABLE_FONT_ROLES.includes(role) ? s : ''
  }
  if (s.startsWith('bundled:')) return ''
  const safe = s.replace(/\s+/g, ' ')
  if (!/^[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af -]+$/.test(safe)) return ''
  return truncateChars(safe, FONT_VALUE_MAX)
}

/** 只认白名单内的图标，脏数据 / 旧 data.json 回默认（leaf） */
export function sanitizeBrandIcon(value: unknown): BrandIcon {
  return BRAND_ICONS.some((i) => i.id === value) ? (value as BrandIcon) : 'leaf'
}

/** 只收字符串：trim + 截断到上限（码点口径，不劈开代理对）；空串 / 脏值回默认「Momo」 */
export function sanitizeBrandName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BRAND_NAME
  return truncateChars(value.trim(), BRAND_NAME_MAX) || DEFAULT_BRAND_NAME
}

/** 只认合法枚举，脏数据 / 旧 data.json 回 meta */
export function sanitizeTagPosition(value: unknown): TagPosition {
  return value === 'bottom' ? 'bottom' : 'meta'
}

/**
 * 地点标签位置 sanitize（2026-10-01 从 tagPosition 拆出）：只认合法枚举。
 * 旧 data.json 没有 locPosition → 回 'meta'（拆分前地点 pill 一直在 meta 行，
 * 升级后观感逐像素不变）。
 */
export function sanitizeLocPosition(value: unknown): LocationPosition {
  return value === 'bottom' ? 'bottom' : 'meta'
}

/** 视觉微调三档 sanitize：只认合法枚举，脏数据 / 旧 data.json 回 md（设计稿原值） */
export const sanitizeUiScale: (value: unknown) => UiScale = enumOr(UI_SCALES, 'md')

/** 卡片日期粒度 sanitize：脏数据 / 旧 data.json 回 auto（默认行为） */
export const sanitizeCardStamp: (value: unknown) => CardStamp = enumOr(CARD_STAMPS, 'auto')

/** 正文预热比例 sanitize：脏数据 / 旧 data.json 回 half（v0.9.13 起写死的行为） */
export const sanitizeWarmRatio: (value: unknown) => WarmRatio = enumOr(WARM_RATIOS, 'half')

/** 界面语言 sanitize：只认合法枚举，脏数据 / 旧 data.json 回 auto（跟随 Obsidian） */
export const sanitizeLangPref: (value: unknown) => LangPref = enumOr(LANG_PREFS, 'auto')

/**
 * 路径形态的第一道闸（BUG-112a）：带「根」的形态都不是 vault 相对路径——
 * 盘符（`C:/x`，含盘符相对 `C:x`）、前导 `/` 或 `\`（含 UNC `\\host`）、含 `\0`
 * （文件系统调用的非法字符）。段级纪律（`.` / `..` / 空段、扩展名白名单）
 * 由各自的 sanitizer 继续做：两处对「尾部分隔符折叠」的口径不同，不强行统一。
 * `sanitizeSettings` 的 `dir()` 与 `sanitizeBrandIconImage` 共用这一道。
 */
function hasPathRoot(value: string): boolean {
  return value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value) || value.includes('\0')
}

/**
 * 左上角自定义图标路径 sanitize：只收 **vault 内相对路径 + 白名单扩展名**，
 * 空串 = 用预设形状（合法值，不是脏数据）。
 *
 * 上传的写盘路径由 service.saveBrandIconImage 自己拼，一定是合法的；这里防的是
 * 手改 data.json / 盘面脏值：绝对路径（指向 vault 外）、`..` 段（逃出根目录）、
 * 非图片扩展名（渲染不出东西的行）一律回空串，宁可回预设也不挂一个死链。
 */
export function sanitizeBrandIconImage(value: unknown): string {
  if (typeof value !== 'string') return ''
  const path = value.trim()
  if (path === '' || path.length > 260) return ''
  if (hasPathRoot(path)) return ''
  const segs = path.split(/[\\/]+/)
  // 首 / 尾分隔符切出空段，一并拒（路径形状不干净；中间连续分隔符由下面的
  // join 归一化折叠——与 Obsidian normalizePath 同口径）
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return ''
  const ext = (path.includes('.') ? path.split('.').pop() : '')?.toLowerCase() ?? ''
  return BRAND_ICON_EXTS.includes(ext) ? segs.join('/') : ''
}

/**
 * 上传图标清单（v0.9.12 多图）：逐条过 sanitizeBrandIconImage（同一个路径
 * 尺子，不另写一套），丢脏项、按出现顺序去重、到 BRAND_ICONS_MAX 张收口。
 * 旧盘上没有这个键（那时只有 brandIconImage 一张图）→ 空清单，
 * 由 prefsFromDisk 把那张老路径补进来。
 */
export function sanitizeBrandIconImages(value: unknown): string[] {
  return uniqueList(
    value,
    (item) => {
      const path = sanitizeBrandIconImage(item)
      return path === '' ? null : path
    },
    BRAND_ICONS_MAX,
  )
}

/** 旧三档 → px 的对照（v0.9.1 的 styles.src 里那三个数）。认表不认公式：
 *  13.5 / 14.5 / 16 之间隔不相等（1.0 又 1.5），算出来的映射迟早和盘上的不一致。 */
const LEGACY_FONT_SIZE: Record<UiScale, number> = { sm: 13.5, md: 14.5, lg: 16 }
const LEGACY_CARD_RADIUS: Record<UiScale, number> = { sm: 10, md: 16, lg: 22 }

/**
 * 串是不是这张旧档对照表的**自有**键。不能用 `value in TABLE`：`in` 走原型链，
 * "constructor" / "toString" / "valueOf" / "__proto__" 都会命中 Object.prototype，
 * 于是 `LEGACY_FONT_SIZE['constructor']` 返回 Object 构造函数（`'__proto__'` 返回
 * Object.prototype 对象）并被断言成 number 原样流出——下游拼 CSS 变量得到
 * `--momo-ui-fs-body: function Object() { [native code] }px`，整条变量失效、
 * 字号悄悄回落默认，设置页滑杆跟着变 NaN%。手改 / 同步冲突后的 data.json 就能造出
 * 这种串，所以这一层必须自己挡住。
 */
function legacyTableHas(table: Record<string, unknown>, value: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, value)
}

/**
 * 正文字号（px）兜底：v0.9.12 起连续滑杆。
 *
 * **旧三档要无损迁过来**：老 data.json 存的是 'sm' / 'md' / 'lg' 字符串，
 * 直接按「非数字 → 默认」处理会把选了「大」的用户悄悄打回中档。那三个字符串
 * 各对应一个确切的 px（见 LEGACY_FONT_SIZE，正是 CARD_FONT_SIZE 区间的中间
 * 三点），所以枚举值认表里的数字值，其余按钳制收口——用户拖到哪就是哪，
 * 只有脏值才动。
 */
export function clampCardFontSize(value: unknown): number {
  if (typeof value === 'string' && legacyTableHas(LEGACY_FONT_SIZE, value)) {
    return LEGACY_FONT_SIZE[value as UiScale]
  }
  return clampNumber(value, CARD_FONT_SIZE.min, CARD_FONT_SIZE.max, CARD_FONT_SIZE.default, 0.5)
}

/** 卡片圆角（px）兜底：同 clampCardFontSize，旧三档见 LEGACY_CARD_RADIUS */
export function clampCardRadius(value: unknown): number {
  if (typeof value === 'string' && legacyTableHas(LEGACY_CARD_RADIUS, value)) {
    return LEGACY_CARD_RADIUS[value as UiScale]
  }
  return clampNumber(value, CARD_RADIUS.min, CARD_RADIUS.max, CARD_RADIUS.default)
}

/**
 * 「短首行作为标题」的标题字号（px）兜底：v0.9.12 新增的 pref，**没有旧值要迁**
 * （老盘上没这个键 → 默认 17，即升级前 `.momo-card > .momo-card-title` 用的字阶），
 * 所以只需要钳制 + 半 px 吸合。
 */
export function clampCardTitleSize(value: unknown): number {
  return clampNumber(value, CARD_TITLE_SIZE.min, CARD_TITLE_SIZE.max, CARD_TITLE_SIZE.default, 0.5)
}

/**
 * 「短首行作为标题」的字数上限兜底：v0.9.12 起可配（此前写死 32）。同样没有
 * 旧值要迁——老盘没这个键 → 32，行为与写死时逐字节一致。
 */
export function clampTitleMaxChars(value: unknown): number {
  return clampNumber(value, TITLE_MAX.min, TITLE_MAX.max, TITLE_MAX.default)
}

/**
 * data.json 里的目录设置兜底。三个静默故障都由脏值引起：
 * - 目录名写成空串 / 纯斜杠 → `normalizePath` 产出 `''`，`isMomoFile` 随之
 *   全部落空 → 插件不显示任何 Momo，且没有任何报错；
 * - 带 `..` 段的路径会指到 vault 外面；
 * - 绝对路径（`C:/Windows`、`/etc`、UNC）根本不是 vault 相对路径——
 *   Obsidian 的 adapter 不会因盘符重置 `path.join(basePath, p)`，会就地
 *   建出垃圾目录（BUG-112a，与 sanitizeBrandIconImage 收进同一道 hasPathRoot）。
 * 三者都退回默认值；其余原样保留（隐藏目录 `.trash` 仍由 service 的
 * migrateHiddenTrashDir 负责迁移，这里不拦）。
 */
export function sanitizeSettings(raw: Partial<MomoSettings> | undefined): MomoSettings {
  const merged = { ...DEFAULT_SETTINGS, ...raw }
  const dir = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback
    // 自备 normalizePath 的口径（本模块不能 import obsidian）：统一 `\`/`/`、
    // 收敛连续分隔符、去掉首尾分隔符。分段后再校验，`..` / `.` 才拦得干净。
    const trimmed = value.trim()
    if (hasPathRoot(trimmed)) return fallback
    const segs = trimmed.split(/[\\/]+/).filter((s) => s !== '')
    if (segs.length === 0 || segs.some((s) => s === '.' || s === '..')) return fallback
    return segs.join('/')
  }
  return {
    root: dir(merged.root, DEFAULT_SETTINGS.root),
    notesDir: dir(merged.notesDir, DEFAULT_SETTINGS.notesDir),
    attachmentsDir: dir(merged.attachmentsDir, DEFAULT_SETTINGS.attachmentsDir),
    trashDir: dir(merged.trashDir, DEFAULT_SETTINGS.trashDir),
    panelSide: merged.panelSide === 'left' ? 'left' : 'right',
  }
  // 注：notesDir 与 trashDir 重叠（写成同一个目录）会让 isMomoMdPath 把笔记目录
  // 整块判成回收目录 → 列表静默全空。那种重叠由调用方在**写盘前**处理
  //（service.saveSettings 走 D-06 的同一道 sanitize + 目录重叠校验），这里只做
  // 逐字段归一，不做跨字段裁决——它还得在 saveSettings 里给出「用户想改哪个」
  // 的优先级，纯函数里没有那个信息。
}

/**
 * data.json 里的软删登记兜底（与 prefs 各字段的 sanitize 同一套思路）。
 *
 * 此前 trash 是**原样信任盘面**的：data.json 被手改坏（`trash` 写成字符串 /
 * 数组、项不是对象）时，`init()` 的自愈循环会对非对象做
 * `delete this.data.trash[name]` —— 严格模式下对字符串下标 delete 抛
 * TypeError，整个 onload 失败、插件直接加载不了。这里按形状收敛一遍，
 * 非法项退回与 `listTrash` 缺登记时相同的空串形态。
 *
 * 键名 `__proto__` 要显式跳过：`JSON.parse` 会把它解析成**自有属性**，所以它确实
 * 能进到循环里；而 `out['__proto__'] = rec` 触发的是 Object.prototype 的
 * `__proto__` setter——记录被挂成 out 的原型而不是自有键，`Object.keys` /
 * `JSON.stringify` / init 的自愈循环都看不见它，这条登记连同 originalPath
 * 一起静默消失（恢复时只能回退到 notes 目录）。
 */
export function sanitizeTrash(raw: unknown): Record<string, TrashRecord> {
  return sanitizeTable<TrashRecord>(raw, (name, rec) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null
    const r = rec as Record<string, unknown>
    return [
      name,
      {
        originalPath: typeof r.originalPath === 'string' ? r.originalPath : '',
        deletedAt: typeof r.deletedAt === 'string' ? r.deletedAt : '',
      },
    ]
  })
}

/** 置顶清单的条数上限（与 BRAND_ICONS_MAX 同一类纪律）：脏 data.json / 旧版本
 *  异常写入可能塞进成千上万条，没上限的话每次加载原样进内存、每次 persist 原样
 *  写回，data.json 体积与侧栏渲染一起劣化，且 load→save 循环无人收口。 */
export const PINNED_NOTES_MAX = 500

/**
 * 置顶笔记（v0.8.3）：只收非空字符串、按路径去重、**保持先后**（顺序就是展示顺序）。
 * 脏数据 / 旧 data.json（没这个字段）一律回空数组——不置顶任何东西，行为与升级前一致。
 */
export function sanitizePinnedNotes(value: unknown): string[] {
  return uniqueList(
    value,
    (item) => (typeof item === 'string' ? (item.trim() || null) : null),
    PINNED_NOTES_MAX,
  )
}

/** 置顶标签的归一：剃非法项、按身份键去重、保留原样大小写（顺序即展示顺序） */
export function normalizePinnedTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return normalizeTags(value.filter((t): t is string => typeof t === 'string')).map(tagKey)
}

/** 用户手填地点坐标的条数上限（与 PINNED_NOTES_MAX 同一类纪律）：地点名本身受
 *  normalizeLocations 的 ≤20 字约束，但全库去重后的地点仍可能成百上千，没上限的
 *  话每次加载原样进内存、每次 persist 原样写回，data.json 体积只增不减。 */
export const LOC_COORDS_MAX = 500

/**
 * 用户手填的地点坐标（F7 星球视图，v0.9.25）：只保留「非空地点名 → 合法经纬度」
 * 的项。三道闸门与 sanitizeSeen / sanitizeTrash 同一套思路：
 * - 数组 / 非对象一律回空（`Object.entries(['a'])` 会把下标 "0" 当键）；
 * - `__proto__` / 空名跳过（JSON.parse 会把它解析成自有键，直接赋值又会命中
 *   setter 而静默丢失，见 sanitizeTrash 的同类注释）；
 * - 值过 isValidLatLon（形状 / NaN / 越界都算脏），并**吸合到两位小数**——
 *   精度口径见 locations/locCoords.ts 文件头（≈1km 级，锚点足够；秒级的输入成本不值）。
 * 脏项**整条丢**而不是整表作废：手改 data.json 改坏一行，不该让其他地点连坐。
 * 旧 data.json 没有这个键 → 空映射（无手填，星球只用内置字典）。
 */
export function sanitizeLocCoords(value: unknown): Record<string, LatLon> {
  return sanitizeTable<LatLon>(
    value,
    (name, coord) => {
      if (!isValidLatLon(coord)) return null
      return [name, [Math.round(coord[0] * 100) / 100, Math.round(coord[1] * 100) / 100]]
    },
    LOC_COORDS_MAX,
  )
}

/** 用户手填地点大洲 / 国家的条数上限：与 LOC_COORDS_MAX 同一条纪律（见那边注释） */
export const LOC_REGIONS_MAX = 500

/**
 * 用户手填的地点大洲 / 国家（v0.9.30）：只保留「非空地点名 → 合法大洲 / 国家对」
 * 的项。与 sanitizeLocCoords 同一套思路（脏项整条丢，不连坐），三处差别：
 * - 值过 isValidLocRegion（两项都得是字符串），并**逐项 trim**；
 * - 两项全空的项**整条丢**（等于没填，留着只会让设置页多一行空行）；
 * - **两项同值的项整条丢**（如 `['中国', '中国']`）：把国家名同时填进大洲那一格
 *   是脏输入，`country` 档会产出与内置 `'亚洲\u0000中国'` 不一致的一节组键
 *   `'中国'`，把同一国家拆成两个组头（BUG-71b）。与「两项全空」同一种处置，
 *   该地点回落到内置字典或无归属；
 * - 不设「至少填一项」的闸——只填大洲（`['亚洲', '']`）是合法输入：那一级
 *   分组时国家环被跳过，见 locations/locations.ts 的 locPartsOf。
 */
export function sanitizeLocRegions(value: unknown): Record<string, LocRegion> {
  return sanitizeTable<LocRegion>(
    value,
    (name, region) => {
      if (!isValidLocRegion(region)) return null
      const continent = region[0].trim()
      const country = region[1].trim()
      if (continent === '' && country === '') return null
      // 两项同值 = 脏输入（国家占了大洲那一格），整条丢；见上方注释。
      if (continent !== '' && continent === country) return null
      return [name, [continent, country]]
    },
    LOC_REGIONS_MAX,
  )
}

/** 地点层级的归一：白名单外（含脏值 / 缺省）一律回默认档 `name`（= 升级前 + 前缀） */
export const sanitizeLocLevel: (value: unknown) => LocLevel = enumOr(LOC_LEVELS, DEFAULT_LOC_LEVEL)

/** 侧栏「全部地点」树展开方式的归一：白名单外（含脏值 / 缺省）一律回 `all`
 *  （全展开不画 twisty = 升级前那棵树的行为，老盘读侧零变化） */
export const sanitizeLocTreeExpand: (value: unknown) => LocTreeExpand = enumOr(
  LOC_TREE_EXPANDS,
  DEFAULT_LOC_TREE_EXPAND,
)

/** 星球外观的归一（2026-10-05）：白名单外（含脏值 / 缺省）一律回 `night`。
 *  不大小写宽容、不接受同义词——`'Day'` / `'sun'` 都算脏值回默认：宁可画夜地球，
 *  也不要因为一个手改的字符串让球在「有图 / 没图」之间摇摆。 */
export const sanitizeGlobeEarth: (value: unknown) => GlobeEarth = enumOr(GLOBE_EARTHS, DEFAULT_GLOBE_EARTH)

/** 可覆写的语义图标名集合（sanitize 的键白名单；37 个，leaf 品牌位不在内） */
const ICON_OVERRIDE_KEYS: ReadonlySet<string> = new Set<string>(CONFIGURABLE_ICON_NAMES)

/**
 * 语义图标覆写表的归一（v0.9.36「每个图标可配置」）：只保留
 * 「合法语义名 → 库里存在的 id」的项。与 sanitizeLocCoords / sanitizeSeen
 * 同一套思路（三道闸门），三处差别：
 * - **键也要过白名单**：合法键只有 CONFIGURABLE_ICON_NAMES（37 个，`leaf`
 *   品牌位有自己的配置体系，不进本系统）；`__proto__` / 空名自然被挡；
 * - **值过 LUCIDE_ID_SET**：库里没有的 id（手改 / 版本升级后图标被改名）
 *   整条丢——留着会让渲染侧拿到一枚没有形状的空洞（iconPaths 的兜底是
 *   回落原形，但盘上留脏值只会让「恢复默认」之类的判断变糊涂）；
 * - 脏项**整条丢**而不是整表作废：用户配置 37 枚，手改坏一枚不该让其他 36 枚连坐。
 *
 * 稀疏表天然有上限（≤37 条），不需要额外计数截断。旧 data.json 没有这个键
 * → 空表（全 Momo 原形，升级后界面逐像素不变）。
 */
export function sanitizeIconOverrides(value: unknown): IconOverrides {
  return sanitizeTable<string>(value, (name, id) => {
    if (!ICON_OVERRIDE_KEYS.has(name)) return null
    if (typeof id !== 'string' || !LUCIDE_ID_SET.has(id)) return null
    return [name, id]
  })
}
