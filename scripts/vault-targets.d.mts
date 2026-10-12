// vault-targets.mjs 的类型声明（scripts 层 typecheck 用，见 tsconfig.scripts.json；
// 先例 scripts/project-root.d.mts）。部署侧（esbuild.config.mjs / verify-deploy.mjs）
// 与测试（font-deploy / globe-texture-deploy）都 import 这个 .mjs，esbuild 剥类型跑、
// 类型只在 tsc 那层用——这里照抄导出形状，改了 .mjs 的导出记得同步。

/** 要同步进 vault 的工程根产物（顺序即校验顺序） */
export declare const ARTIFACTS: string[]

/** 内置字体目录名（工程根下） */
export declare const FONT_DIR: string

/** cube 六面的面名（顺序 = three.js CubeTexture 的构造顺序） */
export declare const GLOBE_CUBE_FACES: string[]

/**
 * 一套 cube map 六面（源 / 目标文件名）。两套之间只差一个词干，所以是工厂。
 * 旧单套口径的 `src` / `name` 两个 getter 已随「两个代表面」的用法一起删掉
 * （真代码里没人用；tmp/ 里的探针是过期的中间产物）。
 */
export interface GlobeTextureSet {
  stem: string
  nameOf: (face: string) => string
  srcOf: (face: string) => string
  srcs: () => string[]
}

/**
 * 贴图套：地球档（`prefs.globeEarth`）→ 那一套六面（v0.9.x 起两套：night / day）。
 * `night` 是随插件发布的默认套，文件名不许改（已部署 vault 与缓存 URL 认它）。
 */
export declare const GLOBE_TEXTURES: Record<string, GlobeTextureSet>

/** 全部贴图套的档位（顺序 = 部署顺序 + 指纹拼接顺序；与 src 的 GLOBE_EARTHS 同序） */
export declare const GLOBE_EARTH_IDS: string[]

/** 发布包清单（BUG-117b）：src 相对工程根、dest 相对包根（vault 插件目录平铺布局） */
export declare function releaseManifest(dir?: string): { src: string; dest: string }[]

/** 旧单套口径的落点 = 默认套（night）；只为「只关心默认套」的读法保留 */
export declare const GLOBE_TEXTURE: GlobeTextureSet

/** fonts/ 里允许同步的文件名口径（字体 + 授权文本） */
export declare function isFontFileSync(name: string): boolean

/** fonts/ 下登记口径内的文件名（排序后） */
export declare function fontFiles(dir?: string): string[]

/** fonts/ 的部署前置校验（半截下载 / 错误页 → 问题列表） */
export declare function fontProblems(dir?: string): string[]

/** 星球贴图的部署前置校验（逐套：缺失 / 非 PNG / 套内尺寸不齐 → 问题列表） */
export declare function globeTextureProblems(): string[]

/** 所有 vault 的插件目录（MOMO_VAULTS 派生） */
export declare function vaultPluginDirs(): string[]

/** 工程根（产物源目录）。入参只为对齐调用方 `pluginProjectDir(import.meta.url)`
 *  的写法（.mjs 本体不收参、直接返回工程根） */
export declare function pluginProjectDir(start?: string): string

/** 星球三维渲染库 globe3d.js（three.js 档，2026-10-04 起的第二构建产物，在 ARTIFACTS 里） */
export declare const GLOBE3D: { name: string }

/** 星球三维渲染库的部署前置校验（缺失 / 缺工厂全局 → 问题列表） */
export declare function globe3dProblems(): string[]

/**
 * 运行时资源（globe3d.js + **两套** cube 六面）的内容指纹：合并 sha256 前 12 位。
 * esbuild 与 verify-deploy 共用这一个实现——自检与被自检各算一遍 = 不一致的新来源。
 * 文件缺失会抛（调用方决定怎么报，别静默给默认值）。
 */
export declare function globeAssetRevOf(dir?: string): string

/**
 * 从 main.js 头部 banner 回读构建期烘进去的指纹；没读到返回 ''。
 * 用 banner 而不是搜 minify 后的字符串字面量：后者会把构建器的输出细节钉进门禁。
 */
export declare function readGlobeAssetRev(dir?: string): string
