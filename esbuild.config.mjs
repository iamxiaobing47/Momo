import esbuild from 'esbuild'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildCss } from './scripts/build-css.mjs'
import { ARTIFACTS, STALE_ARTIFACTS, GLOBE_TEXTURES, GLOBE_EARTH_IDS, GLOBE_CUBE_FACES, globeTextureProblems, globeAssetRevOf, vaultPluginDirs } from './scripts/vault-targets.mjs'

const production = process.argv[2] === 'production'

// 本文件所在目录 = 插件工程根。所有相对路径都以它为基准，不取决于 CWD
// （此前用 '../.obsidian/...' 相对 CWD 解析，实际指向 .code/.obsidian，部署被静默跳过）
const projectDir = path.dirname(fileURLToPath(import.meta.url))

/** 插件版本（manifest.json）：部署时写进星球资源包的记账文件（见下方 deployPlugin） */
const pluginVersion = JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8')).version

// bundle 不 import 任何 CSS：
// 样式全部手写（styles.css 由 build-css 那条链产出），插件侧只有 React + Zustand。
//
// 「编辑器一律用 Obsidian 原生编辑器，插件不封装第二套编辑器」这条不变——正文
// 仍由 Obsidian 渲染与保存。但**扩展原生编辑器**要用到 CodeMirror 的 Extension，
// 所以 `@codemirror/view` / `@codemirror/state` 进 external：这两包必须由 Obsidian
// 运行时 `require`（公开 API `registerEditorExtension` 就是收 Extension 的，不给
// 这条路插件就没法写扩展）。打进 bundle 会更糟——会得到**第二份** CodeMirror，
// 它的 ViewPlugin 认不出宿主编辑器实例，扩展静默不生效。

// **先重建 CSS，再 bundle**（v0.7.6 的教训）：esbuild 只产 main.js，styles.css 是
// build-css 那条链。此前改完 CSS 只跑 npm run build，部署进 vault 的就是旧样式——
// Obsidian 只认一个 styles.css，用户眼里就是「改了没生效」。放在这里，两条链自动同源，
// 不需要谁记得先跑 build:css；门禁不过会直接 exit，不会带着坏 CSS 往下部署。
buildCss()

// 星球贴图（v0.9.32）：它是独立部署产物（不再内联进 main.js——那 1.95MB
// base64 把 bundle 抬到 2.7MB，插件 onload 的 parse+eval 实测 ~50ms 里它占
// 大头）。同字体：缺失 / 不是 PNG 都在构建时 exit 1，别等运行时「球不见了」。
const textureIssues = globeTextureProblems()
if (textureIssues.length > 0) {
  for (const p of textureIssues) console.error(`[deploy] 贴图校验失败 ${p}`)
  process.exit(1)
}

// 星球三维渲染库（three.js 档，2026-10-04 起曾是**第二构建产物** globe3d.js）：
// 2026-10-13（BUG-219）整体退役——Obsidian 提交评审把「运行期 createElement('script')」
// 列为 Error（代码混淆：分不清「注入自己的本地产物」与「注入远端任意代码」），用户裁决
// **把 three 打进 main.js**。现在 src/ui/globe/globe3dStage.ts 是普通静态模块，
// main.ts → GlobeStage → 它这条 import 链让 esbuild 把 three 一起 bundle 进 main.js；
// 这里不再有第二次 build，也没有 globe3dProblems() 这道产物闸（产物就是 main.js 自己）。
//
// 代价（本单唯一被牺牲的东西）：main.js 体积 / onload parse+eval 抬一截，实测数字见
// docs/tasks/bug/fixing 的 BUG-219「落地记录」。

