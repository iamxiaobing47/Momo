// 图标库（Lucide）下载与生成器 —— 图标可配置化 P0（2026-10-02）。
//
//   node scripts/fetch-icons.mjs [version]
//
// 范式照抄 scripts/fetch-fonts.mjs：单进程、多重试、多源镜像、下载三道闸
// （重定向逐跳限主机白名单 / 流式字节上限 / dist.integrity 摘要比对，机制在
// scripts/fetch-guards.mjs）全过才算完整，坏内容即删绝不留下。解 tar / 解析 SVG /
// 生成 TS 全部纯 node（zlib + 字符串），不引依赖、不拉子进程。
//
// 产物两件（随仓库入库；lucideIcons.ts 是纯数据模块，esbuild 随 main.js 打包，
// 构建与部署链零改动）：
//   src/momo/lucideIcons.ts      LUCIDE_PATHS / LUCIDE_IDS / LUCIDE_SKIPPED / LUCIDE_VERSION
//   src/momo/LUCIDE-LICENSE.txt  ISC 许可原文（从包里原样抽出）
//
// 版本为什么锁死：图标 id 会进用户的 data.json（prefs.icons 的值就是库 id）。
// 浮动静态latest = 用户盘上的 id 某天指到另一枚形状。加版本 = 换生成物 +
// 老 id 仍在（Lucide 不改已发布图标的形状）。
//
// 本机网络备注（2026-10-02 实测）：jsDelivr 不可达；npm registry 直连可达。
// 源列表按顺序试，都失败时先手动把包放到临时目录再重跑（已生成的会跳过）：
//   curl -L -o "$TEMP/momo-icons/lucide-static.tgz" \
//     "https://registry.npmjs.org/lucide-static/-/lucide-static-<version>.tgz"
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchGuarded, integrityOf, streamToFile } from './fetch-guards.mjs'

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT_TS = path.join(projectDir, 'src', 'momo', 'lucideIcons.ts')
const OUT_LICENSE = path.join(projectDir, 'src', 'momo', 'LUCIDE-LICENSE.txt')

/** 锁定版本（改它 = 重新生成；产物头里也写这份，跳过逻辑按它判） */
const PINNED_VERSION = '1.50.0'
// argv[2] 可以是版本号，也可以是 --force（不带版本号强重生成）——以 '--' 开头
// 的按旗标处理，别拿它去拼下载 URL（会拼出 lucide-static@--force.tgz 404）。
const version = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : PINNED_VERSION

/** 最小图标数：低于它说明下到的包不对（半截 / 别的包），直接失败别生成 */
const MIN_ICONS = 1500

/** tarball 源（按顺序；npm 官方 + 国内镜像） */
const sources = (v) => [
  `https://registry.npmjs.org/lucide-static/-/lucide-static-${v}.tgz`,
  `https://registry.npmmirror.com/lucide-static/-/lucide-static-${v}.tgz`,
]

/** 下载链允许落地的主机：npm 官方 + npmmirror（tgz 请求会 302 到 cdn.npmmirror.com） */
const ALLOWED_HOSTS = new Set([
  'registry.npmjs.org',
  'registry.npmmirror.com',
  'cdn.npmmirror.com',
])

/**
 * 各锁定版本的包摘要（npm dist.integrity 口径）——`npm view lucide-static@<v> dist.integrity` 得出。
 * 加版本必须同步补一条：integrityFor 对未登记版本直接抛，不许「没有摘要就放行」。
 */
const TGZ_INTEGRITY = {
  '1.50.0': 'sha512-Pge6F5Au0bEBvjaeBIjfU5PsmA43FHdM3s5g3rYqSNWvBO3o7WwDSNQSavwX76z/OoSCjwSVbQpGA9lqKud/WA==',
}

/** 包字节上限：1.50.0 实测 6.8MB；64MB 是「响应根本不是这个包」的兜底，不求贴近 */
const TGZ_MAX_BYTES = 64 * 1024 * 1024

