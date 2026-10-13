// 手动发布 GitHub Release —— 发布链的第二条路径（第一条是 tag push 触发的 CI release.yml）。
//
//   npm run release:publish                    从「已推送的 tag」建 Release（tag 默认 = manifest.json 的 version）
//   npm run release:publish -- --dry-run       走完全部校验与铺包，只打印 gh 命令、不调 gh
//   npm run release:publish -- --force         Release 已存在时重传资产（gh release upload --clobber）
//   npm run release:publish -- --draft         建草稿 Release（先在网页上确认再 publish）
//   npm run release:publish -- --repo <目录>   在别的检出上执行（默认当前工程根）
//
// 口径（为什么这样设计，改之前先读）：
//   · **只认已推送的 tag**：本命令不 commit / 不打 tag / 不 push——git 写动作留给人
//     （AGENTS.md §10）。tag 必须等于 manifest.json 的 version（Obsidian 商店按这个匹配，
//     不许带 v 前缀）、指向 HEAD，且工作区干净：发布资产必须逐字节等于那个 commit 的内容。
//   · **不重新发明资产清单**：铺包复用 vault-targets.releaseManifest() / stageRelease()
//     ——手列文件名漏过 12 张贴图（BUG-117b：当时还漏了 globe3d.js，它已随 BUG-219 退役），
//     CI 与本命令共用同一条链。
//   · **发布前必须 build 过**：构建产物（main.js / styles.css）比 src/**、
//     styles.src/** 旧就红（「改了没构建」正是发布链最容易漏、也最长在用户眼里的错）。
//   · **provenance（attestation）只走 CI 那条路**：GitHub artifact attestation 用
//     workflow 的 OIDC 身份签名，本地手动发布**没有**这个身份，gh CLI 也没有
//     「本地造 attestation」的子命令（gh attestation 只有 verify / download 一侧）。
//     所以本命令发完只打印一条提示，让用户知道手动路不带 provenance、要它就回 CI 重跑
//     （见 MANUAL_PROVENANCE_NOTE；BUG-220 的落地记录写了这条裁决）。
//   · **依赖 gh CLI**：缺 gh / 没登录都 fail-loud 并给安装与登录指引（不自造 HTTP 上传）。
//   · 与 CI 的关系：tag push 会触发 release.yml 自动发版；它已经发了的话本命令默认拒绝，
//     要重传资产用 `--force`。两条路径共用「一个 tag 一份 Release」的语义。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { pluginProjectDir, releaseManifest } from './vault-targets.mjs'
import { stageRelease } from './stage-release.mjs'

// ─── 纯判据（不碰 fs / git / gh，测试直接喂数据） ───

/**
 * tag 与版本的匹配问题。Obsidian 社区商店按「release tag == manifest.version」匹配，
 * 带 v 前缀会被判成「没有匹配 manifest 版本的 release」而卡住（见 release.yml 的注释）。
 * @param {string} tag
 * @param {string} version
 * @returns {string[]}
 */
export function releaseTagProblems(tag, version) {
  const bad = []
  if (!tag) {
    bad.push('tag 是空的——给 --tag <版本号>，或让 manifest.json 的 version 顶上')
  } else if (/^v/.test(tag)) {
    bad.push(`tag「${tag}」带了 v 前缀——Obsidian 要求 tag 等于 manifest.version，必须是不带 v 的 ${version}`)
  }
  if (tag && version && tag !== version) {
    bad.push(`tag「${tag}」与 manifest.json 的 version「${version}」不一致——先改版本三件套，或 checkout 到该版本对应的 commit`)
  }
  return bad
}

/**
 * 版本三件套（package / manifest / versions）一致性——发布前最后一道闸，
 * 与 release-assets-guard.test.mts 的 BUG-173b 判据同口径。
 * @param {{ pkgVersion: unknown, manifestVersion: unknown, minAppVersion: unknown, versions: unknown }} input
 * @returns {string[]}
 */
export function versionTrioProblems({ pkgVersion, manifestVersion, minAppVersion, versions }) {
  const bad = []
  if (typeof manifestVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifestVersion)) {
    bad.push(`manifest.json 的 version「${String(manifestVersion)}」不是 semver`)
  }
  if (pkgVersion !== manifestVersion) {
    bad.push(`package.json 的 version「${String(pkgVersion)}」与 manifest.json 的「${String(manifestVersion)}」不一致（发版三件套漏改一处）`)
  }
  if (typeof minAppVersion !== 'string' || minAppVersion === '') {
    bad.push('manifest.json 缺 minAppVersion')
  }
  if (versions === null || typeof versions !== 'object') {
    bad.push('versions.json 读不出来 / 不是对象')
  } else if (typeof manifestVersion === 'string' && !(manifestVersion in versions)) {
    bad.push(`versions.json 没有登记「${manifestVersion}」（发版三件套漏改一处）`)
  } else if (versions[manifestVersion] !== minAppVersion) {
    bad.push(`versions.json 的「${manifestVersion}」= ${String(versions[manifestVersion])}，不等于 manifest.minAppVersion「${String(minAppVersion)}」`)
  }
  return bad
}

