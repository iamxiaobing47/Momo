// 同步面的共享真源：`sync-to-momo.mjs`（搬运）与 `sync-check.mjs`（核对）都从这里取，
// 免得两处各写一份、改一处漏一处。
//
// 常规 `scripts/` 新脚本默认 **dev-only**（测试 / 文档守卫 / 一次性工具都不进公开仓，
// 跟踪面以 Momo 的 git 索引为权威，见 AGENTS.md §0）；**发布链脚本是例外**：
// 它要在公开仓检出里直接能跑（`npm run release:publish`），必须进同步面。
// 要把一个新脚本纳入同步面：登记到下面这张表，并同步 AGENTS.md §0 的口径。
export const SCRIPT_ALWAYS_SYNC = [
  // 手动发布 GitHub Release：Momo 检出的 package.json 里登记了同名的 npm script
  'scripts/publish-release.mjs',
  // sync-to-momo.mjs import 它；不带过去会让公开仓里那份 sync 脚本 import 到不存在的模块
  'scripts/sync-surface.mjs',
]
