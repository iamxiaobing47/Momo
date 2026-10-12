import { normalizeTags, parseInlineTags, splitFrontmatter } from '../tags'
import { locationsOf } from '../locations'
import { pad2 } from '../dates'
import type { MomoEntry } from '../types'

// Momo 文件层面的纯逻辑（obsidian-free）：文件名怎么生成、什么算「空白」、
// 回收站读不到文件时的占位条目。service.ts 只负责把这些函数接上 vault 的读写。

/** `YYYY-MM-DD-HHmmss`：Momo 与导出文件共用的时间戳基名 */
export function fileStamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  )
}

/** 空白 Momo：正文为空且无任何标签（与索引过滤同一口径）。
 *
 *  BUG-172：还要算上地点。地点只活在 frontmatter、没有行内形态（与标签的结构性
 *  差异），「有地点、无正文」的笔记是用户显式填过属性面板的——`newNoteLocations`
 *  偏好的设计目的正是「Obsidian 属性面板点开就能填」。旧实现不数 locations，
 *  两条路一起坏：readEntry 不索引（面板里任何视图都看不到），启动的空白草稿
 *  清扫还会把它当「新建即弃」静默移进系统回收站。**空数组不算有内容**——
 *  create() 给每篇新笔记写 `locations: []`，拿它当痕迹会废掉整个清扫。 */
export function isBlankEntry(content: string, tags: string[], locations: string[]): boolean {
  return !content.trim() && tags.length === 0 && locations.length === 0
}

/** frontmatter 的 `createdAt` → 落库串（两处取材点 `readEntry` / `readTrashEntry` 共用一份）。
 *
 *  BUG-164：非空、**可解析**才原样采用，否则回退创建时间（`ctime`）。旧实现只看
 *  `typeof === 'string'`——`createdAt: ""`（属性面板清空 / 手写）与 `createdAt: 垃圾`
 *  会原样进条目：`dayKey` 对空串返回 `''`、`groupByDate` 静默 `continue`，而列表密度
 *  （主列表与回收站页都）只渲染 `dateGroups` → 整张卡消失（网格 / 焦点渲染 `ctx.list`
 *  照旧看得见，「同一篇换个视图就失踪」）。空串 / 不可解析一律回退 ctime（与缺字段同路）。
 *  **可解析**而非「严格 ISO」是刻意的：只挡住「解析不出日期」这一类；date-only
 *  （`2026-09-18`）能解析，但口径归 BUG-130f——见下面的本地午夜归一。
 *
 *  BUG-130f：date-only（Obsidian 属性面板 date 类型的回写形态）按**本地**午夜归一。
 *  `new Date('2026-09-18')` 解析成 UTC 零点——UTC+8 用户眼里是当天 08:00：时段图
 *  整批落进 08 点那一根、还被排在本日组最末，与带 `+08:00` 偏移的写法混存时先后
 *  顺序整体错乱。只归一**读侧**，盘上串一个字节不动（§2.5 契约①）。 */
