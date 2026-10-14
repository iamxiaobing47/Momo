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
import { ARTIFACTS, STALE_ARTIFACTS, GLOBE_TEXTURES, GLOBE_EARTH_IDS, GLOBE_CUBE_FACES, globeTextureProblems, globeAssetRevOf, readGlobeAssetRev, pluginProjectDir, vaultPluginDirs, FONT_PACK_ASSETS, FONT_PACK_SRC_DIR } from './vault-targets.mjs'

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const projectDir = pluginProjectDir()

// 星球贴图（v0.9.32，独立部署产物）：源不在 / 不是 PNG 都先说，别只报 vault 侧
const badTexture = globeTextureProblems()
for (const b of badTexture) console.error(`verify-deploy: ${b}`)
let bad = badTexture.length
// 两个计数各管各的（BUG-117a）：`checked` 只数**vault 侧**比对过的产物——零目标哨兵与结论行
// 都只认它；工程根的指纹自检不算「部署到位」的证据，计进去会让零目标恒 ≥1、哨兵永不触发
// （实测：MOMO_VAULTS 没设 / 指向不存在的 vault 时曾报「1 个产物全部一致，可以重载」）。
let checked = 0
let skippedVaults = 0
console.log(`verify-deploy: 源 = ${projectDir}`)

// ── 运行时资源指纹自检（工程根侧，2026-10-05） ─────────────────────────────
// 为什么值得单独一条：两套 cube 贴图（12 张）是固定文件名的独立产物，运行期由 caps
// 读字节上屏。指纹（编进 main.js 的 banner）是 verify-deploy 判「main.js 与磁盘产物
// 是不是同一次构建」的依据；而它一旦与磁盘上的产物脱钩，就从「保险」变成「更隐蔽的
// 故障源」——所以这里在部署层面再钉一次：main.js 声称的指纹 == 磁盘上 12 张贴图实际
// 重算出来的指纹。（2026-10-13 / BUG-219：指纹口径从「三维库 + 十二面」收成只算贴图。）
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
      console.log('         → 贴图变了但 main.js 没重新构建。跑 npm run build')
      bad++
    } else {
      console.log(`      ✓ 运行时资源指纹 ${actual}（main.js 与 12 张贴图一致）`)
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
  // 已退役产物（STALE_ARTIFACTS）不许再留在插件目录里：它们不再产出，留着就是死文件
  // ——2026-10-13（BUG-219）起 globe3d.js 退役（three 打进 main.js），老 vault 里那份
  // 必须由 deployPlugin 清掉；这里是校验侧的那一问（同步的部署逻辑在 esbuild.config.mjs）。
  for (const name of STALE_ARTIFACTS) {
    if (fs.existsSync(path.join(dest, name))) {
      console.log(`      ✗ ${name}：已退役的产物还在（新版不再产出它）→ 重跑 npm run build 让部署侧清理`)
      bad++
    }
  }
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
  // 开源字体包（2026-10-13）：**可选资产**——本地 fonts/ 在（跑过 fetch-fonts）
  // 才逐件校验；不在就只提示（contributor 没取字体照样能构建，真实用户走运行期
  // 从 release 下载）。落点是插件目录的 fonts/ 子目录，与运行期下载的布局一致。
  const fontSrcDir = path.join(projectDir, FONT_PACK_SRC_DIR)
  if (fs.existsSync(fontSrcDir)) {
    for (const name of FONT_PACK_ASSETS) {
      const src = path.join(fontSrcDir, name)
      const dst = path.join(dest, 'fonts', name)
      checked++
      if (!fs.existsSync(src)) {
        console.log(`      ✗ fonts/${name}：本地没有源文件（先 node scripts/fetch-fonts.mjs）`)
        bad++
      } else if (!fs.existsSync(dst)) {
        console.log(`      ✗ fonts/${name}：vault 里没有（未部署）`)
        bad++
      } else if (sha256(src) !== sha256(dst)) {
        console.log(`      ✗ fonts/${name}：与源不一致（vault 里是旧的）`)
        bad++
      } else {
        console.log(`      ✓ fonts/${name} ${fs.statSync(dst).size} B`)
      }
    }
  } else {
    console.log('      - fonts/ 不在（没取字体包）→ 跳过字体校验；字体格在设置页是「未下载」态')
  }
  // vault 侧自洽：这里重算的是 **vault 目录里那一份** 产物（平铺布局），跟上面
  // 工程根的读法不同但算法同一份（vault-targets 的 globeAssetRevOf 会先试平铺路径）。
  // 为什么不复用上面「与源逐字节一致」的结论就完事：那些比对是逐文件对的，这里要的是
  // **组合口径**——万一某次只部署了 main.js 没部署贴图（两个插件的 build 各自拷一遍，
  // 中间失败过一次），逐文件比对会各自报不一致却说不清「banner 指纹对不上字节」这件事，
  // 而这个组合检查会直接把它指出来。
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
      console.log(`      ✗ vault 内指纹对不上：main.js 里是 ${baked}，vault 里的贴图实际是 ${actual}`)
      console.log('         → vault 里是「旧 main.js + 新贴图」的混搭。重跑 npm run build')
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
