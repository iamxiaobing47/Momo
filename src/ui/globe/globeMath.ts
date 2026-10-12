// 星球投影数学（F7）：正交投影的纯函数与常量。
//
// 公式与设计稿生成器逐字同款（由设计稿烘焙锚点反推，五参同时命中误差 1e-13，
// 求解脚本已随本轮清理；期望值钉在 scripts/globe-projection.test.mts）：
//   λ = lon + rotLng（全部化弧度）
//   x = 150 + 130·cosφ·sinλ
//   y = 150 − 130·(cosφ₀·sinφ − sinφ₀·cosφ·cosλ)
//   z = sinφ₀·sinφ + cosφ₀·cosφ·cosλ   ← 可见性：z > 0 才算正面（背面自动隐藏）
// 其中 φ = 纬度、φ₀ = rotLat（观测倾角）、rotLng = 绕竖轴转角（东正）。
//
// 渲染侧（globeRender.ts）用的是这套公式的**逆**：屏幕像素 → 球面点 → 贴图 (u, v)。
// 拆开看：绕竖轴旋转对每个像素是纯 u 平移（u = U0 − rotLng/360），纬度只进
// 静态表——所以拖拽每帧只做一次平移采样，不含逐像素三角运算（基准 3.27ms/帧）。

/** 锚点层 SVG 的 viewBox 边长（设计稿 F7a 口径：300×300） */
export const GLOBE_VIEW = 300
/** 球心（viewBox 坐标） */
export const GLOBE_CENTER = 150
/**
 * 投影半径：贴图采样球与锚点定位共用这一个 k。
 *
 * = 150，不是设计稿里那颗描边球的 130——**这里踩过坑**（2026-09-29 修正）。
 * `globeRender` 把贴图球画满整个 canvas，而 `.momo-globe-canvas` 是 100%×100%
 * 的舞台，所以屏幕上的球半径 = 舞台半边 = 150 视盒单位。锚点若还按 130 算，
 * 整条投影链会比球面小 13.3%，**落点在球上往内缩一圈**：实测北京被画到
 * 经 91.1° / 纬 49.0°（蒙古），离真正的北京 ~1400km；同时设计稿那颗描边圈
 * （r=131.5/134）也跟着变成球内侧的一圈蓝环——小饼报的「蓝色的圆环」就是它。
 * 两处同一个病根：叠层几何没跟 canvas 的实际球半径对齐。描边圈已按小饼意见
 * 删掉，半径则必须对齐到 150，锚点才压在它标的那块地上。
 */
export const GLOBE_R = 150

/**
 * 初始位姿（设计稿 F7a 默认态）：rotLat=28 / rotLng=−8——
 * 北京 / 纽约 / 家（若手填了坐标）三个示例锚点同屏可见。
 * store 的 locGlobeLat / locGlobeLng 初值引这一份，别处不抄数字。
 */
export const GLOBE_DEFAULT_POSE = { lat: 28, lng: -8 } as const

/** 位姿：观测倾角 + 绕竖轴转角。store 的 locGlobe* 与拖拽 / 转向 tween 都用这一对 */
export interface GlobePose {
  lat: number
  lng: number
}

/** 投影结果：viewBox 坐标 + 是否在正面（背面锚点不渲染、不响应点击） */
export interface GlobePoint {
  x: number
  y: number
  visible: boolean
}

/** 地球表面一点在屏幕上的位置（正交投影，见文件头公式） */
export function projectLatLon(lat: number, lon: number, rotLat: number, rotLng: number): GlobePoint {
  const phi = (lat * Math.PI) / 180
  const phi0 = (rotLat * Math.PI) / 180
  const lambda = ((lon + rotLng) * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const cosPhi0 = Math.cos(phi0)
  const sinPhi0 = Math.sin(phi0)
  const cosLambda = Math.cos(lambda)
  const sinLambda = Math.sin(lambda)
  return {
    x: GLOBE_CENTER + GLOBE_R * cosPhi * sinLambda,
    y: GLOBE_CENTER - GLOBE_R * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLambda),
    visible: sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLambda > 0,
  }
}

