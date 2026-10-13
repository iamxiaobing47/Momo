// 同步面的共享真源：`sync-to-momo.mjs`（搬运 + 删除）与 `sync-check.mjs`（核对）都从这里取，
// 免得两处各写一份、改一处漏一处。
//
// 这一份真源管三件事：
//   ① **面内枚举**（搬谁 / 判谁 / 公开仓多出来的该删谁）：`src/**` + `styles.src/**` 全量、
//      根级业务文件（ROOT_BUSINESS_EXACT + `README*` 通配）、`scripts/` 里 **Momo 已跟踪**
//      的（去测试）∪ SCRIPT_ALWAYS_SYNC 白名单；
//   ② **面外清单**（`package.json` / `package-lock.json` / `.github/**`）：永不搬、永不判、
//      **永不删**——公开仓那几件是本仓没有的（精简版 package.json、Momo 自己的 CI），
//      删了就毁用户仓库；删除面靠 isSyncSurfaceFile 这条判据保证「只在同步面内删」（BUG-232
//      的硬约束②）。`.gitattributes` 这类公开仓自有基建不在这张表里，但它同样不在面内——
//      面是**白名单**枚举出来的，没登记就进不去；
//   ③ 发布链白名单 SCRIPT_ALWAYS_SYNC：登记在那里的脚本即使 Momo 索引还没跟踪也进面。
//
// 常规 `scripts/` 新脚本默认 **dev-only**（测试 / 文档守卫 / 一次性工具都不进公开仓，
// 跟踪面以 Momo 的 git 索引为权威，见 AGENTS.md §0）；**发布链 / 构建链脚本是例外**：
// 它们要在公开仓检出里直接能跑或能被 import（`npm run release:publish` 要跑得起来，
// `esbuild.config.mjs` 要 import 得到），必须进同步面。漏登记不会立刻报错——但公开仓
// 那条 `npm run build`（**CI 发版资产就是它构建的**）会 import 到不存在的模块，直接红。
// 要把一个新脚本纳入同步面：登记到下面这张表，并同步 AGENTS.md §0 的口径。
export const SCRIPT_ALWAYS_SYNC = [
  // 手动发布 GitHub Release：Momo 检出的 package.json 里登记了同名的 npm script
  'scripts/publish-release.mjs',
  // sync-to-momo.mjs import 它；不带过去会让公开仓里那份 sync 脚本 import 到不存在的模块
  'scripts/sync-surface.mjs',
  // esbuild.config.mjs import 它（装载期中和 react-dom 的运行期 <script>，BUG-233）；
  // 不带过去，公开仓那条 `npm run build` 会 import 到不存在的模块
  'scripts/react-dom-script-guard.mjs',
  // 上面那个模块的类型声明面。公开仓不跑 scripts 层 typecheck，带过去只为两仓 scripts/
  // 形状一致（先例：vault-targets.d.mts 在 Momo 也是跟踪的）
  'scripts/react-dom-script-guard.d.mts',
]

/** 全量目录面：本仓的这两个目录是唯一真源——本仓有的全搬过去，公开仓多出来的就是退役文件 */
export const SYNC_DIRS = ['src', 'styles.src']

/** 根级业务文件（精确名）。与 AGENTS.md §0 的枚举同源；改口径先改这里，再改 §0 那句话 */
export const ROOT_BUSINESS_EXACT = [
  'styles.css',
  'manifest.json',
  'versions.json',
  'esbuild.config.mjs',
  'tsconfig.json',
  '.stylelintrc.json',
  '.editorconfig',
  '.gitignore',
  'LICENSE',
]

/** 面外（永不搬 / 永不判 / **永不删**）：公开仓这几件是本仓没有的，删除面必须绕开 */
export const IGNORE_EXACT = ['package.json', 'package-lock.json']
export const IGNORE_PREFIX = ['.github/']

export const isIgnoredPath = (rel) =>
  IGNORE_EXACT.includes(rel) || IGNORE_PREFIX.some((p) => rel.startsWith(p))

/** 根级业务文件：精确名 + `README*` 通配（三语文档各自独立，别漏）。只认根级，不认嵌套路径 */
export const isRootBusinessFile = (rel) =>
  !rel.includes('/') && (ROOT_BUSINESS_EXACT.includes(rel) || /^README/.test(rel))

/** `scripts/` 面的一件：Momo 已跟踪的脚本（去测试）或 SCRIPT_ALWAYS_SYNC 登记过的发布链脚本 */
export const isScriptSurfaceFile = (rel, trackedScripts) =>
  rel.startsWith('scripts/') && (trackedScripts.has(rel) || SCRIPT_ALWAYS_SYNC.includes(rel))

/**
 * 这件文件在不在同步面里。搬运、核对、删除三面共用这一条判据：
 * 面外的（package.json / .github/** 与 `.gitattributes` 这类公开仓自有基建）一格都不许进。
 */
export const isSyncSurfaceFile = (rel, trackedScripts) =>
  !isIgnoredPath(rel) &&
  (SYNC_DIRS.some((d) => rel.startsWith(d + '/')) ||
    isRootBusinessFile(rel) ||
    isScriptSurfaceFile(rel, trackedScripts))
