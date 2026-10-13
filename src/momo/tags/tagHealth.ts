import { isValidTag, tagKey } from './parse'
import type { MomoEntry } from '../types'

// 失效标签的判定与修复（纯计算，obsidian-free）。
//
// 「失效标签」的定义只有一条：**标签里有空白**。
//
// 为什么它失效：Obsidian 的标签语法是 `#` 接一段**不含空白**的字符。正文行内写
// `读书 笔记`，Obsidian 只认 `读书`，`笔记` 是普通文字；frontmatter 写成
// `- 第七章 不再在葬礼上哭泣`（这里那个空白是全角空格 U+3000）时，Obsidian **整个不当它是标签**
// ——属性面板里只是文本，标签面板 / 标签搜索 / 点标签跳转全都找不到它。
// Momo 侧却看得见它（normalizeTags 只 trim 两端、内部空白原样保留），于是两边
// 对不上账：侧栏树里点得动，Obsidian 那边像没写过。
//
// 为什么不把别的形态也算进来：
// - 纯数字（`#1984`）isValidTag 已经判非法，索引期就被丢掉、侧栏根本不会出现；
//   它是另一类问题（标签被静默丢弃），混进这张表只会让「修复」按钮无所适从。
// - 空段（`读书//小说`）canonicalTagPath 已经归一成 `读书/小说`，读到时就是对的。
// 所以这张表只列「读得到、但 Obsidian 不认」的那一类，修法也只有一种：**清掉空白**。

/** 标签里的空白：半角空格、全角空格（U+3000）、制表符、不换行空格……一律算失效成因 */
const WHITESPACE = /\s/u

/** 这个标签含空白吗（含全角空格——它是本库最常见的一种，肉眼看是一整段空隙） */
export function hasTagSpace(tag: string): boolean {
  return WHITESPACE.test(tag)
}

/**
 * 修好的标签（全库唯一一种修法：**清掉空白**）。
 * `null` = 修不了，两种情形：
 *   ① 本来就没有空白（不是失效标签）；
 *   ② 去掉空白后不再是合法标签——`19 84` → `1984` 纯数字，isValidTag 判非法。
 *      这种**必须**返回 null：写侧走 normalizeTags 会把它整条丢掉，用户点一下
 *      「修复」就等于静默删了自己的标签。
 */
export function squeezeTagSpace(tag: string): string | null {
  if (!hasTagSpace(tag)) return null
  const next = tag.replace(/\s/gu, '')
  return next !== tag && isValidTag(next) ? next : null
}

/** 一条失效标签（一行 = 一个身份键，不是每个笔记一行） */
export interface DefectiveTag {
  /** 原样写法（首次出现的那个；大小写与空白都按用户写下的保留） */
  tag: string
  /** 身份键（tagKey）：同一行内的大小写差异归到同一行 */
  key: string
  /** 有这个失效标签的笔记条数 */
  notes: number
  /** 清掉空白后的样子；null = 清完也不是合法标签，修不了（见 squeezeTagSpace） */
  fix: string | null
}

/**
 * 全库失效标签清单：按**身份键**并成一行，标注各有多少条笔记带着它。
 *
 * 取材是索引里已解析好的 `entry.tags`（listEntries 的产物），**不额外读盘**——
 * 索引按 path + mtime/size 判新鲜，几千条时这页是纯内存计算。
 * 口径与侧栏树、卡片 chip 完全一致（同为 tagsOf 的归一结果），所以这里列出的
 * 标签就是用户天天能点到的那些，不存在「这一页说有、侧栏没有」。
 *
 * 排序：影响的笔记条数降序（同数按身份键升序，不用 localeCompare——它随 ICU 变，
 * 测试与 diff 都要确定性）。
 */
export function defectiveTags(entries: readonly MomoEntry[]): DefectiveTag[] {
  const rows = new Map<string, DefectiveTag>()
  for (const e of entries) {
    for (const tag of e.tags) {
      if (!hasTagSpace(tag)) continue
      const key = tagKey(tag)
      const hit = rows.get(key)
      if (hit) {
        hit.notes++
      } else {
        rows.set(key, { tag, key, notes: 1, fix: squeezeTagSpace(tag) })
      }
    }
  }
  return [...rows.values()].sort((a, b) => (b.notes - a.notes) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