/**
 * 发布必须发生在「等于 tag 的那个 commit」上：否则铺出来的资产与 tag 内容对不上。
 * @param {{ tag: string, head: string | null, tagCommit: string | null, repoRoot: string | null,
 *           projectDir: string, dirty: boolean, gitError?: string }} state
 * @returns {string[]}
 */
export function gitStateProblems(state) {
  const { tag, head, tagCommit, repoRoot, projectDir, dirty } = state
  const bad = []
  if (state.gitError) {
    bad.push(`执行 git 失败：${state.gitError}`)
    return bad
  }
  if (repoRoot && projectDir && path.resolve(repoRoot) !== path.resolve(projectDir)) {
    bad.push(`工程根不是 git 仓库根（仓库根在 ${repoRoot}）——发布要在公开仓 Momo 的检出里跑，或用 --repo 指过去`)
  }
  if (!head) {
    bad.push('读不到 HEAD——这里不是一个 git 仓库？')
  }
  if (!tagCommit) {
    bad.push(`本地没有 tag「${tag}」——先 git tag ${tag} 并 push（本命令不替你打 tag / push tag）`)
  } else if (head && tagCommit !== head) {
    bad.push(
      `tag「${tag}」不指向 HEAD（tag=${String(tagCommit).slice(0, 7)} HEAD=${String(head).slice(0, 7)}）——` +
        '发布资产只对得上它自己的 commit，checkout 到该 tag（或把 tag 移到 HEAD）再跑',
    )
  }
  if (dirty) {
    bad.push('工作区不干净——发布资产必须逐字节等于 tag 的内容，先 commit / stash 再跑')
  }
  return bad
}

/**
 * 发布资产必须比源新：改了 src/、styles.src/ 却没重新构建 = 发出去的包是旧的。
 * @param {{ newestSourceMtimeMs: number, artifacts: { rel: string, mtimeMs: number | null }[] }} input
 * @returns {string[]}
 */
export function assetFreshnessProblems({ newestSourceMtimeMs, artifacts }) {
  const bad = []
  for (const a of artifacts) {
    if (a.mtimeMs === null) bad.push(`发布资产 ${a.rel} 不在——先 npm run build`)
    else if (a.mtimeMs < newestSourceMtimeMs) bad.push(`发布资产 ${a.rel} 比源旧（改了源码没重新构建）——先 npm run build`)
  }
  return bad
}

/**
 * gh 的 argv。默认建 Release；`--force` 走「已存在 → 重传资产」那条路。
 * @param {{ tag: string, files: string[], draft?: boolean, force?: boolean }} input
 * @returns {string[]}
 */
export function ghArgs({ tag, files, draft = false, force = false }) {
  if (force) return ['release', 'upload', tag, '--clobber', ...files]
  return ['release', 'create', tag, '--title', tag, '--generate-notes', '--verify-tag', ...(draft ? ['--draft'] : []), ...files]
}

/**
 * 手动路发完之后打的 provenance 提示（BUG-220）。
 *
 * **为什么手动路不签名**：GitHub artifact attestation 由 `actions/attest-build-provenance`
 * 在 workflow 里用 OIDC 身份签（subject = 那些资产，issuer = GitHub Actions）；本命令在
 * 用户自己的机器上跑，没有这个身份，gh CLI 也没有「本地造 attestation」这一侧的子命令
 * （`gh attestation` 只有 verify / download）。硬造一个自签名的东西只会让「有没有
 * provenance」这件事更难分辨 —— 所以这里**不假签名**，只把口径说清、把用户引回 CI。
 *
 * 测试（publish-release-guard.test.mts）钉住这段文案必须同时提到 attestation 与 CI：
 * 谁把这条提示删成一句空话，门禁就红。
 */
export const MANUAL_PROVENANCE_NOTE =
  '[release] 注意：手动路不产出 GitHub artifact attestation（它需要 Actions 的 OIDC 身份，' +
  '本机 gh 做不到）。要 provenance 请在公开仓 push tag 走 CI release.yml（那一步带 ' +
  'attest-build-provenance），或事后重跑那条 workflow。'

// ─── 纯助手 ───

