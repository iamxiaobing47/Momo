// fetch-fonts.mjs 的类型面（scripts 层 typecheck 用，见 tsconfig.scripts.json；
// 先例 scripts/fetch-guards.d.mts）。改了 .mjs 的导出记得同步这里。

export interface FontFileSource {
  /** release 资产名（URL 安全：无空格 / 方括号） */
  asset: string
  /** 登记字节数（流式字节上限与长度闸的基准） */
  bytes: number
  /** 登记 sha256（摘要闸；发布链取件侧钉身份） */
  sha256: string
  /** 按顺序试的下载源（第一路为主，其余是镜像） */
  urls: string[]
}

export interface FontLicenseSource {
  /** 家族名（拼进 combined 许可文件的节标题） */
  family: string
  url: string
  /** 这一家族的版权行片段（结构闸判据） */
  copyright: string
}

/** 字体文件清单（与 src/momo/fonts/pack.ts 的 FONT_PACKS 三列 parity，守卫钉住） */
export declare const FILES: FontFileSource[]

/** 许可文本源（四份 OFL.txt，拼成 fonts/OFL.txt 随发布包分发） */
export declare const LICENSE_SOURCES: FontLicenseSource[]

/** 下载链允许落地的主机（jsDelivr + GitHub raw / objects） */
export declare const ALLOWED_HOSTS: Set<string>

/** 字节数 + sha256 双闸；任一不过即抛（调用方负责删掉坏文件）。
 *  入参只要 bytes / sha256 两列（.mjs 里也只读这两列）——pack.ts 的
 *  FontPackFile（多 family / weight）直接传得进来。 */
export declare function verifyFontFile(file: Pick<FontFileSource, 'bytes' | 'sha256'>, buf: Uint8Array): void

/** 许可文本结构闸：SIL 字样 + 本家族版权行 + 体积封顶；不过即抛 */
export declare function verifyLicenseText(entry: FontLicenseSource, text: string): void
