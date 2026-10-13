// 清理运行时临时产物：tmp/ 统一临时区 + 历史遗留的 .tmp-* / tmp-* 散物。
// 这是临时文件清理的唯一入口，不要手写 rm 命令（历史教训见 AGENTS.md §5）。
// 用法：
//   npm run clean          只清可再生成的 tmp/test、tmp/bench（下次运行自动重建）
//   npm run clean -- --all 连 tmp/ 整个目录（含 scratch / repro 归档）一起清
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectRoot } from './project-root.mjs'

// projectRoot() 不传参：传 import.meta.url 那是 URL 字符串，path.dirname 切完
// existsSync 按 cwd 解析（实测返回 '.'）——npm 从仓库根跑时碰巧对，换个 cwd 就
// 静默清错地方。默认参数内部先 fileURLToPath，直跑 / 打包两种宿主都指向仓库根。
const projectDir = projectRoot()
const all = process.argv.includes('--all')
const tmpDir = path.join(projectDir, 'tmp')

const targets = all
  ? [tmpDir]
  : [path.join(tmpDir, 'test'), path.join(tmpDir, 'bench')]

// --all 时补扫根目录历史命名残留（.gitignore 仍兜底，但物理上清掉）
if (all) {
  for (const name of fs.readdirSync(projectDir)) {
    if (/^\.(tmp-|tmp-)|^tmp-/.test(name)) targets.push(path.join(projectDir, name))
  }
}

let removed = 0
for (const dir of targets) {
  if (!fs.existsSync(dir)) continue
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`[clean] - ${path.relative(projectDir, dir)}`)
  removed++
}
console.log(removed === 0 ? '[clean] 没有可清理的临时目录' : `[clean] 清理了 ${removed} 个目录`)
