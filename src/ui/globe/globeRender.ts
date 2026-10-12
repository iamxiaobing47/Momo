// 星球渲染（F7）：静态表 + 每帧平移采样。**纯计算，node 里可测**（贴图解码在
// globeTexture.ts，表缓存在 globeSurface.ts——这一层只认「贴图 + 位姿 + 输出缓冲」）。
//
// 为什么是「静态表 + 旋转」而不是逐像素投影：绕竖轴旋转对每个像素是**同一个 yaw
// 角**（推导见 globeMath.ts 文件头），所以 rotLat 不变时表不动，每帧只转一次方向。
// 分层：
//   ① buildGlobeTable(size, rotLat)：屏幕像素 → 球面点 → **方向向量** + 正面掩码。
//      rotLat 之外的量全是静态的，按 0.5° 量化缓存（见 globeSurface.ts）。
//   ② renderFrame(tex, table, rotLng, out)：绕 Y 轴转 **−rotLng**（采样方向取逆
//      变换）后按方向取 cube 面采样。
// 基准（node，本机实测）：建表 12.4ms/倾角(560²) / 6.3ms(400²)，采样 3.1ms(560²)。
// 倾角可拖之后「每帧重算一张表」不再是死成本，于是运动期换小画布（见 GLOBE_MOVING_SIZE）。
//
// 表的「建」与「填」是分开的两个函数（createGlobeTable / fillGlobeTable）：
// 运动档一帧一张表，缓冲必须复用——每次都 new Float32Array 的话 400² 一帧 1.37MB、
// 560² 一帧 2.69MB，60fps 就是每秒 80~160MB 的分配速率，GC 的顿挫比建表本身更伤
// 手感（量过：建表 5.1ms 里纯计算只占 4.2ms，差的那一截就是分配）。
//
// 采样侧还有一档：运动期用半尺寸贴图（halveCube）。400² 画布配 1024²/面 的 cube 是
// 2.56 texel/px（正对观察者的半球横跨两面 = 2048 texel / 400px 再折半），点采样必
// 走样——量过（对超采样真值的 RMS）：原图 5.72、半尺寸 4.26、四分之一 5.18，半尺寸
// 两头最优；转 0.35° 的帧间抖动也从 11.2 降到 7.8，城市灯光在转动时不再闪。
//
// 合规（红线，先立字据——设计稿 F7b §合规注记）：
// 贴图是 NASA GIBS 的 Black Marble 夜地球，公有领域静态影像，含真实陆地轮廓但
// **无审图号**；本模块只作个人自用面板的可视化，**公开发布前必须替换为自然资源部
// 标准地图数据或去掉陆地**（坐标字典 locCoords.ts 是纯经纬度数字，与陆地轮廓无关，
// 不受此 gate 影响）。运行期零网络零 key：贴图随产物部署，不发地图请求。
//
// ---- 2026-10-04 换 cube --------------------------------------------------------
// 贴图从「单张等距圆柱」换成「六面 cube」：px/nx/py/ny/pz/nz，1024²/面（与 HTML 同）。
// 动机 = 等距圆柱在两极有**几何奇异**：极点那一 row 等于整个极冠，经线向极点收束，
// 源图上任何沿经度的横向结构裹到球上都会变成从极点辐射出来的辐条（小饼 2026-10-01
// 起的「两极拼接痕」四轮修复都是在这上面打补丁）。cube 没有这一说：极点方向的主分量
// 恒为 ±Y，落在 py/ny 面的**正中**，采样密度与其它方向完全一致——几何上就没有奇异点。
// 副产物 = 等距圆柱那套后处理（接缝修复 / 冰盖补丁 / 北极瓦片羽化 / 极冠延续填充 /
// 海洋提亮）全部作废：它们修的全是「等距圆柱 + 旧合成底图」这对组合的病灶，cube 上
// 既没有可修的东西、坐标也对不上号，一并删除（测试同步删）。

import { GLOBE_LIGHT_RECIPE, type GlobeLight } from './globeLight'

/**
 * 零光照路径的空占位。为什么要有：光照那几张表在循环外一次性取成局部量（避免逐像素
 * 走属性链），而 `light` 为 null 时 TS 不会把 `Uint8Array | null` 窄化成数组。
 * 用零长度常量替 null 既保住类型、又不引入逐帧分配；真正的边界由 `shaded` 这个
 * 布尔量守着，`NO_*` 永远不会被索引到。
 */
