// vault 部署目标的单一真源：esbuild 的部署插件与 verify-deploy 共用这一份。
//
// 为什么单独一个文件：目标列表算错过——当年用 `'../.obsidian/...'` 相对 **CWD**
// 解析，而构建脚本的 CWD 不固定，实际指向 `.code/.obsidian`，部署被静默跳过
// （esbuild.config.mjs 顶部有这件事的注释）。这里只用 import.meta.url 反推工程根，
// 再拼绝对路径，与 CWD 无关。
//
// 部署目标的唯一来源是环境变量 MOMO_VAULTS（多个绝对路径，用 `;`（path.delimiter）
// 分隔）——本文件不再内置任何开发机 vault 候选：开源分发出去，贡献者的机器上没有
// 那些 vault，留着只会让 build 打出莫名其妙的部署日志。没设 = 零目标（部署跳过、
// verify-deploy 报错 exit 1），这正是 CI / release 流水线的依赖：CI 里没有
// MOMO_VAULTS，部署按设计被跳过、build 仍 exit 0（见 .github/workflows/release.yml）。
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)

/** 要同步进 vault 的产物（顺序即校验顺序）。Obsidian 只认 main/manifest/styles，
 *  globe3d.js 是星球三维档的独立产物（惰性加载），tex-earth-cube_*.png（六面）因源在
 *  src/ 下单独映射（见 deployPlugin / verify-deploy）。别把 src/ 加进来。 */
export const ARTIFACTS = ['main.js', 'manifest.json', 'styles.css', 'globe3d.js']

// v1.0.0：内置开源字体（`fonts/` 目录 + FONT_DIR / isFontFileSync / fontFiles /
// fontProblems 这一整套 下载 → 部署 → 校验 链）退役——改用 Obsidian 自带的字体
// 角色（见 types/prefs.ts 的 FONT_ROLES），发布包不再背 fonts/，也不再需要字体侧
// 的魔数校验。

/**
 * 所有 vault 的插件目录（绝对路径）——**唯一来源：环境变量 MOMO_VAULTS**
 * （多个绝对路径，`;`（path.delimiter）分隔）。开源分发版不含任何开发机内置候选：
 * 贡献者的机器上没有那些 vault，内置它们只会让 build 打出莫名其妙的部署日志。
 * 没设 MOMO_VAULTS = 零目标：部署跳过（build 仍 exit 0），verify-deploy exit 1。
 * 返回的是**候选**：vault 不存在时由调用方决定——部署时跳过并打印，校验时算问题。
 */
