// 星球光照（F7，2026-10-05）：把球从「零光照」补到有球面暗示。纯计算，node 可测。
//
// 背景：贴图本身是对的（cube 六面与 NASA 源图逐字节一致，见 outputs/us-block-diagnosis/），
// 球上看着「像贴了一块」的根因是**渲染管线里没有任何光照**——globeRender.renderFrame
// 只做 `dst[o] = src[t]` 的逐字节拷贝，于是数据里任何亮度台地（北美那块是 NASA 源图里
// 就有的软边台地）都被读成「贴上去的矩形」。做法参考 outputs/polefix_v2/globe.html
// （Ambient 0.85 + Directional 0.9 + 蓝边光 0.35），静态对比稿与完整参数见
// docs/design/mockups/globe-lighting/。
//
// 两档只差**光照配方 + 贴图**，渲染器与几何是同一套：
//   night — 夜灯贴图（src/ui/globe/tex-earth-cube_*.png）+ 球面暗示：**只有临边衰减**。
//           两件事都是用户定案：
//             ① **不加方向光**：夜地球本身是「全球夜景合成」，加 max(0, n·L) 等于宣布
//                一半地球是白天，会平白抹掉半个世界的城市灯光。
//             ② **不加边缘光**（2026-10-06）：原先那圈 `#88aaff · 0.13·t^1.5` 被用户
//                判为「外层光圈」，直接置 `rimGain = 0`——理由与配方的形状都写在
//                GLOBE_LIGHT_RECIPE.night.rimGain 的注释里。
//   day   — 日地球（src/ui/globe/tex-day-cube_*.png，即 globe.html 自己读的那套）
//           + globe.html 的原配方（ambient + key + 背面边缘光）。日地球的贴图本来就该
//           有受光面与背光面，那套配方正是它的正解——**它的背面边缘光不受上面第 ② 条影响**。
//
// ⚠️ **光照必须在线性空间做，最后才转回 sRGB**。sRGB 编码是 ~2.4 次幂：乘性系数要跟着
//    取 1/2.4 次幂才等价，而加性项**先编码再加**则完全错——编码器把小的线性值放得很
//    大，实测「先编码再加边缘光」在球盘最外圈能偏出 **76/255**（球缘直接爆白）。所以
//    这里把乘性项与加性项**分两张表**烘，两张都是线性空间语义：
//      ① mulLut[mulBin·256 + byte] = round(255·l2s(s2l[byte]·mul))
//         —— 与「线性空间乘 mul 再编码」等价（只差 mul 的量化档），不是近似。
//      ② addLut[ch][addBin·256 + t] = 255·l2s(s2l[t/255] + rimLin[ch]·add)
//         —— 加性项在编码**前**加进去；中间只过一次 8bit，实测最大偏差 2/255。
//
// 为什么查表而不是每像素算 pow：每像素要 6 次 Math.pow，560² 一帧实测 **141ms**——
// 60Hz 的 16.7ms 预算连零头都不够。查表版每像素只多 6 次数组读 + 一行量化算术。
// 三维档（globe3dStage.ts）不吃这套：GLSL 里 pow 是原生指令，那边跑**同一套公式的
// 精确版**，两侧容差 ≤2/255（globe-light.test.mts 钉 CPU 侧，GPU 侧靠双后端比对）。
//
// 光照固定在**屏幕空间**（灯跟着相机、不跟着球转）：用户拖动改的是「哪条经线朝向相机」，
// 太阳在世界里没动 → 晨昏线在屏幕上就不动。这与 globe.html 一致（它的灯在 scene 空间）。
// 副产品 = 光照只跟像素位置有关、**与位姿无关** → 不必进 GlobeTable 的缓存键，
// 也就不动 globeSurface 那笔 13B/px 的内存账。

