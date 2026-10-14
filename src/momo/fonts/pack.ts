// 开源字体包（2026-10-13）：v1.0.0 退役的内置字体以**按需下载**复活。
//
// 为什么又走一遍「可选资源包」：Obsidian 社区商店安装器与 BRAT 都只下发
// main.js / manifest.json / styles.css 三件——四套开源字体合计 ~70MB，随插件
// 分发既到不了自动安装的用户手里，也让发布包背一笔重资产（v1.0.0 退役的理由）。
// 而「只用 Obsidian 自带的三档字体」对想要楷体 / 宋体 / 等宽样字的用户不够用
// （2026-10-13 用户要求「下载一些开源字体放到 GitHub Release，提供字体卡片」）。
// 于是与星球贴图同一条路：字体挂在本仓自己的 release 资产里，用户在设置页**显式
// 点击**时按需下载（对话框先报文件大小），落插件目录，注册成 FontFace 后由既有的
// 字体变量注入生效。
//
// 本模块**纯逻辑、不 import obsidian、不碰文件系统**：只回答「有哪些包、每个包哪些
// 文件、从哪个 URL 下、下回来的字节像不像那一件、合计多大」。网络与写盘都在
// `service/index.ts`（唯一 import obsidian 的 I/O 入口）。
//
// 与另外两处的关系：
//   · `scripts/fetch-fonts.mjs`（发布链）——同一份包表的**上游侧**：pin 住的
//     下载源 + sha256，取回来的字节改名成这里的 `asset` 落进 `fonts/`，再由
//     stage-release 挂上 release。改这一侧的字节 / 摘要，两边一起看。
//   · `i18n` 三语言 `copy.meta.fontPack`——展示名（Record<FontPackId, string>，
//     漏一个编译不过）。
import type { FontPackId } from '../types'

/** 插件自己的仓库：字体包的下载源，release 资产挂在这里 */
export const FONT_PACK_REPO = 'https://github.com/iamxiaobing47/Momo'

/** 插件目录下的字体子目录（与星球贴图平级，都在 `<configDir>/plugins/momo/` 下） */
export const FONT_PACK_DIR = 'fonts'

/** 一个字体文件：release 资产名 + 字节数 + 摘要 + 落出来之后的 CSS 身份 */
export interface FontPackFile {
  /** release 资产名（URL 安全：无空格 / 方括号；上游原名在 fetch-fonts.mjs 侧映射） */
  asset: string
  /** 上游字节数：下载后的长度校验 + 确认框里的文件大小提示 */
  bytes: number
  /** sha256（发布链取件时逐字节钉；运行期不联网比摘要，只查魔数与长度，理由见 isFontPackFileValid） */
  sha256: string
  /** CSS 家族名：FontFace 的 family、偏好值（`prefs.uiFont` / `cardFont`）与格子选中态都认它 */
  family: string
  /** FontFace 的 weight 描述符：静态字重给 '400' / '500'，可变字体给区间 '100 900' */
  weight: string
}

/** 一套字体包（一张卡片）：一个或多个文件共享同一个家族名 */
export interface FontPack {
  id: FontPackId
  files: readonly FontPackFile[]
}

/**
 * 字体包表（顺序即设置页格子顺序）。
 *
 * 四套都是 SIL OFL 1.1 授权（授权文本随发布包的 `OFL-1.1.txt` 分发——由
 * fetch-fonts.mjs 与上游一起取）。字节数与 sha256 出自 BUG-104 工单里人工确认过的
 * 那份 `fonts/` 盘上内容（2026-10-07 三道闸时钉的），换字体 / 换版本时两边一起换。
 *
 * 霞鹩文楷是**两个字重**（Regular + Medium，合计 ≈26.3MB）：旧内置版就用 Medium
 * 接粗体，只下 Regular 的话粗体只能走合成加粗。对话框会把合计大小如实报给用户。
 */
