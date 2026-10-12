// styles.css 的结构化模型：注释 / 规则 / 声明 / at-rule 上下文 / 特异性。
// 供 css-audit.mjs、lint-css.mjs、merge-css.mjs 共用——所有 CSS 治理脚本都从这里取数，
// 避免每个脚本各写一套半吊子解析器（那正是「重复定义 91 处」在工具侧的镜像）。
//
// 口径约定（全仓库统一，改这里等于改所有治理脚本的口径）：
//   · 上下文（context）：@container / @media 的嵌套链，规范化空白后作为 key。
//     同上下文 + 同选择器文本 = 可合并的重复定义；跨上下文一律不合并
//     （把 @container 里的规则提到外面，响应式语义就没了）。
//   · 特异性：按 (id, class+attr+pseudo-class, element) 三元组计；:where() 记 0；
//     :not() / :has() 取其内部最高者（近似，够用来分桶）。
import fs from 'node:fs'

/** 读文件 → { text, eol, bom, hasLonelyCr } */
export function readCss(file) {
  const buf = fs.readFileSync(file)
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const text = buf.toString('utf8')
  return {
    text,
    bom,
    eol: /\r\n/.test(text) ? 'CRLF' : (/\r/.test(text) ? 'CR' : 'LF'),
    lonelyCr: (text.match(/\r(?!\n)/g) || []).length,
  }
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim()

/**
 * 解析 CSS。
 * @returns {{ rules: Rule[], comments: Comment[] }}
 * Rule   = { index, context: string[], contextKey, selector, kind, decls, start, bodyStart, bodyEnd, end }
 * Comment= { index, start, end, text, attachedTo: 'rule'|'decl'|'standalone' }
 */
export function parseCss(text) {
  const rules = []
  const comments = []
  const ctxStack = []
  const openRecords = []
  let i = 0
  let pending = '' // 自上一个 ; { } 以来累积的前置文本
  let pendingStart = -1

  const pushComment = (start, end) => {
    comments.push({
      index: comments.length,
      start,
      end,
      text: text.slice(start + 2, end - 2),
      attachedTo: 'standalone',
    })
  }

  while (i < text.length) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new Error('未闭合的注释 @' + i)
      pushComment(i, end + 2)
      i = end + 2
      continue
    }
    if (ch === '"' || ch === "'") {
      // 字符串原样吞掉，避免把 ; { } 当分隔符
      const quote = ch
      let j = i + 1
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === quote) { j++; break }
        j++
      }
      pending += text.slice(i, j)
      i = j
      continue
    }
    if (ch === '{') {
      const prelude = collapse(pending)
      const start = pendingStart < 0 ? i : pendingStart
      const isAt = prelude.startsWith('@')
      const parentCtx = ctxStack.filter((c) => c.isAt).map((c) => c.prelude)
      ctxStack.push({ prelude, isAt, ruleStart: start })
      const record = {
        index: rules.length,
        context: parentCtx,
        contextKey: parentCtx.join(' >> '),
        selector: prelude,
        kind: isAt ? 'at' : 'style',
        decls: [],
        start,
        bodyStart: i + 1,
        bodyEnd: -1,
        end: -1,
      }
      openRecords.push(record)
      rules.push(record)
      pending = ''
      pendingStart = -1
      i++
      continue
    }
    if (ch === '}') {
      const top = ctxStack.pop()
      const record = openRecords.pop()
      if (record) {
        record.bodyEnd = i
        record.end = i + 1
      }
      if (top && !top.isAt) {
        // 样式规则的声明已在 ; 处收齐
      }
      pending = ''
      pendingStart = -1
      i++
      continue
    }
    if (ch === ';') {
      const top = ctxStack[ctxStack.length - 1]
      if (top && !top.isAt) {
        const decl = splitDecl(pending)
        if (decl) rules[rules.length - 1].decls.push(decl)
      }
      pending = ''
      pendingStart = -1
      i++
      continue
    }
    if (pending.trim() === '' && ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') pendingStart = i
    pending += ch
    i++
  }

  // 注释归属：落在某个规则区间内的标 'rule'（更细的 decl 归属对当前用途够用）
  for (const c of comments) {
    const host = rules.find((r) => c.start >= r.start && c.end <= r.end)
    if (host) c.attachedTo = 'rule'
  }
  return { rules, comments }
}

/** 把一段 "prop: value" 文本切成声明 */
function splitDecl(raw) {
  const text = raw.trim()
  if (text === '') return null
  const colon = text.indexOf(':')
  if (colon < 0) return null
  const prop = text.slice(0, colon).trim()
  const value = text.slice(colon + 1).trim()
  if (!/^(--[a-zA-Z0-9_-]+|[*-]?[a-zA-Z][a-zA-Z0-9-]*)$/.test(prop)) return null
  return { prop, value, raw: text }
}

