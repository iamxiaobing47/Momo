import { canonicalTagPath, hasImageMarkdown, tagKey } from './parse'
import type { MomoEntry } from '../types'

// 标签树（ADR-004 / concept-momo-tags）：由条目上的扁平标签路径**运行时派生**，
// 不物化到文件、不写回 frontmatter。纯函数、不 import obsidian —— ui/ 与 momo/ 都能用。
//
// 口径要点：
// - 唯一键是**身份键**（规范路径的小写形式）；显示用**首次出现**的原样写法。
// - 祖先节点可以是 isVirtual（没有直属笔记，只因后代而存在）。
// - totalCount 按**条目去重**，与「点该节点后的卡片数」严格相等。

export interface TagNode {
  /** 身份键：规范路径的小写形式，树的唯一键 */
  key: string
  /** 显示路径：该身份键下首次出现的原样大小写写法 */
  displayPath: string
  /** 本段显示名（`displayPath` 的最后一段） */
  name: string
  /** 层级，从 1 起 */
  depth: number
  /** 直属条目数：该身份键作为标签真实出现在多少条 Momo 里 */
  ownCount: number
  /** 子树合计条目数（按条目去重）：与点该节点后的卡片数严格相等 */
  totalCount: number
  /**
   * 子树内正文含图的 Momo 条数（按条目去重，口径同 totalCount）。
   * 「含图」的判定与统计页同源：parse.ts 的 hasImageMarkdown。
   */
  withImageCount: number
  /** 无直属条目、仅因后代而存在的中间节点 */
  isVirtual: boolean
  children: TagNode[]
}

const byCreatedAtAsc = (a: MomoEntry, b: MomoEntry) => a.createdAt.localeCompare(b.createdAt)

/** 身份键的全部前缀（含自身）：`a/b/c` → `[a, a/b, a/b/c]`。
 *  公开给筛选管道（BUG-110c 起逐条目算保留键集时收这条链），
 *  内部计数遍也用它——同一把尺子只有这一处定义。 */
export function tagKeyPrefixes(key: string): string[] {
  const segs = key.split('/')
  const out: string[] = []
  for (let i = 1; i <= segs.length; i++) out.push(segs.slice(0, i).join('/'))
  return out
}

/**
 * 调用计数（仅给性能守卫用）：每次 `buildTagTree` 自增一次。
 * AGENTS.md §4.1 要求「一个 `computeStats()` 调用内只构建一次树」——这条红线没有
 * 语言级表达方式，由 `scripts/perf-guard.test.mts` 读这两个函数做断言。
 * 生产代码只付一次自增的代价，行为不变。
 */
let buildTagTreeCallCount = 0

/** 当前进程内 `buildTagTree` 的累计调用次数 */
export function buildTagTreeCalls(): number {
  return buildTagTreeCallCount
}

/** 计数清零（守卫用例之间调用；生产代码不需要） */
export function resetBuildTagTreeCalls(): void {
  buildTagTreeCallCount = 0
}

