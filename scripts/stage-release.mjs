// 发布包铺平（BUG-117b）：按 vault-targets.mjs 的 releaseManifest() 把产物拷进一个目录，
// 布局与 vault 插件目录一致（main.js / manifest.json / styles.css / globe3d.js / 两套贴图六面）。
//
//   node scripts/stage-release.mjs <输出目录>     # CI 的 release.yml 用这一条
//   npm run release:publish                      # 手动发布：内部 import 下面的 stageRelease()
//
// 只给发布链用：CI 里输出到 `${{ runner.temp }}` 下（仓库外，不碰 tmp/ 白名单），
// upload-artifact 整目录上传。任何一件缺失即 exit 1——等价于 `if-no-files-found: error`，
// 但覆盖的是**完整**清单，而不是 workflow 里手列的那几行。
//
// 清单只有一份真源（releaseManifest），铺平逻辑导出成函数好让手动发布复用同一条路径——
// workflow 里手列文件名漏过 globe3d.js 与 12 张贴图那次事故（BUG-117b）不允许有第二遍。
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { pluginProjectDir, releaseManifest } from './vault-targets.mjs'

/**
 * 按 `releaseManifest(dir)` 铺平发布包，返回清单（`{ src, dest }[]`）。
 * 任何一件源缺失、或输出目录落在工程内，都抛 Error——调用方决定怎么报。
 *
 * @param {string} outArg 输出目录（必须在工程外：工程内会被下一次 build / check:workspace 当散件）
 * @param {string} [dir] 工程根（默认当前检出，`--repo` 走的就是它）
 * @returns {{ src: string, dest: string }[]}
 */
export function stageRelease(outArg, dir = pluginProjectDir()) {
  const outDir = path.resolve(outArg)
  const rel = path.relative(dir, outDir)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`输出目录不许在工程内（${outDir}）——用仓库外的目录`)
  }
  const manifest = releaseManifest(dir)
  const missing = manifest.filter((m) => !fs.existsSync(path.join(dir, m.src)))
  if (missing.length > 0) {
    throw new Error(`缺 ${missing.map((m) => m.src).join(' / ')}（先 npm run build / npm run fetch）`)
  }
  fs.rmSync(outDir, { recursive: true, force: true })
  for (const m of manifest) {
    const dst = path.join(outDir, m.dest)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(path.join(dir, m.src), dst)
  }
  return manifest
}

// CLI 薄壳：只有「被 node 直接执行」时才跑（被测试 / publish-release.mjs import 时不许有副作用）。
// 判据照 fetch-icons.mjs / lint-deadcode.mjs：esbuild 打进 tmp/test/ 的 bundle 里 argv[1]
// 与 import.meta.url 会**相等**（都是 bundle 自己），只比那一条会让 CLI 在测试进程里凭空执行。
if (
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'stage-release.mjs' &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const outArg = process.argv[2]
  if (!outArg) {
    console.error('stage-release: 缺输出目录参数——用法 node scripts/stage-release.mjs <输出目录>')
    process.exit(1)
  }
  try {
    const manifest = stageRelease(outArg)
    console.log(`stage-release: ${manifest.length} 件 → ${path.resolve(outArg)}`)
  } catch (e) {
    console.error(`stage-release: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}