/**
 * 选中某地点时星球要转到的**经度**：让该点居中（λ=0），倾角固定收到 25°
 * （设计稿 F7a 选中态：垂直位太低显得「贴脸」、默认 28 又会让标签挤到边沿，
 * 25 是两态之间的折中）。纬度不动——只绕竖轴转 + 轻收倾角。
 */
export const GLOBE_FOCUS_LAT = 25

/**
 * 选中态的目标位姿（rotLng 取该点经度的相反数：λ = lon + rotLng = 0）。
 * 不收纬度入参：纬度恒为 `GLOBE_FOCUS_LAT`（上面那段「纬度不动」的在案理由），
 * 曾经有个从不被读的 `lat` 形参，2026-10-11 删掉（R2）——签名别暗示选中点的
 * 纬度参与计算，它不参与。
 */
export function focusPoseFor(lon: number): GlobePose {
  return { lat: GLOBE_FOCUS_LAT, lng: -lon }
}

// ---- 地名标签几何（BUG-108b）--------------------------------------------------
//
// 悬停标签画在 `overflow: hidden` 的 viewBox 0 0 300 300 里，球又占满整个盒子：
// 锚点靠球缘时，旧口径 `p.x ± 12` 会连文字一起写到盒子外，越出的部分直接消失
// （实测成都 p.x≈278 时右缘越界 16.9 屏幕 px；en/ja 地名更长、更早命中）。
// 修复 = 宽度上界估计 + 夹取：文字整体必须落在 [0, GLOBE_VIEW] 内，锚向仍按
// 象限（右半球 start / 左半球 end）。宽度不在纯函数里真量字——逐字符按字体
// 实测上界估：宁可多估（标签往球心多挪几像素），不可少估（少估 = 出界复发）。

/** 标签字号：与 `.momo-globe-label` 的 `--momo-fs-1`（11px）逐值一致，em 基准 */
export const GLOBE_LABEL_FS = 11

/** 标签与锚点的水平间距（视盒单位）——旧口径那个 ±12 */
export const GLOBE_LABEL_GAP = 12

/** 基线相对锚点的纵向下移——旧口径那个 +4 */
export const GLOBE_LABEL_DY = 4

/**
 * 逐字符宽度上界（em）。分桶按字体实测**最大值**取整（Noto Sans SC 与通用
 * sans 回退栈各量一遍，每桶取更宽的那头再留余量）：
 * CJK / 假名 1.05；W M w m 1.018 → 1.05；其余大写 0.667 → 0.8；
 * 小写与数字 0.586 → 0.65；空格 0.296 → 0.35；其余（标点 / 未列入的字符）0.9。
 * emoji 类按 1.3——一张图宽过汉字，宁可多估。
 *
 * CJK 为什么不按「advance 恰 1.0」估：字体的**墨迹盒**比 advance 宽
 * （实测 Noto Sans SC 11px，「成都」canvas advance 22.0、SVG getBBox 22.245
 * ≈ 1.011em/字），按 1.0 估时贴边标签的最后一字仍会被裁掉 ~0.3px。
 * 1.05 盖住墨迹盒，代价只是贴边时标签再往球心挪一两像素。
 */
function charEm(cp: number): number {
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // 谚文字母
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK 部首 / 汉字 / 假名 / 注音等
    (cp >= 0xac00 && cp <= 0xd7a3) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容汉字
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 兼容标点
    (cp >= 0xff00 && cp <= 0xff60) || // 全角形式
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角符号（¥ ￡ 等）
    (cp >= 0x20000 && cp <= 0x2fa1f) // 扩展 B~F 汉字
  )
    return 1.05
  if ((cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f300 && cp <= 0x1faff)) return 1.3
  if (cp === 0x20) return 0.35
  if (cp === 0x57 || cp === 0x4d || cp === 0x77 || cp === 0x6d) return 1.05 // W M w m
  if (cp >= 0x41 && cp <= 0x5a) return 0.8
  if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39)) return 0.65
  return 0.9
}

/** 标签文字宽度的**上界**（视盒单位；空串 0）。宁可多估，见本节文件头。 */
export function labelTextWidth(text: string): number {
  let em = 0
  for (const ch of text) em += charEm(ch.codePointAt(0) ?? 0)
  return em * GLOBE_LABEL_FS
}

