// styles.css 附加守卫：管 stylelint 不管的三件事（治理方案 §7）。
//
//   node scripts/lint-css.mjs            有问题 → 列出来并 exit 1
//   node scripts/lint-css.mjs --report  只报不失败（迁移期当进度尺）
//
// stylelint 已覆盖：!important / 特异性 / 非法 hex / 块内重复属性 / 空注释。
// 这里补的是「按方案口径、stylelint 表达不了」的四条：
//   1. 重复定义：同 (上下文, 选择器) 出现多次 —— 合并进度尺，P1 阶段归零
//   2. 同名断点：同一个 @container / @media 断点被打开多次 —— 调整要改多处
//   3. 令牌外泄：组件规则里出现裸 hex（令牌段 / 主题覆写块 / 响应式覆写块除外；
//      var() 降级 fallback 按治理方案 §4 铁律 1 的白名单不算外泄，见 hexLiterals）
//   4. 弱墨阶当小字色：color: var(--momo-ink-5 / -ink-6)（BUG-17）——这档在十套
//      方案上全部低于 4.5:1（3.1~3.7），check-contrast 的 PAIRS 表达不了
//      「这个令牌出现在 color: 里」，在这里按规则文本拦。要当图标 / 描边等
//      非文字用途时写别的属性（border-color / fill 等）不受这条拦。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCss, parseCss, duplicateGroups, hexLiterals } from './css-model.mjs'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const reportOnly = process.argv.slice(2).includes('--report')
const file = path.join(projectDir, 'styles.css')
const { text } = readCss(file)
const { rules } = parseCss(text)
const style = rules.filter((r) => r.kind === 'style')

// 合法写色值的地方：四个令牌宿主（逗号组）、主题覆写、@container 内的覆写。
// 第五个宿主 .momo-globe-card 与 .momo-set-scheme 同源同批：星球视图那张「夜空」卡
// 的 --globe-* 色板是**主题无关**的（夜光地球 + 星点整套夜空隐喻，浅色方案下
// 也必须是深底），十套方案同值，进 themes/*.css 只会变成十一份复制。取值即设计稿
// F7a 逐字值，定义处与消费端都在 60-design.css 的星球段落里。
// （v0.9.26 起色板少了两支：大气圈的 glow/rim 连同那两颗描边圆一起删了。）
const TOKEN_HOSTS = /^(:root|\.momo-app|\.momo-confirm|\.momo-settings|\.momo-set-scheme|\.momo-globe-card)$/
const isTokenHost = (sel) => sel.split(',').map((s) => s.trim()).every((s) => TOKEN_HOSTS.test(s))
const mayWriteColor = (r) =>
  isTokenHost(r.selector) || r.selector.includes('.momo-theme-') || r.contextKey.includes('@container')

const problems = { duplicates: [], dupAtRules: [], leaks: [], weakTextInk: [] }

for (const [key, list] of duplicateGroups(rules)) {
  const sel = list[0].selector
  const where = list.map((r) => lineOf(text, r.start))
  problems.duplicates.push({ sel, ctx: list[0].contextKey, n: list.length, lines: where })
}

const atMap = new Map()
for (const r of rules) {
  if (r.kind !== 'at') continue
  const key = r.contextKey + ' ||| ' + r.selector
  if (!atMap.has(key)) atMap.set(key, [])
  atMap.get(key).push(lineOf(text, r.start))
}
for (const [key, lines] of atMap) {
  if (lines.length > 1) problems.dupAtRules.push({ at: key.split(' ||| ')[1], lines })
}

// 「color: 画的是图标 / 禁用态」的既有消费者（非文字 3:1 或 WCAG 豁免，不当小字判）。
// 出现新的这 类用法时在这里登记理由；文字用途一律 ink-4 起（BUG-17）。
const NONTEXT_INK = [
  '.momo-empty-icon', // 空态的大图标（SVG stroke 继承 color）
  '.momo-pop-check', // 14px 圈形勾选标记（图形，SC 1.4.11 口径）
  '.momo-set-icon.is-upload.is-full', // 上传完成的大图标
  '.momo-set-icon.is-broken', // 图标损坏占位
]
const isNontextInk = (sel) => NONTEXT_INK.some((w) => sel.includes(w))

for (const r of style) {
  if (mayWriteColor(r)) continue
  const hex = r.decls.flatMap((d) => hexLiterals(d.value))
  if (hex.length) problems.leaks.push({ sel: r.selector, hex, line: lineOf(text, r.start) })
  // BUG-17：ink-5 / ink-6 当文字色，四套方案全部低于 4.5:1。2026-09-30 已把
  // styles.src 里的存量清干净（改 ink-4），这条拦的是回归。
  if (isNontextInk(r.selector)) continue
  for (const d of r.decls) {
    if (/^color$/.test(d.prop) && /var\(--momo-ink-(5|6)\)/.test(d.value)) {
      problems.weakTextInk.push({ sel: r.selector, line: lineOf(text, r.start), v: d.value.trim() })
    }
  }
}

const nDup = problems.duplicates.reduce((n, d) => n + d.n - 1, 0)
console.log(`lint-css styles.css`)
console.log(`  重复定义      ${nDup} 处 / ${problems.duplicates.length} 组   （目标 0）`)
console.log(`  同名断点      ${problems.dupAtRules.length} 个            （目标 0）`)
console.log(`  令牌外泄 hex  ${problems.leaks.length} 条规则            （目标 0）`)
console.log(`  弱墨阶文字色  ${problems.weakTextInk.length} 条规则            （目标 0）`)

if (problems.duplicates.length) {
  console.log('  -- 重复定义明细 --')
  problems.duplicates
    .sort((a, b) => b.n - a.n)
    .slice(0, 12)
    .forEach((d) => console.log(`   x${d.n}  ${d.sel}  @ L${d.lines.join('/L')}${d.ctx ? '  [' + d.ctx + ']' : ''}`))
}
if (problems.dupAtRules.length) {
  console.log('  -- 同名断点明细 --')
  problems.dupAtRules.forEach((d) => console.log(`   ${d.at}  @ L${d.lines.join('/L')}`))
}
if (problems.leaks.length) {
  console.log('  -- 令牌外泄明细 --')
  problems.leaks.slice(0, 12).forEach((l) => console.log(`   L${l.line}  ${l.sel}  ${l.hex.join(' ')}`))
}
if (problems.weakTextInk.length) {
  console.log('  -- 弱墨阶文字色明细 --')
  problems.weakTextInk.slice(0, 12).forEach((l) =>
    console.log(`   L${l.line}  ${l.sel}  ${l.v}（四套方案上 < 4.5:1，文字改 ink-4）`),
  )
}

const clean =
  nDup === 0 && problems.dupAtRules.length === 0 && problems.leaks.length === 0 && problems.weakTextInk.length === 0
if (clean) {
  console.log('lint-css: 通过')
} else if (reportOnly) {
  console.log('lint-css: 有存量（--report 模式不失败）')
} else {
  console.log('lint-css: 未通过')
  process.exit(1)
}

function lineOf(text, pos) {
  return text.slice(0, pos).split('\n').length
}