/** 带空格的路径要在打印出来的命令里带引号，方便直接复制去跑 */
function quote(s) {
  return /\s/.test(s) ? `"${s}"` : s
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function walkRel(dir, rel, out) {
  const abs = path.join(dir, rel)
  if (!fs.existsSync(abs)) return
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = `${rel}/${e.name}`
    if (e.isDirectory()) walkRel(dir, child, out)
    else out.push(child)
  }
}

function mtimeMsOrNull(file) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

/** 源面：src/**、styles.src/** 与几个根级配置 / 清单文件（产物必须比它们新） */
function sourceRels(dir) {
  const out = []
  for (const area of ['src', 'styles.src']) walkRel(dir, area, out)
  for (const f of ['package.json', 'manifest.json', 'versions.json', 'esbuild.config.mjs', 'tsconfig.json']) {
    if (fs.existsSync(path.join(dir, f))) out.push(f)
  }
  return out
}

function git(dir, args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
}

function gitState(dir, tag) {
  const headR = git(dir, ['rev-parse', 'HEAD'])
  if (headR.error || headR.status !== 0) {
    return { head: null, tagCommit: null, repoRoot: null, dirty: false, gitError: String(headR.stderr || headR.error?.message || '').trim() }
  }
  const tagR = git(dir, ['rev-parse', '--verify', '-q', `refs/tags/${tag}^{commit}`])
  const rootR = git(dir, ['rev-parse', '--show-toplevel'])
  const stR = git(dir, ['status', '--porcelain'])
  return {
    head: headR.stdout.trim(),
    tagCommit: tagR.status === 0 ? tagR.stdout.trim() : null,
    repoRoot: rootR.status === 0 ? rootR.stdout.trim() : null,
    dirty: stR.status === 0 ? stR.stdout.trim().length > 0 : false,
  }
}

// ─── CLI ───