const NO_U8 = new Uint8Array(0)
const NO_F32 = new Float32Array(0)

/** 解码后的立方体贴图：六面同尺寸正方形，RGBA，顺序 **px/nx/py/ny/pz/nz**。
 * 面的朝向与 `outputs/polefix_v2/equirect_to_cubemap.py` 的 bases 表一一对应。
 *  buffer 收紧到 ArrayBuffer（getImageData 的真实返回，永不是 SharedArrayBuffer）：
 *  三维档要经 `new ImageData(data, …)` 上 GPU，泛型松一档那里就编译不过 */
export interface GlobeCube {
  /** 每面边长（六面必须相等，装载侧已校验） */
  size: number
  faces: Uint8ClampedArray<ArrayBuffer>[]
}

/** 某个倾角（rotLat）下的静态采样表（每像素三项） */
export interface GlobeTable {
  /**
   * 画布内部分辨率（正方形）
   */
  size: number
  /**
   * 每像素的**旋转后方向向量**（单位向量，Y 轴向上 = 北极侧符合球面几何）。
   * 2026-10-04 起从「equirect (u0,v0)」改成方向向量：cube map 采样必须拿方向，
   * 而方向只与倾角有关（经度是绕 Y 轴旋转 → 逐像素的纯 yaw 旋转，见 renderFrame）。
   * 极点不再有奇异：任何方向都能确定唯一 texel。
   */
  dx: Float32Array
  dy: Float32Array
  dz: Float32Array
  /** 正面掩码：1 = 看得见（球面朝观察者这半），0 = 圆盘外或背面 */
  vis: Uint8Array
}

/** 画布内部分辨率：CSS 侧再缩放到实布尺寸（design 400px → 内部 560，1.4× 超采样，边缘由浏览器双线性收） */
export const GLOBE_CANVAS_SIZE = 560

/**
 * 运动档画布内部分辨率：拖拽与选中转向都用它。
 *
 * 倾角一动，静态表就得整张重算（见 buildGlobeTable），而**一次转向每帧都落在
 * 一个新的 0.5° 键上**（node 实测：90°→25° 的 20 帧碾过 21 张表，缓存一次都没命中），
 * 560² 光建表 12.4ms + 采样 3.1ms = 最坏一帧 16.6~17.2ms ——已经越过 60Hz 的
 * 16.7ms 预算（还没算 React 提交与 SVG 叠层），转向会掉帧。
 *
 * 400² 建表 6.3ms + 采样 1.6ms ≈ 最坏一帧 7.9ms，留得下余量；松手 / 转向停下那一刻
 * 再以 560² 重画一帧，停机时的清晰度一点不折。
 *
 * 为什么不是更小（曾用 320²）：运动档配半尺寸 cube（512²/面），正对观察者的半球
 * 横跨两面 = 1024 texel，画布小于它就是在**丢 texel**——夜地球的灯光是高频道内容，
 * 会拖出闪烁。400 是「2.56 texel/px」的折中（与旧等距圆柱满档同档），要完全不掉点
 * 得 512²（建表 10.4ms，余量只剩 3ms）。
 */
export const GLOBE_MOVING_SIZE = 400

/**
 * 静止档随缩放升分辨率的**分档**（像素）：`stillSizeFor` 按当前缩放挑一档。
 *
 * 为什么要有分档而不是按 zoom 连续算：静态表是**按 (倾角量化键, 尺寸)** 缓存的
 * （见 globeSurface），尺寸每滚一格就变一格 = 每格都重建一张 5~7MB 的表，缓存
 * 彻底失效还顺带把 GC 逼出顿挫。所以尺寸必须落在少数几档上。
 *
 * 上限 880 是两个天花板里更紧的那个：
 *   ① 贴图 1024²/面，正对观察者的半球横跨两面 = **2048 texel**——880 画布约
 *      1.5 texel/px，还在「不丢细节」那一侧（夜地球的灯光是高频道内容，丢了会闪）；
 *   ② 建表 13.7ms + 采样 8.2ms（node 实测）已经是一帧的量级，再大就不像"停手后
 *      重画一帧"而像卡顿。
 * 真要更大得换更高分辨率的源图，那是素材决定的事，不是这里调得动的。
 */
export const GLOBE_STILL_TIERS = [560, 720, 880] as const

/** 静止档画布的硬上限 = 最大那一档：`frameSizeFor` 按 DPR 放大后也不许超过它 */
export const GLOBE_STILL_MAX = GLOBE_STILL_TIERS[GLOBE_STILL_TIERS.length - 1]

