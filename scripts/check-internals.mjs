// 「内部产物不进版本控制」守卫（BUG-99，2026-10-07 立）。
//
// 治的是什么：`.gitignore` 只约束**未被跟踪**的文件——一旦某文件在补 ignore 规则
// **之前**已经进了索引，后面的规则对它零作用力。本项目声明「不随公开仓库分发」的
// 目录（.gitignore :20-26 段：docs/internal / .workbuddy / .playwright-cli / .zcode）
// 里就留着 5 颗这样的历史残留（含本机用户名与绝对路径、会话 id 诊断稿）。
//
// 判据一条：`git ls-files -i -c --exclude-standard`（被排除规则命中 ∩ 在索引里）
// 输出非空即 exit 1 并逐条点名。只查索引，不碰工作区——摘除走 `git rm --cached`
// （保留盘上文件），提交后本守卫转绿；历史清理由用户按 BUG-99 工单执行。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { projectRoot } from './project-root.mjs'

// cwd 取项目根（danpen）：ls-files 在子目录下只列本子树、路径按项目根相对化，
// 消息里报的路径与 .gitignore 段里写的一模一样。git 根是整个 vault（见工单
// 「备注」），但本守卫的语义只覆盖本项目自己声明的内部目录。
// 可选入参：在别的 git 仓库里跑同一判据（守卫机制自测用——probe 仓故意塞一颗
// 「被 ignore 却已入库」的文件应红，git rm --cached 后应绿）。
const projectDir = projectRoot(import.meta.url)
const argDir = process.argv[2]
const cwd = argDir ? path.resolve(argDir) : projectDir
const r = spawnSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-i', '-c', '--exclude-standard'], {
  cwd,
  encoding: 'utf8',
})
if (r.error) {
  console.log('check-internals: 无法执行 git——' + r.error.message)
  process.exit(1)
}
if (r.status !== 0) {
  console.log('check-internals: git 命令失败：' + String(r.stderr || '').trim())
  process.exit(1)
}
const files = String(r.stdout).split('\n').filter(Boolean)
// ⚠️ quotepath 必须生效，否则判据不可信：git 默认把非 ASCII 路径转义并加引号，
// 行首变成引号后任何按前缀匹配的规则都会静默放过那颗文件（本仓实测：不加
// `-c core.quotepath=off` 时中文名文件不在点名列表里）。与其静默漏，不如在这里 fail-loud
// ——谁把上面那三个参数摘掉，这条立刻红。
for (const f of files) {
  if (f.startsWith('"')) {
    console.log('check-internals: git 返回了引号包裹的转义路径——core.quotepath=off 没生效，判据不可信')
    process.exit(1)
  }
}
if (files.length > 0) {
  console.log('check-internals: 未通过——以下文件被 .gitignore 声明「不随公开仓库分发」，却仍在 git 索引中：')
  for (const f of files) console.log('  ' + f)
  console.log('  处理：git rm --cached <路径>（保留工作区文件），提交后本守卫转绿')
  process.exit(1)
}
console.log('check-internals: 通过（索引里没有被 ignore 声明的文件）')