function usage() {
  console.log(
    [
      '手动发布 GitHub Release（不 commit / 不打 tag / 不 push，只建 Release）',
      '',
      '  npm run release:publish [-- 选项]',
      '',
      '选项：',
      '  --dry-run      走完全部校验与铺包，只打印 gh 命令，不调 gh',
      '  --force        Release 已存在时重传资产（gh release upload --clobber）',
      '  --draft        建草稿 Release',
      '  --tag <版本>   默认 = manifest.json 的 version（Obsidian 口径，不带 v）',
      '  --repo <目录>  在别的检出上执行（默认当前工程根）',
      '  -h, --help     这份说明',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, draft: false, help: false, tag: undefined, repo: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--force') opts.force = true
    else if (a === '--draft') opts.draft = true
    else if (a === '-h' || a === '--help') opts.help = true
    else if (a === '--tag') opts.tag = argv[++i]
    else if (a === '--repo') opts.repo = argv[++i]
    else die([`不认识的参数「${String(a)}」——--help 看用法`])
  }
  return opts
}

function die(problems, keepDir) {
  console.error('[release] 发布未开始——以下条件不满足：')
  for (const p of problems) console.error(`[release]   · ${p}`)
  if (keepDir) console.error(`[release]   铺好的资产仍在：${keepDir}`)
  process.exit(1)
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return usage()

  const dir = opts.repo ? path.resolve(opts.repo) : pluginProjectDir()
  const readPaths = {
    manifest: path.join(dir, 'manifest.json'),
    pkg: path.join(dir, 'package.json'),
    versions: path.join(dir, 'versions.json'),
  }
  const absent = Object.values(readPaths).filter((p) => !fs.existsSync(p))
  if (absent.length > 0) {
    die([`缺 ${absent.join(' / ')}——--repo / 工程根必须指向插件工程根（公开仓 Momo 检出）`])
  }

  const manifest = readJson(readPaths.manifest)
  const pkg = readJson(readPaths.pkg)
  const versions = readJson(readPaths.versions)
  const version = String(manifest.version ?? '')
  const tag = opts.tag ?? version

  // ① 版本三件套 + tag 口径（这两组不满足就不必碰 git / gh 了）
  const problems = [
    ...versionTrioProblems({ pkgVersion: pkg.version, manifestVersion: manifest.version, minAppVersion: manifest.minAppVersion, versions }),
    ...releaseTagProblems(tag, version),
  ]
  if (problems.length > 0) die(problems)

  // ② git：tag 必须在本地、指向 HEAD，工作区干净
  const state = gitState(dir, tag)
  problems.push(...gitStateProblems({ tag, ...state, projectDir: dir }))

  // ③ 远端 tag：release 只认已推送的 tag（本命令不替你 push）
  if (!opts.dryRun && !state.gitError) {
    const remote = git(dir, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
    if (remote.error || remote.status !== 0) {
      problems.push(`git ls-remote 失败（这条要联网）：${String(remote.stderr || remote.error?.message || '').trim()}`)
    } else if (!remote.stdout.trim()) {
      problems.push(`远端 origin 上没有 tag「${tag}」——先 git push origin ${tag}（本命令不替你 push）`)
    }
  }

  // ④ 构建新鲜度：**构建产物**必须比源新
  // 只查构建出来的那几件（main.js / styles.css）：manifest.json 与星球贴图
  // 是从源原样拷的、不存在「重新构建」，把它们也拉去跟 src/ 比时间会恒红（贴图自己就在 src/ 下）。
  const sourceList = sourceRels(dir)
  // 路径口径统一成正斜杠：sourceRels 是手写 `/`，releaseManifest 走 path.join（Windows 是 `\`），
  // 不归一就会把「本身就是源文件」的贴图/清单当成构建产物、拿它跟 src/ 比时间 → 恒红。
  const norm = (rel) => rel.split(path.sep).join('/')
  const sourceSet = new Set(sourceList.map(norm))
  const artifacts = releaseManifest(dir)
    .filter((m) => !sourceSet.has(norm(m.src)))
    .map((m) => ({ rel: m.src, mtimeMs: mtimeMsOrNull(path.join(dir, m.src)) }))
  const sourceMs = sourceList.map((rel) => mtimeMsOrNull(path.join(dir, rel)) ?? 0)
  problems.push(...assetFreshnessProblems({ newestSourceMtimeMs: sourceMs.length > 0 ? Math.max(...sourceMs) : 0, artifacts }))
  if (problems.length > 0) die(problems)

  // ⑤ gh CLI（--dry-run 只打印命令，不要求装 gh）
  if (!opts.dryRun) {
    const ghv = spawnSync('gh', ['--version'], { encoding: 'utf8' })
    if (ghv.error || ghv.status !== 0) {
      die(['没找到 gh CLI——手动发布靠它建 Release。安装：https://cli.github.com/（Windows: winget install --id GitHub.cli）'])
    }
    const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' })
    if (auth.status !== 0) {
      die(['gh 没登录——先 gh auth login（或给环境变量 GH_TOKEN / GITHUB_TOKEN）'])
    }
  }

  // ⑥ 铺包（与 CI 同一条链、同一份清单）
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-release-'))
  let entries
  try {
    entries = stageRelease(stageDir, dir)
  } catch (e) {
    fs.rmSync(stageDir, { recursive: true, force: true })
    die([`铺发布包失败：${e instanceof Error ? e.message : String(e)}`])
  }
  const files = entries.map((m) => path.join(stageDir, m.dest))
  const args = ghArgs({ tag, files, draft: opts.draft, force: opts.force })

  // ⑦ --dry-run：只打印，留着目录好让人核对
  if (opts.dryRun) {
    console.log(`[release] dry-run：${entries.length} 件资产已铺到 ${stageDir}`)
    for (const m of entries) console.log(`[release]   ${m.dest}`)
    console.log(`[release] 将执行：gh ${args.map(quote).join(' ')}`)
    console.log(MANUAL_PROVENANCE_NOTE)
    console.log('[release] dry-run 结束——未调用 gh、未创建 Release')
    return
  }

  // ⑧ Release 已存在（多半是 tag push 触发的 CI 发过了）：默认拒绝，--force 才覆盖资产
  if (!opts.force) {
    const view = spawnSync('gh', ['release', 'view', tag], { encoding: 'utf8' })
    if (view.status === 0) {
      die([`Release「${tag}」已存在（很可能是 tag push 触发的 CI release.yml 发的）——要重传资产用 --force`], stageDir)
    }
  }

  const r = spawnSync('gh', args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`[release] gh 退出码 ${String(r.status)}——发布未完成。铺好的资产仍在：${stageDir}`)
    process.exit(1)
  }
  fs.rmSync(stageDir, { recursive: true, force: true })
  console.log(`[release] 已发布 tag「${tag}」（${entries.length} 件资产）`)
  console.log(MANUAL_PROVENANCE_NOTE)
}

// 只有「被 node 直接执行」时才跑：测试 import 纯判据时不许有副作用。
// 判据照 fetch-icons.mjs / lint-deadcode.mjs：esbuild 打进 tmp/test/ 的 bundle 里 argv[1]
// 与 import.meta.url 会**相等**（都是 bundle 自己），只比那一条会让 CLI 在测试进程里执行
// （sync-check.mjs 就没有这道守卫，被测试 import 时连它的 CLI 一起跑了——别照抄那个）。
if (
  process.argv[1] !== undefined &&
  path.basename(process.argv[1]) === 'publish-release.mjs' &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
