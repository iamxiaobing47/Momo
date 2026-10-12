// 构建期注入的常量：`__GLOBE_ASSET_REV__`。
//
// 由 esbuild.config.mjs 的 `define` 编进 main.js，值是 globe3d.js + cube 六面
// 的合并内容哈希前 12 位。运行期由 src/views/caps.ts 的 globeCubeUrls /
// globe3dUrl 追加成 `?v=<hash>`——**给固定文件名的独立产物加内容指纹**，让
// Chromium 的资源缓存不可能命中旧副本（2026-10-05 踩实：改了 shader 并部署、
// 磁盘产物逐字节校验全对，用户仍看到「球有贴图但不转」——球与贴图走 app://
// 固定 URL 被缓存，光点在 main.js 里所以是新的）。
//
// ⚠️ 为什么声明成「可能未定义」而不是 `string`：jsdom 测试与截图 harness 走
// scripts/run-tests.mjs 与 esbuild 的另一条配置，那两条**不注入**这个 define。
// 声明成 string 会让 `typeof __GLOBE_ASSET_REV__ === 'string'` 之外的用法编译
// 通过、运行期却 ReferenceError；这里用「未定义也合法」的口径，运行时由
// `globeAssetRev()` 兜成空串（= 不加 query = 退回改动前的行为，不崩）。
declare const __GLOBE_ASSET_REV__: string | undefined