/** 版本 → 登记摘要；未登记直接抛（提示去哪取） */
function integrityFor(v) {
  const want = TGZ_INTEGRITY[v]
  if (!want) {
    throw new Error(
      `lucide-static@${v} 没有登记摘要——先 \`npm view lucide-static@${v} dist.integrity\` 再补 TGZ_INTEGRITY`,
    )
  }
  return want
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- tar 解析
// 只要POSIX ustar / GNU tar 的最小子集：普通文件 + 目录 + GNU 长名（typeflag 'L'）。
// ustar prefix 字段拼上；size 是八进制。npm 的包都是这两种之一。

function parseTar(buf) {
  const files = new Map()
  let longName = null
  let off = 0
  while (off + 512 <= buf.length) {
    const head = buf.subarray(off, off + 512)
    // 全零块 = 归档结束（tar 末尾至少两块）
    if (head.every((b) => b === 0)) break
    const size = parseInt(head.subarray(124, 136).toString('latin1').replace(/\0.*$/, '').trim(), 8) || 0
    const typeflag = String.fromCharCode(head[156])
    const name = head.subarray(0, 100).toString('latin1').replace(/\0.*$/, '')
    const prefix = head.subarray(345, 500).toString('latin1').replace(/\0.*$/, '')
    const dataStart = off + 512
    const data = buf.subarray(dataStart, dataStart + size)
    off = dataStart + Math.ceil(size / 512) * 512
    if (typeflag === 'L') {
      // GNU 长名：这一块的数据是**下一个**头的名字
      longName = data.toString('latin1').replace(/\0.*$/, '')
      continue
    }
    const full = longName || (prefix ? `${prefix}/${name}` : name)
    longName = null
    if (typeflag === '0' || typeflag === '\0') files.set(full, data)
  }
  return files
}

// ---------------------------------------------------------------- svg 解析
// Lucide 1.50.0 的 svg 实测**不是全 path**：除 path 外还有 circle 648 / rect 493 /
// line 149 / ellipse 16 / polyline 3 / polygon 2，无 <g>、无 transform，子元素
// 唯一的非几何属性是 fill="currentColor"（11 枚图标用实心元素画圆点）。
//
// 处置（2026-10-02 定）：
//   ① 六种基本图形一律**转换成 path d**（同一渲染口径：stroke 1.6 / round 端），
//      转换数学见下；这样库里每枚图标都是 string[]，渲染器 / sanitize / 测试
//      只有一种形状模型；
//   ② 含实心元素的 11 枚**整枚跳过**并在产物里显式列出（LUCIDE_SKIPPED）——
//      本渲染器只描边，为 0.5% 的图标引入「按 path 填充」机制不划算；
//   ③ 任何意外形态（未知元素 / 未知属性 / viewBox 非 24 / 空 d / script）
//      直接炸出，不静默跳过——否则用户盘上就是一枚「换了却没形状」的空洞。

const GEOM_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'points', 'class',
])

/** 支持的元素白名单：白名单外的标签（g / use / text / defs…）一律炸出。
 *  为什么必须查：elemRe 是「全文扫六种标签」，包在 <g transform=…> 里的 path
 *  也会被它抓到并**丢掉 transform 直接转换**——形状 silently 错位。Lucide
 *  1.50.0 实测没有这些元素，这道闸守的是「升级库版本后冒出嵌套 / 变换」那天。 */
const KNOWN_TAGS = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon'])

/** path 命令全集（实测 Lucide 1.50.0 只用到这些字母；不含 e/E = 无科学计数法）。
 *  白名单同时挡住 NaN / undefined / Infinity：它们的字母 N/u/n/d/e/f/i/y 全在集外。
 *  真出了新形态（比如指数记数）让守卫炸，不静默生成坏数据。 */
const PATH_CMD = new Set('MmAaHhVvLlCcSsQqTtZz'.split(''))

/** 坐标格式化：有限数、抹平浮点尾差、去多余的 .0 */
function fmt(n) {
  if (!Number.isFinite(n)) throw new Error(`非有限坐标 ${n}`)
  return String(Math.round(n * 1e4) / 1e4)
}

function num(attrs, key, tag) {
  const v = attrs.get(key)
  if (v === undefined || v.trim() === '') throw new Error(`<${tag}> 缺 ${key}`)
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`<${tag}> ${key}="${v}" 不是数`)
  return n
}

