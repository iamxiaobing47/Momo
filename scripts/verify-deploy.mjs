// 部署校验：本地产物 vs vault 插件目录里的实际文件，逐个字节比对。
//
//   npm run verify:deploy
//
// 为什么单独一条命令：部署是构建的**副作用**，历史上被漏过两次——
//   1. v0.7.6：改完 TSX 只跑 build:css，main.js 从未重新编译，Obsidian 里跑的还是旧代码；
//   2. 同类：改完 CSS 忘跑 build:css，部署的是旧样式。
// 现在的 build 已经会先重建 CSS 并在部署后自校验，但「我此刻能不能让用户去重载插件」
// 仍需要一个确定答案——跑这条，别靠记忆。退出码 0 = vault 与源一致，1 = 有缺失/不一致。
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ARTIFACTS, FONT_DIR, fontFiles, fontProblems, GLOBE_TEXTURES, GLOBE_EARTH_IDS, GLOBE_CUBE_FACES, GLOBE3D, globeTextureProblems, globeAssetRevOf, readGlobeAssetRev, pluginProjectDir, vaultPluginDirs } from './vault-targets.mjs'

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const projectDir = pluginProjectDir()

// 本地fonts/ 里的 .ttf 先过「真字体」校验（半截下载 / 错误页不进 vault）
const badFonts = fontProblems()
for (const b of badFonts) console.error(`verify-deploy: ${b}`)
let bad = badFonts.length
// 星球贴图（v0.9.32，独立部署产物）：源不在 / 不是 PNG 都先说，别只报 vault 侧
const badTexture = globeTextureProblems()
for (const b of badTexture) console.error(`verify-deploy: ${b}`)
bad += badTexture.length
// 两个计数各管各的（BUG-117a）：`checked` 只数**vault 侧**比对过的产物——零目标哨兵与结论行
// 都只认它；工程根的指纹自检不算「部署到位」的证据，计进去会让零目标恒 ≥1、哨兵永不触发
// （实测：MOMO_VAULTS 没设 / 指向不存在的 vault 时曾报「1 个产物全部一致，可以重载」）。
let checked = 0
let skippedVaults = 0
console.log(`verify-deploy: 源 = ${projectDir}`)

// ── 运行时资源指纹自检（工程根侧，2026-10-05） ─────────────────────────────
// 为什么值得单独一条：globe3d.js 与 cube 六面是固定文件名的独立产物，经 app://
// 注入，Chromium 按 URL 缓存。URL 里没有版本 → 改了源码、构建了、部署了、重启了，
// 浏览器仍拿旧副本，**不报错不留痕**。指纹（编进 main.js）就是给这些 URL 加版本。
// 而指纹一旦与磁盘上的产物脱钩，它就从「保险」变成「更隐蔽的故障源」——所以这里
// 在部署层面再钉一次：main.js 声称的指纹 == 磁盘上这些产物实际重算出来的指纹。
// 不一致 = 用户拿到的 URL 版本号与实际字节对不上，缓存该失效时不会失效。
{
  const baked = readGlobeAssetRev(projectDir)
  if (baked === '') {
    console.log(`      ✗ main.js 里读不到运行时资源指纹 banner（先 npm run build）`)
    bad++
  } else {
    let actual = ''
    try {
      actual = globeAssetRevOf(projectDir)
    } catch (e) {
      actual = `重算失败（${e.code ?? e.message}）`
    }
    if (actual !== baked) {
      console.log(`      ✗ 运行时资源指纹对不上：main.js 里是 ${baked}，产物实际是 ${actual}`)
      console.log('         → globe3d.js / cube 六面变了但 main.js 没重新构建。跑 npm run build')
      bad++
    } else {
      console.log(`      ✓ 运行时资源指纹 ${actual}（main.js 与 globe3d.js + 六面一致）`)
    }
  }
}