// ---- 运行时资源的内容指纹（2026-10-05；2026-10-13 收成只算贴图）------------------
//
// **为什么需要**：两套 cube 贴图（12 张）是**固定文件名**的独立部署物，运行期由 caps
// 读字节包 `blob:` URL 装载。指纹值（`momo:globe-asset-rev=<hash>`）编进 main.js 的
// banner，verify-deploy 靠它判「main.js 与磁盘上的产物是不是同一次构建」：改了贴图却
// 没重新构建 main.js，banner 里的哈希与磁盘重算的结果就对不上。
//
// 现场原貌（2026-10-05 踩实，那一版指纹还管着 globe3d.js 的 `<script>` URL）：球有贴图
// （上一轮的修复在缓存里）、拖拽不转（这一轮的不在）、光点动得欢（光点在 main.js 里）
// ——代码逐行读过、探针实测过、部署产物逐字节校验过，三处都「对」，用户仍看到旧行为。
//
// 2026-10-13（BUG-219）：globe3d.js 退役、贴图改走 blob: URL，运行期已经没有 URL 需要
// 加版本 → `define.__GLOBE_ASSET_REV__` 与 ui/globe/globeAssetRev.ts 一起撤掉，**banner
// 保留**（它是 verify-deploy 判「同一次构建」的唯一依据，且是我们自己写的稳定标记，
// 不依赖 esbuild 对 define 字面量的输出形态）。
//
// 指纹取**两套**贴图六面（共 12 面）的 sha256 合并哈希：任一贴图变了指纹就变。
// **算法在 scripts/vault-targets.mjs 的 globeAssetRevOf 里**（与 verify-deploy 共用
// 同一份实现）——自检和被自检的东西各算一遍的话，自检本身就成了新的不一致来源。
const assetRev = globeAssetRevOf(projectDir)
console.log(`[build] 运行时资源指纹 globe-asset-rev = ${assetRev}`)


// 构建产物同步到各 vault 的插件目录（dev 热更新与 production 都生效）。
// 目标列表与 verify-deploy 共用 scripts/vault-targets.mjs（单一真源，别在这再抄一份）。
// 追加 vault 用环境变量 MOMO_VAULTS（多个绝对路径，用 ; 分隔）。
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const sameFile = (a, b) => fs.existsSync(a) && fs.existsSync(b) && sha256(a) === sha256(b)

// 同步部署到 vault 的插件目录；vault 不存在时跳过，但一定打印结果（不静默失败）
const deployPlugin = {
  name: 'deploy-to-vault',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return
      const deployed = []
      const skipped = []
      const problems = []
      for (const dest of vaultPluginDirs()) {
        const vault = path.resolve(dest, '../../..')
        if (!fs.existsSync(vault)) {
          skipped.push(vault)
          continue
        }
        fs.mkdirSync(dest, { recursive: true })
        for (const file of ARTIFACTS) {
          const src = path.join(projectDir, file)
          if (!fs.existsSync(src)) {
            problems.push(`${dest} 缺产物 ${file}`)
            continue
          }
          fs.copyFileSync(src, path.join(dest, file))
          // 复制成功 ≠ 内容一致：半写盘 / 目标只读 / 落到别的路径，都会静默留下旧产物。
          // 逐个字节校验，把「以为部署了」变成看得见的失败（v0.7.6 就是这么白屏一轮的）。
          if (!sameFile(src, path.join(dest, file))) problems.push(`${dest}\\${file} 与源不一致`)
        }
        // 清理历史产物：CodeMirror 迁移后不再产出 Inter 字体文件（旧 CSS 也只引用它们）
        for (const name of fs.readdirSync(dest)) {
          if (/^inter-v12-.*\.woff2?$/.test(name)) fs.rmSync(path.join(dest, name))
        }
        // 同类清理：**已退役的产物**（STALE_ARTIFACTS）留在目标目录里就是死文件——
        // 2026-10-13（BUG-219）起 globe3d.js 不再产出（three 打进 main.js），老 vault
        // 里那份必须删掉，否则「部署目录里不许再出现 globe3d.js」永远不成立。
        for (const name of STALE_ARTIFACTS) {
          const stale = path.join(dest, name)
          if (fs.existsSync(stale)) fs.rmSync(stale)
        }
        // 星球贴图（v0.9.32 / 2026-10-04 起 cube 六面 / 2026-10-05 起**两套**：
        // 夜地球 + 日地球，按 prefs.globeEarth 在运行期挑一档装载）：逐套逐面同一口径
        // 校验。它不在 ARTIFACTS 里是因为源在 src/ 下（不是工程根），单独映射一次。
        // 两套都部署——运行期只装载当前那一档，但设置页允许随时切，缺一套就是
        // 「切过去球没了」。
        // 旧单张 tex-earth-night.png 若还在目标目录里，删掉（换 cube 后不再产出）。
        const staleTex = path.join(dest, 'tex-earth-night.png')
        if (fs.existsSync(staleTex)) fs.rmSync(staleTex)
        for (const setId of GLOBE_EARTH_IDS) {
          const set = GLOBE_TEXTURES[setId]
          for (const face of GLOBE_CUBE_FACES) {
            const texSrc = path.join(projectDir, set.srcOf(face))
            const texName = set.nameOf(face)
            if (!fs.existsSync(texSrc)) {
              problems.push(`${dest} 缺贴图源 ${set.srcOf(face)}`)
            } else {
              const texDst = path.join(dest, texName)
              fs.copyFileSync(texSrc, texDst)
              if (!sameFile(texSrc, texDst)) problems.push(`${dest}\\${texName} 与源不一致`)
            }
          }
        }
        // 星球资源包的**记账文件**（v1.0.0）：本地构建把 12 张贴图直接铺进插件目录，
        // 等价于「已下载」——补上同一份记账，设置页才显示「已安装」而不是催用户去下载
        // （商店用户那条路才是真的联网下载，见 service.downloadGlobePack）。
        // 文件名与 src/momo/globe/pack.ts 的 GLOBE_PACK_MANIFEST_FILE 是同一个字面量
        // （那是 .ts，本文件是构建期跑的 .mjs，import 不了）；globe-pack.test.mts 钉住两处一致。
        fs.writeFileSync(path.join(dest, 'globe-pack.json'), JSON.stringify({ version: pluginVersion }))
        deployed.push(dest)
      }
      const note = skipped.length > 0 ? `（未找到 vault：${skipped.length} 个，已跳过）` : ''
      console.log(`[deploy] → ${deployed.join('\n           ') || '(无)'}${note}`)
      // 零目标（既没部署、也没遇到「vault 不存在」）与「配了路径但机器上没有那些 vault」
      // 是两回事：后者是 skipped，前者说明 MOMO_VAULTS 整个没设。对开源贡献者
      // 「(无)」莫名其妙，这里说清修法。
      // 只提示、不拦人：零目标 = 跳过部署、build 仍 exit 0——CI/release 流水线正是
      // 依赖这一点（CI 里没有 MOMO_VAULTS，产物照常产出并上传为 artifact）。
      if (deployed.length === 0 && skipped.length === 0) {
        console.log(
          '[deploy] 未配置部署目标（MOMO_VAULTS 没设）→ 跳过部署；产物仍在工程根。多个绝对路径用 `;` 分隔',
        )
      }
      if (process.exitCode === 1 || problems.length > 0) {
        console.error(`[deploy] 校验失败 ${problems.length} 项：\n  ${problems.join('\n  ')}`)
        process.exitCode = 1
      }
    })
  },
}