/**
 * 静止档该用多大画布：`moving` 为真时一律降档（见 GLOBE_MOVING_SIZE），否则按 zoom 挑档。
 *
 * 阈值是「画布 ≥ 显示尺寸」反推的（显示边长 = **400** × zoom——CSS 基准见
 * 60-design.css 的 `calc(400px * var(--globe-zoom, 1))`；旧注释锚在已换掉的
 * 280px 设计稿上，推出来的 1.55 / 2.0 会让两段放大反而更糊）：
 *   zoom ≤ 1.4 → 显示 ≤ 560 → 560 够（1.0×）
 *   zoom ≤ 1.8 → 显示 ≤ 720 → 720 够（1.0×）
 *   zoom > 1.8 → 880（2.6× 时显示 1040，0.85×，是 880 天花板的明账）
 * 跨档时画布只增不减，所以放大过程中不会出现"越放大越糊"的那一下。
 *
 * DPR 不在这里乘（这一层只按 CSS px 标定）：`frameSizeFor` 拿到档位后再乘
 * devicePixelRatio 并封顶 880，见 globeSurface.ts。
 */
export function stillSizeFor(zoom: number): number {
  if (zoom <= 1.4) return GLOBE_STILL_TIERS[0]
  if (zoom <= 1.8) return GLOBE_STILL_TIERS[1]
  return GLOBE_STILL_TIERS[2]
}

/** 倾角表的量化步长（度）：0.5° 在 400px 球上约 1.7px 的边沿位移，tween 里看不出台阶 */
export const GLOBE_LAT_STEP = 0.5

/**
 * 分配一张 size² 的空表：方向向量清零，vis（圆盘掩码）按几何算好。
 *
 * vis 只跟 size 有关——r² 与倾角无关，所以**一辈子算一次**；随倾角变的只有
 * 方向向量，交给 fillGlobeTable 反复重填。为什么要拆：见文件头（运动档一帧一张
 * 表，缓冲不复用的话每秒 80~160MB 的分配速率会把 GC 逼出可见顿挫）。
 */
export function createGlobeTable(size: number): GlobeTable {
  const half = size / 2
  const inv = 1 / (size / 2)
  const vis = new Uint8Array(size * size)
  for (let py = 0; py < size; py++) {
    const y_m = -(py + 0.5 - half) * inv
    for (let px = 0; px < size; px++) {
      const x_m = (px + 0.5 - half) * inv
      if (x_m * x_m + y_m * y_m <= 1) vis[py * size + px] = 1
    }
  }
  return {
    size,
    dx: new Float32Array(size * size),
    dy: new Float32Array(size * size),
    dz: new Float32Array(size * size),
    vis,
  }
}

/**
 * 就地重填一张已有表的倾角（rotLat 变了、缓冲不变）：运动档每帧走这里。
 *
 * 逐像素（约定：世界系 Y 轴向上 = 北极，单位球半径 1）：
 *   x_m = (px+.5−S/2)/(S/2)，y_m = −(py+.5−S/2)/(S/2)，r² = x_m²+y_m² > 1 → 盘外
 *   z_m = √(1−r²)，c = z_m·cosφ₀ − y_m·sinφ₀，s = y_m·cosφ₀ + z_m·sinφ₀
 *   **世界方向 = (x_m, s, c)**——这步是 2026-10-04 换 cube 时推出来的恒等式：
 *     老等距圆柱版算 lat = asin(s)、lon₀ = atan2(x_m, c)，反推方向分量就是
 *       wx = cos(lat)·sin(lon₀) = x_m，wy = sin(lat) = s，wz = cos(lat)·cos(lon₀) = c，
 *     且 x_m²+s²+c² = x_m²+y_m²+z_m² = 1（φ₀ 两项是同一对 (y,z) 的旋转，模长不变）
 *     → 直接就是单位向量，省掉 asin/atan2/三角函数。
 *
 * 经度（yaw）不进表：绕 Y 轴旋转对每像素是**同一角度**的旋转，放 renderFrame 里做
 * （与老版「u 统一平移」的账一样，见 renderFrame）——所以表只随倾角变，缓存键不变。
 */
