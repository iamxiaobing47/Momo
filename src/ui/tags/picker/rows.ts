import { canonicalTagPath, tagKey } from '../../../momo/tags'
import { suggestScore } from '../../../momo/tags'
import { cooccurrenceOf, tagNodeMapOf } from '../../../momo/tags'
import type { MomoEntry } from '../../../momo/types'

// 批量标签弹层的**候选行计算**（纯函数：entries + 选中路径 → 展示行）。
// 抽出来是为了让「哪种模式列哪些标签、按什么排序」可以单独看——弹层组件本身
// 只管交互与渲染。

/** 候选最多渲染多少行（标签极多时别一次铺满 DOM；过滤仍作用在全集上） */
export const MAX_ROWS = 60

/** 弹层模式：追加标签 / 摘掉标签 */
export type TagPickerMode = 'add' | 'remove'

/** 渲染用的候选行（两种模式归一成同一形状，只有行渲染一处） */
export interface Row {
  /** 身份键（规范路径小写） */
  key: string
  /** 显示路径（该键下首次出现的原样写法） */
  path: string
  /** 选中 Momo 里**真的带这个标签**的条数（精确身份键，见组件文件头的口径说明） */
  hit: number
  /** 只有子级、本层无直属 Momo（虚拟父节点） */
  virtual: boolean
  /** 共现建议分（只影响加模式的排序，不参与任何写入判定） */
  score: number
}

/**
 * 选中路径 → 索引投影（选中的 path 一定在 entries 里，这里只是防御）。
 */
export function pickedEntries(entries: readonly MomoEntry[], selected: readonly string[]): MomoEntry[] {
  const byPath = new Map(entries.map((e) => [e.path, e]))
  return selected.map((p) => byPath.get(p)).filter((e): e is MomoEntry => e !== undefined)
}

/** 输入框里的词 → 归一化检索词（剃前导 #、小写；去模式不新建标签，只用它过滤） */
export function queryOf(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase()
}

/**
 * 候选行：
 * - **去模式**：候选就是这批 Momo 身上的标签并集（按命中条数倒序）。列全库标签毫无意义——
 *   这批 Momo 没有的标签，移除它是空操作；真要点名的目标标签直接搜。
 *   虚拟父节点在这里没有意义：一个标签要么真的写在某条 Momo 上，要么不在候选里。
 * - **加模式**：全库标签树（可新建 `父/子`），按共现建议 + 子树条数排序（ADR-005 第 4 项）。
 */
export function candidateRows(
  entries: readonly MomoEntry[],
  picked: readonly MomoEntry[],
  isRemove: boolean,
  query: string,
): Row[] {
  // 标签树 = 与侧栏同一棵（身份键 → 节点），走 derived 的共享缓存（工单 WO-3）
  const tree = tagNodeMapOf(entries)
  // 共现索引（全库）——候选「建议排序」的依据，与侧栏「洞察」共用同一份缓存
  const cooc = cooccurrenceOf(entries)
  /** 选中 Momo 已有的标签身份键并集：建议分 = 候选与它们的共现支持度 */
  const pickedKeys = new Set(picked.flatMap((e) => e.tags.map(tagKey)))

  /**
   * 选中 Momo 的标签命中表（身份键 → 命中条数 + 首次出现的原样写法）。
   * 一张表同时供两种模式使用：加模式看「还没含的条数」（picked.length - hit），
   * 去模式**直接就是候选集合**（只有 hit > 0 的标签才可能被摘掉）。
   * 显示路径取首次出现的原样写法（与侧栏标签树、卡片 chip 同一规则，ADR-004）；
   * 一个 Momo 的 tags 本身已去重，所以按条累加即可。
   */
  const hitMap = new Map<string, { hit: number; path: string }>()
  for (const e of picked) {
    for (const t of e.tags) {
      const k = tagKey(t)
      if (!k) continue
      const prev = hitMap.get(k)
      if (prev) prev.hit++
      else hitMap.set(k, { hit: 1, path: canonicalTagPath(t) })
    }
  }

  const q = queryOf(query)
  const all: Row[] = isRemove
    ? [...hitMap.entries()].map(([key, v]) => ({ key, path: v.path, hit: v.hit, virtual: false, score: 0 }))
    : [...tree.values()].map((node) => ({
        key: node.key,
        path: node.displayPath,
        hit: hitMap.get(node.key)?.hit ?? 0,
        virtual: node.isVirtual,
        score: suggestScore(cooc, node.key, pickedKeys),
      }))
  // 先过滤（便宜），再用定宽比较选出展示集，最后只给 ≤60 行 localeCompare：
  // 全量逐对起 Intl 排序器在标签极多的库里每次击键都可感（core/sort.ts 头注的警告）。
  // 候选不超一屏时两段与原来的全量排序等价（BUG-71c，与 locPicker/rows.ts 同形）。
  const filtered = all.filter((r) => !q || r.key.includes(q))
  const cheap = isRemove
    ? (a: Row, b: Row): number => b.hit - a.hit
    : (a: Row, b: Row): number => b.score - a.score || b.hit - a.hit
  const shown = filtered.length <= MAX_ROWS ? filtered : filtered.sort(cheap).slice(0, MAX_ROWS)
  return shown.sort((a, b) => {
    if (isRemove) return b.hit - a.hit || a.key.localeCompare(b.key)
    return b.score - a.score || b.hit - a.hit || a.key.localeCompare(b.key)
  })
}
