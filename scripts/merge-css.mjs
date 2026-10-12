// P1 · 合并重复定义——把「同一选择器被切开写多次」收敛成一处，且**证明计算样式零变化**。
//
//   node scripts/merge-css.mjs                  # 执行合并（写回 styles.css）
//   node scripts/merge-css.mjs --dry-run        # 只报告，不落盘
//   node scripts/merge-css.mjs --strict         # 只走静态三判，不逐组试搬
//   node scripts/merge-css.mjs --merge-atrules  # 额外把同名 @container / @media 块并成一块
//   node scripts/merge-css.mjs <file>           # 指定文件
//   node scripts/merge-css.mjs --out <file>     # 结果另存（审查用）
//
// 为什么不能无脑搬：把早先块 S 的声明搬到同 (上下文, 选择器) 的最后一个块 T，
// 若有规则 R 夹在中间且与 S **特异性相等**、也声明了同一属性，则旧级联里 R 赢 S，
// 搬家后 S 反赢 R——视觉就变了。特异性更高的 R 不受源码序影响，不构成阻塞。
// 注意阻塞**不限同一上下文**：自定义属性跨 @container 边界级联，顶层声明被搬到
// @container 块之后，容器命中时就会反赢容器里的值（这个坑第一次跑就踩到了）。
//
// 拦路判定必须加「共命中」条件（P1b 修的旧判定漏洞）：等特异性 + 同属性只是必要条件，
// R 还要**可能命中 S 的同一批元素**才真的拦路。.momo-resize-handle 与 .momo-menu-item
// 都是 (0,1,0)、都声明 width，但两者命中不同元素、互不拦路；旧判定把它们全算成阻塞，
// 于是 22 组重复定义一组也合并不掉。共命中 = 任一分支的右端复合选择器类集相交，
// 或一侧右端无类（纯标签 / 通配，保守地当作可能命中）。
//
// 属性级三判（对 source S 的每条声明 p；T = 同 (上下文, 选择器) 的最后一个块）：
//   1. T 已声明 p          → 死声明，丢（T 同上下文、同选择器、后出现，恒赢）
//   2. 更靠后的 source 声明 p → 死声明，丢（同一组内后来者恒赢）
//   3. S..T 之间有等特异性、共命中、声明 p 的 R → 留在原处（搬家会让 S 反赢 R）
//   其余 → 搬进 T（**前置**到 T 自身声明之前，保住简写 / 长笔的相对顺序）
//
// 策略（默认）：逐组乐观试搬 + 聚焦验证。只对「命中该组选择器（含与拦路规则类并集）」
// 的元素 × 状态求赢家表，前后一致才接受这一组的合并，否则回退静态三判。
// --strict：完全依照上面的静态三判，不逐组试搬（合并量更小，但每条去留可解释）。
//
// 收尾三道全量验证（任一不过 → 不写盘）：
//   1. 注释一条不丢（多重集相等）
//   2. 剩余规则的源码序不变（新序列是旧序列的子序列）
//   3. 全量级联零差异
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCss, parseCss, specificity, duplicateGroups } from './css-model.mjs'
import { diffWinners, parseSelector } from './css-cascade.mjs'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const strict = argv.includes('--strict')
const mergeAtrules = argv.includes('--merge-atrules')
const outIdx = argv.indexOf('--out')
if (outIdx >= 0 && argv[outIdx + 1] === undefined) {
  // path.resolve(undefined) 抛的是 TypeError: path must be of type string——
  // 退出码虽非 0，报错与用法无关也没 hint（BUG-35）
  console.error('用法：node scripts/merge-css.mjs [--out <输出路径>] [--dry-run] [--strict] [--merge-atrules] [输入.css]')
  console.error('  --out 后面要跟输出文件路径')
  process.exit(1)
}
const outPath = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : null
const positional = argv.filter((a, i) => !a.startsWith('-') && !(i > 0 && argv[i - 1] === '--out'))
const file = positional.length ? path.resolve(positional[0]) : path.join(projectDir, 'styles.css')
const { text, eol } = readCss(file)
const { rules, comments } = parseCss(text)