/** 基本图形 → path d（24×24 绝对坐标；stroke 渲染下与原图形逐像素等价）。
 *  抛错不带 id 上下文——调用方负责包一层。 */
function shapeToPath(tag, attrs) {
  switch (tag) {
    case 'line':
      return `M ${fmt(num(attrs, 'x1', tag))} ${fmt(num(attrs, 'y1', tag))} L ${fmt(num(attrs, 'x2', tag))} ${fmt(num(attrs, 'y2', tag))}`
    case 'polyline':
    case 'polygon': {
      const pts = (attrs.get('points') || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      if (pts.length < 4 || pts.some((p) => !Number.isFinite(p))) throw new Error(`<${tag}> points 不可解析`)
      let d = `M ${fmt(pts[0])} ${fmt(pts[1])}`
      for (let i = 2; i < pts.length; i += 2) d += ` L ${fmt(pts[i])} ${fmt(pts[i + 1])}`
      return tag === 'polygon' ? d + ' Z' : d
    }
    case 'circle': {
      const cx = num(attrs, 'cx', tag)
      const cy = num(attrs, 'cy', tag)
      const r = num(attrs, 'r', tag)
      if (r <= 0) throw new Error('<circle> r<=0')
      return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)}`
    }
    case 'ellipse': {
      const cx = num(attrs, 'cx', tag)
      const cy = num(attrs, 'cy', tag)
      const rx = num(attrs, 'rx', tag)
      const ry = num(attrs, 'ry', tag)
      if (rx <= 0 || ry <= 0) throw new Error('<ellipse> rx/ry<=0')
      return `M ${fmt(cx - rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}`
    }
    case 'rect': {
      const x = num(attrs, 'x', tag)
      const y = num(attrs, 'y', tag)
      const w = num(attrs, 'width', tag)
      const h = num(attrs, 'height', tag)
      if (w <= 0 || h <= 0) throw new Error('<rect> width/height<=0')
      let rx = attrs.has('rx') ? num(attrs, 'rx', tag) : 0
      let ry = attrs.has('ry') ? num(attrs, 'ry', tag) : 0
      if (rx === 0 && ry === 0) {
        return `M ${fmt(x)} ${fmt(y)} H ${fmt(x + w)} V ${fmt(y + h)} H ${fmt(x)} Z`
      }
      if (rx === 0) rx = ry
      if (ry === 0) ry = rx
      rx = Math.min(rx, w / 2)
      ry = Math.min(ry, h / 2)
      return (
        `M ${fmt(x + rx)} ${fmt(y)}` +
        ` H ${fmt(x + w - rx)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + w)} ${fmt(y + ry)}` +
        ` V ${fmt(y + h - ry)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + w - rx)} ${fmt(y + h)}` +
        ` H ${fmt(x + rx)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y + h - ry)}` +
        ` V ${fmt(y + ry)} A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x + rx)} ${fmt(y)} Z`
      )
    }
    default:
      throw new Error(`未支持的图形 <${tag}>`)
  }
}

/**
 * 解析一枚 lucide svg。
 * 返回 { ds }（全部 path 数据）或 { skip: true }（含实心元素）。
 */
function parseIconSvg(id, text) {
  if (/<script/i.test(text)) throw new Error(`${id}: svg 内含 script`)
  const vb = /viewBox="([^"]+)"/.exec(text)
  if (!vb || vb[1] !== '0 0 24 24') throw new Error(`${id}: viewBox=${vb ? vb[1] : '(无)'}，不是 0 0 24 24`)
  const rootFill = /<svg\b[^>]*\bfill="([^"]*)"/.exec(text)
  if (rootFill && rootFill[1] !== 'none') throw new Error(`${id}: 根 fill="${rootFill[1]}"，不是 none`)
  // inner = <svg> 开标签之后到 </svg> 之前。不能拿全文第一个 '>' 切——lucide 的
  // svg 带 `<?xml …?>` 声明，第一个 '>' 在声明末尾，那样 inner 会含进 <svg …>
  // 开标签本身（下面的元素白名单会误炸 <svg>）。定位 <svg 再往后找它的 '>'。
  const svgOpen = text.lastIndexOf('<svg')
  if (svgOpen < 0) throw new Error(`${id}: 没有 <svg 开标签`)
  const inner = text.slice(text.indexOf('>', svgOpen) + 1, text.lastIndexOf('</svg>'))
  for (const tm of inner.matchAll(/<([a-zA-Z]+)/g)) {
    if (!KNOWN_TAGS.has(tm[1])) throw new Error(`${id}: 出现未支持元素 <${tm[1]}>`)
  }
  const elemRe = /<(path|circle|rect|line|ellipse|polyline|polygon)\b([^>]*?)\/?>/g
  const ds = []
  let m
  let sawElem = false
  while ((m = elemRe.exec(inner)) !== null) {
    sawElem = true
    const tag = m[1]
    const attrs = new Map()
    // 属性名可含数字（x1/x2/y1/y2）与连字符（stroke-dasharray）：
    // 写成 [a-zA-Z-]+ 会把 x1 整条漏掉，报出假的「缺 x1」。
    for (const am of m[2].matchAll(/([a-zA-Z_][\w-]*)="([^"]*)"/g)) attrs.set(am[1], am[2])
    // 实心元素：本渲染器只描边，整枚跳过（产物里显式记录，见 LUCIDE_SKIPPED）。
    // 必须在属性白名单之前判——fill 不在白名单里（其余图标都没这属性）。
    if (attrs.get('fill') === 'currentColor') return { skip: true }
    for (const key of attrs.keys()) {
      if (!GEOM_ATTRS.has(key)) throw new Error(`${id}: <${tag}> 有未知属性 ${key}="${attrs.get(key)}"`)
    }
    if (tag === 'path') {
      const d = (attrs.get('d') || '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
      if (d.trim() === '') throw new Error(`${id}: 有空 d 的 path`)
      ds.push(d)
    } else {
      try {
        ds.push(shapeToPath(tag, attrs))
      } catch (e) {
        throw new Error(`${id}: ${String(e.message || e)}`)
      }
    }
  }
  if (!sawElem) throw new Error(`${id}: 没有图形元素`)
  for (const d of ds) {
    for (const ch of d) {
      if (!PATH_CMD.has(ch) && !/[0-9.,+\-\s]/.test(ch)) {
        throw new Error(`${id}: 产物含非路径字符 ${JSON.stringify(ch)}：${d.slice(0, 60)}`)
      }
    }
  }
  return { ds }
}

// ---------------------------------------------------------------- 下载

/** 是不是 lucide-static 的 tar：全文找两个标记（不能只看头部——npm 包的条目顺序不定，
 *  package.json 实测排在第 11 条，前 4KB 只有 LICENSE 与 font 文件） */
function looksLikeLucideStaticTar(tar) {
  const s = tar.toString('latin1')
  return s.includes('package/package.json') && /package\/icons\/[^/]+\.svg/.test(s)
}

/** 完整性两道闸：① 字节摘要 == 登记 integrity（防镜像换包）；② 能 gunzip 且是 lucide-static 包（防半截） */
function verifyTgz(file, v) {
  const buf = fs.readFileSync(file)
  const got = integrityOf(buf)
  const want = integrityFor(v)
  if (got !== want) throw new Error(`字节摘要与登记不符（实收 ${got}）`)
  const tar = zlib.gunzipSync(buf)
  if (tar.length < 1024 || !looksLikeLucideStaticTar(tar)) {
    throw new Error('解出来不是 lucide-static 包')
  }
}

async function download(url, file) {
  const res = await fetchGuarded(url, { hosts: ALLOWED_HOSTS })
  await streamToFile(res, file, TGZ_MAX_BYTES, `lucide-static@${version} 包`)
  // 摘要 / 结构两道闸；不过即删——绝不把坏内容留给后续任何一步
  try {
    verifyTgz(file, version)
  } catch (e) {
    fs.rmSync(file, { force: true })
    throw new Error(`下载内容不可用：${String(e.message || e).slice(0, 120)}`)
  }
}

// ---------------------------------------------------------------- 生成

function tsString(s) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function generate(icons, skipped, licenseText) {
  const ids = Object.keys(icons).sort()
  const stamp = new Date().toISOString().slice(0, 19) + 'Z'
  const lines = [
    '// 本文件由 scripts/fetch-icons.mjs 生成，请勿手改（重生成：node scripts/fetch-icons.mjs）。',
    '// 图标库：Lucide —— ISC 许可，原文见同目录 LUCIDE-LICENSE.txt。',
    `// 版本：lucide-static@${version} · 图标数：${ids.length} · 生成于 ${stamp}。`,
    '//',
    '// 盘上为什么锁版本：图标 id 会写进用户 data.json（prefs.icons 的值），',
    '// 浮动 latest = 用户盘上的 id 某天指向另一枚形状。',
    '//',
    skipped.length > 0
      ? `// 跳过 ${skipped.length} 枚（含 fill="currentColor" 实心元素，本渲染器只描边）：${skipped.join(' ')}`
      : '// 跳过 0 枚。',
    '',
    '/**',
    ' * 库里每枚图标的路径数据（24×24 视图框，与 momo 自己的 PATHS 同一渲染口径：',
    ' * stroke 1.6 / round 端 / currentColor，见 src/ui/shared/icons.tsx 的 Icon）。',
    ' * circle / rect / line / ellipse / polyline / polygon 在生成时已转成 path d',
    ' * （转换规则见 scripts/fetch-icons.mjs 的 shapeToPath，stroke 渲染下逐像素等价）。',
    ' *',
    ' * id 冲突时**momo 自己的 PATHS 优先**（pathsOf 的解析顺序），所以两边有同名',
    ' * 图标（search / copy / pin…）不是问题：库里那份只是候选，默认渲染仍走 PATHS。',
    ' */',
    'export const LUCIDE_PATHS: Record<string, string[]> = {',
  ]
  for (const id of ids) {
    lines.push(`  ${tsString(id)}: [${icons[id].map(tsString).join(', ')}],`)
  }
  lines.push(
    '}',
    '',
    '/** 全部图标 id（排序稳定；sanitize 白名单与设置页候选共用这一份） */',
    'export const LUCIDE_IDS: readonly string[] = [',
    ...ids.map((id) => `  ${tsString(id)},`),
    ']',
    '',
    '/**',
    ' * 生成时跳过的图标 id（含实心元素，见文件头）。 future lucide 版本若多出实心',
    ' * 图标会落在这里——scripts/icons.test.mts 盯着这份清单，变了要先评审再收。',
    ' */',
    'export const LUCIDE_SKIPPED: readonly string[] = [',
    ...skipped.map((id) => `  ${tsString(id)},`),
    ']',
    '',
    '/** 生成时锁定的库版本（探测「盘上这份是哪一版」用；设置页关于信息可引） */',
    `export const LUCIDE_VERSION = ${tsString(version)}`,
    '',
  )
  fs.writeFileSync(OUT_TS, lines.join('\r\n'))
  fs.writeFileSync(OUT_LICENSE, licenseText.replace(/\r?\n/g, '\r\n'))
}

