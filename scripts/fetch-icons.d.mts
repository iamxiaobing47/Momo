// fetch-icons.mjs 的类型面。icons.test.mts 直接测它的纯函数面（shapeToPath /
// parseIconSvg）与摘要登记面（PINNED_VERSION / TGZ_INTEGRITY / integrityFor /
// sources / verifyTgz），.mjs 对 tsc 不可见——本文件把那层手抄的形状声明出来。
// 生成器本体（下载 tar、解包、生成 lucideIcons.ts）不在此声明范围内。

/** 六种基本图形 → path d；属性缺失 / 越界 / 未知元素一律抛 */
export function shapeToPath(tag: string, attrs: Map<string, string>): string

/** 源 SVG → { ds }：只收白名单元素与属性，意外形态一律抛（不静默跳过） */
export function parseIconSvg(id: string, svg: string): { ds: string[] }

/** 锁定的库版本 */
export const PINNED_VERSION: string

/** 各锁定版本的包摘要（npm dist.integrity 口径 sha512-<base64>） */
export const TGZ_INTEGRITY: Record<string, string>

/** 下载链白名单主机：起始 URL 与每一跳重定向都要在里 */
export const ALLOWED_HOSTS: Set<string>

/** 版本 → 登记摘要；未登记直接抛（不许「没有摘要就放行」） */
export function integrityFor(version: string): string

/** tarball 源列表（npm 官方 + 国内镜像） */
export function sources(version: string): string[]

/** 完整性两道闸：摘要 == 登记 + 能 gunzip 且是 lucide-static 包；不过抛 */
export function verifyTgz(file: string, version: string): void