// 档位轴（夜地球 / 日地球）的真源**不在这里**：它就是 `prefs.globeEarth`，
// 枚举在 `momo/types/prefs.ts` 的 `GlobeEarth`（合法值 `GLOBE_EARTHS`、默认值
// `DEFAULT_GLOBE_EARTH`、白名单 `sanitizeGlobeEarth`）。这里只 `import type`——
// **类型导入是零运行时的**，本模块因此仍可被 globe3d.js 那个独立 chunk 引用
// （那里的纪律是「只许 import three 与纯模块」，见 globe3dStage.ts 文件头）；
// 一旦改成值导入，整条 types 依赖会被拖进 globe3d.js。
import type { GlobeEarth } from '../../momo/types'

// 转出给同族消费者：globe3dStage / globe3dTypes 住在 globe3d.js 那个独立 chunk 里，
// 它们的 import 面刻意只有 three + globe3dMath + 本模块（见 globe3dStage.ts 文件头），
// 让它们直接 import momo/types 会看着像破了那条纪律。档位轴的**定义**仍然只有
// momo/types 一处，这里只是把同一个类型再递一手（类型转出，零运行时）。
export type { GlobeEarth }

/**
 * 边缘光颜色 `#88aaff` 的三通道（0..255）——GLSL 侧要用归一化值，这里给字节，两侧同一份真源。
 * 同色于 `globe.html` 的 rim DirectionalLight。
 *
 * ⚠️ 原来这里还有一个 `GLOBE_RIM_HEX = '#88aaff'`，**两个色面是同一份真源的两次抄写**，
 * 而且 HEX 那个从没人消费（`lint:dead` 一直在报它，2026-10-06 顺手删掉）。要字符形态就从
 * 这三个字节拼，别再建第二个字面量。
 */
export const GLOBE_RIM_RGB: readonly [number, number, number] = [0x88, 0xaa, 0xff]

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2])
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * 两档的光照配方（只存**原始**参数，取值范围由 lightRanges 推出来，不写第二遍——
 * 写第二遍就会漂）。**改这里必须同步改 globe3dStage.ts 的 GLSL**（那边是同一套公式的
 * 精确版），否则 CPU 档与 GPU 档画出来的球不一样。
 *
 * day 的三个数值逐字抄自 globe.html：`AmbientLight(0xffffff, 0.85)`、
 * `DirectionalLight(0xffffff, 0.9)` @(5, 2.5, 4)、`DirectionalLight(0x88aaff, 0.35)`
 * @(−6, −1, −4)，材质 `roughness 0.92 / metalness 0`（镜面项可忽略，故不建模）。
 * three 的漫反射项带 1/π 归一化，这里照抄，数值才能和参考稿对上。
 */
export const GLOBE_LIGHT_RECIPE = {
  night: {
    /** 临边衰减下限（n·v = 0 处；1.0 = 完全不衰减） */
    limbFloor: 0.62,
    /** 边缘光起点（占球盘半径比例）：r 小于它完全不参与 */
    rimStart: 0.9,
    /** 边缘光带宽（占半径） */
    rimWidth: 0.1,
    /**
     * 边缘光强度 = **0：夜地球不加边缘光**（2026-10-06，用户定案「外层不要加光圈」）。
     *
     * 曾经是 0.13（`#88aaff · t^1.5`），实测在最外圈把 B 通道抬到 82.4（中心 32.9，
     * 即 +49.5），用户在原图上看到的那一圈蓝光就是它。
     *
     * ⚠️ **别手贱改回来**。要恢复只需把这里改回非 0——`globeLightMulAdd` / `renderFrame`
     * 内联 / GLSL 三处都按这个值算，`buildGlobeLight` 另有 `addMax = 0` 的退化分支
     * （见 ADD_BINS 那段注释）。`rimStart` / `rimWidth` 留着是**给这条公式留形状**，
     * 不是「还没删干净」。
     *
     * ⚠️ **不要顺手把 limbFloor 一起改成 1**。临边衰减不是「光圈」——它是这颗盘看起来
     * 是个球的唯一线索；去掉它球就退回一张贴纸。globe-light.test.mts 有反向守卫钉这条。
     */
    rimGain: 0,
  },
  day: {
    /** AmbientLight(0xffffff, 0.85)：three 的漫反射带 1/π */
    ambient: 0.85 / Math.PI,
    /** DirectionalLight(0xffffff, 0.9) 的主光方向（已归一化） */
    key: 0.9 / Math.PI,
    keyDir: normalize3([5, 2.5, 4]),
    /** DirectionalLight(0x88aaff, 0.35) 的背光方向（已归一化）——它从**背后**来，
     *  只在球缘擦出一圈，这正是它叫「边缘光」而不是「补光」的原因 */
    rimGain: 0.35 / Math.PI,
    rimDir: normalize3([-6, -1, -4]),
  },
} as const

