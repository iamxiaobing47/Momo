// 硬编码文案守卫：src/ 下**字符串字面量**里不许再出现 CJK（注释不算——中文注释是文档）。
//
// 目的：把「文案一律从 src/momo/i18n 的 copy 读」这条约定变成可执行检查。
// 用法：
//   node scripts/lint-copy.mjs           # 有残留 → 列出并 exit 1（CI / 提交前）
//   node scripts/lint-copy.mjs --report  # 只报告不失败（迁移期当进度尺）
//
// 四类**刻意**的例外（都在下面的白名单里，改动前先读理由）：
//   1. 开发者日志（console.* 的参数）：日志要稳定、可 grep，不随用户语言变；
//   2. 会落盘的默认值（DEFAULT_BRAND_NAME）：它是 data.json 里的数据，不是界面文案；
//      本地化它会悄悄改写用户已存的值 —— 详见 i18n/zh/meta.ts 的说明；
//   3. 地名数据字典（locRegions.ts 的 BUILTIN_LOC_REGIONS）：大洲 / 国家名与地名
//      本身同级，是**专有名词数据不是界面文案**——用户在 frontmatter 里写的就是
//      中文，星球上的坐标也没有本地化一说，i18n 只管「大洲 / 国家 / 地点」三个
//      档位名与设置页标签（完整论证见该文件头注释）。用 ctx: '*' 整文件豁免：
//      字典值挂在城市名（属性名）下，逐条 ctx 列不出来。
//   4. 首次安装的播种卡内容（service/firstCard.ts）：与 2 同类——它是写进用户
//      vault 的**落盘内容**（正文 / 标签 / 地点），三语同一张卡。它也不能住进
//      i18n 字典：i18n-glyph-guard 挡的正是「ja 字典里混进简体专用字形」。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const srcDir = path.join(projectDir, 'src')
const reportOnly = process.argv.includes('--report')

/** CJK + 全角标点 */
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/

/** 白名单：允许保留中文的「非界面文案」字面量，按出现顺序说明理由 */
const ALLOW = [
  { file: 'momo/types/prefs.ts', ctx: 'DEFAULT_BRAND_NAME', why: '落盘默认值（数据，不是文案）' },
  { file: 'momo/locations/locRegions.ts', ctx: '*', why: '内置地名归属字典（专有名词数据，不本地化）' },
  { file: 'momo/locations/locRoster.ts', ctx: '*', why: '世界城市名册（三语地名数据，专有名词，不本地化）' },
  // 首次安装播种卡的内容（正文 / 标签 / 地点）：与 DEFAULT_BRAND_NAME 同一类——
  // 它是**写进用户 vault 的落盘内容**，不是渲染出来的界面文案，三语同一张卡
  // （2026-10-13 用户裁决）。它也不能住进 i18n：`i18n-glyph-guard` 挡的正是
  // 「ja 字典里混进简体专用字形」，「问候」当场就红（详见该文件头注释）。
  { file: 'momo/service/firstCard.ts', ctx: 'FIRST_CARD_TAG', why: '首次播种卡的落盘标签（数据，不是文案）' },
  { file: 'momo/service/firstCard.ts', ctx: 'FIRST_CARD_LOCATION', why: '首次播种卡的落盘地点（名册正名，专有名词数据）' },
]
// （原第二条白名单 `ExportSummary` 随导出功能整块移除：那个「导出-小记-*.md」
//   文件名前缀已经不存在，白名单条目同步退场。）

/** @returns {string[]} */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) {
      // 字典目录是中文**唯一**的合法住所，不扫它自己（否则守卫会一直在喊自己）
      if (path.relative(srcDir, p).replace(/\\/g, '/') === 'momo/i18n') return []
      return walk(p)
    }
    return /\.tsx?$/.test(d.name) ? [p] : []
  })
}

/** 字面量是不是 console.* / 错误上报的参数（开发者日志） */
function inConsoleCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const expr = p.expression.getText()
      return /^(console\.(debug|log|info|warn|error|trace)|this\.log)/.test(expr)
    }
    if (ts.isStatement(p) || ts.isFunctionLike(p) || ts.isJsxElement(p)) return false
  }
  return false
}

/** 取节点所在的属性名 / 变量名当 ctx，供白名单匹配 */
function ctxOf(node, sf) {
  let ctx = ''
  for (let p = node.parent; p && !ctx; p = p.parent) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) ctx = p.name.getText(sf)
    else if (ts.isVariableDeclaration(p)) ctx = p.name.getText(sf)
    else if (ts.isPropertyDeclaration(p)) ctx = p.name.getText(sf)
    else if (ts.isJsxAttribute(p)) ctx = p.name.getText(sf)
  }
  return ctx
}

