// 开源字体包取件（2026-10-13）：v1.0.0 退役的内置字体以「GitHub Release 按需下载」
// 复活——本脚本是发布链的**上游侧**：把四套字体的 ttf 与许可取进 `fonts/`
// （gitignore，不入库），由 stage-release 挂上 release 资产；运行期由插件在设置页
// 用户显式点击时按需下载（见 src/momo/fonts/pack.ts 与 service.downloadFontPack）。
//
//   node scripts/fetch-fonts.mjs
//
// 范式照抄 scripts/fetch-icons.mjs：单进程、多重试、多源镜像、下载三道闸
// （重定向逐跳限主机白名单 / 流式字节上限 / 摘要固定，机制在 scripts/fetch-guards.mjs）
// 全过才算完整，坏内容即删绝不留下。纯 node，不引依赖、不拉子进程。
//
// 源清单与 src/momo/fonts/pack.ts 的 FONT_PACKS **同一份口径**（asset / bytes /
// sha256 三列逐一对应；pack.ts 多 family / weight 两列是运行期 FontFace 用的）：
// 改一边要一边起看，守卫 scripts/fonts-pack.test.mts 钉住三列 parity。
// bytes / sha256 出自 BUG-104 工单里人工确认过的那份 fonts/ 盘上内容（2026-10-07
// 三道闸时钉的），本次（2026-10-13）已用 GitHub tree API 逐文件复核：三个
// google/fonts 的 size 与两个 LXGW 的 size 均与登记值一致。
//
// 源的选择（2026-10-13 现场复核）：
//   · LXGW（霞鹩文楷 Lite）——jsDelivr，pin tag `@v1.522`（不可变引用）；
//     许可在仓根 OFL.txt（不是 OFL-1.1.txt——jsDelivr 实测 404，tree API 坐实）。
//   · google/fonts 三家——raw.githubusercontent.com，pin 40 位 commit SHA
//     （不可变引用）。Noto Sans SC / JetBrains Mono 另挂 jsDelivr 镜像（同 SHA
//     两路），Noto Serif SC 只有 raw 一路：25MB 超过 jsDelivr 全系 20MB 上限
//     （BUG-104 实测 403「File size exceeded…」）。
//
// 换字体工序（与当年 fetch-fonts.mjs 头部同款）：
//   ① 上游定版 → 拿不可变引用（tag / commit SHA）；
//   ② 下载后算 sha256 + bytes，补进本文件 FILES **和** src/momo/fonts/pack.ts；
//   ③ 运行 `node scripts/fonts-pack.test.mts` 对应的 `npm test`（parity 守卫）——
//      两边不一致会红；
//   ④ 重跑本脚本 → `npm run build` 走发布链。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchGuarded, sha256Hex, streamToFile } from './fetch-guards.mjs'

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = path.join(projectDir, 'fonts')
const OUT_LICENSE = path.join(OUT_DIR, 'OFL.txt')

/**
 * 字体文件清单：asset = release 资产名（URL 安全，无方括号——上游的 `[wght]`
 * 在 URL 里要 Percent-encode，当资产名只会添乱），bytes / sha256 = 三道闸的
 * 后两道，urls = 按顺序试的源（第一路为主，其余是镜像）。
 */
export const FILES = [
  {
    asset: 'font-lxgw-wenkai-lite-regular.ttf',
    bytes: 13_872_424,
    sha256: '140c99ba4e28e817cec49bf82a0c5fcdc4fe633fb9dfda16d0ee8d59a8545f15',
    urls: [
      'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.522/fonts/TTF/LXGWWenKaiLite-Regular.ttf',
      'https://raw.githubusercontent.com/lxgw/LxgwWenKai-Lite/v1.522/fonts/TTF/LXGWWenKaiLite-Regular.ttf',
    ],
  },
  {
    asset: 'font-lxgw-wenkai-lite-medium.ttf',
    bytes: 13_700_636,
    sha256: '02eb0f8deed11b00481393f5720630ae1a44424f37f4157ea160a69a1c72a0b6',
    urls: [
      'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.522/fonts/TTF/LXGWWenKaiLite-Medium.ttf',
      'https://raw.githubusercontent.com/lxgw/LxgwWenKai-Lite/v1.522/fonts/TTF/LXGWWenKaiLite-Medium.ttf',
    ],
  },
  {
    asset: 'font-noto-sans-sc.ttf',
    bytes: 17_772_300,
    sha256: 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
    ],
  },
  {
    asset: 'font-noto-serif-sc.ttf',
    bytes: 25_125_512,
    sha256: '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
    // 只有 raw 一路：25MB > jsDelivr 全系 20MB 上限（BUG-104 实测 403）
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2e61f4355afd22b801791b0df176065082423b87/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
    ],
  },
  {
    asset: 'font-jetbrains-mono.ttf',
    bytes: 187_208,
    sha256: '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/2e05c1cf00a6e4f40a4b931600a90881c26e15cd/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@2e05c1cf00a6e4f40a4b931600a90881c26e15cd/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
    ],
  },
]

