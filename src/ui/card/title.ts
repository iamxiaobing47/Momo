import { copy } from '../../momo/i18n'
import { TITLE_MAX } from '../../momo/types'
import { removeInlineTags } from './markdown'

// 卡片标题与时间的取法（纯函数）：短首行才升为标题，时间一律本地化显示。

/** 标题字数上限的兜底默认（prefs.titleMaxChars 的默认值；真值由调用方从 pref 传进来） */
const TITLE_MAX_DEFAULT = TITLE_MAX.default

/** 行内 Markdown 标记剥成纯文本（标题是纯文本渲染，不能把 `**` 原样显示出来） */
export function stripInlineMd(s: string): string {
  return s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

/**
 * 把内容切成「标题 + 正文」。**保守规则**（用户 2026-09-19 裁决：短首行才升为标题）：
 * 首行非空、剥掉行内标记后不超过 `maxChars` 字、且不是 Markdown 块级（列表 / 引用 /
 * 标题标记 / 代码围栏 / 表格 / 图片），并且后面还有别的非空行——四条同时成立才升为标题。
 * 任一不成立就返回 null，整段按正文渲染（避免把整段首行变成一行粗体大字）。
 *
 * `maxChars` = `prefs.titleMaxChars`（v0.9.12 起可配，此前写死 32），由调用方传进来：
 * 这条链上已经有订阅（titleFromFirstLine），字数只是个入参，不必再开一条。
 */
export function splitFirstLine(content: string, maxChars: number = TITLE_MAX_DEFAULT): { title: string; body: string } | null {
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return null
  const raw = lines[i].trim()
  const hasMore = lines.slice(i + 1).some((l) => l.trim() !== '')
  if (!hasMore) return null
  if (/^(?:[-*+]|\d+[.)])\s/.test(raw)) return null
  if (/^[>#`|!]/.test(raw)) return null
  // BUG-184a：块级门补两个缺口——tilde 围栏（`~~~`）与水平线（`***` / `___` / `---`）
  // 也是 Markdown 块级。旧门只认了反引号那一半围栏：`~~~` 首行被升成标题、
  // 正文剩的尾围栏渲染错乱；裸 `***` / `---` 同样被升成一行符号标题。
  if (/^~/.test(raw)) return null
  if (/^(?:[-*_]\s*){3,}$/.test(raw)) return null
  const title = stripInlineMd(removeInlineTags(raw))
  if (!title || title.length > maxChars) return null
  return { title, body: lines.slice(i + 1).join('\n').replace(/^\s*\n/, '') }
}

/**
 * MarkdownBody 实际渲染的那段正文：标题升格生效时是切掉首行后的 body，否则整段。
 *
 * 渲染缓存的命中比对与密度切换预热（`ListControls` 的 hover 预热）都必须按同一个
 * 口径算这个字符串——两边各算一遍一旦漂移，缓存永远命不中（性能 bug，不是正确性
 * bug），所以口径收在这里，调用方（Card / ReviewCard 的表达式）以此为准。
 */
export function bodyOf(content: string, titleFromFirstLine: boolean, titleMaxChars: number): string {
  const split = titleFromFirstLine ? splitFirstLine(content, titleMaxChars) : null
  return split ? split.body : content
}

/**
 * 正文预览截断：只保留前 `lines` 行（统计页「最长笔记」的预览卡用）。
 *
 * 为什么是**源行**不是视觉行：Obsidian 默认不折行（Readable line length 关着），
 * 一段话常常是一整行源文本。按源行截 = 「这篇的前三行」在用户眼里就是前三行，
 * 也让他能预期「卡片里看到的就是文件开头那几行」。视觉行要靠 CSS 夹，那会把
 * 整篇 Markdown 都渲染进 DOM（与「只渲染前三行」相反），且代码块 / 表格被夹断
 * 时观感更怪。
 *
 * 行数不足原样返回；`lines <= 0` 视为不截断（调用方用「0 = 不传」表达同一件事）。
 * 末尾不留孤零零的换行：截断点落在换行符**之前**，MarkdownRenderer 不会因为
 * 尾巴上一个空段多画一行空白。
 */
export function firstLines(text: string, lines: number): string {
  if (lines <= 0) return text
  let at = -1
  for (let i = 0; i < lines; i++) {
    at = text.indexOf('\n', at + 1)
    if (at < 0) return text
  }
  return text.slice(0, at)
}

/** `ISO` → `HH:MM`（本地时间；非法输入返回空串，不显示占位文本） */
export function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** `ISO` → `9月19日`（本地日历日；具体日期而非「今天/昨天」——见 2026-09-19 用户裁决） */
export function monthDayOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return copy.date.monthDay(d.getMonth() + 1, d.getDate())
}