export function createdAtOf(raw: unknown, ctime: number): string {
  if (typeof raw !== 'string' || raw === '' || Number.isNaN(Date.parse(raw))) {
    return new Date(ctime).toISOString()
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (dateOnly) {
    // BUG-206：先按安全年构造再 setFullYear——new Date(y,…) 对 0≤y≤99 有 legacy
    // 年份映射（0026 → 1926），与 sanitizeStatsDay 同一把尺（sanitize.ts 先例）。
    const local = new Date(2000, Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    local.setFullYear(Number(dateOnly[1]))
    if (!Number.isNaN(local.getTime())) return local.toISOString()
  }
  return raw
}

/** frontmatter 的 `tags` 一律读成字符串数组（YAML 里可能是单串 / 数字 / 缺省） */
export function fmTagList(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return [raw]
  return []
}

/** 一条 Momo 的标签全集（行内 ∪ frontmatter，归一后） */
export function tagsOf(frontmatter: Record<string, unknown>, content: string): string[] {
  return normalizeTags([...parseInlineTags(content), ...fmTagList(frontmatter)])
}

/**
 * 回收站条目的**降级占位投影**：正文 / 标签读不到时的行形状（读盘抛错，或目录里
 * 列出了名字但文件不可得——极端竞态）。空正文 + 兜底时间（能拿到 stat 时用 `times`
 * 的 ctime / mtime），行照常出——恢复 / 彻底删除按 name 递，不依赖正文。
 *
 * `readFailed: true` 是给卡片的可见状态（BUG-95）：这一行是「读不到」，不是
 * 「本来就空」。不标记的话两者在界面上完全同形，用户会把空白卡当空条目
 * 「彻底删除」——盘上还有内容就被真删了。读失败的行不入缓存
 * （service 的 `readTrashEntryCached`），每次刷新重试，成功即恢复真身。
 *
 * BUG-164：**`createdAt` 不许是空串**——回收站页也走 `groupByDate`，空日键的行在
 * 列表密度静默消失，与上面「行照常出」的承诺相反。拿不到 stat（文件已被并发删掉）
 * 时用 `fallbackAt`（回收登记的 `deletedAt`）；连它也缺 / 脏就落到当下时刻
 * （「不知道何时删的」显示成今天，比整行消失好）。
 */
export function emptyTrashEntry(
  path: string,
  times?: { ctime: number; mtime: number },
  /** 文件不可得时的兜底时刻：调用方传回收登记的 `deletedAt` */
  fallbackAt?: string,
): MomoEntry {
  const createdAt = times
    ? new Date(times.ctime).toISOString()
    : fallbackAt !== undefined && fallbackAt !== '' && !Number.isNaN(Date.parse(fallbackAt))
      ? fallbackAt
      : new Date().toISOString()
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    createdAt,
    updatedAt: times ? new Date(times.mtime).toISOString() : createdAt,
    backfilled: false,
    scheduled: false,
    tags: [],
    locations: [],
    content: '',
    readFailed: true,
  }
}

/** frontmatter 的痕迹旗标：YAML 的 `true` 被 mini-parser 读成字符串 'true'，两种都认（T2）。
 *  与 `isDraftFlag`（service/index.ts）是两把尺：那个「有值就算」，这三个旗标严格认 true。 */
export function isTrueFlag(v: unknown): boolean {
  return v === true || v === 'true'
}

/** 读侧共享投影（T2）：`readEntry` 与 `readTrashEntry` 同一套取材的产物。
 *  两条读路径曾把这 14 行各抄一遍（连注释都写着「与另一条逐字对齐」），
 *  BUG-130d / BUG-164 两次都要两处一起改。收成一处之后，「同一把尺」从注释
 *  承诺变成结构保证；两者的差异（草稿闸 / 空白闸 / readFailed）留在各自调用方。 */
export interface EntryProjection {
  frontmatter: Record<string, unknown>
  /** 剥掉（可能嵌套的）frontmatter 之后的正文 */
  content: string
  tags: string[]
  locations: string[]
  createdAt: string
  backfilled: boolean
  scheduled: boolean
  updatedAt: string
}

/** 文件统计里投影要用的两个时间戳（TFile 结构上就满足，obsidian-free 侧不 import 它） */
export interface EntryStatLike {
  path: string
  name: string
  stat: { ctime: number; mtime: number }
}

export function projectEntry(file: EntryStatLike, raw: string): EntryProjection {
  const split = splitFrontmatter(raw)
  // 取值源恒为**外层**（文件真正的）frontmatter。内层那块只用来换正文——
  // 2026-10-11 T2 首版在这里写成 `frontmatter = inner.frontmatter`，把草稿期遗留块
  // 的 tags / locations / createdAt 盖到了真 frontmatter 上（实测：外层 `[甲]/北京/
  // 01-01` 被内层 `[乙]/上海/02-02` 整份替换），review 对拍时抓回来。回归见
  // `scripts/service.bugs.test.mts` 的「嵌套遗留块只换正文、不换取值源」。
  const frontmatter = split.frontmatter
  let content = split.content
  // 兼容历史脏数据：正文里嵌着草稿期遗留的 frontmatter 块。
  // BUG-130d：判据是「内层有 draft 或有 createdAt」——草稿期遗留的内嵌块可能只有
  // `draft: true` 没有 `createdAt`，只认后者时整段围栏会被当正文渲染，块内文本还被
  // parseInlineTags 计入标签（与列表侧口径不一致）。
  if (content.startsWith('---')) {
    const inner = splitFrontmatter(content)
    if (inner.frontmatter.draft !== undefined || inner.frontmatter.createdAt !== undefined) {
      content = inner.content
    }
  }
  return {
    frontmatter,
    content,
    // 标签归一（ADR-004）与地点（F1）：口径见各自模块，这里只负责取材
    tags: tagsOf(frontmatter, content),
    locations: locationsOf(frontmatter),
    // BUG-164：createdAt 与回收站那条同一把尺（createdAtOf）——空串 / 脏串回退 ctime
    createdAt: createdAtOf(frontmatter.createdAt, file.stat.ctime),
    backfilled: isTrueFlag(frontmatter.backfilled),
    scheduled: isTrueFlag(frontmatter.scheduled),
    // 更新时间取文件 mtime：用户绝大多数编辑发生在 Obsidian 原生编辑器里，插件看不见
    // 那些写入，frontmatter 自维护 updatedAt 必然漏更（v0.9.15「按更新时间排序」的取材点）
    updatedAt: new Date(file.stat.mtime).toISOString(),
  }
}