/** 一档光照里 (mul, add) 各自的取值范围（量化分档要用；从配方推，不手抄） */
function lightRanges(mode: GlobeEarth): { mulMin: number; mulMax: number; addMax: number } {
  if (mode === 'night') {
    const r = GLOBE_LIGHT_RECIPE.night
    return { mulMin: r.limbFloor, mulMax: 1, addMax: r.rimGain }
  }
  const r = GLOBE_LIGHT_RECIPE.day
  return { mulMin: r.ambient, mulMax: r.ambient + r.key, addMax: r.rimGain }
}

/**
 * 逐像素的 (mul, add)：光照的**全部**配方都在这里，其余（查表怎么做、档位怎么量化）
 * 都是实现细节。
 *
 * 入参是**屏幕空间**的单位法线（球心在原点、半径 1，几何恒等不动，见 globe3dStage 的
 * VERT 注释）：xm 向右、ym 向上、zm 朝向观察者。mul = 贴图要乘的系数；
 * add = 要加的边缘光标量（颜色由 GLOBE_RIM_RGB 给）。两者都在**线性空间**语义下。
 *
 * ⚠️ 这个函数是 GLSL 那份的镜像：`renderFrame` 里内联了同一段算术（逐像素调函数
 * 会被 V8 的调用开销吃掉），globe-light.test.mts 逐像素比对两边的 (mul, add)，
 * 防止内联那份和这里走散。
 */
export function globeLightMulAdd(
  mode: GlobeEarth,
  xm: number,
  ym: number,
  zm: number,
): { mul: number; add: number } {
  if (mode === 'night') {
    const r = GLOBE_LIGHT_RECIPE.night
    const limb = r.limbFloor + (1 - r.limbFloor) * zm
    // 边缘光那一项：`rimGain` 现在是 0，所以 add ≡ 0（用户要求「外层不要加光圈」）。
    // **公式与其形状原样留着**：它同时是 GLSL 与 renderFrame 内联版的共同定义，
    // 删掉会让三处走散；恢复只需把 rimGain 改回非 0。
    // 指数取 1.5 是刻意的：梯度在起点更缓、到球缘更陡，画出来才像大气层，
    // 而不是沿轮廓描的一圈线。
    const rr = Math.sqrt(Math.max(0, xm * xm + ym * ym))
    let t = (rr - r.rimStart) / r.rimWidth
    if (t < 0) t = 0
    else if (t > 1) t = 1
    return { mul: limb, add: r.rimGain * t * Math.sqrt(t) }
  }
  const r = GLOBE_LIGHT_RECIPE.day
  const dk = xm * r.keyDir[0] + ym * r.keyDir[1] + zm * r.keyDir[2]
  const dr = xm * r.rimDir[0] + ym * r.rimDir[1] + zm * r.rimDir[2]
  return {
    mul: r.ambient + r.key * (dk > 0 ? dk : 0),
    add: r.rimGain * (dr > 0 ? dr : 0),
  }
}

// ---- sRGB 传递函数 ----------------------------------------------------------
// 与 three.js 的 sRGBTransferEOTF / linearToOutputTexel 是同一对。GPU 档不经过这里：
// CubeTexture 的 colorSpace = SRGBColorSpace 让 three 用 SRGB8_ALPHA8 内部格式，
// 采样时由硬件解码成线性，编码则交给既有的 `#include <colorspace_fragment>`。

/** sRGB 字节 → 线性。256 项查表：逐像素 pow 太贵，而输入本来就只有 256 个可能值 */
const S2L = (() => {
  const t = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return t
})()

