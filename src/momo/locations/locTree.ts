import { locFullKey, locNodeCovers, type LocView } from './locations'
import { displayLocName } from './locDisplay'
import type { LocRegion } from './locRegions'
import type { MomoEntry } from '../types'

// 地点层级树（「地点名前加大洲和国家」二期，v0.9.31「选中即过滤」）：
// **大洲 → 国家 → 城市**三级树，消费者是侧栏「全部地点」区块（v0.9.31 ④ 起，
// 过滤入口从顶栏跳转浮层搬来）。纯函数 + 纯数据，不碰文件、不 import obsidian（momo/ 层红线）。
//
// 三件事与别处对齐：
// ① **节点键 = 完整路径的前缀段**（`亚洲\u0000中国`）：与分组流的组键同一把
//   尺子（locations.ts 的 KEY_SEP / locNodeCovers），所以「选中中国」在 name /
//    country / continent 三档下都过滤得动；
// ② **查不到归属的地点按地名自成顶级节点**（`外婆家` 就是 depth 0）：与分组流
//    「不造未知大洲」同一条裁决（v0.9.27）——树里没有「未知 / 其他」这种占位叶，
//    「没数据」不被伪装成「有数据」；
// ③ **计数口径 = 覆盖的条目数（去重）**：与组头条数同一个数，否则侧栏树点过去
//    条数会对不上。
//
// 树**不随 locLevel 档位变形**：它恒是完整三级。locLevel 只管分组流怎么并组、
// 组头写多长；树管「从哪儿筛」。两个维度正交，混在一起会让「选大洲」在国家档
// 下点不到城市。

/** 树的一个节点。`count` = 路径落在该节点下的**条目数**（去重） */
export interface LocTreeNode {
  /** 路径键（`\u0000` 连接的前缀段）——**恒是规范形**，比对 / 过滤 / 落盘全靠它 */
  key: string
  /** 该级**显示名**（单段，不是路径；2026-10-06 起按当前界面语言，见
   *  `displayLocName`）。键与名分开：切语言只改这一个字段，`key` 一个字不动。 */
  label: string
  /** 0 = 大洲 / 顶级地名，1 = 国家，2 = 城市 */
  depth: 0 | 1 | 2
  count: number
  children: LocTreeNode[]
}

/** 节点排序：条数降序、同数按显示名（与分组流组排序同口径——用户看见的是名） */
function byCountThenLabel<T extends { count: number; label: string }>(a: T, b: T): number {
  return b.count - a.count || a.label.localeCompare(b.label)
}

/**
 * 建地点层级树。`entries` = 当前语料（通常是筛选 + 排序后的命中集；**不含**
 * 地点过滤本身——选中一个节点后树还得是完整的，否则侧栏树会越筛越窄），
 * `regions` = 用户手填的大洲 / 国家（prefs.locRegions，压过内置字典）。
 *
 * depth 的退化：只填了大洲没填国家的地点挂在 depth 1（国家位）——它的路径
 * 只有两节，缩进比「正常城市」浅一级。罕见（手填半边归属才会出现），按路径
 * 本身的长度走，不为它发明「半级」。
 */