// ---------------------------------------------------------------- 主流程

/** 已生成且版本一致 → 跳过（除非 --force） */
function alreadyGenerated() {
  if (process.argv.includes('--force')) return false
  if (!fs.existsSync(OUT_TS)) return false
  const head = fs.readFileSync(OUT_TS, 'utf8').slice(0, 2000)
  return head.includes(`lucide-static@${version}`)
}

// 只有当「被直接执行」时才跑主流程：被 scripts/icons.test.mts import 做单元测试时
// （验证 shapeToPath / parseIconSvg / parseTar 的转换数学）不能触发下载。
//
// 除 URL 相等还要查 basename（2026-10-07 修，与 fetch-fonts.mjs 同款）：测试 runner
// 用 esbuild 把本文件与测试打进同一个 bundle（tmp/test/icons.test.mjs）再直接执行，
// bundle 里 import.meta.url 是 bundle 自己的运行时 URL、argv[1] 也正是它——只比对 URL
// 会把「bundle 被跑」误判成「本文件被直接执行」（实测：测试子进程真发起 lucide tgz
// 下载）。bundle 名是 *.test.mjs，只有真 `node scripts/fetch-icons.mjs` 时 basename 才相等。
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'fetch-icons.mjs' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((e) => {
    console.error(String(e?.stack || e))
    process.exit(1)
  })
}

