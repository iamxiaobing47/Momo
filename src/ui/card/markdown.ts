import { TAG_RE_HEAD, TAG_RE_TAIL, TAG_TAIL_RE, mapOutsideCode } from '../../momo/tags'
import type { MomoDomFactory } from '../store/types'

// 卡片正文的 Markdown 预处理（纯函数，不碰 React）。
// 三件事：行首 Tab 转占位元素、剥掉行内 #标签、把搜索词包成 <mark>。

/** 渲染用预处理：把行首 Tab 转成内联缩进占位元素，保留层级并画出缩进线。
 *  不能用空白字符（&emsp; / U+2003）：渲染器会把行首空白当段落缩进剥掉；
 *  占位元素不是空白，不会被剥，左边框即缩进线。
 *  两类例外原样保留、交给渲染器：代码段（mapOutsideCode，占位 span 会污染代码内容），
 *  以及「Tab + 列表 / 引用」——那是 Markdown 语法缩进，替换会把嵌套列表 / 引用
 *  打断成字面文本（"- 子项" 不再是列表）。 */
export function keepIndent(markdown: string): string {
  return mapOutsideCode(markdown, (seg) =>
    seg.replace(/^\t+/gm, (tabs: string, offset: number, whole: string) => {
      const rest = whole.slice(offset + tabs.length)
      if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(rest) || /^[ \t]*>/.test(rest)) return tabs
      return '<span class="momo-indent"></span>'.repeat(tabs.length)
    }),
  )
}

/** 去掉正文里的行内 #标签——它们已在卡片末尾的标签行统一展示。
 *  与 parseInlineTags 同口径：代码段（fenced / 行内代码）里的 # 不是标签
 *  （shell/python 注释、`#include`……），先切段、只处理代码段以外的文本。
 *  段前是不是行首同样跟随切段结果（首段认行首、后续段只认空白前导），
 *  否则 `\`helper\`#tag` 里的 # 会被当成标签从卡片正文里剥掉。 */
export function removeInlineTags(markdown: string): string {
  return mapOutsideCode(markdown, (seg, isFirst) =>
    seg.replace(isFirst ? TAG_RE_HEAD : TAG_RE_TAIL, (_m: string, pre: string, raw: string) => {
      // BUG-180b：尾随标点不是标签的一部分（与 parseInlineTags / rewriteInlineTags 同一把
      // 尺子）——旧实现把整 token 替换成 `$1`，`#book.` / `#读书。` 的句读标点被一起吃掉。
      const tail = raw.match(TAG_TAIL_RE)?.[0] ?? ''
      return pre + tail
    }),
  )
}

/**
 * 卡片正文的完整预处理（`MarkdownBody` 的实时渲染路径与 `warmBodyCache` 的
 * 预热路径共用同一份，别在两处各写一遍组合）。
 *
 * **顺序即口径**（BUG-165）：先 `removeInlineTags`、后 `keepIndent`。反过来的话
 * `keepIndent` 先把行首 Tab 换成占位 span，`#` 的前一个字符从空白变成 `>`——
 * `removeInlineTags` 的 `(^|\s)#` 判据两边都不命中，Tab 缩进行首的行内标签剥不掉：
 * 同一颗标签在卡片标签行一枚、正文里还带一个原始 `#`，而 `parseInlineTags` 在原串上
 * 明明认了它（存量测试分别钉了两个函数、各自正确，盲区正是在组合上）。
 * 反序则 `removeInlineTags` 先看到真 Tab、剥完 Tab 还在，`keepIndent` 照常替换。
 */
export function prepareCardBody(content: string): string {
  return keepIndent(removeInlineTags(content))
}

/**
 * 在已渲染的正文里高亮搜索词。
 * 纯 DOM 操作（**不**重渲染 Markdown，否则每次输入都要把全部命中卡片的
 * MarkdownRenderer 重跑一遍）：先撤掉旧的 `<mark>`，再用 TreeWalker 包住命中的
 * 文字节点；跳过 code / pre / a —— 在代码块与链接内部插标签会破坏渲染结果。
 *
 * `dom` = 注入的宿主 DOM 工厂（BUG-235）：本层不许 import obsidian、也不许直接
 * `document.createElement`（评审 `prefer-create-el`），建 `<mark>` 与文档片段
 * 经 caps.dom 下沉到 views 侧。`document.createTextNode` / `createTreeWalker`
 * 不在该规则管辖内，照旧直接调。
 */
export function highlightMatches(root: HTMLElement, query: string, dom: MomoDomFactory): void {
  for (const hit of Array.from(root.querySelectorAll('mark.momo-hit'))) {
    const parent = hit.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(hit.textContent ?? ''), hit)
    parent.normalize()
  }
  const q = query.trim().toLowerCase()
  if (!q) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const text = node.nodeValue ?? ''
      if (!text || !text.toLowerCase().includes(q)) return NodeFilter.FILTER_REJECT
      const parent = (node as Text).parentElement
      if (!parent || parent.closest('code, pre, a, script, style')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text)

  for (const node of targets) {
    const text = node.nodeValue ?? ''
    const lower = text.toLowerCase()
    const frag = dom.fragment()
    let i = 0
    let at = lower.indexOf(q, i)
    while (at >= 0) {
      if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)))
      // BUG-235：建 <mark> 走注入的工厂（类名在创建时整体赋上，与旧的
      // `document.createElement('mark')` + `mark.className = 'momo-hit'` 逐字等价）
      const mark = dom.el('mark', 'momo-hit')
      mark.textContent = text.slice(at, at + q.length)
      frag.appendChild(mark)
      i = at + q.length
      at = lower.indexOf(q, i)
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)))
    node.parentNode?.replaceChild(frag, node)
  }
}
