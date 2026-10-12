import { getLocale } from '../../../momo/i18n'
import { canonicalLocName, locGroupOf, rosterMatches } from '../../../momo/locations'
import type { LocView } from '../../../momo/locations'
import type { MomoEntry } from '../../../momo/types'

// 地点弹层的**候选行计算**（纯函数：entries + 选中路径 → 展示行）。
// 与 tagPicker/rows.ts 同一分工：行怎么算在 rows，交互与渲染在组件。
//
// 两处入口共用这一份（F6 §编辑与批量：「两处入口同一套列表组件，行序 = 组排序」）：
// 单卡编辑弹层与批量「设地点」。
//
// v0.9.30 层级适配：行文字 = 该地点在当前档位下的**路径标签**（`亚洲 · 中国 ·
// 北京`；粗档下同组的不同地点标签会重复，靠排序与条数区分），而行内一切身份
// （勾选、写入、pending 队列）仍是**地名本身**——地点是 frontmatter 里的内容，
// 弹层改的是内容不是视图。过滤也按地名匹配（输入即精确，不做路径匹配）。

/** 候选最多渲染多少行（地点极多时别一次铺满 DOM；过滤仍作用在全集上） */
export const MAX_ROWS = 60

/** 名册建议最多补多少行（库外城市的建议是补充不是接管，一段就够扫） */
export const MAX_ROSTER_ROWS = 8

/** 弹层模式：加地点 / 摘地点 */
export type LocPickerMode = 'add' | 'remove'

/** 渲染用的候选行（两种模式归一成同一形状，只有一处行渲染） */
export interface LocRow {
  /** 地名（entries 读侧已是**身份**形：纽约 / New York 合并成「纽约」）。
   *  勾选 / 写入 / pending 的比较都过 canonicalLocName 按身份算 */
  location: string
  /** 行文字：该地点在 view 档位下的路径（`亚洲 · 中国 · 北京`） */
  label: string
  /** 选中（或单卡那一篇）Momo 里真的带这个地点的条数 */
  hit: number
  /** 全库条数 = 这一组的组条数（与分组流组头同一个数；批量弹层右列与行序都用它） */
  total: number
  /** 名册行（库外城市，v1 名册化）：右列不显示计数、行前有小标题隔开 */
  roster?: boolean
}

/** Q2：path→entry 索引按 entries **引用**缓存（同下方 locationCounts 手法）：
 *  App 的 locRemovable 随每次勾选重跑（toggleSelected 换新 Set），全库 Map
 *  不该跟着一次勾选重建一遍。entries 只在 refresh 时换引用，缓存即数据一致。 */
const byPathCache = new WeakMap<readonly MomoEntry[], Map<string, MomoEntry>>()

/** 选中路径 → 索引投影（选中的 path 一定在 entries 里，这里只是防御）。
 *  入参吃 Iterable：调用方有的是路径数组（弹层快照）、有的是选中集（store 的
 *  Set，批量条「移除地点」的置灰判据）——两种都是「一批路径」，不值当各写一份。 */
export function pickedLocEntries(entries: readonly MomoEntry[], selected: Iterable<string>): MomoEntry[] {
  let idx = byPathCache.get(entries)
  if (!idx) {
    idx = new Map(entries.map((e) => [e.path, e]))
    byPathCache.set(entries, idx)
  }
  return [...selected].map((p) => idx!.get(p)).filter((e): e is MomoEntry => e !== undefined)
}

/**
 * 全库地点计数表（地名 → 带这个地点的笔记条数）。
 * 一篇有 N 个地点就在 N 个地名下各计一次——与 groupByLocation 的分组条数同一个数，
 * 弹层行序因此能和分组流对得上。
 *
 * 按 `entries` 数组**引用**缓存（WeakMap，同 store/caches.ts 的手法）：两个弹层都在
 * 渲染路径上调它（每次击键一次），而 entries 只在 refresh 时换引用——O(N×L) 的表
 * 不该跟着输入框里的一个字重算。
 */
const countsCache = new WeakMap<readonly MomoEntry[], Map<string, number>>()

export function locationCounts(entries: readonly MomoEntry[]): Map<string, number> {
  const hit = countsCache.get(entries)
  if (hit) return hit
  const m = new Map<string, number>()
  for (const e of entries) {
    for (const loc of e.locations) m.set(loc, (m.get(loc) ?? 0) + 1)
  }
  countsCache.set(entries, m)
  return m
}