const specEqual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const indentOf = (pos) => {
  const ls = text.lastIndexOf('\n', pos) + 1
  const m = /^[ \t]*/.exec(text.slice(ls, pos))
  return m ? m[0] : ''
}
/** 规则右端片段要求的类 */
function rightmostClasses(selectorText) {
  return [...new Set(parseSelector(selectorText).map((alt) => alt[alt.length - 1]).flatMap((seg) => seg.compound.classes))]
}

/**
 * 共命中：两个选择器是否可能命中同一元素。
 * 近似口径（只比右端复合选择器——它决定命中元素本身；祖先链在模拟器里同样近似）：
 * 任一分支对的右端类集相交，或一侧右端无类。偏向「判共命中」= 偏向保守。
 */
function coMatchable(selA, selB) {
  const altsA = parseSelector(selA)
  const altsB = parseSelector(selB)
  for (const a of altsA) {
    for (const b of altsB) {
      const ca = a[a.length - 1].compound
      const cb = b[b.length - 1].compound
      const inter = ca.classes.some((c) => cb.classes.includes(c))
      if (inter || ca.classes.length === 0 || cb.classes.length === 0) return true
    }
  }
  return false
}

/** 把规则体切成「声明段 / 注释段」 */
function splitBody(src, rule) {
  const body = src.slice(rule.bodyStart, rule.bodyEnd)
  const segs = []
  let i = 0
  let buf = ''
  const flush = () => { const raw = buf.trim(); if (raw !== '') segs.push({ type: 'decl', raw }); buf = '' }
  while (i < body.length) {
    const ch = body[i]
    if (ch === '/' && body[i + 1] === '*') {
      flush()
      const end = body.indexOf('*/', i + 2)
      segs.push({ type: 'comment', raw: body.slice(i, end + 2) })
      i = end + 2
      continue
    }
    if (ch === '"' || ch === "'") {
      const q = ch
      let j = i + 1
      while (j < body.length) { if (body[j] === '\\') { j += 2; continue } if (body[j] === q) { j++; break } j++ }
      buf += body.slice(i, j)
      i = j
      continue
    }
    if (ch === ';') { flush(); i++; continue }
    buf += ch
    i++
  }
  flush()
  return segs
}
const propOf = (raw) => {
  const c = raw.indexOf(':')
  return c < 0 ? null : raw.slice(0, c).trim()
}

/**
 * 对单个重复组生成合并编辑。
 * @param {string} src 当前文本
 * @param {Array} rules 当前解析结果
 * @param {Array} list 同 (上下文, 选择器) 的规则，按源码序
 * @param {boolean} conservative 是否按静态三判处理（false = 乐观全搬，交给模拟器验证）
 * @returns {{text, edits, stats, danger}|null}
 */