/** 字面量四形态的文本（字符串 / 无插值模板 / JSX 文本 / 插值模板的静态段） */
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isJsxText(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => s.literal.text).join('')
  }
  return null
}

const hits = []
for (const file of walk(srcDir)) {
  const rel = path.relative(projectDir, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  const check = (node, value) => {
    if (!CJK.test(value)) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    const ctx = ctxOf(node, sf)
    const allowed =
      inConsoleCall(node) ||
      ALLOW.some((a) => a.file === rel.replace(/^src\//, '') && (a.ctx === '*' || a.ctx === ctx))
    if (!allowed) hits.push({ file: rel, line: line + 1, ctx, value: value.replace(/\s+/g, ' ') })
  }

  const visit = (node) => {
    const value = literalText(node)
    if (value !== null) check(node, value)
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

// ---- 品牌词守卫（BUG-105c）：i18n 字典里不许写死品牌名 ----------------------
//
// 上面那遍 CJK 扫描是为「中文只活在 zh/ 里」设计的，而且刻意跳过 i18n 目录；
// 品牌词 `prefs.brandName`（默认 Momo）是 ASCII，写死后 lint 天然照不到——
// tags 域就这样在改名用户眼前露出「这批 Momo 身上有」。这里单开一遍**只扫
// i18n 字典**的字面量检查：针值从 DEFAULT_BRAND_NAME 解析（解析不到 = 守卫
// 本身失效，大声退出而不是静默放行），命中即报告，除非该键在豁免表里。
// 豁免表当前为空：品牌名一律走 `(brand: string)` 入参，一处都不该写死；
// 将来若真有「品牌词本身」的文案（教用户默认叫什么之类）再加，并写明理由。
const BRAND_ALLOW = []

const prefsText = fs.readFileSync(path.join(srcDir, 'momo', 'types', 'prefs.ts'), 'utf8')
const brandPin = /export const DEFAULT_BRAND_NAME = '([^']+)'/.exec(prefsText)?.[1]
if (!brandPin) {
  console.error('[lint-copy] 品牌词守卫解析不到 DEFAULT_BRAND_NAME（src/momo/types/prefs.ts）——守卫失效，拒绝放行')
  process.exit(1)
}

/** 只扫 i18n 字典（与 walk 互补：walk 刻意跳过它） */
function walkI18n(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return walkI18n(p)
    return /\.tsx?$/.test(d.name) ? [p] : []
  })
}

const brandHits = []
for (const file of walkI18n(path.join(srcDir, 'momo', 'i18n'))) {
  const rel = path.relative(projectDir, file).replace(/\\/g, '/')
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TS)
  const visit = (node) => {
    const value = literalText(node)
    if (value !== null && value.includes(brandPin)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      const ctx = ctxOf(node, sf)
      const allowed = BRAND_ALLOW.some((a) => rel.endsWith(a.file) && (a.ctx === '*' || a.ctx === ctx))
      if (!allowed) brandHits.push({ file: rel, line: line + 1, ctx, value: value.replace(/\s+/g, ' ') })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

if (hits.length === 0 && brandHits.length === 0) {
  console.log(`[lint-copy] 通过：src/ 下没有硬编码界面文案，i18n 字典里没有写死的品牌名（${brandPin}）`)
  process.exit(0)
}

if (hits.length > 0) {
  const byFile = new Map()
  for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1)
  console.log(`[lint-copy] 硬编码文案残留：${hits.length} 处 / ${byFile.size} 个文件`)
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`)
  console.log('\n前 40 处：')
  for (const h of hits.slice(0, 40)) console.log(`  ${h.file}:${h.line}  [${h.ctx}]  ${h.value}`)
  console.log('\n修法：从 src/momo/i18n 的 `copy` 读（见 .code/AGENTS.md §文案）')
}

if (brandHits.length > 0) {
  console.log(`\n[lint-copy] i18n 字典里写死品牌名（${brandPin}）：${brandHits.length} 处`)
  for (const h of brandHits) console.log(`  ${h.file}:${h.line}  [${h.ctx}]  ${h.value}`)
  console.log('修法：写成 (brand: string) => string，界面侧传 prefs.brandName（见 .code/AGENTS.md §2.4）')
}

if (reportOnly) {
  console.log('\n（--report：只报告，不判失败）')
  process.exit(0)
}
process.exit(1)