/** 边缘光颜色的**线性**值（加性项按线性空间的颜色加权）。globe3dStage 的 GLSL 也读它 */
export const GLOBE_RIM_LIN: Float32Array = (() => {
  const t = new Float32Array(3)
  for (let ch = 0; ch < 3; ch++) t[ch] = S2L[GLOBE_RIM_RGB[ch]]
  return t
})()

/** 线性 → sRGB（归一化） */
function linToSrgb(c: number): number {
  if (c <= 0) return 0
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/** 线性 → sRGB 字节（0..255）。取整后夹取——返回值当作**数**用（参考实现要拿它比对），
 *  所以必须真是整数；只靠 Uint8ClampedArray 落盘时取整的话，函数一旦被当值读出去
 *  就带着半格偏移（这个坑踩过：偏差统计里冒出一堆 2.5、2.096 这种非整数）。 */
function linToByte(c: number): number {
  const v = Math.round(linToSrgb(c) * 255)
  return v > 255 ? 255 : v < 0 ? 0 : v
}

// ---- 查表 -------------------------------------------------------------------

/** 乘性项的量化档数：256 档 → 单档误差 ≈0.19/255（远不可见），再细分只是让 LUT 变大 */
const MUL_BINS = 256

/**
 * 加性项的量化档数。这个轴按**线性值**等距分档（不是按编码值）。边缘光的自然梯度在
 * 球缘约 3~5 字节/像素，256 档给出的量化误差 ≈1.7 字节 ≪ 一个像素的变化量，看不出
 * 台阶；更粗就会在这个斜率上留下可见的环，更细则白涨 LUT（实测总偏差已经被 8bit
 * 中间量压到 2/255，加档也换不回来）。
 *
 * ⚠️ **某一档的 addMax 为 0 时不再用 256 档**（夜档 2026-10-06 起 rimGain = 0 就是这种）。
 * 两条理由，缺一条都会出问题：
 *   ① `addScale = (ADD_BINS − 1) / addMax` 会变成 `Infinity`，逐像素 `add * addScale`
 *      得到 `0 · ∞ = NaN`——眼下靠 `(NaN + 0.5) | 0 === 0` 侥幸落回第 0 档（位运算把
 *      NaN 折成 0），是**运气不是设计**，换个夹取写法就崩；
 *   ② 256 档全烘一遍等于把**同一行恒等表**抄 256 遍（3 × 256² × 4B = 786KB 白烧）。
 * addMax 为 0 时这一轴退化成 1 档（`addBins = 1`，只留恒等那一行），`addScale = 0`
 * 让逐像素的 `ab` 恒为 0，于是渲染循环**一行都不用改**。
 */
const ADD_BINS = 256

/**
 * 一档光照的查表结果。两张表都是「行 × 256」，行由量化档拼出来（`行基址 = bin * 256`），
 * 于是逐像素只做两次数组读：`addLut[ch][addRow + mulLut[mulRow + byte]]`。
 */
export interface GlobeLight {
  mode: GlobeEarth
  /** 量化参数：`mulBin = (mul - mulMin) * mulScale`，夹到 [0, mulBins-1] */
  mulMin: number
  mulScale: number
  mulBins: number
  /** 量化参数：`addBin = add * addScale`，夹到 [0, addBins-1] */
  addScale: number
  addBins: number
  /**
   * 乘性项：mulBins × 256（输出已是 sRGB 字节）。
   * **三通道共用同一行**——mul 是标量、线性空间乘完再编码，与通道无关；
   * 拆三张只会把同样的字节抄三遍（`mulLut[ch]` 三格指向同一个 Uint8Array）。
   */
  mulLut: Uint8Array
  /** 加性项：addBins × 256，每通道一张（边缘光是带色的，三通道各烘各的）。
   *  值是 sRGB 的 0..255 **浮点**——交给 Uint8ClampedArray 存入时取整，先取整会白多一次量化 */
  addLut: Float32Array[]
}

function buildGlobeLight(mode: GlobeEarth): GlobeLight {
  const { mulMin, mulMax, addMax } = lightRanges(mode)

  // 退化区间保护（见 ADD_BINS 上面的 ⚠️）：值为常量时那一轴只需要 1 档。
  // 两轴对称处理——`mulMax === mulMin` 现在不会发生（夜档 1 − 0.62、日档 > 0），
  // 但写成对称的，将来谁把某档配成常量都不会生成 `Infinity` 的 scale。
  const mulBins = mulMax > mulMin ? MUL_BINS : 1
  const addBins = addMax > 0 ? ADD_BINS : 1

  const mulLut = new Uint8Array(mulBins * 256)
  for (let m = 0; m < mulBins; m++) {
    // 分档取**含端点的等分**（bin 0 = mulMin、bin 末 = mulMax），不取档中心：
    // 取中心会让每一档整体偏半档，add 轴那一侧表现为「整盘浮起一层极淡的蓝」
    // （0 档的中心值是 addMax/512 ≠ 0），正好踩在「蓝只许落在最外圈」那条红线上。
    const mul = mulBins === 1 ? mulMin : mulMin + ((mulMax - mulMin) * m) / (mulBins - 1)
    const base = m * 256
    for (let b = 0; b < 256; b++) mulLut[base + b] = linToByte(S2L[b] * mul)
  }

  const addLut: Float32Array[] = [
    new Float32Array(addBins * 256),
    new Float32Array(addBins * 256),
    new Float32Array(addBins * 256),
  ]
  for (let a = 0; a < addBins; a++) {
    // 同上：0 档必须**恰好**是 0，否则球盘正中也会吃到一点边缘光
    const addScalar = addBins === 1 ? 0 : (addMax * a) / (addBins - 1)
    const base = a * 256
    for (let ch = 0; ch < 3; ch++) {
      const row = addLut[ch]
      const addLin = GLOBE_RIM_LIN[ch] * addScalar
      for (let t = 0; t < 256; t++) row[base + t] = linToSrgb(S2L[t] + addLin) * 255
    }
  }

  return {
    mode,
    mulMin,
    // 反解档号：`bin = round((v - min) · scale)`，逐像素写成 `(x·scale + 0.5) | 0`
    mulScale: mulBins === 1 ? 0 : (mulBins - 1) / (mulMax - mulMin),
    mulBins,
    addScale: addBins === 1 ? 0 : (addBins - 1) / addMax,
    addBins,
    mulLut,
    addLut,
  }
}

const LIGHT_CACHE = new Map<GlobeEarth, GlobeLight>()

/**
 * 取一档光照的查表（首次调用时烘焙，之后复用）。
 *
 * 烘焙成本实测 ≈60ms/档（本机 node，两档合计；真机更快）——一次性，别放到逐帧路径上。
 * 调用方（GlobeStage）在贴图就绪的空闲回调里先摸一下，首帧就不会吃到这笔。
 */
export function globeLightFor(mode: GlobeEarth): GlobeLight {
  let light = LIGHT_CACHE.get(mode)
  if (!light) {
    light = buildGlobeLight(mode)
    LIGHT_CACHE.set(mode, light)
  }
  return light
}

/**
 * 参考实现：同一套配方，走**每像素直接 pow** 的严格线性空间路径。
 *
 * 它不是生产路径（560² 一帧 141ms，见文件头），存在的意义是给查表版当**独立的**
 * 对照：偏差一旦超过 2/255，就说明量化 / 索引 / 混档里有一处错了。测试也用它钉住
 * 换算里最容易错的那一步——加性项必须在线性空间（编码前）加。
 */
export function globeLightReference(
  mode: GlobeEarth,
  rgb: readonly [number, number, number],
  xm: number,
  ym: number,
  zm: number,
): [number, number, number] {
  const { mul, add } = globeLightMulAdd(mode, xm, ym, zm)
  const out: [number, number, number] = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    out[ch] = linToByte(S2L[rgb[ch] & 255] * mul + GLOBE_RIM_LIN[ch] * add)
  }
  return out
}