const context = await esbuild.context({
  entryPoints: [path.join(projectDir, 'src/main.ts')],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/view', '@codemirror/state'],
  format: 'cjs',
  target: 'es2021',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: path.join(projectDir, 'main.js'),
  minify: production,
  // N09（AGENTS.md §8）：console.debug 标成 pure → 树 shaking 时整条调用可被摘掉，
  // 生产产物不留排查日志。不用的 drop: ['console']：那会把 service.ts 里
  // 十处 console.error 一起删光，错误上报不能丢。
  pure: ['console.debug'],  jsx: 'automatic',
  conditions: ['style', 'browser', 'default'],
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  // 指纹以 banner 形式落在 main.js 最前面：verify-deploy 靠它回读「这次构建认为的
  // 指纹」，再跟磁盘上 12 张贴图实际重算的结果比对（见上面 assetRev 那段）。
  // 曾经还有 `define: { __GLOBE_ASSET_REV__ }` 编给运行期用（给 <script> / <img> 的
  // URL 加 `?v=`）；2026-10-13（BUG-219）之后运行期没有任何 URL 需要版本号，define
  // 与 ui/globe/globeAssetRev.ts 一起撤掉，banner 留下。
  // 为什么要 banner 而不是在 minify 后的 main.js 里搜那段十六进制：define 的产物是裸
  // 字符串字面量，minify 后形态由 esbuild 决定，拿正则去捞字面量等于把构建器输出细节
  // 钉进门禁；banner 是自己写的稳定标记。
  banner: { js: `/* momo:globe-asset-rev=${assetRev} */` },
  plugins: [deployPlugin],
})

if (production) {
  await context.rebuild()
  // 别写死 exit(0)：部署校验失败时 onEnd 会把 process.exitCode 设成 1，
  // 这里原样带出去，否则「校验不过」会被这个 0 悄悄吞掉。
  process.exit(process.exitCode ?? 0)
} else {
  await context.watch()
}