/**
 * 候选行：
 * - **去模式**：只列选中 Momo 身上**真的有**的地点（hit > 0）。列全库地点毫无意义——
 *   这批 Momo 没有的地点，摘它是空操作；真要点名的目标地点直接搜。
 * - **加模式**：全库地点（可新建），搜索词非空时末尾追加**名册建议**（locRoster，
 *   中 / 英 / 日任一语言名命中即出；库名册里已有的地点自动去重）。
 * 两种模式的**行序都按组排序**（全库条数降序、同数 localeCompare，F6 明文）：
 * 用户在分组流里看到的顺序就是这里的顺序， muscle memory 直接复用。名册段接在
 * 库行之后、不参与这条排序（它没有条数可言，行前有小标题隔开）。
 *
 * 过滤是**精确子串、大小写敏感**（F6「拼音 / 首字母过滤不做：输入即精确匹配」）：
 * 没有拼音与首字母匹配，输入对不上就是没有，回车新建——这条路比猜用户想搜什么可靠。
 * 名册那段的匹配口径是它自己的（ASCII 不分大小写、三语名都参与，见 rosterMatches），
 * 比库过滤宽——名册的建议本来就 「替你想名字」，太严就失去意义。
 * `view` 只决定行文字（路径标签），不参与过滤。
 */
export function candidateLocRows(
  entries: readonly MomoEntry[],
  picked: readonly MomoEntry[],
  isRemove: boolean,
  query: string,
  view: LocView = { level: 'name' },
): LocRow[] {
  const counts = locationCounts(entries)
  const hitMap = new Map<string, number>()
  for (const e of picked) {
    for (const loc of e.locations) hitMap.set(loc, (hitMap.get(loc) ?? 0) + 1)
  }
  const q = query.trim()
  // 先过滤（精确子串，便宜），再**先截断后 localeCompare**：全量逐对起 Intl 排序器
  // 在数千独立地名的大库里每次击键都可感（sort.ts 头注的警告）。先用定宽比较
  // （条数降序）选出展示集，最后只给 ≤60 行做 localeCompare 定同数次序；
  // 候选不超一屏时两段与原来的全量排序等价（BUG-71c）。
  const candidates = [...counts.keys()]
    .filter((location) => !isRemove || (hitMap.get(location) ?? 0) > 0)
    .filter((location) => q === '' || location.includes(q))
  const shown =
    candidates.length <= MAX_ROWS
      ? candidates
      : candidates.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)).slice(0, MAX_ROWS)
  // 留下哪些行之后再排最终序并算路径 label：locGroupOf 每行都要查归属字典 + 拼字符串，
  // 给被 slice 掉的行算是白付的。
  const rows = shown
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
    .map((location) => ({
      location,
      label: locGroupOf(location, view).label,
      hit: hitMap.get(location) ?? 0,
      total: counts.get(location) ?? 0,
    }))
  return isRemove || q === '' ? rows : [...rows, ...rosterRows(q, counts, view)]
}

/**
 * 名册建议段（加模式 + 搜索词非空才出现，见 candidateLocRows）：按当前界面语言
 * 的写法落笔（zh 界面选「Tok」得「东京」，en 界面得「Tokyo」，ja 界面得「東京」；
 * 整词照抄用户打的字——写「東京」进「東京」）。已在库里的地点不再重复出
 * （它已经在库段里了）。
 */
function rosterRows(q: string, counts: Map<string, number>, view: LocView): LocRow[] {
  const out: LocRow[] = []
  for (const { location } of rosterMatches(q, getLocale(), MAX_ROSTER_ROWS)) {
    // BUG-166：去重按**身份**（canonicalLocName），不是精确串。counts 的键是
    // `e.locations`——读侧已过 locationsOf 身份折叠，装的是规范名（「纽约」）；
    // 而 rosterMatches 按当前界面语言落笔（en 界面「New York」）。精确串比永远
    // 不命中 → 库里的地点在名册段重复出现，而单卡弹层点那一行按身份比较是勾上
    // 的、执行的是摘除（LocEditPop.toggle 的 has 分支）。同文件的 isKnownLocation
    // 一直过 canonicalLocName，两把尺子在这里对齐。
    const id = canonicalLocName(location)
    if (id !== '' && counts.has(id)) continue
    if (out.some((r) => r.location === location)) continue
    out.push({ location, label: locGroupOf(location, view).label, hit: 0, total: 0, roster: true })
  }
  return out
}

/**
 * 输入串是否已是库里的地点（决定要不要显示「新建 X」行 / 回车是新建还是切换）。
 * **早退扫描、不建表**：调用点在两个弹层的渲染路径上（每次按键都跑），
 * 为一次 `.has()` 重建全库计数表（locationCounts，O(N×L) + 一次 Map 分配）
 * 是白付的代价；命中通常前几行就中，未命中才扫全库。匹配按**身份**
 * （BUG-110a：canonicalLocName——打「New York」时库里的「纽约」就算已有，
 * 不会给出一个重复的「新建 New York」）。
 */
export function isKnownLocation(entries: readonly MomoEntry[], typed: string): boolean {
  const id = canonicalLocName(typed.trim())
  if (id === '') return false
  for (const e of entries) {
    for (const l of e.locations) {
      if (l === id || canonicalLocName(l) === id) return true
    }
  }
  return false
}
