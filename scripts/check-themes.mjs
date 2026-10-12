// 配色方案一致性守卫（v0.9.31）
//
//   node scripts/check-themes.mjs          单独跑
//   （也会作为 build-css 的第 4 道门禁自动跑）
//
// 「一个配色方案一个文件」之后，新增方案要动**三处**：
//   ① styles.src/themes/<id>.css（令牌）
//   ② src/momo/types/prefs.ts 的 COLOR_SCHEMES（展示顺序 + sanitize 白名单）
//   ③ src/momo/i18n/zh/meta.ts 的 colorScheme（名字与说明）
// 漏任何一处都不会报错——只会表现为「设置页少一张色卡」或「选了没反应」或
// 「色卡预览是白的」。这个脚本把三处钉在一起，构建时必跑：
//   1. 三处的 id **集合**必须相同（多一个 / 少一个都失败）；
//   2. 每个主题文件的令牌清单必须与 mist-blue.css **逐项相同**——少一个令牌，
//      用到它的地方会拿到空值（透明），这是最容易漏、也最难一眼看出的错；
//   3. 每个主题文件的四个宿主选择器必须齐全，且带自己的 .momo-theme-<id>；
//   4. swatch 必须等于该主题的 --momo-accent（BUG-47）；name / desc 非空（BUG-47）；
//   5. .momo-globe-card 局部色板不与任何主题的 page/card/surface 同值（BUG-46）。
//
// 三处怎么加、色值放哪：见 styles.src/themes/README.md。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const themesDir = path.join(projectDir, 'styles.src', 'themes')
const prefsFile = path.join(projectDir, 'src', 'momo', 'types', 'prefs.ts')
const metaFile = path.join(projectDir, 'src', 'momo', 'i18n', 'zh', 'meta.ts')

/** 基准方案：令牌清单以它为准（2026-10-09 删 stone 后换成 mist-blue——最中性的浅色模板，
 *  新增浅色方案照它抄色值最省事；深色的 ink-night 与带矿物色铁律的 clam-white 都不适合当模板） */
const BASELINE = 'mist-blue'
/** 每个主题文件必须给这四个宿主各写一份（第四个是设置页的配色方案卡） */
const HOSTS = ['.momo-app', '.momo-confirm', '.momo-settings', '.momo-set-scheme']

const tokensOf = (text) => [...text.matchAll(/^\s+(--[\w-]+):/gm)].map((m) => m[1])
/** 取单个令牌的值：`--momo-accent: #d9a441;` → `'#d9a441'` */
const tokenValueOf = (text, name) =>
  [...text.matchAll(new RegExp(`^\\s+(${name}):\\s*([^;]+);`, 'gm'))][0]?.[2]?.trim() ?? null
const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()
const diff = (a, b) => {
  const sa = new Set(a)
  const sb = new Set(b)
  return { onlyA: a.filter((x) => !sb.has(x)), onlyB: b.filter((x) => !sa.has(x)) }
}

/**
 * 三处一致性检查。
 *
 * @param {{ quiet?: boolean }} opts quiet = 不打印（由 build-css 调用时让调用方统一输出）
 * @returns {{ ok: boolean, problems: string[], lines: string[] }} 问题清单 + 可打印的摘要行
 */