/**
 * 许可文本源（SIL OFL 1.1）：四套字体各自的 OFL.txt，取回来**拼成一份**
 * `fonts/OFL.txt` 随发布包分发——OFL 要求「每一份再分发都带着版权声明与许可」，
 * 字体资产挂上 release 时许可必须同行。
 *
 * 与 ttf 的区别：许可是几百字节的**文本**，威胁模型不是「被换成一段可执行
 * 载荷」，所以闸是结构式的（含 SIL OPEN FONT LICENSE 字样 + 含本家族版权行 +
 * 体积封顶），不钉 sha256——上游修订许可文本时不该被一道摘要闸卡死（ttf 那边
 * 换内容必须重算摘要，因为字节就是字体本身）。
 *
 * `copyright` 是**上游版权行的片段**，不是家族名——按家族名猜过一次，三道闸里
 * 唯一没真跑过的那闸，1.0.4 首发 CI 才暴露（BUG-247）：LXGW 的许可署的是
 * 「LXGW」与 Klee（Lite 是 Klee 的衍生），Noto Sans SC 署的是 Adobe /
 * Reserved Font Name 'Source'（Source Han Sans 的授权链），Noto Serif SC 署的是
 * 「Copyright 2012 Google Inc.」——三份全文都没有家族名字样。URL 都是**不可变
 * 引用**（tag / 40 位 commit SHA），所以这些片段照抄即可，不会再变。
 */
export const LICENSE_SOURCES = [
  {
    family: 'LXGW WenKai Lite',
    url: 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.522/OFL.txt',
    /** 这一家族的版权行片段（结构闸用：防取错家族的许可；拼进 combined 文件的是整份原文） */
    copyright: 'Copyright 2021-2026 LXGW',
  },
  {
    family: 'Noto Sans SC',
    url: 'https://raw.githubusercontent.com/google/fonts/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/OFL.txt',
    copyright: "Copyright 2014-2021 Adobe",
  },
  {
    family: 'Noto Serif SC',
    url: 'https://raw.githubusercontent.com/google/fonts/2e61f4355afd22b801791b0df176065082423b87/ofl/notoserifsc/OFL.txt',
    copyright: 'Copyright 2012 Google Inc.',
  },
  {
    family: 'JetBrains Mono',
    url: 'https://raw.githubusercontent.com/google/fonts/2e05c1cf00a6e4f40a4b931600a90881c26e15cd/ofl/jetbrainsmono/OFL.txt',
    copyright: 'JetBrains Mono Project Authors',
  },
]

/** 下载链允许落地的主机：jsDelivr + GitHub raw（raw 大文件会 302 到 objects） */
export const ALLOWED_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
])

/** 单件字节上限 = 登记 bytes × 2（「响应根本不是这个文件」的兜底，不求贴近） */
const CAP_FACTOR = 2

/** 许可文本上限：OFL.txt 实测 ~4.4KB；64KB 是「拿错了页面」的兜底 */
const LICENSE_MAX_BYTES = 64 * 1024

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 一件 ttf 的两道闸：字节数相等 + sha256 相符。任一不过即假。 */
export function verifyFontFile(file, buf) {
  if (buf.length !== file.bytes) {
    throw new Error(`字节数与登记不符（实收 ${buf.length} / 登记 ${file.bytes}）`)
  }
  const got = sha256Hex(buf)
  if (got !== file.sha256) {
    throw new Error(`sha256 与登记不符（实收 ${got}）`)
  }
}

/** 许可文本的结构闸：SIL 字样 + 本家族版权行 + 体积封顶 */
export function verifyLicenseText(entry, text) {
  if (text.length > LICENSE_MAX_BYTES) throw new Error('许可文本超过上限')
  if (!text.includes('SIL OPEN FONT LICENSE')) throw new Error('不是 SIL OFL 文本')
  if (!text.includes(entry.copyright)) throw new Error(`缺少 ${entry.family} 的版权行`)
}