export function buildLocTree(
  entries: readonly MomoEntry[],
  regions?: Readonly<Record<string, LocRegion>> | null,
): LocTreeNode[] {
  interface Node {
    key: string
    label: string
    depth: 0 | 1 | 2
    /** 落到本节点的条目下标（去重后即 count） */
    seen: Set<number>
    children: Map<string, Node>
  }
  const roots = new Map<string, Node>()

  // Q4：一次重建内每个唯一地名只查一次归属链（locFullKey → regionOfLocation →
  // userKeyOf 三级，见 locations.ts）——照 groupByLocation 的 infoOf（BUG-58）手法
  // 收重复付账。局部 Map：regions 换引用（语言 / 归属表更新）后整次重建重开，天然失效。
  const partsCache = new Map<string, string[]>()

  entries.forEach((e, idx) => {
    // `locations` 缺省 = 空数组：盘上来的条目都被 service 归一过，但绕过 service
    // 直灌 store 的路径（测试夹具、将来的 store 种子数据）可能没有这个字段。
    // 这棵树 2026-10-01 晚起**每次挂载都建**（侧栏「全部地点」常驻），
    // 所以一条脏数据必须是「这篇没有地点」，而不是让整个面板白屏——
    // 与 LocationPills 的 `locations = []` 同一条兜空理由。
    for (const loc of e.locations ?? []) {
      // 完整路径（name 档）：缺的环跳过，所以路径可能是 1~3 节。parts 只读共享
      let parts = partsCache.get(loc)
      if (!parts) {
        parts = locFullKey(loc, regions).split('\u0000').filter((p) => p !== '')
        partsCache.set(loc, parts)
      }
      let level = roots
      let path = ''
      for (let d = 0; d < parts.length; d++) {
        path = d === 0 ? parts[d] : `${path}\u0000${parts[d]}`
        let node = level.get(path)
        if (!node) {
          // 键用规范形 `path`，名过一遍 displayLocName（大洲 / 国家 / 地名三级同一条
          // 规则）。⚠️ 它让这棵树的输出带上了语言 → **memo 的依赖里必须有 `lang`**
          // （useListDerivations 的 locTree 已补，见 locations.ts 的 locGroupOf
          // 文件头那张清单），否则切语言后侧栏树停在旧语言。
          node = { key: path, label: displayLocName(parts[d]), depth: d as 0 | 1 | 2, seen: new Set(), children: new Map() }
          level.set(path, node)
        }
        node.seen.add(idx)
        level = node.children
      }
    }
  })

  const toTree = (map: Map<string, Node>): LocTreeNode[] =>
    [...map.values()]
      .map((n) => ({
        key: n.key,
        label: n.label,
        depth: n.depth,
        count: n.seen.size,
        children: toTree(n.children),
      }))
      .sort(byCountThenLabel)

  return toTree(roots)
}

// ---- 侧栏树的层级过滤（「只看这几级」，2026-10-01；2026-10-10 起多选）----

/** 侧栏「全部地点」树的层级过滤档位：`all` = 完整三级树（缺省，不过滤）；
 *  其余三档 = **只显示这一级**的节点。 */
export type LocTreeLevel = 'all' | 'continent' | 'country' | 'place'

/** 四档的全序（浮层 chips 的顺序就是它；缺省 = 第一档 all） */
export const LOC_TREE_LEVELS: readonly LocTreeLevel[] = ['all', 'continent', 'country', 'place']

/**
 * 档位**集合**（2026-10-10 多选）：store 的 `locTreeLevels` 存的就是它。
 * `['all']`（或空集）= 完整三级树；其余 = 勾中的那几级。
 */
export type LocTreeLevels = readonly LocTreeLevel[]

/** 侧栏树的层级过滤默认档（store 初值）：完整三级树，与 LOC_TREE_LEVELS 第一档一致 */
export const DEFAULT_LOC_TREE_LEVELS: LocTreeLevels = ['all']

/** 档位 → 树上的哪一级（depth；`all` 不在表里：它不裁树，原样返回） */
const LEVEL_OF_DEPTH: Record<Exclude<LocTreeLevel, 'all'>, LocTreeNode['depth']> = {
  continent: 0,
  country: 1,
  place: 2,
}

/**
 * 规范化档位集合：去重 + 按 `LOC_TREE_LEVELS` 的全序排序（store 里存的值因此
 * 恒可预测，测试与 UI 都不用管用户点击的先后）。**空集与含 `all` 都归一成
 * `['all']`**——「一级都没勾」= 回到完整树（筛选 chip 的常例：没有条件就是全部），
 * 而 `all` 本来就等于「全都要」，与具体级混存时以它为准。
 */
export function normalizeLocTreeLevels(levels: LocTreeLevels): LocTreeLevels {
  const picked = new Set(levels)
  if (picked.size === 0 || picked.has('all')) return DEFAULT_LOC_TREE_LEVELS
  return LOC_TREE_LEVELS.filter((v) => picked.has(v))
}

