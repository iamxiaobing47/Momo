// 运行时资源（globe3d.js + cube 六面）的内容指纹——**构建期注入，运行期只读**。
//
// 这个值由 esbuild.config.mjs 的 `define` 编进 main.js：`__GLOBE_ASSET_REV__`
// = globe3d.js 与六个 cube 面合并哈希的前 12 位（见 src/globe-asset-rev.d.ts）。
//
// **为什么需要它**（2026-10-05 踩实）：那些产物是**固定文件名**的独立部署物，
// 经 app:// 注入 <script> / <img> 装载，而 Chromium 的资源缓存按 URL 记账。
// URL 里没有版本 → 「改了源码 → 构建 → 部署 → 重启 Obsidian」这一整套动作，
// 浏览器仍然拿缓存里的旧副本，且**不报错、不留痕**。
// 现场：球有贴图（上一轮 shader 修复在缓存里）、拖拽不转（这一轮的不在）、
// 光点动得欢（光点在 main.js 里，main.js 的 URL 变了所以是新的）——
// 代码读过、探针实测过、部署产物逐字节校验过，三处都「对」，行为仍是旧的。
//
// 单独成文件而不是写在 caps.ts 里：ui/ 侧（globe3dLoader / globeTexture）也要能
// 读到同一个值——「所有运行时资源 URL 都带指纹」是一条要能单测钉住的机制，
// 而 ui/ 不能 import views/（AGENTS.md §3.1 的分层反向），所以指纹的**取用**放在
// ui/ 这侧，caps 只 import 它。
//
// ⚠️ 空串是合法值：jsdom 测试走 scripts/run-tests.mjs 与 esbuild
// 的另一条配置，那条**不注入**这个 define。此时 `typeof` 守卫兜成空串 =
// 不追加 query = 退回改动前的行为（不崩、不改变那些环境的语义）。

/**
 * 内容指纹（12 位十六进制）；构建未注入该 define 时返回空串。
 *
 * 用 `typeof` 而不是直接引用：未注入 define 的构建路径下裸引用会 ReferenceError，
 * 那会让 jsdom 测试整体挂掉——为一个「缓存优化」付这种代价不值。
 */
export function globeAssetRev(): string {
  return typeof __GLOBE_ASSET_REV__ === 'string' ? __GLOBE_ASSET_REV__ : ''
}

/**
 * 给运行时资源 URL 追加 `?v=<rev>`（内容变 → URL 变 → 缓存必失效；内容不变 →
 * URL 不变 → 仍然命中缓存，不牺牲正常路径）。
 *
 * - 空 URL（没有 caps 的环境：jsdom 测试的 fake-caps）原样返回；
 * - 空指纹（同上，见本文件头）原样返回；
 * - 原 URL 已带 query 时用 `&` 续，不覆盖既有参数；
 * - **已带同一个 `v=` 时原样返回**（幂等）：指纹可能加在两处（caps 与真正的
 *   发起点），重复追加会得到 `?v=a&v=a` —— 那不是幂等，是脏 URL。
 *
 * 纯函数、可 node 测：守卫测试钉的就是「同内容同 URL / 变内容变 URL / 空输入不炸 /
 * 加两次与加一次等价」。
 */
export function withAssetRev(url: string, rev: string = globeAssetRev()): string {
  if (url === '' || rev === '') return url
  if (new RegExp(`[?&]v=${rev}(&|$)`).test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${rev}`
}