/**
 * 特异性三元组。顶层逗号各分支取**最大值**（CSS 规范语义）——
 * 当成 sum 会把 `.a input, .a .b` 这类规则高估成 (0,3,0)。
 * 切分支的方式与 css-cascade.mjs 的 parseSelector **刻意同款**（朴素 split(',')，
 * 函数伪类里的逗号也切）——级联模拟器按「命中哪个分支」取 specs[i]，
 * 两个模块的下标必须一一对齐（BUG-191）。
 */
export function specificity(selector) {
  let best = [0, 0, 0]
  for (const s of specificityAlts(selector)) {
    if (cmpSpec(s, best) > 0) best = s
  }
  return best
}

/**
 * 特异性按**逗号分支**逐个返回（口径与 specificity 一致，不取 max）。
 * 级联模拟器用它做「命中哪个分支就按哪个分支的特异性比输赢」——整条按 max
 * 记账的后果：`.momo-app button, .momo-app .momo-chip` 这类 reset 里的
 * (0,1,1) 分支被按整条最大档比，与宿主 button:not(.clickable-icon)（(0,1,1)）
 * 的胜负判反（BUG-191）。
 */
export function specificityAlts(selector) {
  return selector.split(',').map((alt) => alt.trim()).filter(Boolean).map(specificitySingle)
}

const cmpSpec = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])

/** 从 open（'(' 的下标）起找配平的 ')'，返回其下标；配不平返回 -1 */
function balancedParen(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

const PSEUDO_ELEMENTS = ['before', 'after', 'placeholder', 'selection', 'first-line', 'backdrop', 'part']
const FUNCTIONAL_PSEUDOS = ['not', 'is', 'has', 'matches']

function specificitySingle(selector) {
  let a = 0, b = 0, c = 0
  // 函数型伪类整段处理（括号配平，嵌套伪类整体吃进）：:where 按零计；
  // :not/:is/:has/:matches 只记其**参数**的特异性。处理完把整段从文本里剥掉
  // 再数类 / 标签——不剥的话参数里的类会被下面的正则**再数一遍**（BUG-191：
  // 宿主 button:not(.clickable-icon) 被算成 (0,2,1)，真实 (0,1,1)），特异性一错，
  // 「与宿主抢优先级」的整场战争判反。:where 的旧正则 `[^)]*` 吃不住嵌套括号，
  // 这里一并改成配平扫描（与 css-cascade.mjs parseCompound 的 BUG-185 修法同族）。
  let rest = ''
  let i = 0
  while (i < selector.length) {
    if (selector[i] === ':') {
      const head = /^::?[a-zA-Z-]+/.exec(selector.slice(i))
      if (head && selector[i + head[0].length] === '(') {
        const close = balancedParen(selector, i + head[0].length)
        if (close >= 0) {
          const name = head[0].replace(/^::?/, '').toLowerCase()
          if (name !== 'where' && !FUNCTIONAL_PSEUDOS.includes(name)) {
            rest += selector.slice(i, close + 1) // 带参的其它函数型伪类（:lang() 等）原样保留，按普通伪类计
          } else if (FUNCTIONAL_PSEUDOS.includes(name)) {
            const s = specificity(selector.slice(i + head[0].length + 1, close))
            a += s[0]; b += s[1]; c += s[2]
          }
          i = close + 1
          continue
        }
      }
    }
    rest += selector[i]
    i++
  }
  const pseudoClasses = (rest.match(/::?[a-zA-Z-]+/g) || [])
  for (const p of pseudoClasses) {
    const name = p.replace(/^::?/, '').toLowerCase()
    if (PSEUDO_ELEMENTS.includes(name)) { c++; continue }
    b++
  }
  const ids = (rest.match(/#[a-zA-Z0-9_-]+/g) || []).length
  const classes = (rest.match(/\.[a-zA-Z0-9_-]+/g) || []).length
  const attrs = (rest.match(/\[[^\]]+\]/g) || []).length
  const elements = (rest.replace(/::?[a-zA-Z-]+/g, ' ').match(/(^|[\s>+~])([a-zA-Z][a-zA-Z0-9-]*)/g) || []).length
  a += ids
  b += classes + attrs
  c += elements
  return [a, b, c]
}

/**
 * 声明值里的「裸 hex 字面量」——**var() 回退值不算**（治理方案 §4 铁律 1 的白名单：
 * reset 段与降级 fallback 允许写色值）。var(--x, #fff) 里的 #fff 是 Obsidian 主题
 * 变量取不到时的兜底，不是绕开令牌；把兜底也当外泄会让指标虚高、逼人乱改。
 */
export function hexLiterals(value) {
  const stripped = (value.match(/var\([^()]*\)/g) || []).reduce((v, m) => v.replace(m, ''), value)
  return stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || []
}

/** 按 (contextKey, selector) 分组，返回出现多次的组 */
export function duplicateGroups(rules) {
  const map = new Map()
  for (const r of rules) {
    if (r.kind !== 'style') continue
    const key = r.contextKey + ' ||| ' + r.selector
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return [...map.entries()].filter(([, list]) => list.length > 1)
}