/** 标签字形在基线之上 / 之下占的高度上界（em）：上沿按整 1em 估（盖住 CJK 墨迹盒与
 *  拉丁大写 + 变音符），下沿 0.25em（g / y / p 的降部）。同 charEm，宁可多估。 */
export const GLOBE_LABEL_ASCENT_EM = 1
export const GLOBE_LABEL_DESCENT_EM = 0.25

/**
 * 标签落点：按 p.x 所在半球取锚向（右 start / 左 end，与旧口径同），再把 x
 * 夹取到「文字整体落在 [0, GLOBE_VIEW] 内」——不贴边时与旧口径逐值一致
 * （±GLOBE_LABEL_GAP / +GLOBE_LABEL_DY），贴边时往回收，收不下才贴齐边。
 * 夹取是**单向收**：只可能在锚点内侧，不会把文字甩到另一半球。
 *
 * y（基线）同理夹到「字形整体落在 [0, GLOBE_VIEW] 内」（BUG-122c，BUG-108b 的纵向对应面）：
 * 倾角无上限，球竖直拖到极点正对视野时赤道锚点投影到 y≈0 / 300 且仍在正面，旧实现
 * 原样返回 `py + DY`，地名被 viewBox 上 / 下沿裁掉半截。不贴边时与旧口径逐值一致。
 */
export function labelPlacement(
  px: number,
  py: number,
  text: string,
): { x: number; y: number; anchor: 'start' | 'end' } {
  const w = labelTextWidth(text)
  const yMin = GLOBE_LABEL_ASCENT_EM * GLOBE_LABEL_FS
  const yMax = GLOBE_VIEW - GLOBE_LABEL_DESCENT_EM * GLOBE_LABEL_FS
  const y = Math.min(yMax, Math.max(yMin, py + GLOBE_LABEL_DY))
  if (px > GLOBE_CENTER) {
    // start 锚：文字向右延展，右界 = x + w，x 夹到 ≤ VIEW − w
    return { x: Math.max(0, Math.min(px + GLOBE_LABEL_GAP, GLOBE_VIEW - w)), y, anchor: 'start' }
  }
  // end 锚：文字向左延展，左界 = x − w，x 夹到 ≥ w
  return { x: Math.min(GLOBE_VIEW, Math.max(px - GLOBE_LABEL_GAP, w)), y, anchor: 'end' }
}

/**
 * 倾角**不设上限**（2026-10-04 改动）：两极都能拖过头顶，纬度与经度一样无限翻滚。
 *
 * 早先钉死在 ±90°（"到极点即止，地球仪不翻跟头"），但用户明确要「像 HTML 版
 * OrbitControls 那样自由滚」——把纬度当**绕横轴的旋转角**看，它本来就该能超过
 * 90°：拖过北极之后北极转到背面、南极转到正面，投影公式
 * （x/y/z 三条全是 sinφ₀/cosφ₀ 的函数）对任意 φ₀ 都自洽，`visible` 判据同理。
 *
 * 保留这个常量只作**文档锚点**（引用它即表示「这里说的就是倾角范围」），值为
 * Infinity —— 语义 = 无界。别再往它上面夹取。
 */
export const GLOBE_LAT_LIMIT = Infinity

/**
 * 拖拽 → 新位姿（纯函数；GlobeStage.onPointerMove 与回归测试共用这一份）。
 *
 * 两轴都对：x 走 yaw（绕竖轴，360° 无上限，跨 ±180 也不用归位）、
 * y 走倾角（绕横轴，同样无上限——2026-10-04 起两极能拖过头顶，与 yaw 对称）。
 * 两轴一起构成二自由度地球仪——**故意不加 roll**：北极拖过头顶后仍是「北朝上」
 * 的翻滚，地图不会斜着挂在球上。
 *
 * 灵敏度：横穿整个球宽 / 球高各转 180°，即「手指拖多远，球就滚多远」。
 * 上下方向取 `+dy`：屏幕 y 向下增大，而 rotLat 增大时正面那一点往屏幕下方走
 * （y = C − R(cosφ₀sinφ − sinφ₀cosφcosλ)，对 φ₀ 求导 = R·cos(φ−φ₀) > 0），
 * 于是「往下拖 = 前表面往下滚」，和横拖同一个手感。
 */