export function vaultPluginDirs() {
  return (process.env.MOMO_VAULTS ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((v) => path.join(v, '.obsidian', 'plugins', 'momo'))
}

/**
 * 星球贴图（v0.9.32 起是**独立部署产物**，与内置字体同一条路）：那张 2048×1024
 * 的夜地球 base64 后有 1.95MB，内联进 main.js 会把 bundle 抬到 2.7MB——插件
 * onload 的 parse+eval 实测 ~50ms 里它占大头（Chromium 量：parse 19.6ms +
 * eval ~30ms），而它只在切到星球档时才用得上。现在 src 里的 png 不再被 bundle，
 * 构建时随产物同步进 vault 插件目录，运行期由 caps 读字节包 `blob:` URL 装载
 * （2026-10-13 起；旧实现走 app:// 资源 URL，跨源把 canvas 污染了）。文件名是
 * caps / service 与 src/ui/globe/png.d.ts 注释里的同一份真源。
 *
 * 2026-10-04 起从「一张 2048×1024 等距圆柱」换成 **cube map 六面**（polefix cube，
 * 与 globe.html 同一套 6 面 ×1024²）——等距圆柱在极点有几何奇异，任何软化都只能
 * 换来「星芒↔灰斑」二选一，cube 才是根上的解法：极点落在 **+Y/-Y 面正中**，
 * 采样最密，天然无奇异。
 *
 * 2026-10-05 起是**两套**（夜地球 / 日地球，按 `prefs.globeEarth` 在设置页切）：
 * 两套都随插件发布，运行期只装载当前那一档（见 GLOBE_TEXTURES）。多带的那套
 * ≈3.6MB，是**磁盘**上的账，不进 main.js 也不进内存（没被装载的那套不会被读）。
 *
 * 面名前缀跟 three.js CubeTexture 的语义对齐（px/nx/py/ny/pz/nz）。运行期由
 * caps.globeCubeUrls(earth) 取当前档那套的六个 `blob:` URL 装载（读字节 → 同源
 * blob URL，见 src/momo/service/index.ts 的 readGlobeCubeFaces）。
 */
export const GLOBE_CUBE_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

/**
 * 一套 cube map 六面的源 / 目标文件名（**词干不同就是另一套**）。
 *
 * 两套的差别只有词干：六面名与顺序共用，src/ 与 vault 插件目录里都是平铺的
 * `<stem>_<face>.png`。做成工厂而不是两个字面量对象，是为了让「套与套之间只差
 * 一个变量」这件事在源码里一眼成立（复制一份再手改路径，迟早会有一边漏改）。
 */
function globeTextureSet(stem) {
  return {
    /** 词干 = 落盘文件名的前缀，也是换套的唯一变量 */
    stem,
    /** 落进 vault 插件目录的文件名（裸文件名，不带目录） */
    nameOf: (face) => `${stem}_${face}.png`,
    /** 仓库内的源路径（不随 bundle） */
    srcOf: (face) => path.join('src', 'ui', 'globe', `${stem}_${face}.png`),
    /** 全部面的源路径（校验 / 部署用） */
    srcs: () => GLOBE_CUBE_FACES.map((f) => path.join('src', 'ui', 'globe', `${stem}_${f}.png`)),
  }
}

/**
 * 贴图套：地球档（`prefs.globeEarth`）→ 那一套六面。**键与顺序都是**
 * `momo/types/prefs.ts` 的 `GlobeEarth` / `GLOBE_EARTHS`（守卫逐档对齐：那边加一档
 * 而这里没配贴图，`globe-texture-deploy.test.mts` 直接红）。
 *
 * - `night` — 随插件发布的默认套（NASA Black Marble 夜灯，2026-10-04 起 cube）。
 * - `day`   — `outputs/polefix_v2/globe.html` 自己读的那套日地球（真彩色、无云）。
 *
 * 两套是**同一套渲染器**的两份贴图：几何 / 采样 / 位姿 / 光照函数全共用，切档只换
 * 贴图与光照配方（见 src/ui/globe/globeLight.ts）。
 */
export const GLOBE_TEXTURES = {
  night: globeTextureSet('tex-earth-cube'),
  day: globeTextureSet('tex-day-cube'),
}

/** 全部贴图套的档位（顺序 = 部署顺序 + 指纹拼接顺序，见 globeAssetRevOf） */
export const GLOBE_EARTH_IDS = Object.keys(GLOBE_TEXTURES)

/**
 * 发布包清单（BUG-117b）：`{ src, dest }` 对，src 相对工程根、dest 相对包根（= vault 插件目录
 * 的平铺布局）。与 vault 部署**同一份**产物口径：ARTIFACTS + 每套贴图六面。
 *
 * 为什么不在 release.yml 的 `path:` 里手列：那是第二份真源（v0.9.36 的 globe3d.js 与两套贴图
 * 加进 ARTIFACTS / GLOBE_TEXTURES 后没人回头补 workflow，发出去的包缺 13 件，恒绿）；而且贴图
 * 的源在 `src/ui/globe/` 下，upload-artifact 按最近公共祖先保留目录结构，手列也拼不出平铺布局。
 * 所以 workflow 只跑 `node scripts/stage-release.mjs <目录>` 按本清单铺平再整目录上传，
 * 守卫 `scripts/release-assets-guard.test.mts` 钉住两头。
 *
 * v1.0.0：fonts/ 退出清单（内置字体退役，改用 Obsidian 自己的字体角色）。
 * v1.0.0+：globe3d.js 与两套贴图仍是发布资产——社区商店安装器不会下发它们，
 * 由插件在设置页按需从本仓 release 下载（可选资源包）。
 */
export function releaseManifest(dir = projectDir) {
  const out = ARTIFACTS.map((f) => ({ src: f, dest: f }))
  for (const id of GLOBE_EARTH_IDS) {
    const set = GLOBE_TEXTURES[id]
    for (const face of GLOBE_CUBE_FACES) out.push({ src: set.srcOf(face), dest: set.nameOf(face) })
  }
  return out
}

/**
 * 旧单套口径的落点 = **默认套**（night）。
 *
 * night 的文件名一个字节都不许改：它们是已部署 vault 里的既有文件名，也是浏览器
 * 缓存 URL 认得的那份——改名等于让老用户那一套凭空消失（`?v=` 指纹只治内容、
 * 不治路径）。改 deployment 里的名字时先想清楚这条。
 */
export const GLOBE_TEXTURE = GLOBE_TEXTURES.night

/**
 * 星球贴图的部署前置校验（字体那套的镜像）：源文件必须在、且真是 PNG——
 * 「部署一个不存在的产物」会在运行时静默退化成「球不见了」，那种失败看都看不出来，
 * 所以在构建时就拦住。**逐套**查（两套都要在），尺寸检查按套内判（见下）。
 * 返回问题列表（空 = 通过）。
 */
export function globeTextureProblems() {
  const bad = []
  const PNG_MAGIC = '89504e470d0a1a0a'
  for (const setId of GLOBE_EARTH_IDS) {
    const set = GLOBE_TEXTURES[setId]
    for (const face of GLOBE_CUBE_FACES) {
      const rel = set.srcOf(face)
      const file = path.join(projectDir, rel)
      if (!fs.existsSync(file)) {
        bad.push(`${rel} 不在——星球贴图（${setId} 套的 cube ${face} 面）源文件缺失，部署出来的球会是空的`)
        continue
      }
      // PNG 魔数（\x89PNG\r\n\x1a\n）。半截下载 / 错误页照样能当文件复制进去。
      let head
      try {
        const fd = fs.openSync(file, 'r')
        head = Buffer.alloc(8)
        fs.readSync(fd, head, 0, 8, 0)
        fs.closeSync(fd)
      } catch (e) {
        bad.push(`${rel} 读不出来（${String(e)}）`)
        continue
      }
      if (head.toString('hex') !== PNG_MAGIC) {
        bad.push(`${rel} 不是 PNG（首 8 字节 ${head.toString('hex')}）`)
      }
    }
    // 一套内的六个面必须同尺寸：cube map 上传对尺寸不齐是直接失败（three 侧报错难追）。
    // **按套判**而不是两套一起判——两套各自上传成自己的 CubeTexture，互不要求同尺寸。
    const sizes = new Map()
    for (const face of GLOBE_CUBE_FACES) {
      const file = path.join(projectDir, set.srcOf(face))
      if (!fs.existsSync(file)) continue
      try {
        // 读 IHDR：宽(4B) 高(4B) 在 PNG 第 16..24 字节
        const fd = fs.openSync(file, 'r')
        const ihdr = Buffer.alloc(8)
        fs.readSync(fd, ihdr, 0, 8, 16)
        fs.closeSync(fd)
        sizes.set(face, `${ihdr.readUInt32BE(0)}x${ihdr.readUInt32BE(4)}`)
      } catch {
        /* 上面已报读过不出来的问题，这里略过 */
      }
    }
    const uniq = new Set(sizes.values())
    if (uniq.size > 1) {
      bad.push(
        `${setId} 套 cube 六面尺寸不齐（${[...sizes].map(([f, s]) => `${f}=${s}`).join(', ')}）——CubeTexture 要求六面同尺寸`,
      )
    }
  }
  return bad
}

/** 工程根（产物源目录）。与 vaultPluginDirs 同源，别在各处各算一遍。 */
export function pluginProjectDir() {
  return projectDir
}

/**
 * 星球三维渲染库（three.js 档，2026-10-04 起是**第二构建产物**，esbuild.config.mjs
 * 在主 bundle 之前单独打包 src/ui/globe/globe3dStage.ts）：three 全量 minified
 * ~600KB，不许进 main.js（onload parse 账见 GLOBE_TEXTURE 注释），构建时随产物
 * 同步进 vault 插件目录（在 ARTIFACTS 里），运行期经 caps.globe3dUrl（app://）
 * 注入 <script> 惰性加载，失败回退 canvas 软渲染。文件名是 caps.ts 拼的路径与
 * esbuild 产物名共用的同一份真源。
 */
export const GLOBE3D = {
  /** 落进 vault 插件目录的文件名（= 工程根的构建产物名） */
  name: 'globe3d.js',
}

/**
 * 三维渲染库的部署前置校验（贴图那套的镜像）：产物必须在（esbuild 已跑过）、且带
 * 工厂全局标记——半截产物 / 空文件在运行时只表现为「三维档静默回退」，现场看不出
 * 原因，所以在构建时拦住。返回问题列表（空 = 通过）。
 */
export function globe3dProblems() {
  const bad = []
  const file = path.join(projectDir, GLOBE3D.name)
  if (!fs.existsSync(file)) {
    bad.push(`${GLOBE3D.name} 不在——三维档装载会失败，星球回退软渲染`)
    return bad
  }
  const body = fs.readFileSync(file, 'utf8')
  if (!body.includes('__momoGlobe3D')) {
    bad.push(`${GLOBE3D.name} 内容不对（没有工厂全局 __momoGlobe3D）——构建入口或产物被换过`)
  }
  return bad
}

/* ── 运行时资源指纹（2026-10-05） ─────────────────────────────────────────
 *
 * globe3d.js 与 cube 六面是**固定文件名**的独立部署物，运行期经 app:// 注入
 * <script> / <img>。Chromium 的资源缓存按 URL 记账，而 URL 里原本没有版本——于是
 * 「改了 globe3dStage.ts → 构建 → 部署 → 重启 Obsidian」这一整套动作，浏览器仍然
 * 拿缓存里的旧副本，且**不报错、不留痕**。现场：球有贴图（上一轮 shader 修复在缓存
 * 里）、拖拽不转（这一轮的不在）、光点动得欢（光点在 main.js 里，main.js 换过 URL）。
 * 代码读过、探针实测过、部署产物逐字节校验过，三处都「对」，用户仍看到旧行为。
 *
 * 解法 = 指纹编进 main.js（esbuild define `__GLOBE_ASSET_REV__`），运行期由
 * ui/globe/globeAssetRev.ts 追加成 `?v=<hash>`；内容变 → URL 变 → 缓存必失效，
 * 内容不变 → URL 不变 → 仍然命中缓存（正常路径不牺牲性能）。
 */

/**
 * 某一套的某一个面在某个目录里的实际路径。
 *
 * 两处布局不同，故两个都要认：工程根里源在 `src/ui/globe/`（构建时读这个），
 * vault 插件目录里是平铺的 `<stem>_*.png`（部署后读这个）。先试平铺——
 * 它是「部署产物」那侧的布局，也正是缓存真正对应的字节。
 */
function cubeFacePath(dir, setId, face) {
  const set = GLOBE_TEXTURES[setId]
  const flat = path.join(dir, set.nameOf(face))
  return fs.existsSync(flat) ? flat : path.join(dir, set.srcOf(face))
}

/**
 * 运行时资源的内容指纹：globe3d.js + **两套**贴图的合并 sha256 取前 12 位。
 *
 * 顺序固定为「globe3d.js 在先，然后按 GLOBE_EARTH_IDS 的档序、每档按
 * GLOBE_CUBE_FACES 的面序」——哈希拼接对顺序敏感，这里必须与 esbuild.config.mjs
 * 调用时一致，否则自检会报假红。**这个函数就是那里的唯一实现**，别在任何地方再抄。
 *
 * ⚠️ 两套**都要**进指纹，不能只算当前档：指纹是编进 main.js 的东西，而 main.js
 * 不认识「当前档」（那是用户的 prefs），只算一套会让另一套的改动完全不破缓存
 * ——正是这个机制要治的那个故障。
 *
 * 任一产物字节变了指纹就变；反之逐字节一致则指纹逐位一致（正常路径）。
 * 文件缺失会抛（ENOENT），调用方自己决定是记坏还是跳过——静默给个默认值才是错的。
 */
export function globeAssetRevOf(dir = projectDir) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(path.join(dir, GLOBE3D.name)))
  for (const setId of GLOBE_EARTH_IDS) {
    for (const face of GLOBE_CUBE_FACES) h.update(fs.readFileSync(cubeFacePath(dir, setId, face)))
  }
  return h.digest('hex').slice(0, 12)
}

/**
 * 从 main.js 头部 banner 里回读构建期烘进去的指纹。
 *
 * 用 banner 而不是「在 minify 后的 main.js 里搜一段十六进制」：define 的产物是
 * 裸字符串字面量，minify 后缩进/引号形态都由 esbuild 决定，拿正则去捞字面量
 * 等于把构建器的输出细节钉进守卫。banner 是我们自己写的稳定标记。
 * 返回 '' = 没读到（main.js 缺失 / 不是本次构建产物 / 被换过）。
 */
export function readGlobeAssetRev(dir = projectDir) {
  const file = path.join(dir, 'main.js')
  if (!fs.existsSync(file)) return ''
  const fd = fs.openSync(file, 'r')
  try {
    // banner 在文件最前，读前 4KB 足够（真·极短前缀，不整读 1.2MB）
    const head = Buffer.alloc(4096)
    const n = fs.readSync(fd, head, 0, 4096, 0)
    const m = head.toString('utf8', 0, n).match(/\/\* momo:globe-asset-rev=([0-9a-f]{12}) \*\//)
    return m ? m[1] : ''
  } finally {
    fs.closeSync(fd)
  }
}