export function fillGlobeTable(table: GlobeTable, rotLatDeg: number): GlobeTable {
  const { size, dx, dy, dz, vis } = table
  const phi0 = (rotLatDeg * Math.PI) / 180
  const cosPhi0 = Math.cos(phi0)
  const sinPhi0 = Math.sin(phi0)
  const half = size / 2
  const inv = 1 / (size / 2)
  for (let py = 0; py < size; py++) {
    const y_m = -(py + 0.5 - half) * inv
    const row = py * size
    for (let px = 0; px < size; px++) {
      const i = row + px
      if (vis[i] === 0) continue
      const x_m = (px + 0.5 - half) * inv
      const r2 = x_m * x_m + y_m * y_m
      const z_m = Math.sqrt(1 - r2)
      dx[i] = x_m
      dy[i] = y_m * cosPhi0 + z_m * sinPhi0
      dz[i] = z_m * cosPhi0 - y_m * sinPhi0
    }
  }
  return table
}

/** 便捷入口：现建一张（测试 / 基准 / 一次性场景；运动档热路径走 create + fill） */
export function buildGlobeTable(size: number, rotLatDeg: number): GlobeTable {
  return fillGlobeTable(createGlobeTable(size), rotLatDeg)
}

/**
 * 每帧渲染（cube 版，2026-10-04）：把表里的方向向量绕 Y 轴转 **−rotLng**，再
 * **cube map 采样**写进 out。out 需与 table.size 同边长（RGBA）。
 *
 * 绕 Y 轴旋转 = 同一角度对每像素（与老 equirect 版「u 统一平移」的账一样）：
 *   x' = x·cosθ + z·sinθ，z' = −x·sinθ + z·cosθ，y 不变（θ = **−rotLng** 弧度）
 *
 * ⚠️ 为什么 θ 取负（2026-10-05 修）：这里转的是**采样方向**，它必须是叠层世界
 *   变换 M = Rx(φ₀)·Ry(r) 的**逆**（推导见 globe3dMath.ts 文件头）——屏幕方向
 *   n 处该采的贴图方向是 M⁻¹·n = Ry(−r)·Rx(−φ₀)·n，而表里已经烘了 Rx(−φ₀)，
 *   所以 renderFrame 只补 Ry(−r)。老 equirect 版的「u = U0 − rotLng/360」本来
 *   就是减号；2026-10-04 换 cube 时抄反了（显示经度 = lon₀ + rotLng，默认位姿
 *   中心差 2×rotLng）。GPU 档占着生产路径没人看见，软渲染同雷——拖拽时画布
 *   内容与叠层反向等速（小饼 2026-10-05 报的「地球跟着鼠标反方向移动」）。
 *   守卫：scripts/globe3d-orientation.test.mts + globe-projection.test.mts 的
 *   方向用例（亮斑质心必须与 λ = lon + rotLng 同向移动）。
 *
 * cube 采样：取方向绝对值最大的轴当 face，主分量归一化后另两轴 ∈ [−1,1] 定像素。
 * **极点没有奇异**——极点方向主分量恒为 +Y，落在 py 面正中，与其它方向一样唯一
 * 确定 texel。这是换 cube 的全部意义（等距圆柱那版必然在极点汇聚出辐条）。
 *
 * 面基与 `equirect_to_cubemap.py` 的 bases 表一一对应（贴图烘的时候就是按它切的）：
 *   px: 主 +X，右 −Z，下 −Y        nx: 主 −X，右 +Z，下 −Y
 *   py: 主 +Y，右 +X，下 +Z        ny: 主 −Y，右 +X，下 −Z
 *   pz: 主 +Z，右 +X，下 −Y        nz: 主 −Z，右 −X，下 −Y
 * 即「面的 (u,v) 像素 = 右/下 轴按 主分量 归一化到 [−1,1]」。
 */