for (const dest of vaultPluginDirs()) {
  const vault = path.resolve(dest, '../../..')
  if (!fs.existsSync(vault)) {
    // BUG-208：缺失的 vault 是**配置问题**不是「跳过」——vault-targets.mjs 的契约
    // 原文「校验时算问题」，部署侧守约、校验侧此前只计数不进 bad，真 + 假 vault 的
    // 组合会打出「全部一致，可以重载」的假绿。与全缺同口径：进 bad、进退出码。
    console.log(`  ✗ ${dest}（vault 不存在——盘没挂上 / 路径写错，按问题计）`)
    skippedVaults++
    bad++
    continue
  }
  console.log(`  - ${dest}`)
  for (const file of ARTIFACTS) {
    const src = path.join(projectDir, file)
    const dst = path.join(dest, file)
    checked++
    if (!fs.existsSync(src)) {
      console.log(`      ✗ ${file}：本地没有该产物（先 npm run build）`)
      bad++
      continue
    }
    if (!fs.existsSync(dst)) {
      console.log(`      ✗ ${file}：vault 里没有（未部署）`)
      bad++
      continue
    }
    if (sha256(src) !== sha256(dst)) {
      console.log(`      ✗ ${file}：与源不一致（vault 里是旧的）`)
      bad++
      continue
    }
    console.log(`      ✓ ${file} ${fs.statSync(dst).size} B`)
  }
  // 内置字体（v0.9.16）：与三件套同一口径逐字节校验；字体缺失只会在运行时
  // 静默回退默认字体，最容易「以为装好了」，所以必须在这里说出口
  const fonts = fontFiles()
  if (fonts.length === 0) {
    console.log(`      ! fonts/ 为空：本地产物没有内置字体（跳过字体校验）`)
  }
  for (const name of fonts) {
    const src = path.join(projectDir, FONT_DIR, name)
    const dst = path.join(dest, FONT_DIR, name)
    checked++
    if (!fs.existsSync(dst)) {
      console.log(`      ✗ fonts/${name}：vault 里没有（未部署）`)
      bad++
      continue
    }
    if (sha256(src) !== sha256(dst)) {
      console.log(`      ✗ fonts/${name}：与源不一致（vault 里是旧的）`)
      bad++
      continue
    }
    console.log(`      ✓ fonts/${name} ${fs.statSync(dst).size} B`)
  }
  // 星球贴图（v0.9.32 / 2026-10-04 起 cube 六面 / 2026-10-05 起两套）：与三件套同一
  // 口径逐套逐面校验。缺失只会在运行时表现为「球不见了」或「切到那一档球没了」——
  // 没有球、也没有报错，所以必须在这里说出口。
  for (const setId of GLOBE_EARTH_IDS) {
    const set = GLOBE_TEXTURES[setId]
    for (const face of GLOBE_CUBE_FACES) {
      const src = path.join(projectDir, set.srcOf(face))
      const name = set.nameOf(face)
      const dst = path.join(dest, name)
      checked++
      if (!fs.existsSync(src)) {
        console.log(`      ✗ ${name}：本地没有源文件（${set.srcOf(face)}）`)
        bad++
      } else if (!fs.existsSync(dst)) {
        console.log(`      ✗ ${name}：vault 里没有（未部署）`)
        bad++
      } else if (sha256(src) !== sha256(dst)) {
        console.log(`      ✗ ${name}：与源不一致（vault 里是旧的）`)
        bad++
      } else {
        console.log(`      ✓ ${name} ${fs.statSync(dst).size} B`)
      }
    }
  }
  // vault 侧自洽：这里重算的是 **vault 目录里那一份** 产物（平铺布局），跟上面
  // 工程根的读法不同但算法同一份（vault-targets 的 globeAssetRevOf 会先试平铺路径）。
  // 为什么不复用上面「与源逐字节一致」的结论就完事：那些比对是逐文件对的，这里要的是
  // **组合口径**——万一某次只部署了 main.js 没部署 globe3d.js（两个插件的 build 各自
  // 拷一遍，中间失败过一次），逐文件比对会各自报不一致却说不清「URL 版本号对不上字节」
  // 这件事，而这个组合检查会直接把它指出来。
  {
    const baked = readGlobeAssetRev(dest)
    let actual
    try {
      actual = globeAssetRevOf(dest)
    } catch (e) {
      actual = `重算失败（${e.code ?? e.message}）`
    }
    if (baked === '') {
      console.log('      ✗ vault 里的 main.js 没有指纹 banner——它不是本次构建的产物')
      bad++
    } else if (actual !== baked) {
      console.log(`      ✗ vault 内指纹对不上：main.js 里是 ${baked}，vault 里的产物实际是 ${actual}`)
      console.log('         → vault 里是「旧 main.js + 新 globe3d.js」的混搭，缓存会拿错版本。重跑 npm run build')
      bad++
    } else {
      console.log(`      ✓ vault 内指纹 ${actual}`)
    }
    checked++
  }
}

// 零目标 = 一个 vault 都没校验到：部署目标只来自环境变量 MOMO_VAULTS，没设就是这个。
// 刻意 keep exit 1——这条命令的全部意义就是「确认产物真的进了某个 vault」，
// 没有任何可校验的目标本身就是配置错误，不能绿灯放行。
if (checked === 0) {
  const why =
    skippedVaults > 0
      ? `MOMO_VAULTS 里的 ${skippedVaults} 个 vault 都不存在（盘没挂上 / 路径写错）`
      : 'MOMO_VAULTS 没设（部署目标只来自这个环境变量）'
  console.error(
    `verify-deploy: 一个 vault 都没校验到——${why}。\n` +
      '  修法：MOMO_VAULTS="<vault 绝对路径>"（多个用 `;` 分隔，目标自动接 .obsidian/plugins/momo），\n' +
      '  先 npm run build 部署，再重跑 npm run verify:deploy 校验。',
  )
  process.exit(1)
}
if (bad > 0) {
  // BUG-208：skippedVaults 必为 0 才可能走到绿灯——它已在循环里并入 bad，
  // 这里点名是给「部分缺失」场景一句能定位的汇总（缺几个、剩下的是什么性质）。
  const where =
    skippedVaults > 0
      ? `（其中 ${skippedVaults} 个 vault 不存在，其余为缺失 / 不一致的产物）`
      : '——跑 npm run build 重新构建并部署'
  console.error(`verify-deploy: ${bad} 项有问题${where}`)
  process.exit(1)
}
console.log(`verify-deploy: ${checked} 个产物全部与源一致，可以重载插件了`)