export const FONT_PACKS: readonly FontPack[] = [
  {
    id: 'wenkai',
    files: [
      {
        asset: 'font-lxgw-wenkai-lite-regular.ttf',
        bytes: 13_872_424,
        sha256: '140c99ba4e28e817cec49bf82a0c5fcdc4fe633fb9dfda16d0ee8d59a8545f15',
        family: 'LXGW WenKai Lite',
        weight: '400',
      },
      {
        asset: 'font-lxgw-wenkai-lite-medium.ttf',
        bytes: 13_700_636,
        sha256: '02eb0f8deed11b00481393f5720630ae1a44424f37f4157ea160a69a1c72a0b6',
        family: 'LXGW WenKai Lite',
        weight: '500',
      },
    ],
  },
  {
    id: 'noto-sans',
    files: [
      {
        asset: 'font-noto-sans-sc.ttf',
        bytes: 17_772_300,
        sha256: 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',
        family: 'Noto Sans SC',
        weight: '100 900',
      },
    ],
  },
  {
    id: 'noto-serif',
    files: [
      {
        asset: 'font-noto-serif-sc.ttf',
        bytes: 25_125_512,
        sha256: '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
        family: 'Noto Serif SC',
        weight: '100 900',
      },
    ],
  },
  {
    id: 'jetbrains-mono',
    files: [
      {
        asset: 'font-jetbrains-mono.ttf',
        bytes: 187_208,
        sha256: '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
        family: 'JetBrains Mono',
        weight: '100 900',
      },
    ],
  },
]

/** id → 包（未登记的 id 返回 undefined，调用方自己决定口径） */
export function fontPackById(id: FontPackId): FontPack | undefined {
  return FONT_PACKS.find((p) => p.id === id)
}

/** 一个包的全部文件（顺序即下载顺序） */
export function fontPackFiles(id: FontPackId): readonly FontPackFile[] {
  return fontPackById(id)?.files ?? []
}

/** 一个包的全部资产名（落盘文件名与下载 URL 的最后一段） */
export function fontPackAssets(id: FontPackId): string[] {
  return fontPackFiles(id).map((f) => f.asset)
}

/** 一个包的合计字节数：确认框「文件大小」报的就是它 */
export function fontPackBytes(id: FontPackId): number {
  return fontPackFiles(id).reduce((n, f) => n + f.bytes, 0)
}

/**
 * CSS 家族名 → 包。面板 / 设置页据此判断「这个偏好值是不是某套下载字体」——
 * 是则要把字节注册成 FontFace（没注册的家族名在 font-family 栈里静默回落，
 * 表现是「下载了却没生效」）。
 */
export function fontPackByFamily(family: string): FontPack | undefined {
  if (family === '') return undefined
  return FONT_PACKS.find((p) => p.files.some((f) => f.family === family))
}

/** 某件文件的下载 URL：本仓 release 资产（tag = 插件版本号，Obsidian 要求不带 v 前缀） */
export function fontPackUrl(version: string, asset: string): string {
  return `${FONT_PACK_REPO}/releases/download/${version}/${asset}`
}

/**
 * sfnt 魔数（前 4 字节）：TrueType `0x00010000` / CFF `OTTO`。
 * 半截下载 / GitHub 的 HTML 错误页都拦在这里——字体是 Chromium 的解析面，
 * 进来的东西至少要「看起来是一个字体文件」。
 */
const SFNT_MAGIC: ReadonlyArray<readonly number[]> = [
  [0x00, 0x01, 0x00, 0x00],
  [0x4f, 0x54, 0x54, 0x4f], // 'OTTO'
]

/**
 * 一件文件该过哪道闸：sfnt 魔数 + 字节数与登记值相等。
 *
 * **为什么不比 sha256**（与星球贴图同一口径）：下载走的是 GitHub release 的
 * HTTPS，运行期的威胁模型是「截断 / 错误页 / 代理改写」，不是中间人；摘要比对
 * 在发布链那一侧由 fetch-fonts.mjs 的三道闸钉死（pin 住的上游 + 固定摘要），
 * 运行期再带一份摘要逻辑既不增信也没有新情报。长度 + 魔数足以拦住两类真实故障。
 */
export function isFontPackFileValid(file: FontPackFile, buf: ArrayBuffer): boolean {
  if (buf.byteLength !== file.bytes) return false
  if (buf.byteLength < 4) return false
  const head = new Uint8Array(buf, 0, 4)
  return SFNT_MAGIC.some((magic) => magic.every((b, i) => head[i] === b))
}

/**
 * 下载失败的口径（给 UI 分口径说话，与星球资源包同一套词）：
 * - `missing` —— release / 资产不在（HTTP 404）：**这一版还没发字体资产**。
 * - `corrupt` —— 字节不对（魔数 / 长度不过）：代理 / 镜像改写了内容。
 * - `network` —— 其余（断网、超时、非 2xx）。
 */
export type FontPackFailure = 'missing' | 'network' | 'corrupt'

/** 注册 FontFace 用的描述：service 读字节 → ui 注册，两层之间只传这个形状 */
export interface FontFaceSpec {
  family: string
  weight: string
  buffer: ArrayBuffer
}