export function renderFrame(
  tex: GlobeCube,
  table: GlobeTable,
  rotLngDeg: number,
  out: { data: Uint8ClampedArray },
  light?: GlobeLight | null,
): void {
  const { size, dx, dy, dz, vis } = table
  // θ = −rotLng：采样方向取叠层世界变换的逆（见函数头 ⚠️ 段）
  const theta = (-rotLngDeg * Math.PI) / 180
  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const dst = out.data
  const n = size * size
  const S = tex.size
  const faces = tex.faces

  // ---- 光照（可选）：一切能提前的都提到循环外，逐像素只留算术与两次查表 ----
  //
  // 屏幕空间的单位法线只跟像素坐标有关（几何恒等不动、位姿只转采样方向），
  // 所以 xm 只随列、ym 只随行——用两个游标推着走，省掉逐像素的 `i % size` 与除法。
  // ⚠️ 游标必须在 `vis === 0` 的 continue **之前**前进，否则盘外像素会把后续全体错位一行。
  const half = size / 2
  const invS = 1 / (size / 2)
  const shaded = light ?? null
  const mulLut = shaded ? shaded.mulLut : NO_U8
  const add0 = shaded ? shaded.addLut[0] : NO_F32
  const add1 = shaded ? shaded.addLut[1] : NO_F32
  const add2 = shaded ? shaded.addLut[2] : NO_F32
  const mulMin = shaded?.mulMin ?? 0
  const mulScale = shaded?.mulScale ?? 0
  const mulLast = shaded ? shaded.mulBins - 1 : 0
  const addScale = shaded?.addScale ?? 0
  const addLast = shaded ? shaded.addBins - 1 : 0
  const isNight = shaded?.mode === 'night'
  const night = GLOBE_LIGHT_RECIPE.night
  const dayKey = GLOBE_LIGHT_RECIPE.day.keyDir
  const dayRim = GLOBE_LIGHT_RECIPE.day.rimDir
  const dayAmbient = GLOBE_LIGHT_RECIPE.day.ambient
  const dayKeyGain = GLOBE_LIGHT_RECIPE.day.key
  const dayRimGain = GLOBE_LIGHT_RECIPE.day.rimGain
  let col = 0
  let ymRow = -(0.5 - half) * invS

  for (let i = 0; i < n; i++) {
    let xm = 0
    let ym = 0
    if (shaded) {
      xm = (col + 0.5 - half) * invS
      ym = ymRow
      if (++col === size) {
        col = 0
        ymRow -= invS
      }
    }
    const o = i * 4
    if (vis[i] === 0) {
      dst[o] = 0
      dst[o + 1] = 0
      dst[o + 2] = 0
      dst[o + 3] = 0
      continue
    }
    const x0 = dx[i]
    const z0 = dz[i]
    // 绕 Y 轴转（rotLng）：x/y/z 与上式对齐
    const x = x0 * ct + z0 * st
    const z = z0 * ct - x0 * st
    const y = dy[i]
    const ax = Math.abs(x)
    const ay = Math.abs(y)
    const az = Math.abs(z)
    let face: number
    let u: number // ∈ [−1,1]，面的右向
    let v: number // ∈ [−1,1]，面的下向（像素 y 向下）
    let major: number
    if (ax >= ay && ax >= az) {
      major = ax
      if (x > 0) {
        face = 0
        u = -z
        v = -y
      } else {
        face = 1
        u = z
        v = -y
      }
    } else if (ay >= az) {
      major = ay
      if (y > 0) {
        face = 2
        u = x
        v = z
      } else {
        face = 3
        u = x
        v = -z
      }
    } else {
      major = az
      if (z > 0) {
        face = 4
        u = x
        v = -y
      } else {
        face = 5
        u = -x
        v = -y
      }
    }
    // 主分量归一化 → 像素：u/major ∈ [−1,1]，×S/2 得 [−S/2, S/2]，再平移到 [0,S]。
    // ⚠️ 别写成 (u*inv + 1) * 0.5 * S —— inv 已经是 S/2 量纲，再乘一次 S/2 是双重缩放
    // （面上只有正中心那一个 texel 会碰巧算对，其它全飞出面外 → 球上一片错色）。
    const inv = S / 2 / major
    let sx = (u * inv + S / 2) | 0
    let sy = (v * inv + S / 2) | 0
    if (sx < 0) sx = 0
    else if (sx >= S) sx = S - 1
    if (sy < 0) sy = 0
    else if (sy >= S) sy = S - 1
    const t = (sy * S + sx) * 4
    const src = faces[face]
    if (shaded) {
      // 光照配方见 globeLight.ts 文件头。这段是 globeLightMulAdd 的**内联版**
      // （逐像素调函数要付一次对象分配）：两边走散由 globe-light.test.mts 的
      // 「渲染结果 vs globeLightReference」逐像素比对兜底。
      const r2 = xm * xm + ym * ym
      const zm = Math.sqrt(r2 < 1 ? 1 - r2 : 0)
      let mul: number
      let add: number
      if (isNight) {
        // 夜档：只补球面暗示。临边衰减让盘「鼓」起来。
        // **不给方向光**——夜灯贴图是全球夜景合成，加晨昏线会抹掉半个世界的灯光。
        // **也不给边缘光**：`night.rimGain === 0`（用户要求「外层不要加光圈」，2026-10-06），
        // 下面那段仍然算 `e` 只是为了让这份内联版与 globeLightMulAdd / GLSL 三处同形，
        // 乘出来恒为 0。addMax = 0 时 addLut 只剩恒等那一档，取到的就是 mulLut 的值。
        mul = night.limbFloor + (1 - night.limbFloor) * zm
        let e = (Math.sqrt(r2) - night.rimStart) / night.rimWidth
        if (e < 0) e = 0
        else if (e > 1) e = 1
        add = night.rimGain * e * Math.sqrt(e)
      } else {
        // 日档：globe.html 的原配方（ambient + key + 背面边缘光）
        const dk = xm * dayKey[0] + ym * dayKey[1] + zm * dayKey[2]
        const dr = xm * dayRim[0] + ym * dayRim[1] + zm * dayRim[2]
        mul = dayAmbient + dayKeyGain * (dk > 0 ? dk : 0)
        add = dayRimGain * (dr > 0 ? dr : 0)
      }
      // 档号 = round((值 − 下界) · scale)；非负所以 `+0.5 | 0` 等价于 Math.round 且更快
      let mb = ((mul - mulMin) * mulScale + 0.5) | 0
      if (mb < 0) mb = 0
      else if (mb > mulLast) mb = mulLast
      let ab = (add * addScale + 0.5) | 0
      if (ab < 0) ab = 0
      else if (ab > addLast) ab = addLast
      const mRow = mb * 256
      const aRow = ab * 256
      dst[o] = add0[aRow + mulLut[mRow + src[t]]]
      dst[o + 1] = add1[aRow + mulLut[mRow + src[t + 1]]]
      dst[o + 2] = add2[aRow + mulLut[mRow + src[t + 2]]]
      dst[o + 3] = 255
      continue
    }
    dst[o] = src[t]
    dst[o + 1] = src[t + 1]
    dst[o + 2] = src[t + 2]
    dst[o + 3] = 255
  }
}