/** 已存在且过闸 → 跳过（重跑时幂等；--force 强制重下） */
function alreadyFetched(file) {
  if (process.argv.includes('--force')) return false
  const p = path.join(OUT_DIR, file.asset)
  if (!fs.existsSync(p)) return false
  try {
    verifyFontFile(file, fs.readFileSync(p))
    return true
  } catch {
    return false
  }
}

async function downloadTo(url, dest, capBytes, label) {
  const res = await fetchGuarded(url, { hosts: ALLOWED_HOSTS })
  await streamToFile(res, dest, capBytes, label)
}

// ---------------------------------------------------------------- 主流程

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const failed = []

  for (const file of FILES) {
    if (alreadyFetched(file)) {
      console.log(`[skip] ${file.asset} 已在盘上且过闸（--force 可重下）`)
      continue
    }
    let ok = false
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      for (const url of file.urls) {
        const dest = path.join(OUT_DIR, file.asset)
        try {
          process.stdout.write(`[get ] ${file.asset}（第 ${attempt} 次）← ${new URL(url).host} … `)
          fs.rmSync(dest, { force: true })
          await downloadTo(url, dest, file.bytes * CAP_FACTOR, file.asset)
          verifyFontFile(file, fs.readFileSync(dest))
          console.log(`完成 ${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB`)
          ok = true
          break
        } catch (e) {
          console.log(`失败：${String(e.message || e).slice(0, 120)}`)
          fs.rmSync(dest, { force: true })
          await sleep(2000)
        }
      }
    }
    if (!ok) failed.push(file.asset)
  }

  // 许可：四份 OFL.txt 拼成一份（缺任何一份都算失败——许可必须随字体同行）
  const parts = [
    '开源字体许可（SIL Open Font License 1.1）——由 scripts/fetch-fonts.mjs 从各上游取回拼接，',
    '随本仓库 release 的字体资产一同分发。四套字体各自一节，许可原文逐字未改。',
    '',
  ]
  for (const entry of LICENSE_SOURCES) {
    let text = ''
    let got = false
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      try {
        const res = await fetchGuarded(entry.url, { hosts: ALLOWED_HOSTS })
        const buf = Buffer.from(await res.arrayBuffer())
        text = buf.toString('utf8')
        verifyLicenseText(entry, text)
        got = true
      } catch (e) {
        console.log(`[get ] ${entry.family} 许可（第 ${attempt} 次）失败：${String(e.message || e).slice(0, 120)}`)
        await sleep(2000)
      }
    }
    if (!got) {
      failed.push(`${entry.family} 许可`)
      continue
    }
    parts.push('='.repeat(72), `${entry.family} — ${entry.url}`, '='.repeat(72), '', text.replace(/\r\n/g, '\n').trimEnd(), '')
  }
  if (!failed.some((f) => f.endsWith('许可'))) {
    fs.writeFileSync(OUT_LICENSE, parts.join('\n'))
    console.log(`[get ] 许可 → fonts/OFL.txt（${LICENSE_SOURCES.length} 份拼接）`)
  }

  if (failed.length > 0) {
    console.error(`[FAIL] 没取完整：${failed.join(' / ')}`)
    process.exit(1)
  }
  const total = FILES.reduce((n, f) => n + f.bytes, 0)
  console.log(
    `[fetch-fonts] ${FILES.length} 个文件 + ${LICENSE_SOURCES.length} 份许可 → fonts/（合计 ${(total / 1024 / 1024).toFixed(1)} MB）`,
  )
}

// 只有当「被直接执行」时才跑主流程：被 scripts/fonts-pack.test.mts import 做表结构
// 断言时不能触发下载。
//
// 判据是双条件（2026-10-07 BUG-104 的假绿事故，与 fetch-icons.mjs 同款）：测试
// runner 用 esbuild 把本文件与测试打进同一个 bundle（tmp/test/*.test.mjs）再直接
// 执行，bundle 里 import.meta.url 与 argv[1] 会**相等**——只比对 URL 会把「bundle
// 被跑」误判成「本文件被直接执行」，主流程在测试进程里真跑（真下载 / process.exit
// 杀掉测试进程却记通过）。bundle 名是 *.test.mjs，只有真 `node scripts/fetch-fonts.mjs`
// 时 basename 才相等。
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

// 供测试 import 的纯函数面：FILES / LICENSE_SOURCES / ALLOWED_HOSTS /
// verifyFontFile / verifyLicenseText（下载主流程不导出——它在 invokedDirectly 里）。