function planGroup(src, rules, list, conservative) {
  const target = list[list.length - 1]
  const spec = specificity(target.selector)

  const targetLines = []
  for (const seg of splitBody(src, target)) targetLines.push(seg.raw)
  const targetProps = new Set(targetLines.map(propOf).filter(Boolean))

  // 每个 source 声明过的属性集（用来判定「更靠后的 source 已声明」）
  const sourceProps = list.slice(0, -1).map((s) => new Set(splitBody(src, s).filter((x) => x.type === 'decl').map((x) => propOf(x.raw))))

  const sources = []
  let blocked = 0
  let deadDropped = 0
  for (let si = 0; si < list.length - 1; si++) {
    const s = list[si]
    const segs = splitBody(src, s)
    const move = []
    const keep = []
    for (const d of segs.filter((x) => x.type === 'decl' && propOf(x.raw))) {
      const p = propOf(d.raw)
      // 判据 1：目标块已声明 → 死声明
      if (targetProps.has(p)) { deadDropped++; continue }
      // 判据 2：更靠后的 source 已声明 → 死声明
      if (sourceProps.slice(si + 1).some((set) => set.has(p))) { deadDropped++; continue }
      // 判据 3：区间内有等特异性、共命中、同属性的规则 → 留在原处
      const blocker = conservative
        ? rules.find(
            (r) =>
              r.kind === 'style' &&
              r.index > s.index &&
              r.index < target.index &&
              specEqual(specificity(r.selector), spec) &&
              coMatchable(r.selector, s.selector) &&
              r.decls.some((dd) => dd.prop === p)
          )
        : null
      if (blocker) { keep.push(d.raw); blocked++ } else move.push(d.raw)
    }
    sources.push({ rule: s, move, keep, comments: segs.filter((x) => x.type === 'comment').map((x) => x.raw) })
  }

  // 危险组合：组选择器的类 ∪ 共命中拦路规则的类（聚焦验证必须覆盖）
  const groupClasses = rightmostClasses(target.selector)
  const danger = []
  for (const s of sources) {
    const props = new Set(splitBody(src, s.rule).filter((x) => x.type === 'decl').map((x) => propOf(x.raw)))
    for (const r of rules) {
      if (r.kind !== 'style') continue
      if (r.index <= s.rule.index || r.index >= target.index) continue
      if (!specEqual(specificity(r.selector), spec)) continue
      if (!coMatchable(r.selector, s.rule.selector)) continue
      if (!r.decls.some((d) => props.has(d.prop))) continue
      const combo = [...new Set([...groupClasses, ...rightmostClasses(r.selector)])]
      if (combo.length && combo.length <= 5) danger.push(combo)
    }
  }
  const uniqDanger = []
  const seen = new Set()
  for (const c of danger) { const k = [...c].sort().join('+'); if (!seen.has(k)) { seen.add(k); uniqDanger.push(c) } }

  const edits = []
  const tIndent = indentOf(target.start)
  const bodyIndent = tIndent + '  '
  // 顺序很关键：搬来的声明**必须前置**（它们在源文件里本来就位于目标块之前；
  // 追加到尾部会把简写 / 长笔的相对顺序弄反）。
  // 去重方向同样关键：多个 source 声明同一属性时**后来者赢**（源码序在后的块赢），
  // 早到的同名声明要丢掉；目标块已有的属性则整个赢过所有 source（它是最后一次出现）。
  const movedList = []
  for (const s of sources) {
    for (const raw of s.move) {
      const p = propOf(raw)
      const at = movedList.findIndex((m) => m.prop === p)
      if (at >= 0) movedList[at] = { prop: p, raw } // 后来者替换先到者，位置留在原处
      else movedList.push({ prop: p, raw })
    }
  }
  const movedLines = []
  let moved = 0, dropped = 0
  for (const m of movedList) {
    if (targetProps.has(m.prop)) dropped++
    else { movedLines.push(m.raw); moved++ }
  }
  const mergedLines = [...movedLines, ...targetLines]
  for (const s of sources) {
    if (s.keep.length > 0) continue // 有残留的块不删，注释留在原处
    for (const c of s.comments) mergedLines.push(c)
  }
  const body = mergedLines
    .map((l) => (propOf(l) ? bodyIndent + l.trim().replace(/;?\s*$/, '') + ';' : (l.trim() === '' ? '' : bodyIndent + l.trim())))
    .join('\n')
  edits.push({ start: target.start, end: target.end, replacement: `${src.slice(target.start, target.bodyStart)}\n${body}\n${tIndent}}` })

  let removed = 0
  for (const s of sources) {
    if (s.keep.length === 0) {
      let end = s.rule.end
      while (src[end] === '\r' || src[end] === '\n') end++
      edits.push({ start: s.rule.start, end, replacement: '' })
      removed++
    } else {
      const sIndent = indentOf(s.rule.start)
      const keepBody = s.keep.map((l) => sIndent + '  ' + l.trim().replace(/;?\s*$/, '') + ';').join('\n')
      const cmts = s.comments.map((c) => sIndent + '  ' + c.trim()).join('\n')
      edits.push({
        start: s.rule.start,
        end: s.rule.end,
        replacement: `${src.slice(s.rule.start, s.rule.bodyStart)}\n${keepBody}${cmts ? '\n' + cmts : ''}\n${sIndent}}`,
      })
    }
  }

  if (moved === 0 && removed === 0 && edits.length === 1) return null
  edits.sort((a, b) => b.start - a.start)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  return { text: out, edits, danger: uniqDanger, stats: { moved, dropped: dropped + deadDropped, removed, blocked } }
}