/**
 * 按层级过滤侧栏地点树（纯函数，2026-10-10 起**多选**）：`levels` = 勾了的级
 * （先过 `normalizeLocTreeLevels`；`['all']` / 空集 → 原样**复制**一份完整树返回，
 * 不返同一个引用，调用方改不坏原数组）。否则**只保留勾中的级，树形照旧**：
 * 没勾的级整级收走，它的子孙直接顶到父级的位置——选「大洲 + 地点」时亚洲下面
 * 直接是北京 / 上海，中间的国家那一级不见了（选「国家 + 地点」则大洲收走、
 * 国家升成根）。
 *
 * 四条边界（改前先读，都与既有裁决对齐）：
 * ① **只动侧栏这棵树**：不碰分组流、不碰 `prefs.locLevel`（那个管主区并组口径，
 *    见文件头「树不随 locLevel 档位变形」——两个维度正交，混了会让「选大洲」
 *    在国家档下点不到城市）；
 * ② **不清 filterLocations**：已选节点在当下档位不可见时（筛着「中国」却只看
 *    大洲）侧栏没有选中行可看，但主区仍筛着——过滤是会话态，跨档位保留；
 * ③ 无归属的顶级地名（「外婆家」，depth 0）只在 `all` / `continent` 两档出现，
 *    按 depth 本身走，不为它发明「半级」（与 buildLocTree 的 depth 退化同一条裁决）；
 * ④ 顺序 = 原树的文档序（buildLocTree 的条数降序 + 同数按名），收走一级不重排。
 *
 * 与 2026-10-10 之前的单选版关系：单元素集合（`['place']` 等）的输出与旧
 * `filterLocTreeByLevel` **逐个字段相同**（该级节点、children 剥空）——多选是
 * 它的推广，不是改写；那一版的测试原样搬过来仍成立。
 */
export function filterLocTreeByLevels(
  nodes: readonly LocTreeNode[],
  levels: LocTreeLevels,
): LocTreeNode[] {
  const picked = normalizeLocTreeLevels(levels)
  if (picked.includes('all')) return [...nodes]
  const want = new Set<LocTreeNode['depth']>()
  for (const v of picked) {
    if (v === 'all') continue
    want.add(LEVEL_OF_DEPTH[v])
  }
  /** 保留勾中的级；没勾的级不造节点，把它的幸存子孙顶上来 */
  const keep = (list: readonly LocTreeNode[]): LocTreeNode[] => {
    const out: LocTreeNode[] = []
    for (const n of list) {
      const kids = keep(n.children)
      if (want.has(n.depth)) out.push({ ...n, children: kids })
      else out.push(...kids)
    }
    return out
  }
  return keep(nodes)
}

/**
 * 条目是否落在节点 `nodeKey` 下（`nodeKey` = null 表示「全部」= 不过滤）。
 * 「选中即过滤」在数据层的判定：entry 只要有**任一个**地点的完整路径被该节点
 * 覆盖就算命中（多地点条目在哪个节点的地盘里就归哪儿，与分组流「一条进 N 个组」
 * 同一条语义）。
 */
export function entryAtLocNode(
  entry: MomoEntry,
  nodeKey: string | null,
  regions?: Readonly<Record<string, LocRegion>> | null,
): boolean {
  if (nodeKey === null) return true
  for (const loc of entry.locations) {
    if (locNodeCovers(nodeKey, locFullKey(loc, regions))) return true
  }
  return false
}

/** 层级视角的便捷别名（调用方手里通常是 `{ level, regions }` 一整个） */
export function entriesAtLocNode(
  entries: readonly MomoEntry[],
  nodeKey: string | null,
  view?: LocView,
): MomoEntry[] {
  if (nodeKey === null) return [...entries]
  return entries.filter((e) => entryAtLocNode(e, nodeKey, view?.regions))
}
