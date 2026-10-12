// 内置字体的下载器（v0.9.16）：单进程、内置重试与 jsDelivr 镜像回退。
// 每个文件过三道闸才落盘：① 重定向逐跳限主机白名单（scripts/fetch-guards.mjs）；
// ② 结构校验——按 sfnt table directory 重算应有总长、必须等于实收字节（防截断）；
// ③ sha256 与清单登记比对（防镜像给错内容 / 上游在可移动引用上漂移）。
// 半截或对不上号的文件绝不留在 fonts/ 里。
//
//   node scripts/fetch-fonts.mjs
//
// 升级工序（换字体 / 加字重 / 上游发新 tag 要跟）：
//   下载新文件 → `sha256sum` 与 `stat -c %s` 两个值更新到 FILES 对应条 →
//   文件放进 fonts/ → fonts/OFL-1.1.txt 表加行 → BUNDLED_FONTS 加条（types/prefs.ts）。
//   摘要对不上时先换源重试，所有源都过不了就失败退出——清单里钉的是「这一份字节」，
//   不是「随便哪份同名字体」，宁可红也不把对不上号的字节改名成正式文件。
//
// 为什么不用 curl 子进程：bash 版的重试循环 + pkill 在 Windows 上会互相踩
// （杀了父 bash 子 curl 变成孤儿继续写同一个文件，两个写者把文件写坏）。
// 单进程没有这个问题，退出码也干净。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchGuarded, sha256Hex, streamToFile } from './fetch-guards.mjs'

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fontDir = path.join(projectDir, 'fonts')

// 下载链允许落地的主机：github.com（release 直链与仓库页）、两个 release 资产
// CDN（release 下载 302 过去）、raw（点文件直链）、jsDelivr（镜像回退）。
const ALLOWED_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
])

const FILES = [
  {
    name: 'LXGWWenKaiLite-Regular.ttf',
    bytes: 13872424,
    sha256: '140c99ba4e28e817cec49bf82a0c5fcdc4fe633fb9dfda16d0ee8d59a8545f15',
    urls: [
      'https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Regular.ttf',
      // 文件在仓库 fonts/TTF/ 子目录下（平铺路径是 404 死链，2026-10-07 修正）
      'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.522/fonts/TTF/LXGWWenKaiLite-Regular.ttf',
    ],
  },
  {
    name: 'LXGWWenKaiLite-Medium.ttf',
    bytes: 13700636,
    sha256: '02eb0f8deed11b00481393f5720630ae1a44424f37f4157ea160a69a1c72a0b6',
    urls: [
      'https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Medium.ttf',
      'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.522/fonts/TTF/LXGWWenKaiLite-Medium.ttf',
    ],
  },
  {
    // google/fonts 的 ofl 目录在 @main 上会随上游提交漂移，三条都钉 40 位 commit SHA——
    // 引用不可变是摘要闸有意义的前提。
    name: 'NotoSansSC[wght].ttf',
    bytes: 17772300,
    sha256: 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
    ],
  },
  {
    // jsDelivr 全系（cdn / fastly / gcore 同一后端）对 >20MB 单文件返回 403
    // （"File size exceeded the configured limit of 20 MB."，2026-10-07 实测），
    // Serif 25MB 超出，只有 GitHub raw 一条源——单源是这台体积限制的结果，不是漏写。
    name: 'NotoSerifSC[wght].ttf',
    bytes: 25125512,
    sha256: '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2e61f4355afd22b801791b0df176065082423b87/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
    ],
  },
  {
    name: 'JetBrainsMono[wght].ttf',
    bytes: 187208,
    sha256: '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2e05c1cf00a6e4f40a4b931600a90881c26e15cd/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@2e05c1cf00a6e4f40a4b931600a90881c26e15cd/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
    ],
  },
]

/** 按 sfnt table directory 算应有总长（与 prefs.test.mts 的 BUNDLED_FONTS 守卫同口径）；非 sfnt / 表目录不全返回 -1 */
function expectedSize(buf) {
  if (buf.length < 12) return -1
  const tag = buf.subarray(0, 4).toString('latin1')
  if (tag !== '\u0000\u0001\u0000\u0000' && tag !== 'true' && tag !== 'OTTO') return -1
  const n = buf.readUInt16BE(4)
  if (buf.length < 12 + n * 16) return -1
  let end = 0
  for (let i = 0; i < n; i++) {
    const e = 12 + i * 16
    end = Math.max(end, buf.readUInt32BE(e + 8) + buf.readUInt32BE(e + 12))
  }
  return end + ((4 - (end % 4)) % 4)
}