/* ---------- 同名 @container / @media 块合并 ---------- */

/** 同 (上下文, at-rule 前导) 出现多次的 at-rule 组 */
function atRuleGroups(rulesList) {
  const map = new Map()
  for (const r of rulesList) {
    if (r.kind !== 'at') continue
    const key = r.contextKey + ' ||| ' + r.selector
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return [...map.entries()].filter(([, l]) => l.length > 1)
}

/** 把一段文本的每行缩进从 from 平移到 to（负数 = 减少，行首空白不够则不动） */
function shiftIndent(block, from, to) {
  const delta = to.length - from.length
  if (delta === 0) return block
  return block
    .split('\n')
    .map((l) => {
      const lead = (/^[ \t]*/.exec(l) || [''])[0].length
      if (delta > 0) return ' '.repeat(delta) + l
      const cut = Math.min(-delta, lead)
      return l.slice(cut)
    })
    .join('\n')
}

/**
 * 合并同名 at-rule 块：把其余块的**直接子内容**（规则 + 注释）并进目标块。
 * direction 'last'：搬进最后一个块（子内容前插，保持相对序）；
 * direction 'first'：搬进第一个块（子内容后插）。哪个过模拟器用哪个。
 */
function planAtRuleGroup(src, rules, list, direction) {
  const target = direction === 'first' ? list[0] : list[list.length - 1]
  const others = list.filter((r) => r !== target)
  const tIndent = indentOf(target.start)
  const bodyIndent = tIndent + '  '

  const innerTexts = []
  for (const r of direction === 'first' ? list.slice(1) : list.slice(0, -1)) {
    // 只剥「首行之前的空白」与「尾空白」——不能用 /^\s+/：它会把第一行自己的缩进也吃掉，
    // 搬过去的孩子第一行就顶格（已经踩过一次，diff 里看得见）。
    const inner = src.slice(r.bodyStart, r.bodyEnd).replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '')
    if (inner !== '') innerTexts.push(shiftIndent(inner, indentOf(r.start) + '  ', bodyIndent))
  }
  if (!innerTexts.length) return null
  const movedText = innerTexts.join('\n\n')

  const edits = []
  if (direction === 'first') {
    // 目标块尾部（收尾 } 之前）后插：tIndent 让收尾 } 保持顶格
    edits.push({ start: target.bodyEnd, end: target.bodyEnd, replacement: `\n${movedText}\n${tIndent}` })
  } else {
    // 目标块首部（起始 { 之后）前插：尾部只补一个换行——
    // 早期版本在这里多补了一个 bodyIndent，搬完留下一行「只有两个空格」的尾空白行。
    edits.push({ start: target.bodyStart, end: target.bodyStart, replacement: `\n${movedText}\n` })
  }
  for (const r of others) {
    let end = r.end
    while (src[end] === '\r' || src[end] === '\n') end++
    edits.push({ start: r.start, end, replacement: '' })
  }
  edits.sort((a, b) => b.start - a.start)
  let out = src
  for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end)

  // 注意：这里**不能**用 diffWinners 的 required 做聚焦——required 的语义是
  // 「元素必须同时包含全部类」，at-rule 的子规则类并集动辄几十个，传进去会把元素集
  // 过滤空、diff 恒为 0（假通过）。块合并一律走全量比对。

  // 被迁移的规则 key：源 at-rule 块自身（合并后消失）+ 其全部直接子规则（易位）。
  // 收尾的「源码序保持」检查要把这些 key 从新旧两侧都剔掉再比对——at-rule 合并
  // 的本质就是迁移规则，易位后的序列当然不再是旧序列的子序列；剔除后剩下的规则
  // 必须仍保持相对序。安全性由级联零差异证明，顺序检查只保证「可比对」。
  const keyOfLocal = (r) => r.contextKey + '|' + r.selector
  const movedKeys = others.map(keyOfLocal)
  for (const r of others) {
    // 独立解析源块：rules[0] 是 at-rule 自身，其余全是它的后代（含可能的嵌套 at-rule）
    for (const c of parseCss(src.slice(r.start, r.end)).rules.slice(1)) movedKeys.push(keyOfLocal(c))
  }
  return { text: out, edits, movedKeys }
}