/** 由 Momo 集合构建标签树（同级按子树条目数倒序，并列按显示名） */
export function buildTagTree(entries: readonly MomoEntry[]): TagNode[] {
  buildTagTreeCallCount += 1
  const byKey = new Map<string, TagNode>()
  const roots: TagNode[] = []

  // 1) 每条目的身份键（按出现序去重，带首次出现的原样写法）——**一遍算清**，
  //    后面的显示遍与计数遍共用。旧实现在显示遍调一次 tagKey、计数遍再
  //    `new Set(e.tags.map(tagKey))` 调第二次（每条目还多分配一个数组 + 一个 Set），
  //    @10k 下这是 buildTagTree 19.6ms 的大头之一。
  //    顺带挡掉空身份键（`#/` 之类）：旧实现对空键不拦，会建出一个 name='' 的
  //    幽灵根节点挂在树上；这里整条丢弃，侧栏不会出现空名行。
  // 三处都写 `new Array<T>(n)`（BUG-224）：无泛型参数时返回 any[]，赋给有类型的
  // 数组是 no-unsafe-assignment。显式泛型同样走预分配，行为不变。
  const perEntry = new Array<Array<{ key: string; raw: string }>>(entries.length)
  // 附件（v0.9.18）与 perEntry **同遍**产出：这一步本来就要逐条目走一遍，
  // 顺手取走这个标量，不给后面的计数遍再加一次遍历。
  const entryHasImage = new Array<boolean>(entries.length)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const seen = new Set<string>()
    const keys: Array<{ key: string; raw: string }> = []
    for (const raw of e.tags) {
      const key = tagKey(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      keys.push({ key, raw })
    }
    perEntry[i] = keys
    entryHasImage[i] = hasImageMarkdown(e.content)
  }

  // 2) 显示大小写：每个身份键取 **createdAt 最早** 那条 Momo 里的原样写法；
  //    并列（同一时间戳）取先出现者。Map 保留插入顺序；同一 Momo 内 `entry.tags`
  //    已是「先行内后 frontmatter」。
  //    P03：旧实现 `[...entries].sort(byCreatedAtAsc)` 全量拷贝 + 比较器排序（@10k，
  //    buildTagTree 28.6ms 的大头之一）。这里改单遍 min 追踪，一个引用都不拷：
  //    - 时间串全部可解析时按 (时间戳, 原序) 取最小，与旧实现 stable sort 的
  //      「localeCompare 打平 → 保留先出现者」逐键同结果（严格小于才替换）。
  //      **这个等价只对定宽串成立**（本插件写盘恒为 `toISOString()`）：混入
  //      '2026/09/22 09:00' 这类可解析但非定宽的串时，localeCompare 的字典序与
  //      时间戳数值序会分叉（且随时区翻转），两侧选中的可能不是同一条。手写
  //      frontmatter 出现混合格式时按时间戳取值——那是用户眼中的「更早」。
  //    - 出现任何不可解析的时间串（用户手写 frontmatter 的怪格式）就整体退回旧路径——
  //      不赌 localeCompare 与时间序在混合格式下同序。
  const displayByKey = new Map<string, string>()
  // 每条目的 createdAt 只解析**一次**，显示遍与下面的聚合遍共用（§3.2：折算一次、
  // 复用到底）。不再「见脏就 break」——聚合遍需要每一颗的时间戳才知道该不该参与
  // max，半份 stamps 逼不出第二种口径。脏库因此与干净库付同样的 N 次解析。
  const stamps = new Array<number>(entries.length)
  let allParseable = true
  for (let i = 0; i < entries.length; i++) {
    const t = Date.parse(entries[i].createdAt)
    stamps[i] = t
    if (Number.isNaN(t)) allParseable = false
  }
  if (allParseable) {
    // 每个身份键挑「时间戳最早」那条的原样写法；并列（同时间戳）取先出现者。
    // 收集成 (时间戳, 原序) 有序的列表再建 Map——**插入序必须是「最早在前」**：
    // 第 3 步的 ensure 会给隐式父节点（`read` 这种自己没有条目的前缀）起名，
    // 而它只能向「先被创建的那条子标签」借拼写。若 Map 的插入序是入参序
    // （listEntries 给的是新→旧），父节点借到的是**最新**那条子标签的拼写，
    // 与「前缀节点取最早出现」的约定相反（参照实现按 createdAt 排序后首见，
    // 借到的是最早那条）。tagTree.test.mts 的混合大小写 fixture 盯着这条。
    const picked: Array<{ key: string; raw: string; t: number; i: number }> = []
    const best = new Map<string, number>()
    for (let i = 0; i < entries.length; i++) {
      const t = stamps[i]
      for (const { key, raw } of perEntry[i]) {
        const b = best.get(key)
        if (b === undefined || t < b) {
          best.set(key, t)
          picked.push({ key, raw, t, i })
        }
      }
    }
    picked.sort((a, b) => a.t - b.t || a.i - b.i)
    // 升序遍历、只写首次：同一个键在 picked 里可能出现多次（扫到更早的时间戳就再推
    // 一条），必须先过滤掉重复，否则「后写覆盖」会让**最晚**那条赢——与目标相反。
    for (const p of picked) {
      if (!displayByKey.has(p.key)) displayByKey.set(p.key, canonicalTagPath(p.raw))
    }
  } else {
    // 按 createdAt 稳定排序后的条目顺序走（同旧实现的 sort 副本口径）
    const order = entries.map((_, i) => i).sort((a, b) => byCreatedAtAsc(entries[a], entries[b]))
    for (const i of order) {
      for (const { key, raw } of perEntry[i]) {
        if (!displayByKey.has(key)) displayByKey.set(key, canonicalTagPath(raw))
      }
    }
  }

  // 3) 建节点：沿路径逐段 ensure。前缀节点的显示写法取「最早出现」的那一次。
  const ensure = (displayPath: string): TagNode => {
    const key = tagKey(displayPath)
    const found = byKey.get(key)
    if (found) return found
    const segs = canonicalTagPath(displayPath).split('/')
    const node: TagNode = {
      key,
      displayPath,
      name: segs[segs.length - 1],
      depth: segs.length,
      ownCount: 0,
      totalCount: 0,
      withImageCount: 0,
      isVirtual: true,
      children: [],
    }
    byKey.set(key, node)
    if (segs.length === 1) roots.push(node)
    else ensure(segs.slice(0, -1).join('/')).children.push(node)
    return node
  }
  for (const display of displayByKey.values()) ensure(display)

  // 4) 计数：ownCount = 直属条目数；totalCount = 子树合计，按条目去重
  //    （一条 Momo 同时有 `读书` 与 `读书/小说` 时，祖先只加一次 → 数字与卡片数对齐）。
  for (let i = 0; i < perEntry.length; i++) {
    const keys = perEntry[i]
    const hit = new Set<string>()
    for (const { key } of keys) {
      byKey.get(key)!.ownCount++
      for (const prefix of tagKeyPrefixes(key)) {
        if (hit.has(prefix)) continue
        hit.add(prefix)
        const node = byKey.get(prefix)
        if (node) node.totalCount++
      }
    }
    // 附件：一条 Momo 对它命中的每个前缀**只累加一次**——`hit` 已按前缀去重，
    // 与 totalCount 同口径（一条同时带 `读书` 与 `读书/小说` 的不会被算两回）。
    // 曾经这里还聚合 lastUsedAt（子树最新 createdAt），2026-10-11 删掉（R7）：
    // 全仓零读者，而它用 ISO 字典序取 max 的口径还得配一段「脏值不参与」的注释养着。
    const img = entryHasImage[i]
    for (const prefix of hit) {
      const node = byKey.get(prefix)
      if (!node) continue
      if (img) node.withImageCount++
    }
  }

  // 5) isVirtual 标记 + 递归排序
  const finalize = (nodes: TagNode[]): void => {
    for (const n of nodes) {
      n.isVirtual = n.ownCount === 0
      finalize(n.children)
    }
    nodes.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name))
  }
  finalize(roots)
  return roots
}

/**
 * 条目是否命中某标签节点：命中该节点的**整棵子树**（自身 + 所有后代）。
 * 与 Obsidian 原生 `tag:父` 会命中 `#父/子` 的口径一致（ADR-004 §1.3）。
 */
export function entryMatchesTagKey(entry: MomoEntry, key: string): boolean {
  const target = tagKey(key)
  if (!target) return false
  return entry.tags.some((t) => {
    const k = tagKey(t)
    return k === target || k.startsWith(target + '/')
  })
}

/** 摊平标签树为「身份键 → 节点」，供筛选 / 置顶按 key 反查显示写法 */
export function flattenTagTree(nodes: readonly TagNode[], out = new Map<string, TagNode>()): Map<string, TagNode> {
  for (const n of nodes) {
    out.set(n.key, n)
    flattenTagTree(n.children, out)
  }
  return out
}
