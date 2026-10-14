import { eachTextSegment } from '../tags'

// Markdown 链接路径的纯计算（obsidian-free：只碰已归一化的路径字符串）。
//
// 为什么需要它：粘贴图片后要在正文里写一段 `![](…)`，而 Obsidian 的 Markdown
// 链接是**相对于源文件所在目录**解析的。`attachImage` 返回的是 vault 路径
// （`danpen/attachments/IMG-1.png`），直接塞进正文会被解析成
// `danpen/notes/danpen/attachments/IMG-1.png` —— 图裂，且链接看起来「完全正常」，
// 用户只会以为图丢了。「路径怎么拼」要过 obsidian 的 normalizePath，那部分留在
// service/index.ts；这里是给定两个已归一化路径后怎么互相走，纯字符串。

/** 路径所在的目录；没有 `/` 时是 vault 根，返回空串 */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/**
 * 从 `fromNote` 所在目录走到 `target` 的相对 Markdown 链接路径。
 *
 * 两侧都必须是已归一化的 vault 相对路径（`/` 分隔、无首尾斜杠），否则这里的
 * 分段比较没有意义。`target` 的**最后一段是文件名**，不参与「向上退」的公共前缀
 * 计算——退到共同祖先目录后要把整条尾巴（含文件名）重新拼上去。
 *
 *   'danpen/notes/a.md' → 'danpen/attachments/IMG-1.png'  ⇒ '../attachments/IMG-1.png'
 *   'danpen/a.md'       → 'danpen/IMG-1.png'               ⇒ 'IMG-1.png'
 *   'a.md'              → 'danpen/IMG-1.png'               ⇒ 'danpen/IMG-1.png'
 *   'danpen/notes/a.md' → 'IMG-1.png'（vault 根）           ⇒ '../../IMG-1.png'
 */
export function relativeLinkPath(fromNote: string, target: string): string {
  const from = dirOf(fromNote).split('/').filter((s) => s !== '')
  const to = target.split('/').filter((s) => s !== '')
  // `to` 的最后一段是文件名，永远不进公共前缀：否则同目录时会把文件名也吃掉，
  // 退格数少算一层，链接指到父目录去。
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++
  const up = from.length - common
  return [...new Array<string>(up).fill('..'), ...to.slice(common)].join('/')
}

/** 图片落盘后写进正文的引用：标准 md 图片语法（不带 base64，与 attachImage 同口径） */
export function imageEmbed(linkPath: string, alt: string): string {
  return `![${alt}](${linkPath})`
}

// ---- 引用反解：一份正文引用了哪些附件（BUG-241）----
//
// 为什么在这里：附件清理要回答两个字符串问题——「这条笔记引用了附件目录里的哪些文件」
// （按 notePath 的目录解析相对链接）与「还有谁引用它」（同一把尺子跑全库）。两者都是
// 纯字符串运算，与上面「路径怎么拼」同属一层，所以留在这个 obsidian-free 文件里。
//
// 两条纪律：
//   ① **代码段里的引用不算**：复用 `eachTextSegment`（与标签解析同一套切段口径）——
//      围栏 / 行内代码里的 `![…](…)` 是文本不是图片，拿它当引用会把用户举例用的图删掉。
//   ② 候选窄、保留宽：删除候选只认**图片语法**（md 图片 / `<img>` / `![[…]]`）；
//      保留判据连普通链接（`[文字](path)`、`[[note]]`）也算——它同样证明「这个文件还有人在用」，
//      宁可留下孤儿图，也不删别处在用的图。

const MD_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\n]*)\)/g
const HTML_IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const WIKI_LINK_RE = /(!?)\[\[([^\]\n|]+)(?:\|[^\]]*)?\]\]/g

/** 解 %xx（Obsidian 把空格写成 %20）。坏转义原样保留——解析不出就不该猜。 */
function decodePercent(t: string): string {
  if (!t.includes('%')) return t
  try {
    return decodeURIComponent(t)
  } catch {
    return t
  }
}