/* ---------- 逐组合并 ---------- */

let work = text
let workRules = rules
const accepted = []
const skipped = []
const processed = new Set() // 已裁决的组不重复处理（跳过的不重试，接受过的也不重试）
let guard = 0

while (guard++ < 500) {
  const pending = duplicateGroups(workRules).filter(([k]) => !processed.has(k))
  if (!pending.length) break
  const [key, list] = pending[0]
  const groupClasses = rightmostClasses(list[0].selector)

  const attempt = planGroup(work, workRules, list, strict)
  let acceptedThis = false
  if (attempt) {
    const before = parseCss(work)
    const after = parseCss(attempt.text)
    const diffs = diffWinners(before.rules, after.rules, { required: groupClasses, extra: attempt.danger })
    if (diffs.length === 0) {
      work = attempt.text
      workRules = after.rules
      accepted.push({ key, ...attempt.stats })
      acceptedThis = true
    }
  }
  // 乐观试搬不成立 → 静态三判重试；仍不成立 → 这一组留待人工决策（带上差异明细，否则没法决策）
  if (!acceptedThis) {
    const conservative = planGroup(work, workRules, list, true)
    let okConservative = false
    let whyDiffs = []
    if (attempt) {
      const before = parseCss(work)
      const after = parseCss(attempt.text)
      whyDiffs = diffWinners(before.rules, after.rules, { required: groupClasses, extra: attempt.danger })
    }
    if (conservative && conservative.stats.moved + conservative.stats.removed > 0) {
      const before = parseCss(work)
      const after = parseCss(conservative.text)
      const diffs = diffWinners(before.rules, after.rules, { required: groupClasses, extra: conservative.danger })
      if (diffs.length === 0) {
        work = conservative.text
        workRules = after.rules
        accepted.push({ key, ...conservative.stats, conservative: true })
        okConservative = true
      } else whyDiffs = diffs
    }
    if (!okConservative) skipped.push({ key, why: '乐观与静态三判都会改级联', diffs: whyDiffs.slice(0, 3) })
  }
  processed.add(key)
}

/* ---------- 同名 at-rule 块合并 ---------- */

const acceptedAt = []
const skippedAt = []
const relocated = new Set() // 被 at-rule 合并迁移过的规则 key（顺序检查要剔除）
if (mergeAtrules) {
  const processedAt = new Set()
  let guardAt = 0
  while (guardAt++ < 200) {
    const pending = atRuleGroups(workRules).filter(([k]) => !processedAt.has(k))
    if (!pending.length) break
    const [key, list] = pending[0]
    let done = false
    // 方向优先 first：并进更靠前的块——响应式规则集中在文件中前部（§5 的
    // 95-responsive.css 目标），把散在视图段的晚块并回来比反过来更贴近终局。
    for (const direction of ['first', 'last']) {
      const attempt = planAtRuleGroup(work, workRules, list, direction)
      if (!attempt) break
      const before = parseCss(work)
      const after = parseCss(attempt.text)
      const diffs = diffWinners(before.rules, after.rules, {})
      if (diffs.length === 0) {
        work = attempt.text
        workRules = after.rules
        acceptedAt.push({ key, direction })
        attempt.movedKeys.forEach((k) => relocated.add(k))
        done = true
        break
      }
    }
    if (!done) skippedAt.push(key)
    processedAt.add(key)
  }
}

/* ---------- 全量验证 ---------- */

// 行尾归一：产物一律 LF（行尾真源 = git 根的 .gitattributes）；脚本生成的片段用的是 \n，
// 旧源文件可能带 CRLF——不归一就会写出混合行尾（check-encoding 第一次跑就抓到过，那正是它该干的活）
const out = work.replace(/\r\n/g, '\n')
const { rules: newRules } = parseCss(out)
const norm = (arr) => arr.map((c) => c.replace(/\s+/g, ' ').trim()).sort()
const oldC = norm(comments.map((c) => c.text))
const newC = norm(parseCss(out).comments.map((c) => c.text))
const missing = oldC.filter((c) => !newC.includes(c))
const commentOk = oldC.length === newC.length && missing.length === 0

