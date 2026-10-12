// styles.css 构建：styles.src 下的 .css 按路径序拼成产物（治理方案 §5 路线 A）。
//
//   node scripts/build-css.mjs           构建并写盘 styles.css
//   node scripts/build-css.mjs --check   只比对不写盘：产物与源不一致 → exit 1（提交前用）
//
// 为什么必须有构建：Obsidian 只加载插件目录下的一个 styles.css，「拆文件」必须以
// 拼接收尾。层序由文件名的数字前缀保证，人不用守；层内改动 diff 干净。
//
// 分片按「层 → 组件」两级组织（2026-10-03 分包）：
//   - **层包** `styles.src/NN-<组件族>/`（NN = 层序，与原来的 NN-*.css 同名分片一一对应）；
//     层内按组件切分，文件名 `NNN-<组件>.css` 的三位序号 = 该组件在**原层内的先后顺序**。
//     序号即层内次序这条不能丢：同特异性 tie 靠源序决胜，序号让「谁盖谁」可读且可预期。
//   - **单文件层** `styles.src/NN-*.css`：整个层只有一个关注点（00 令牌 / 10 基础 /
//     50 窄侧栏 / 75 宿主 / 95 响应式），不硬凑成包。
//     `95-responsive.css` 必须是这个单文件形态——门禁 1 按文件名认它。
//   - **配色方案** `styles.src/themes/<id>.css`（一个方案一个文件，见该目录的 README）。
//     配色方案没有数字前缀，按「70 段」插入——排在 60 之后、75 之前，
//     这样它们能覆写 00-tokens 的同名令牌、又不会盖掉后面的设置页规则。
// 收集是**递归**的：新增组件分片只要放进对应层包、序号不撞，就自动进拼接序。
//
// **导出 buildCss() 是被 esbuild.config.mjs 调用的**：esbuild 只产 main.js，
// styles.css 是另一条链。v0.7.6 踩过的坑——改完 CSS 只跑 npm run build，部署进
// vault 的是旧样式（Obsidian 只认一个 styles.css，报应全在用户眼里）。现在 JS 构建
// 前先重建 CSS，两条链永远同源，不需要人记得。
//
// 构建时门禁（都是「架构不变量」，便宜且值得每次构建都查）：
//   1. 断点集中：@container / @media 只允许出现在 95-responsive.css ——
//      「断点最后收」是方案 §5 的硬规则，散落一处就等于没拆；
//   2. !important 配额：全表 0（P3 决议。真要给 reset 段开白名单，先改这里并写清理由）；
//   3. 片段完整：每个分片必须以 } 或 */ 收尾（防截断写盘）；
//   4. 配色方案三处一致（check-themes.mjs）：themes/ 文件、COLOR_SCHEMES、
//      i18n 名字必须一一对应，且令牌清单与基准方案逐项相同——
//      加一套配色要动三处，漏一处只会表现为「色卡预览是白的」，肉眼很难发现；
//   5. 对比度过 WCAG 2.1 AA（check-contrast.mjs）：正文 4.5:1、非文字 3:1，
//      外加墨阶与热力图不许倒挂。低对比的错「看得见但说不清哪里不对」，
//      而且每套配色各有一份色值，改一套容易悄悄弄坏另一套。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkThemes } from './check-themes.mjs'
import { checkContrast } from './check-contrast.mjs'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const srcDir = path.join(projectDir, 'styles.src')
const outFile = path.join(projectDir, 'styles.css')

/**
 * 拼接 styles.src/*.css → styles.css，跑三道架构门禁，返回产物内容。
 *
 * 门禁失败直接 console.error + process.exit：被 buildCss 调用方（esbuild 构建流程）
 * 拿到一份违反架构的 CSS 比拿不到更糟——它会一路部署进 vault。
 *
 * @param checkOnly true = 只比对不写盘（`--check` 用）
 * @returns 产物内容（拼接结果）
 */
