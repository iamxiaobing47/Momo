// 星球资源包（v1.0.0）：两套 cube 贴图共 **12 张**。
//
// 为什么是「可选资源包」：这 12 件是**独立产物**，而 Obsidian 社区商店安装器与 BRAT
// 都只下发 main.js / manifest.json / styles.css——这些重资产（≈7MB）到不了自动安装的
// 用户手里。于是做成资源包，由插件在设置页、用户**显式点击**时从本仓自己的 release
// 下载（这是插件唯一的联网动作）。
//
// 2026-10-13（BUG-219）：包从 13 件变 12 件——three.js 档的 `globe3d.js` 退役（three
// 打进 main.js，评审把运行期 `createElement('script')` 列为 Error），所以这里不再有
// 「三维库」这一件，也没有它的字节标记。
//
// 本模块**纯逻辑、不 import obsidian、不碰文件系统**：只回答「要下哪些文件、从哪个
// URL 下、下回来的字节像不像那一件」。网络与写盘都在 `service/index.ts`（唯一
// import obsidian 的 I/O 入口）。
//
// 文件名与 `scripts/vault-targets.mjs` 的 `GLOBE_TEXTURES` 是**同一份口径**（构建、
// 发布侧管那边，运行期下载与落盘管这边）——改一处两边一起看。
import type { GlobeEarth } from '../types'

/** 插件自己的仓库：资源包的下载源，release 资产挂在这里 */
export const GLOBE_PACK_REPO = 'https://github.com/iamxiaobing47/Momo'

/** 资源包的记账文件名（落在插件目录里，记「下载时的插件版本」） */
export const GLOBE_PACK_MANIFEST_FILE = 'globe-pack.json'

/** cube 六面的面序（与 three.js CubeTexture 构造顺序、vault-targets 同序） */
export const GLOBE_PACK_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const

/** 地球档 → 贴图文件名词干（与 caps.ts / vault-targets 的 GLOBE_TEXTURES 同源） */
export const GLOBE_PACK_STEM: Record<GlobeEarth, string> = {
  night: 'tex-earth-cube',
  day: 'tex-day-cube',
}

/**
 * 某一档贴图的六个落盘文件名，面序固定 px/nx/py/ny/pz/nz。
 *
 * 三处共用同一份口径：构建部署（scripts/vault-targets.mjs 的 GLOBE_TEXTURES）、
 * 资源包下载（`globePackFileNames`）、以及**运行期读取**（`service.readGlobeCubeFaces`
 * → caps → globeTexture 解码）。改名要三处一起看。
 */
export function globePackCubeNames(earth: GlobeEarth): string[] {
  return GLOBE_PACK_FACES.map((face) => `${GLOBE_PACK_STEM[earth]}_${face}.png`)
}

/** 资源包要下的全部文件名（两套贴图各六面 = 12 张），顺序即下载顺序 */
export function globePackFileNames(): string[] {
  const out: string[] = []
  for (const earth of Object.keys(GLOBE_PACK_STEM) as GlobeEarth[]) out.push(...globePackCubeNames(earth))
  return out
}

/** 某件文件的下载 URL：本仓 release 资产（tag = 插件版本号，Obsidian 要求不带 v 前缀） */
export function globePackUrl(version: string, name: string): string {
  return `${GLOBE_PACK_REPO}/releases/download/${version}/${name}`
}

/** PNG 魔数（8 字节）：半截下载 / GitHub 的 HTML 错误页都拦在这里 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 一件贴图字节是不是一张 PNG（首 8 字节魔数） */
export function isPngBytes(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false
  const head = new Uint8Array(buf, 0, 8)
  return PNG_MAGIC.every((b, i) => head[i] === b)
}

/**
 * 一件文件该过哪道闸：包里只剩贴图，所以恒查 PNG 魔数。
 *
 * 名字参数留着（`_` 前缀）是为了让 `service/index.ts` 的逐件校验调用点不必跟着改签名
 * ——三维库退役前这里按文件名分派（PNG 魔数 / `__momoGlobe3D` 工厂标记），那份分派
 * 随 globe3d.js 一起删掉了。
 */
export function isGlobePackFileValid(_name: string, buf: ArrayBuffer): boolean {
  return isPngBytes(buf)
}

/**
 * 下载失败的口径（v1.0.0，给 UI 分口径说话）：
 * - `missing` —— release / 资产不在（HTTP 404）：**这一版还没发资源包**，不是网络问题。
 *   这两件事的修法完全不同（一个是等作者发版 / 下完整包，一个是查网络），
 *   混成一句「检查网络后重试」会把用户引到错的方向。
 * - `corrupt` —— 字节不对（PNG 魔数不过）：代理 / 镜像改写了内容。
 * - `network` —— 其余（断网、超时、非 2xx）。
 */
export type GlobePackFailure = 'missing' | 'network' | 'corrupt'
