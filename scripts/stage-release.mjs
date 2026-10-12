// 发布包铺平（BUG-117b）：按 vault-targets.mjs 的 releaseManifest() 把产物拷进一个目录，
// 布局与 vault 插件目录一致（main.js / manifest.json / styles.css / globe3d.js / 两套贴图六面）。
//
//   node scripts/stage-release.mjs <输出目录>
//
// 只给 .github/workflows/release.yml 用：CI 里输出到 `${{ runner.temp }}` 下（仓库外，
// 不碰 tmp/ 白名单），upload-artifact 整目录上传。任何一件缺失即 exit 1——等价于
// `if-no-files-found: error`，但覆盖的是**完整**清单，而不是 workflow 里手列的那几行。
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pluginProjectDir, releaseManifest } from './vault-targets.mjs'

const outArg = process.argv[2]
if (!outArg) {
  console.error('stage-release: 缺输出目录参数——用法 node scripts/stage-release.mjs <输出目录>')
  process.exit(1)
}
const projectDir = pluginProjectDir()
const outDir = path.resolve(outArg)
const rel = path.relative(projectDir, outDir)
if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
  // 铺进工程内会被下一次 build / check:workspace 当散件；CI 用 runner.temp
  console.error(`stage-release: 输出目录不许在工程内（${outDir}）——用仓库外的目录`)
  process.exit(1)
}

const manifest = releaseManifest(projectDir)
const missing = manifest.filter((m) => !fs.existsSync(path.join(projectDir, m.src)))
if (missing.length > 0) {
  for (const m of missing) console.error(`stage-release: 缺 ${m.src}（先 npm run build / npm run fetch）`)
  process.exit(1)
}
fs.rmSync(outDir, { recursive: true, force: true })
for (const m of manifest) {
  const dst = path.join(outDir, m.dest)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(path.join(projectDir, m.src), dst)
}
console.log(`stage-release: ${manifest.length} 件 → ${outDir}`)