// 供测试 import 的纯函数面（main 之外的逻辑都在这；下载主流程不导出）
export {
  ALLOWED_HOSTS,
  integrityFor,
  looksLikeLucideStaticTar,
  parseIconSvg,
  parseTar,
  PINNED_VERSION,
  shapeToPath,
  sources,
  TGZ_INTEGRITY,
  verifyTgz,
}

async function main() {
  if (alreadyGenerated()) {
    console.log(`[skip] lucideIcons.ts 已是 lucide-static@${version}（--force 可重新生成）`)
    return
  }
  const tmpDir = path.join(os.tmpdir(), 'momo-icons')
  const tgz = path.join(tmpDir, `lucide-static-${version}.tgz`)
  fs.mkdirSync(tmpDir, { recursive: true })

  // 预下载直通：网络被沙箱 / 代理切大文件时，先用 curl 分块 Range 把包续全，
  // 再用 MOMO_ICONS_TGZ 指给本脚本（校验口径与下载路径完全一致）。
  //   curl -x http://127.0.0.1:7897 -r 0-1048575 <tarball-url> >> pkg.tgz   # 逐块续
  //   MOMO_ICONS_TGZ=<pkg.tgz> node scripts/fetch-icons.mjs
  let ok = false
  const preSupplied = process.env.MOMO_ICONS_TGZ
  if (preSupplied && fs.existsSync(preSupplied)) {
    process.stdout.write(`[get ] 使用预下载包 ${preSupplied} … `)
    try {
      fs.copyFileSync(preSupplied, tgz)
      verifyTgz(tgz, version)
      console.log(`完整 ${(fs.statSync(tgz).size / 1024 / 1024).toFixed(2)} MB`)
      ok = true
    } catch (e) {
      console.log(`不可用：${String(e.message || e).slice(0, 100)}`)
      fs.rmSync(tgz, { force: true })
    }
  }
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    for (const url of sources(version)) {
      try {
        process.stdout.write(`[get ] lucide-static@${version}（第 ${attempt} 次）← ${new URL(url).host} … `)
        fs.rmSync(tgz, { force: true })
        await download(url, tgz)
        console.log(`完成 ${(fs.statSync(tgz).size / 1024 / 1024).toFixed(2)} MB`)
        ok = true
        break
      } catch (e) {
        console.log(`失败：${String(e.message || e).slice(0, 120)}`)
        fs.rmSync(tgz, { force: true })
        await sleep(2000)
      }
    }
  }
  if (!ok) {
    console.error(`[FAIL] lucide-static@${version} 所有源都没下完整`)
    process.exit(1)
  }

  const tar = zlib.gunzipSync(fs.readFileSync(tgz))
  const files = parseTar(tar)
  const iconEntries = [...files.entries()].filter(([name]) => /^package\/icons\/[^/]+\.svg$/.test(name))
  if (iconEntries.length < MIN_ICONS) {
    console.error(`[FAIL] 包里只有 ${iconEntries.length} 枚图标（< ${MIN_ICONS}），包不对`)
    process.exit(1)
  }

  const icons = {}
  const skipped = []
  const bad = []
  for (const [name, data] of iconEntries) {
    const id = path.basename(name, '.svg')
    try {
      const r = parseIconSvg(id, data.toString('utf8'))
      if (r.skip) skipped.push(id)
      else icons[id] = r.ds
    } catch (e) {
      bad.push(String(e.message || e))
    }
  }
  if (bad.length > 0) {
    console.error(`[FAIL] ${bad.length} 枚图标不合规：`)
    for (const b of bad.slice(0, 10)) console.error('  ' + b)
    process.exit(1)
  }

  const license = files.get('package/LICENSE')
  if (!license) {
    console.error('[FAIL] 包里没有 LICENSE（许可必须随库入库）')
    process.exit(1)
  }

  generate(icons, skipped, license.toString('utf8'))
  const kb = (fs.statSync(OUT_TS).size / 1024).toFixed(0)
  console.log(
    `[fetch-icons] ${Object.keys(icons).length} 枚图标（跳过 ${skipped.length} 枚实心）` +
      ` → src/momo/lucideIcons.ts（${kb}KB）+ LUCIDE-LICENSE.txt`,
  )
}