/** md 链接 / 图片的目的地：剥 `<…>` 包裹与 `"标题"`，再解 %xx。
 *  未包裹 `<>` 时按 CommonMark 在第一个空白处收尾（带空格的路径本来就该写成 %20 或 `<>`）。 */
function cleanMdTarget(raw: string): string {
  let t = raw.trim()
  if (t.startsWith('<')) {
    const end = t.indexOf('>')
    if (end !== -1) t = t.slice(1, end)
  } else {
    const sp = t.search(/\s/)
    if (sp !== -1) t = t.slice(0, sp)
  }
  t = t.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1)
  }
  return decodePercent(t)
}

/**
 * 链接目标 → vault 相对路径（`<notePath>` 的目录为基点；`/` 开头按库根算）。
 * `..` 退到库根之外返回 `null`（越界引用不是我们的附件）。
 */
export function resolveLinkTarget(fromPath: string, target: string): string | null {
  const t = target.trim()
  if (t === '') return null
  const absolute = t.startsWith('/')
  const out = absolute ? [] : dirOf(fromPath).split('/').filter((s) => s !== '')
  for (const seg of (absolute ? t.slice(1) : t).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.length > 0 ? out.join('/') : null
}

/** 遍历代码段以外的引用：`kind` 分图片 / 普通链接，`wiki` 标记 Obsidian 嵌入语法 */
function eachRef(raw: string, fn: (target: string, kind: 'image' | 'link', wiki: boolean) => void): void {
  eachTextSegment(raw, (seg) => {
    for (const m of seg.matchAll(MD_LINK_RE)) {
      const target = cleanMdTarget(m[3] ?? '')
      if (target !== '') fn(target, m[1] === '!' ? 'image' : 'link', false)
    }
    for (const m of seg.matchAll(HTML_IMG_RE)) {
      const target = decodePercent((m[1] ?? m[2] ?? m[3] ?? '').trim())
      if (target !== '') fn(target, 'image', false)
    }
    for (const m of seg.matchAll(WIKI_LINK_RE)) {
      // `![[名字#小节|别名]]`：引用的是 `名字` 那个文件
      const target = (m[2] ?? '').split('#')[0]?.trim() ?? ''
      if (target !== '') fn(target, m[1] === '!' ? 'image' : 'link', true)
    }
  })
}

function collectAttachments(
  raw: string,
  notePath: string,
  attachmentsPath: string,
  includeLinks: boolean,
): string[] {
  const root = attachmentsPath.replace(/\/+$/, '')
  if (root === '') return []
  const prefix = `${root}/`
  const out = new Set<string>()
  eachRef(raw, (target, kind, wiki) => {
    if (kind === 'link' && !includeLinks) return
    // `![[IMG-1.png]]` 按库内短路径解析（不含 `/` 就是附件目录里的同名文件）；
    // 含 `/` 的按普通链接走相对 / 绝对解析。
    const abs =
      wiki && !target.includes('/')
        ? `${prefix}${decodePercent(target)}`
        : resolveLinkTarget(notePath, target)
    if (abs !== null && abs.startsWith(prefix)) out.add(abs)
  })
  return [...out]
}

/** 本条正文**嵌入**（会显示出来）的附件路径。彻底删除的候选面就是它。 */
export function embeddedAttachments(raw: string, notePath: string, attachmentsPath: string): string[] {
  return collectAttachments(raw, notePath, attachmentsPath, false)
}

/**
 * 本条正文**引用**（嵌入 ∪ 普通链接）的附件路径——「这个附件还有人在用」的判据面。
 * 比 `embeddedAttachments` 宽，理由见本节开头的纪律 ②。
 */
export function linkedAttachments(raw: string, notePath: string, attachmentsPath: string): string[] {
  return collectAttachments(raw, notePath, attachmentsPath, true)
}