export function buildCss(checkOnly = false) {
  if (!fs.existsSync(srcDir)) {
    console.error('build-css: styles.src/ 不存在——本项目的 styles.css 由 styles.src/ 拼接产出，禁止直接手改产物')
    process.exit(2)
  }

  /** 分片清单：递归收集 styles.src 下全部 .css（层包内的组件分片一起进）；
      配色方案 `themes/<id>.css` 统一排在 70 段。
      （排序键 `70.` 里的 `.` 比数字小，所以 theme 一定落在 60 之后、75 之前。） */
  const collectParts = () => {
    const walk = (dir, rel = '') => {
      const out = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          if (childRel === 'themes') continue // 配色方案单独排 70 段
          out.push(...walk(path.join(dir, entry.name), childRel))
        } else if (entry.name.endsWith('.css')) {
          out.push({ rel: childRel, key: childRel })
        }
      }
      return out
    }
    const parts = walk(srcDir)
    const themesDir = path.join(srcDir, 'themes')
    const schemes = fs.existsSync(themesDir)
      ? fs.readdirSync(themesDir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => ({ rel: `themes/${f}`, key: `70.${f}` }))
      : []
    return [...parts, ...schemes].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((x) => x.rel)
  }

  const parts = collectParts()
  if (parts.length === 0) {
    console.error('build-css: styles.src/ 下没有 .css 分片')
    process.exit(2)
  }

  // 行尾归一：产物一律 LF（行尾真源 = git 根的 .gitattributes，eol=lf）。
  // 门的语义是「产物 == 源的拼接」，不是「产物 == 这台机器的行尾」——
  // 旧检出里分片可能还是 CRLF（BUG-98），归一后只有语义漂移才报。
  const contents = new Map(
    parts.map((p) => [p, fs.readFileSync(path.join(srcDir, p), 'utf8').replace(/\r\n/g, '\n')])
  )

  // 门禁 3：分片完整性
  for (const p of parts) {
    const text = contents.get(p)
    const tail = text.replace(/\s+$/, '').slice(-2)
    if (!tail.endsWith('}') && !tail.endsWith('*/')) {
      console.error(`build-css: ${p} 结尾不是 } 或 */（疑似截断写盘）`)
      process.exit(1)
    }
  }

  let out = ''
  for (const p of parts) out += contents.get(p)

  // 门禁 1：断点只住 95-responsive.css
  // （注释里的提及不算——先剥 /* */。）
  const code = out.replace(/\/\*[\s\S]*?\*\//g, '')
  const inResponsive = (file) => file === '95-responsive.css'
  let cursor = 0
  for (const p of parts) {
    const text = contents.get(p)
    const start = out.indexOf(text, cursor)
    cursor = start + text.length
    const body = text.replace(/\/\*[\s\S]*?\*\//g, '')
    const ats = body.match(/@(container|media)\b/g) || []
    if (ats.length && !inResponsive(p)) {
      console.error(`build-css: ${p} 里出现 ${ats.length}个 @container/@media——断点必须全部集中在 95-responsive.css`)
      process.exit(1)
    }
  }

  // 门禁 2：!important 配额 = 0（同样只查代码区）
  const importantCount = (code.match(/!important/g) || []).length
  if (importantCount > 0) {
    console.error(`build-css: 全表 !important ${importantCount} 处——P3 起配额为 0；若确需白名单，改本断言并注释理由`)
    process.exit(1)
  }

  // 门禁 4：配色方案三处一致（--check 也要跑：漂移和漏登记都是要拦的）
  const themes = checkThemes({ quiet: true })
  if (!themes.ok) {
    console.error('build-css: 配色方案一致性检查未通过')
    themes.problems.forEach((p) => console.error(`  × ${p}`))
    process.exit(1)
  }
  themes.lines.forEach((l) => console.log(`  ${l}`))

  // 门禁 5：对比度过 WCAG 2.1 AA
  const a11y = checkContrast({ quiet: true })
  if (!a11y.ok) {
    console.error('build-css: 配色对比度未过 WCAG 2.1 AA')
    a11y.problems.forEach((p) => console.error(`  × ${p}`))
    process.exit(1)
  }
  a11y.lines.forEach((l) => console.log(`  ${l}`))

  if (checkOnly) {
    const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') : ''
    if (current !== out) {
      console.error('build-css: styles.css 与 styles.src/ 拼接结果不一致——跑 npm run build:css 重新生成并提交产物')
      process.exit(1)
    }
    console.log(`build-css: ${parts.length} 个分片拼接 == styles.css（无漂移）`)
  } else if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === out) {
    console.log(`build-css: styles.css 已是最新（${parts.length} 个分片）`)
  } else {
    fs.writeFileSync(outFile, out, 'utf8')
    console.log(`build-css: 已写出 styles.css（${parts.length} 个分片，${Buffer.byteLength(out, "utf8")} B）`)
  }

  return out
}

// CLI 入口（`node scripts/build-css.mjs [--check]`）。被 import 时不执行，
// 所以才需要用 import.meta.url 判断「我是不是主角」——直接执行顶层逻辑会让
// esbuild.config.mjs 每 import 一次就重建一遍。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCss(process.argv.slice(2).includes('--check'))
}