/** 结构闸：是 sfnt 且大小 == table directory 算出的应有大小 */
function structuralOk(buf) {
  const want = expectedSize(buf)
  return want !== -1 && buf.length === want
}

/** skip 判据：盘上文件存在、结构完整、且 sha256 与登记一致 */
function fontOnDiskOk(file, spec) {
  if (!fs.existsSync(file)) return false
  const buf = fs.readFileSync(file)
  return structuralOk(buf) && sha256Hex(buf) === spec.sha256
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function download(url, spec, file) {
  const tmp = `${file}.part`
  const res = await fetchGuarded(url, { hosts: ALLOWED_HOSTS })
  // 字节上限给 2× 余量：宽于登记值，抓的是「响应根本不是这枚字体」（截断件本来就 < bytes）
  await streamToFile(res, tmp, spec.bytes * 2, spec.name)
  // 半截文件不要在盘上以 .part 之外的形态留下：先校验，再原子改名
  const buf = fs.readFileSync(tmp)
  if (!structuralOk(buf)) {
    fs.rmSync(tmp, { force: true })
    throw new Error('下载内容不是完整 sfnt 字体（截断）')
  }
  const got = sha256Hex(buf)
  if (got !== spec.sha256) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`内容与登记摘要不符（实收 sha256 ${got}）`)
  }
  fs.renameSync(tmp, file)
}

async function main() {
  let fail = 0
  fs.mkdirSync(fontDir, { recursive: true })
  for (const spec of FILES) {
    const file = path.join(fontDir, spec.name)
    if (fontOnDiskOk(file, spec)) {
      console.log(`[skip] ${spec.name} 已在盘上且与登记摘要一致`)
      continue
    }
    let done = false
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      for (const url of spec.urls) {
        try {
          process.stdout.write(`[get ] ${spec.name}（第 ${attempt} 次）← ${new URL(url).host} … `)
          await download(url, spec, file)
          console.log(`完成 ${fs.statSync(file).size} B`)
          done = true
          break
        } catch (e) {
          console.log(`失败：${String(e.message || e)}`)
          // 清理的是**临时文件**（download 写的是 ${file}.part，成功才改名成 file）——
          // 旧实现删的是最终名（本来就不存在），半截 .part 永不回收，
          // 会被整目录部署逐字节拷进每个 vault（BUG-05）。
          // 这里同时也兜住 streamToFile / fetchGuarded 中途抛下的一半 .part。
          fs.rmSync(`${file}.part`, { force: true })
          fs.rmSync(file, { force: true })
          await sleep(2000)
        }
      }
    }
    if (!done) {
      console.error(`[FAIL] ${spec.name} 所有源都没下出与登记摘要一致的内容`)
      fail = 1
    }
  }
  if (fail === 0) console.log('[fetch-fonts] 五个字体全部与登记摘要一致')
  process.exit(fail)
}

// 与 fetch-icons.mjs 同构：只有「被直接执行」时才跑主流程——被守卫 import 时
// 不能触发下载 / 改盘 / process.exit。
//
// 除 URL 相等还要查 basename（2026-10-07 修）：测试 runner 用 esbuild 把本文件与
// 守卫打进同一个 bundle（tmp/test/fetch-fonts.test.mjs）再直接执行，bundle 里
// import.meta.url 是 bundle 自己的运行时 URL、argv[1] 也正是它——只比对 URL 会把
// 「bundle 被跑」误判成「本文件被直接执行」（e2e 实测：测试子进程真下载 38MB 到
// 错位的 tmp/fonts/，五条 [skip] 后 process.exit(0) 杀掉测试进程、用例没跑却记通过）。
// bundle 名是 *.test.mjs，只有真 `node scripts/fetch-fonts.mjs` 时 basename 才相等。
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'fetch-fonts.mjs' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((e) => {
    console.error(String(e?.stack || e))
    process.exit(1)
  })
}

export { FILES, ALLOWED_HOSTS, expectedSize, structuralOk, fontOnDiskOk }