export function checkThemes({ quiet = false } = {}) {
  const problems = []
  const lines = []

  // ---- ① 文件 → id ----
  if (!fs.existsSync(themesDir)) {
    console.error(`check-themes: ${themesDir} 不存在`)
    process.exit(2)
  }
  const files = fs.readdirSync(themesDir).filter((f) => f.endsWith('.css')).sort()
  const fileIds = files.map((f) => f.replace(/\.css$/, ''))
  if (fileIds.length === 0) {
    console.error('check-themes: styles.src/themes/ 下没有方案文件')
    process.exit(2)
  }

  // ---- ② prefs.ts → COLOR_SCHEMES 的 id（顺序即展示顺序）----
  const prefsText = fs.readFileSync(prefsFile, 'utf8')
  const arrayBlock = prefsText.slice(prefsText.indexOf('export const COLOR_SCHEMES'))
  const arrayEnd = arrayBlock.indexOf('\n]')
  const typeIds = [...prefsText
    .slice(prefsText.indexOf('export type ColorScheme'), prefsText.indexOf('export type ColorScheme') + 300)
    .matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
  const prefIds = [...arrayBlock.slice(0, arrayEnd).matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1])

  // ---- ③ meta.ts → colorScheme 的键 ----
  const metaText = fs.readFileSync(metaFile, 'utf8')
  const head = metaText.indexOf('colorScheme: {')
  const block = metaText.slice(head, metaText.indexOf('\n  },', head))
  const metaIds = [...block.matchAll(/^ {4}'?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1])

  if (!same(fileIds, prefIds)) {
    const d = diff(fileIds, prefIds)
    problems.push(`themes/ 与 COLOR_SCHEMES 不一致：文件多 [${d.onlyA}] · prefs 多 [${d.onlyB}]`)
  }
  if (!same(fileIds, metaIds)) {
    const d = diff(fileIds, metaIds)
    problems.push(`themes/ 与 i18n meta.colorScheme 不一致：文件多 [${d.onlyA}] · i18n 多 [${d.onlyB}]`)
  }
  if (!same(prefIds, typeIds)) {
    const d = diff(prefIds, typeIds)
    problems.push(`COLOR_SCHEMES 与 ColorScheme 联合类型不一致：清单多 [${d.onlyA}] · 类型多 [${d.onlyB}]`)
  }

  // ---- 令牌清单与宿主选择器（以 BASELINE 为基准）----
  // 基准先读：下面按 id 遍历，边遍历边赋值会在读到基准自己之前拿到 null
  const baselinePath = path.join(themesDir, `${BASELINE}.css`)
  if (!fs.existsSync(baselinePath)) {
    console.error(`check-themes: 基准方案 ${BASELINE}.css 不存在，无法比对令牌清单`)
    process.exit(2)
  }
  const baselineTokens = tokensOf(fs.readFileSync(baselinePath, 'utf8'))
  for (const id of fileIds) {
    const text = fs.readFileSync(path.join(themesDir, `${id}.css`), 'utf8')
    // 宿主选择器：每个方案（含基准）都要给四个宿主各写一份
    for (const host of HOSTS) {
      if (!text.includes(`${host}:where(.momo-theme-${id})`)) {
        problems.push(`themes/${id}.css 缺选择器 ${host}:where(.momo-theme-${id})`)
      }
    }
    if (id === BASELINE) continue
    const tokens = tokensOf(text)
    const missing = baselineTokens.filter((t) => !tokens.includes(t))
    const extra = tokens.filter((t) => !baselineTokens.includes(t))
    if (missing.length) problems.push(`themes/${id}.css 少了 ${missing.length} 个令牌：${missing.join(' ')}`)
    if (extra.length) problems.push(`themes/${id}.css 多了 ${extra.length} 个令牌：${extra.join(' ')}`)

    // ---- BUG-46：星球卡局部色板不与主题中性色同值（墨夜曾与 page 逐位相同）----
    const GLOBE_LOCAL = ['#16171b', '#34363c']
    for (const g of GLOBE_LOCAL) {
      for (const n of ['page', 'card', 'surface']) {
        const v = tokenValueOf(text, `--momo-${n}`)
        if (v && v.toLowerCase() === g) {
          problems.push(`themes/${id}.css：--momo-${n} 与 .momo-globe-card 局部色 ${g} 同值，卡片会融进底色`)
        }
      }
    }

    // ---- BUG-47：swatch 必须等于该主题的 --momo-accent ----
    const swatchOf = (id) =>
      [...arrayBlock.slice(0, arrayEnd).matchAll(new RegExp(`id:\\s*'${id}'[^}]*swatch:\\s*'([^']+)'`, 'g'))][0]?.[1]
    const sw = swatchOf(id)
    const acc = tokenValueOf(text, '--momo-accent')
    if (sw && acc && sw.toLowerCase() !== acc.toLowerCase()) {
      problems.push(`COLOR_SCHEMES 的 swatch(${sw}) 与 themes/${id}.css 的 --momo-accent(${acc}) 不一致`)
    }
  }

  // ---- BUG-47：i18n meta.colorScheme 的 name / desc 非空 ----
  for (const m of block.matchAll(/^ {4}'?([a-z0-9-]+)'?:\s*\{([^}]*)\}/gm)) {
    if (!/name:\s*'[^']+'/.test(m[2]) || !/desc:\s*'[^']+'/.test(m[2])) {
      problems.push(`i18n meta.colorScheme.${m[1]} 的 name / desc 有空值`)
    }
  }

  lines.push(
    `check-themes`,
    `  方案文件        ${fileIds.length} 个：${fileIds.join(' / ')}`,
    `  COLOR_SCHEMES   ${prefIds.length} 个：${prefIds.join(' / ')}`,
    `  i18n 名字       ${metaIds.length} 个：${metaIds.join(' / ')}`,
    `  令牌清单        ${baselineTokens.length} 个（基准 ${BASELINE}.css）`,
    problems.length === 0 ? 'check-themes: 通过' : 'check-themes: 未通过',
  )
  if (!quiet) {
    lines.forEach((l) => console.log(l))
    problems.forEach((p) => console.log(`  × ${p}`))
  }
  return { ok: problems.length === 0, problems, lines }
}

// CLI 入口（被 import 时不执行，跟 build-css.mjs 一个套路）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, lines, problems } = checkThemes({ quiet: true })
  lines.forEach((l) => console.log(l))
  problems.forEach((p) => console.log(`  × ${p}`))
  if (!ok) process.exit(1)
}
