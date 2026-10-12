// 「工作区卫生」守卫（BUG-114，2026-10-07 立）。
//
// 治的是什么：AGENTS.md §5 写了「临时产物统一进 tmp/」「根目录不许再出现散的
// tmp-* / .tmp-* 文件」，但 §6 的清单里没有任何命令会看这件事，于是违规静默累积
// ——取证当场：`outputs/` 57 个文件 36MB 进了索引、仓库根躺着 .tmp-oldtex/ /
// .tmp-test/ / tmp-test-*.log、`tmp/` 顶层堆了 370 项一次性散件（连六个白名单目录
// 共 376 项条目）；而 `npm run clean`
// 默认又不碰顶层，堆积是单调递增的。判据三条，命中任意一条即 exit 1 并逐条点名：
//   ① 仓库根没有 tmp-* / .tmp-* 散件；
//   ② tmp/ 顶层只有六个白名单子目录（test / bench / repro / shots / scratch /
//      tsbuild，各位的用途见 AGENTS.md §5）；一次性脚本放 tmp/scratch/；
//   ③ git 索引里没有位于 outputs/、tmp/、根级 tmp-* / .tmp-* 下的文件
//      （outputs/ 是「不该入库的一次性产物」；摘除走 git rm，见 BUG-114 工单）。
// 可选入参：在别的仓库里跑同一判据（守卫机制自测用——probe 仓故意塞一颗被跟踪的
// outputs/ 文件应红，git rm --cached 后应绿）。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const argDir = process.argv[2]
const cwd = argDir ? path.resolve(argDir) : projectDir

// tmp/ 顶层白名单：与 AGENTS.md §5 的六个临时区位一一对应。
// 要开新位先改规约（并同步本表），别往顶层扔。
const TMP_WHITELIST = new Set(['test', 'bench', 'repro', 'shots', 'scratch', 'tsbuild'])
const problems = []

// ① 仓库根散件：tmp-* / .tmp-*
for (const name of fs.readdirSync(cwd)) {
  if (/^\.?tmp-/.test(name)) {
    problems.push(`根目录散件：${name}（临时产物统一进 tmp/，见 AGENTS.md §5）`)
  }
}

// ② tmp/ 顶层形状：只许六个白名单子目录（不存在 tmp/ 视为未开临时区，跳过）
const tmpDir = path.join(cwd, 'tmp')
if (fs.existsSync(tmpDir)) {
  for (const name of fs.readdirSync(tmpDir)) {
    if (!TMP_WHITELIST.has(name)) {
      problems.push(`tmp/ 顶层散件：tmp/${name}（只许六个白名单子目录；一次性脚本放 tmp/scratch/）`)
    }
  }
}

// ③ 索引面：outputs/ 与 tmp/ 下不该有被跟踪的文件（cwd 取 danpen →
//    ls-files 只列本项目子树、路径按项目根相对化，与 check-internals 同手法）。
//    ⚠️ `core.quotepath=off` 是必需的：git 默认把非 ASCII 路径转义并加引号
//    （`"outputs/polefix/\346\236\201…"`），行首变成引号后 `^(outputs|tmp)/` 匹配不上，
//    那颗文件就被静默放过——实测真仓 57 个被跟踪文件只点名 56 个，漏的正是
//    `outputs/polefix/极点拼接修复报告.md`。守卫的判据必须看得见中文名文件。
const r = spawnSync('git', ['-c', 'core.quotepath=off', 'ls-files'], { cwd, encoding: 'utf8' })
if (r.error) {
  console.log('check-workspace: 无法执行 git——' + r.error.message)
  process.exit(1)
}
if (r.status !== 0) {
  console.log('check-workspace: git 命令失败：' + String(r.stderr || '').trim())
  process.exit(1)
}
for (const f of String(r.stdout).split('\n').filter(Boolean)) {
  // 转义未生效 → 判据不可信，fail-loud（同上：静默放过比不守更坏）
  if (f.startsWith('"')) {
    console.log('check-workspace: git 返回了引号包裹的转义路径——core.quotepath=off 没生效，判据不可信')
    process.exit(1)
  }
  if (/^(outputs|tmp)\//.test(f) || /^\.?tmp-/.test(f)) {
    problems.push(`索引里的临时产物：${f}（不该入库；摘除见 BUG-114 工单）`)
  }
}

if (problems.length > 0) {
  console.log('check-workspace: 未通过——')
  for (const p of problems) console.log('  ' + p)
  process.exit(1)
}
console.log('check-workspace: 通过（根目录无散件、tmp/ 顶层形状合规、索引里无临时产物）')
