import esbuild from 'esbuild'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildCss } from './scripts/build-css.mjs'
import { ARTIFACTS, FONT_DIR, fontFiles, fontProblems, GLOBE_TEXTURES, GLOBE_EARTH_IDS, GLOBE_CUBE_FACES, globeTextureProblems, GLOBE3D, globe3dProblems, globeAssetRevOf, vaultPluginDirs } from './scripts/vault-targets.mjs'

const production = process.argv[2] === 'production'

// 本文件所在目录 = 插件工程根。所有相对路径都以它为基准，不取决于 CWD
// （此前用 '../.obsidian/...' 相对 CWD 解析，实际指向 .code/.obsidian，部署被静默跳过）
const projectDir = path.dirname(fileURLToPath(import.meta.url))

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

// 内置开源字体（v0.9.16）：部署前置校验——fonts/ 下的 .ttf 必须是真字体文件。
// 下载中断的半截 ttf 或 GitHub 404 的 HTML 错误页进了 vault，运行时只表现为
// 「字体选择没效果」（Chromium 忽略坏 @font-face 静默回退），现场看不出原因，
// 所以在构建时就拦住。
// 只打印不拦人等于没有闸（BUG-06）：坏字体照旧被下面的部署插件拷进每个 vault，
// npm run build 还是 exit 0。与 build-css 的五道门禁同款——有问题就 exit 1，
// 不带着坏字体往下走。
const fontIssues = fontProblems()
if (fontIssues.length > 0) {
  for (const p of fontIssues) console.error(`[deploy] 字体校验失败 ${p}`)
  process.exit(1)
}

// 星球贴图（v0.9.32）：它是独立部署产物（不再内联进 main.js——那 1.95MB
// base64 把 bundle 抬到 2.7MB，插件 onload 的 parse+eval 实测 ~50ms 里它占
// 大头）。同字体：缺失 / 不是 PNG 都在构建时 exit 1，别等运行时「球不见了」。
const textureIssues = globeTextureProblems()
if (textureIssues.length > 0) {
  for (const p of textureIssues) console.error(`[deploy] 贴图校验失败 ${p}`)
  process.exit(1)
}

// 星球三维渲染库（three.js 档，2026-10-04）：**第二产物 globe3d.js**，不进 main.js——
// three 全量 minified ~600KB，内联会把插件 onload 的 parse 时间抬回贴图内联时代
// （那笔账见 globeTexture.ts 文件头），而它只在切到星球档时才用得上。运行期经
// caps.globe3dUrl 的 app:// URL 注入 <script> 惰性加载（globe3dLoader.ts），失败
// 回退 canvas 软渲染（GlobeStage）。IIFE 是因为插件宿主里没有可用的 ESM 动态
// import；先于主 bundle 跑——它在 ARTIFACTS 里，部署插件要求产物已存在。
// 与 buildCss 同款：dev watch 模式下也只在启动时跑一次（改 globe3dStage.ts 要重启
// dev 或单独 npm run build；CSS 一直就是这个模式）。
await esbuild.build({
  entryPoints: [path.join(projectDir, 'src/ui/globe/globe3dStage.ts')],
  outfile: path.join(projectDir, 'globe3d.js'),
  bundle: true,
  format: 'iife',
  target: 'es2021',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: false,
  treeShaking: true,
  minify: production,
})
// 产物侧的闸：构建半途而废 / 内容不对（没有工厂全局）在这里 exit，别等运行时
// 「三维档静默回退」看都看不出原因。
const globe3dIssues = globe3dProblems()
if (globe3dIssues.length > 0) {
  for (const p of globe3dIssues) console.error(`[deploy] 三维渲染库校验失败 ${p}`)
  process.exit(1)
}

// ---- 运行时资源的内容指纹（2026-10-05 踩实）------------------------------------
//
// **为什么需要**：globe3d.js 与 cube 六面都是**固定文件名**的独立产物，经 app://
// 注入 <script> / <img> 装载。Chromium 的资源缓存按 URL 记账，而 URL 里没有版本——
// 于是「改了 globe3dStage.ts → npm run build → 重启 Obsidian」这一整套动作拿到的
// 仍旧是缓存里的旧副本。
//
// 现场就是那么怪：球有贴图（上一轮的修复在缓存里），但拖拽不转（这一轮的修复不
// 在），光源点却动得欢（光点在 main.js 里，main.js 换了 URL 所以是新的）。
// **代码逐行读过、探针实测过、部署产物逐字节校验过，三处都「对」，用户仍然看到
// 旧行为** —— 这种不一致只有一个解释：浏览器手里的不是这个文件。
//
// 正解：把内容哈希编进 main.js（下面的 __GLOBE_ASSET_REV__），运行期由
// caps.globeCubeUrls / caps.globe3dUrl 追加成 `?v=<hash>`。内容变 → URL 变 →
// 缓存必失效；内容不变 → URL 不变 → 仍然命中缓存（不牺牲正常路径的性能）。
//
// 指纹取 globe3d.js + **两套**贴图六面（共 12 面）的 sha256 合并哈希：任一产物变了
// 指纹就变，而产物之间不必同步变化（多算几次哈希的成本可以忽略，构建时一次性）。
// **算法在 scripts/vault-targets.mjs 的 globeAssetRevOf 里**（与 verify-deploy 共用
// 同一份实现）——自检和被自检的东西各算一遍的话，自检本身就成了新的不一致来源。
const assetRev = globeAssetRevOf(projectDir)
console.log(`[build] 运行时资源指纹 __GLOBE_ASSET_REV__ = ${assetRev}`)


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
        // 内置开源字体（v0.9.16）：整目录同步（fonts/<file> → <dest>/fonts/<file>），
        // 同样逐字节校验——字体缺了运行时只回退默认字体，不报错，最容易被「以为装好了」骗过。
        fs.mkdirSync(path.join(dest, FONT_DIR), { recursive: true })
        for (const name of fontFiles()) {
          const src = path.join(projectDir, FONT_DIR, name)
          fs.copyFileSync(src, path.join(dest, FONT_DIR, name))
          if (!sameFile(src, path.join(dest, FONT_DIR, name))) problems.push(`${dest}\\fonts\\${name} 与源不一致`)
        }
        // 清理历史产物：CodeMirror 迁移后不再产出 Inter 字体文件（旧 CSS 也只引用它们）
        for (const name of fs.readdirSync(dest)) {
          if (/^inter-v12-.*\.woff2?$/.test(name)) fs.rmSync(path.join(dest, name))
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
  // 运行时资源的内容指纹（见上面 assetRev 那段）：编进 main.js，运行期由
  // caps.globeCubeUrls / caps.globe3dUrl 追加成 `?v=<hash>`，让
  // 「改了 globe3d.js 但浏览器拿的还是缓存旧副本」这件事不可能再发生。
  define: { __GLOBE_ASSET_REV__: JSON.stringify(assetRev) },
  // 同一份指纹再以 banner 形式落在 main.js 最前面：verify-deploy 靠它回读
  // 「这次构建认为的指纹」，再跟磁盘上的 globe3d.js / 六面实际重算的结果比对。
  // define 产物是裸字符串字面量、minify 后形态由 esbuild 决定，拿正则去捞字面量
  // 等于把构建器输出细节钉进门禁；banner 是自己写的稳定标记。
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