/** 倾角量化键（0.5° 一步）：globeSurface.ts 的静止档缓存用它当 Map 键 */
export function latKeyOf(rotLatDeg: number): number {
  return Math.round(rotLatDeg / GLOBE_LAT_STEP) * GLOBE_LAT_STEP
}

/**
 * 每面 2×2 盒式降采样出一张半尺寸 cube（运动档专用）。
 *
 * 为什么运动档要换小贴图：400² 画布配 1024²/面 的 cube 是 2.56 texel/px，点采样
 * （renderFrame 是最近邻）必然走样——城市灯光是这张图里最高频的内容，转动时
 * 采样网格一移就会「闪」。量过（对超采样真值的 RMS）：原图 5.72 / 半尺寸 **4.26**
 * / 四分之一 5.18；转 0.35° 的帧间抖动 RMS：原图 11.2 / 半尺寸 **7.8**。半尺寸在
 * 「贴近真值」与「帧间稳定」两头同时最优。满档 560² 不用降（降了就开始丢细节）。
 *
 * 盒式（每格 4 像素取平均）而不是隔行取：先把高频能量砍半，点采样剩下的走样才压得住。
 * 太小的面原样返回（调用方照用，别造出 0 尺寸的面）。
 */
export function halveCube(tex: GlobeCube): GlobeCube {
  const S = tex.size >> 1
  if (!S) return tex
  const faces = tex.faces.map((src) => {
    const half = new Uint8ClampedArray(S * S * 4)
    for (let y = 0; y < S; y++) {
      const r0 = 2 * y * tex.size
      const r1 = r0 + tex.size
      for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4
        const a = (r0 + 2 * x) * 4
        const b = a + 4
        const c = (r1 + 2 * x) * 4
        const e = c + 4
        // +2 再右移 = 四舍五入；alpha 一律 255（球面内部不透明，与 renderFrame 同规）
        half[o] = (src[a] + src[b] + src[c] + src[e] + 2) >> 2
        half[o + 1] = (src[a + 1] + src[b + 1] + src[c + 1] + src[e + 1] + 2) >> 2
        half[o + 2] = (src[a + 2] + src[b + 2] + src[c + 2] + src[e + 2] + 2) >> 2
        half[o + 3] = 255
      }
    }
    return half
  })
  return { size: S, faces }
}
