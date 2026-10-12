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