const keyOf = (r) => r.contextKey + '|' + r.selector
// at-rule 合并迁移过的规则从两侧剔除（见 relocated 的说明）；样式合并不迁移规则，
// 只删源块 / 原地重写目标块，删元素不破坏子序列关系。
const oldKeys = rules.map(keyOf).filter((k) => !relocated.has(k))
let oi = 0
let orderOk = true
for (const k of newRules.map(keyOf).filter((k) => !relocated.has(k))) {
  let found = -1
  for (let j = oi; j < oldKeys.length; j++) if (oldKeys[j] === k) { found = j; break }
  if (found < 0) { orderOk = false; break }
  oi = found + 1
}

const diffs = diffWinners(rules, newRules, {})
const dupAfter = duplicateGroups(newRules).reduce((n, [, l]) => n + l.length - 1, 0)
const dupBefore = duplicateGroups(rules).reduce((n, [, l]) => n + l.length - 1, 0)
const dupAtAfter = atRuleGroups(newRules).reduce((n, [, l]) => n + l.length - 1, 0)
const dupAtBefore = atRuleGroups(rules).reduce((n, [, l]) => n + l.length - 1, 0)

/* ---------- 报告 ---------- */

const sum = (k) => accepted.reduce((n, a) => n + (a[k] || 0), 0)
console.log(`merge-css styles.css${dryRun ? '（dry-run，不落盘）' : ''}`)
console.log(`  重复定义      ${dupBefore} 处 → ${dupAfter} 处`)
console.log(`  合并组数      ${accepted.length} 组（其中静态判定 ${accepted.filter((a) => a.conservative).length} 组）`)
console.log(`  并入声明      ${sum('moved')} 条；丢弃死声明/被覆盖 ${sum('dropped')} 条；整块移除 ${sum('removed')} 个`)
console.log(`  跳过组数      ${skipped.length} 组`)
if (mergeAtrules) {
  console.log(`  同名断点      ${dupAtBefore} 处 → ${dupAtAfter} 处（合并 ${acceptedAt.length} 组，跳过 ${skippedAt.length} 组）`)
}
console.log(`  注释          ${oldC.length} → ${newC.length} 条 ${commentOk ? '（一条不丢）' : '（有丢失！）'}`)
console.log(`  源码序保持    ${orderOk ? '是' : '否'}`)
console.log(`  级联差异      ${diffs.length} 处`)

if (skipped.length) {
  console.log('  -- 跳过的组（需人工决策；附前 3 条级联差异）--')
  skipped.slice(0, 8).forEach((s) => {
    console.log(`   ${s.key.split(' ||| ')[1] || s.key}  ${s.why}`)
    for (const d of s.diffs || []) console.log(`       ${d.key}  ${d.prop}: ${d.from} → ${d.to}`)
  })
  if (skipped.length > 8) console.log(`   …另 ${skipped.length - 8} 组`)
}
if (mergeAtrules && skippedAt.length) {
  console.log('  -- 跳过的同名断点 --')
  skippedAt.forEach((k) => console.log('   ' + k.split(' ||| ')[1]))
}
if (missing.length) {
  console.log('  -- 丢失的注释 --')
  missing.slice(0, 8).forEach((c) => console.log('   ' + c.slice(0, 60)))
}
if (diffs.length) {
  console.log('  -- 级联差异明细（前 20）--')
  diffs.slice(0, 20).forEach((d) => console.log(`   ${d.key}  ${d.prop}: ${d.from} → ${d.to}`))
}

const ok = commentOk && orderOk && diffs.length === 0
if (outPath) {
  fs.writeFileSync(outPath, out)
  console.log(`merge-css: 结果已另存 ${path.relative(projectDir, outPath).replace(/\\/g, '/')}`)
}
if (!ok) {
  console.log('merge-css: 验证未通过，不写盘')
  process.exit(1)
}
if (dryRun) {
  console.log('merge-css: dry-run 完成（验证通过，未落盘）')
} else {
  fs.writeFileSync(file, out)
  console.log('merge-css: 已写回 styles.css')
}