export function dragPose(
  lat: number,
  lng: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
): GlobePose {
  return {
    // 纬度不再夹取（GLOBE_LAT_LIMIT = Infinity）：拖过头顶继续滚，和经度一样无界
    lat: lat + (dy / (height || GLOBE_VIEW)) * 180,
    lng: lng + (dx / (width || GLOBE_VIEW)) * 180,
  }
}

// ---- 选中转向（tween）--------------------------------------------------------
//
// 点球上光点 / 侧栏「全部地点」树（都走 toggleLocation），两个入口都只是把
// filterLocations 与 locJumpSeq 写进 store；真正「转过去」这件事由 GlobeStage
// 里那一段 rAF 完成——每帧按这里的三个纯函数算出位姿写回 store，canvas 照常跟着
// store 重绘。
//
// 为什么把这几行也放进 globeMath：它们是**位姿**运算（与拖拽同一个域），
// 且最容易写错的两处（缓动端点、跨 ±180 的最短弧）都能在 node 里钉住。

/** 转向时长（ms）：够看清转向过程，又不至于让连续点击变迟钝 */
export const GLOBE_TWEEN_MS = 340

/** 缓入缓出：起步与收尾都慢、中段快——球看着像有质量 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/**
 * 角度归一到 [−180, 180)。
 *
 * JS 的 `%` 带被除数的符号，所以 `((d + 540) % 360) - 180` 只在 d ≥ −540 时才落在
 * 半圈以内：`d = −1170`（rotLng 有意不归位，拖上几圈就会攒到）会算出 −450，球于是
 * 反着绕一圈半。先把 d 自己取模到 (−360, 360) 再补 540，任何入参都在区间内。
 */
function wrapDeg(d: number): number {
  return ((d % 360) + 540) % 360 - 180
}

/**
 * from → to 的**最短弧**（经度差，∈ [−180, 180)）。
 * 不取最短弧的话，从 −170° 转到 170° 会绕地球跑 340°（等于反着转大半圈），
 * 而两者其实只差 20°。
 *
 * 正好相差 180° 时取 −180（本式 `%360` 的下界是闭的）：反向转也一样落在对跖点，
 * 所以不必特判——但要知道有这回事，别拿 `=== 180` 去断言。
 */
export function shortestArc(from: number, to: number): number {
  return wrapDeg(to - from)
}

/**
 * 两个位姿在**屏幕上**是否已经重合（经度按 360° 取模、容差 0.01° ≪ 一个像素）。
 *
 * 为什么不能直接 `a.lng === b.lng`：位姿的经度不归位（拖到几百度、tween 落点是
 * `from.lng + 弧` 的浮点和），同一根经线有无数个等价值。用等值判「已经在位」的
 * 结果几乎永远不成立——用户重复点同一个地点，球一动不动却整整跑 340ms 的转向、
 * 还会把画布降到运动档闪一下。
 */
export function samePose(a: GlobePose, b: GlobePose): boolean {
  return a.lat === b.lat && Math.abs(wrapDeg(a.lng - b.lng)) < 0.01
}

/**
 * tween 的第 e 帧（e 已经过缓动，∈ [0,1]）：纬度线性插值、经度走最短弧。
 *
 * `from` 由调用方在**发起转向那一刻**快照一次并全程复用——不要每帧从 store 读
 * 「当前位置」：那样每帧的目标都少一点，球会越走越慢，永远到不了终点。
 * `e = 1` 时直接给 `to`（调用方对末帧的特判，见 GlobeStage）：累加出来的终点只与
 * 目标**同余**（差 1e-14 或 360），会一路带着这点漂移走。
 */
export function tweenPose(from: GlobePose, to: GlobePose, e: number): GlobePose {
  return {
    lat: from.lat + (to.lat - from.lat) * e,
    lng: from.lng + shortestArc(from.lng, to.lng) * e,
  }
}
