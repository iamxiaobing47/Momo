// fetch-fonts.mjs 的类型面（scripts 层 typecheck 用，见 tsconfig.scripts.json）。
// 守卫（fetch-fonts.test.mts）直接测它的清单与纯函数面；下载主流程不在此声明范围内。

/** 一条源清单：文件名 + 字节数 + sha256 + 候选 URL（第一优先在前） */
export interface FontSource {
  name: string
  bytes: number
  sha256: string
  urls: string[]
}

export const FILES: FontSource[]

/** 下载白名单主机：起始 URL 与每一跳重定向都要在里；守卫把清单 URL 的主机对进这里 */
export const ALLOWED_HOSTS: Set<string>

/** 按 sfnt table directory 算应有总长；非 sfnt / 表目录不全返回 -1 */
export function expectedSize(buf: Uint8Array): number

/** 结构完整（截断检查）：大小 == table directory 算出的应有大小 */
export function structuralOk(buf: Uint8Array): boolean

/** 落盘文件是否就是清单里那一份：存在 + 结构完整 + sha256 逐字节相同 */
export function fontOnDiskOk(file: string, spec: FontSource): boolean
