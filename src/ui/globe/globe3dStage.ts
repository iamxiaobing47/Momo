// 星球三维舞台（three.js 档，F7 的 GPU 后端）——**不进 main.js 的独立 chunk**。
//
// 为什么独立产物：three 全量 minified ~600KB，打进 main.js 会把插件 onload 的
// parse+eval 时间抬回贴图内联时代（那笔账见 globeTexture.ts 文件头），而它只在
// 切到星球档时才用得上。构建链：esbuild.config.mjs 把本文件打成 IIFE 产物
// globe3d.js（与字体 / 贴图同一条部署路，vault-targets 的 GLOBE3D），运行期经
// caps.globe3dUrl 的 app:// URL 注入 <script> 惰性加载（globe3dLoader.ts），在
// window.__momoGlobe3D 上交工厂。装载失败 / WebGL 上下文拿不到 → GlobeStage 回退
// canvas 软渲染（globeRender 那套），用户无感。
//
// 场景（与软渲染逐像素对齐，推导与测试见 globe3dMath.ts 文件头）：
//   正交相机 + 单位球（SphereGeometry）+ cube map。球几何**一动不动**（恒等变换），
//   位姿只进 shader 的采样方向 uniform（uTilt / uSpin），锚点叠层（SVG，
//   projectLatLon）与球因此逐点重合。group/mesh 两层 Object3D 只是挂载点，
//   **不参与位姿**（转几何会与转采样方向恒等抵消，见 VERT 顶部注释）。
//
// ⚠️ **为什么是 ShaderMaterial 而不是 MeshBasicMaterial.map**（2026-10-05 踩实）：
//   three 的 `material.map` 在 shader 里被声明成 **`sampler2D`**（见 three 源码
//   `map_pars_fragment`），而 CubeTexture 上传到 GPU 绑的是 `TEXTURE_CUBE_MAP`。
//   两者类型不匹配 → 采样结果未定义 → **球渲染成纯黑且 GL 不报错**。
//   three 里 `map.isCubeTexture` 这个判定**出现 0 次**，即它从未为「map = cube」
//   准备 shader 变体；只有 `envMap` 才走 `samplerCube`。
//   （`outputs/polefix_v2/globe.html` 的 cube 分支同样是坏的——它的默认路径是
//   equirect，cube 要 `?cube=1` 才开，那条路多半没人真跑过。）
//   → 正解：ShaderMaterial + `uniform samplerCube`，用**世界法线方向**直接采样，
//   语义与软渲染 renderFrame 的「方向向量 → 取面」完全同构。
//
// 渲染节律：**按需渲染**，不内部转 rAF——GlobeStage 的 paint 路径位姿变了才调
// render()（软渲染的「签名跳帧」纪律在这里不必要：一帧一个球的 GPU 成本≈0，
// 重复画无害，而尺寸/DPR/缩放自检反而需要每次 render 都跑）。静止时零 rAF 零功耗。
//
// 本文件运行在 globe3d.js 里，**只许 import three 与纯模块**（globe3dMath /
// globe3dTypes）；import 任何 main.js 侧模块都会把 React / store 拖进这个 chunk。

import * as THREE from 'three'
import { tiltRad, yawRad } from './globe3dMath'
import {
  GLOBE_LIGHT_RECIPE,
  GLOBE_RIM_LIN,
  type GlobeEarth,
} from './globeLight'
import type { Globe3DFactory, Globe3DInstance } from './globe3dTypes'


/** 背面缓冲边长上限（px）：贴图正对观察者的半球只有 1024 texel，超过是纯显存浪费。
    400px 舞台 × ZOOM_MAX 2.6 × DPR 3 ≈ 3120，这里收到 2048——比软渲染的 880 天花板
    宽裕得多（CPU 光栅化的那道墙在 GPU 上不存在），又不放任 DPR 把缓冲吹爆 */
const MAX_BACKING_SIZE = 2048

/**
 * 球面 cube map 采样着色器。
 *
 * 出参 `vDir` = 该片元的**采样方向**（= 屏幕方向；球心在原点、半径 1，几何恒等
 * 不动，位姿只转这个方向）。cube map 采样的定义就是「方向 → 面 + 面内 uv」，
 * 与 `equirect_to_cubemap.py` 的 basis 表完全一致（那套是标准 OpenGL cube 约定）。
 *
 * ⚠️ **VERT / FRAG 模板字面量里不许写中文**——lint-copy 扫的是字符串字面量，
 * GLSL 注释不在豁免里（它是字符串内容，不是 JS 注释）。推导与教训都写在本注释
 * 与 globe3dMath.ts 文件头里，shader 内部只留英文短注。
 *
 * ⚠️ **three r186 的 ShaderMaterial 会自动做 GLSL3 转换**（源码
 * `if (parameters.isRawShaderMaterial !== true)` 那段）：
 *   `varying` → `in`、`gl_FragColor` → `pc_fragColor`、`textureCube/2D` → `texture`，
 *   且 prefix 里已经给了 `precision` 与 `linearToOutputTexel()`。
 *   → 所以这里**不要自己写 `precision`**（会与 prefix 重复声明而编译失败），
 *     而 `#include <colorspace_fragment>` 可以正常用（会被 `resolveIncludes` 展开）。
 *   采样直接写 `texture(uCube, d)`（GLSL3 的 `texture` 对 samplerCube 合法，
 *   不必依赖 `textureCube` 那个 define）。
 *
 * 用 `position` 而不是 `normal` 传方向：球心在原点、半径 1，两者同向；
 * 用位置还完全避开 normalMatrix 在非均匀缩放下的失真。
 *
 * `uSpin` / `uTilt`：**采样方向**的两步旋转（弧度）——不是顶点世界位置！
 * 取值是叠层世界变换 M = Rx(φ₀)·Ry(r) 的**逆**：uTilt = −rotLat、uSpin = −rotLng，
 * 应用顺序是先 Rx（倾角）后 Ry（自转）。两个要点各钉在一处：
 *   ① 取逆：屏幕方向 n 该采的贴图方向是 M⁻¹·n。把正变换当采样方向 =
 *      默认位姿中心采到 97°W 的墨西哥、拖拽时画布内容与叠层反向等速
 *      （小饼 2026-10-05 报的「地球跟着鼠标反方向移动」）。
 *   ② 顺序：Ry / Rx 不可交换。数学断言只在「两角都够大」时有牙，小角退化
 *      （Ry/Rx 近可交换）由源码级顺序钉兜底——globe3d-orientation.test.mts
 *      的结构约束守卫。
 * 完整推导与两个已删旧约定（−90° 偏移、正号 + 先 Ry 后 Rx）见 globe3dMath.ts
 * 文件头。
 */
const VERT = /* glsl */ `
uniform float uSpin;
uniform float uTilt;
varying vec3 vDir;
varying vec3 vNrm;
void main() {
  // Geometry never rotates; only the SAMPLING direction takes the pose.
  // Rotating geometry and direction together cancels out on a sphere (it is
  // symmetric): screen-pixel -> world-direction stays identical, so the texture
  // would never change. gl_Position therefore uses the raw position.
  //
  // vDir is NOT the vertex world position -- it is the cube direction this
  // screen pixel must sample: d(n) = M^-1 * n = Ry(-rotLng) * Rx(-rotLat) * n,
  // the INVERSE of the overlay transform M = Rx(rotLat) * Ry(rotLng) (see the
  // globe3dMath.ts header for the derivation).
  // Step 1: tilt (uTilt = -rotLat)
  float cx = cos(uTilt);
  float sx = sin(uTilt);
  vec3 d = vec3(position.x, position.y * cx - position.z * sx, position.y * sx + position.z * cx);
  // Step 2: yaw (uSpin = -rotLng). Order = factorization order of M^-1; Ry and
  // Rx do not commute (source-level order pinned in the orientation test).
  float cy = cos(uSpin);
  float sy = sin(uSpin);
  vec3 dir = vec3(d.x * cy + d.z * sy, d.y, d.z * cy - d.x * sy);
  vDir = normalize(dir);
  // vNrm = the SCREEN-space surface normal (sphere centred at origin, radius 1,
  // geometry transform is identity, so the raw position IS that normal).
  // It must NOT be vDir: vDir carries the pose, and lighting with it would glue
  // the terminator to the continents while dragging. Screen-space lighting
  // matches globe.html, whose lights live in scene space.
  vNrm = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform samplerCube uCube;
uniform float uLightMode;   // 0 = night (sphere cues only), 1 = day (globe.html recipe)
uniform vec3  uRimLin;      // rim colour, already decoded to LINEAR space
uniform vec4  uNight;       // x limb floor, y rim start, z rim width, w rim gain
uniform vec4  uDay;         // x ambient, y key gain, z rim gain
uniform vec3  uKeyDir;      // day key light direction (normalized, screen space)
uniform vec3  uRimDir;      // day rim light direction (normalized, screen space)
varying vec3 vDir;
varying vec3 vNrm;

void main() {
  // texture() already yields LINEAR values: three uploads this CubeTexture with
  // colorSpace = SRGBColorSpace, i.e. the SRGB8_ALPHA8 internal format, so the
  // hardware decodes on sample. Lighting is therefore a plain linear-space
  // multiply/add, and the single encode stays in colorspace_fragment below.
  // ⚠️ Order matters: encoding FIRST and adding the rim after overshoots by up
  // to 76/255 at the limb (the encoder amplifies small linear values). The CPU
  // path bakes both stages into lookup tables for the same reason -- see the
  // globeLight.ts header.
  vec3 texel = texture(uCube, vDir).rgb;
  vec3 n = normalize(vNrm);
  float mul;
  float add;
  if (uLightMode < 0.5) {
    // Night: no directional term at all. The night composite already means
    // "night everywhere"; a max(0, n.L) term would declare half the planet
    // daytime and wipe out half the world's city lights.
    // No rim either: uNight.w (= rimGain) is 0 (user ruling 2026-10-06:
    // no halo around the outer edge), so add is identically 0 while the limb
    // keeps the disc reading as a sphere. The expression stays shaped like the
    // CPU inline version so the three copies cannot drift.
    mul = uNight.x + (1.0 - uNight.x) * n.z;
    float t = clamp((length(n.xy) - uNight.y) / uNight.z, 0.0, 1.0);
    add = uNight.w * t * sqrt(t);
  } else {
    mul = uDay.x + uDay.y * max(0.0, dot(n, uKeyDir));
    add = uDay.z * max(0.0, dot(n, uRimDir));
  }
  gl_FragColor = vec4(texel * mul + uRimLin * add, 1.0);
  #include <colorspace_fragment>
}
`

// ⚠️ FRAG 内部只许写英文：它被 lint-copy 当字符串扫，中文会被判成「硬编码文案残留」
// （`scripts/lint-copy.mjs`，2026-10-06 实测把上面夜档那段中文备注顶出来了）。
// 用户那句原话是「外层不要加光圈」= 夜档 rimGain 置 0，理由与量值见 globeLight.ts。

function createInstance(canvas: HTMLCanvasElement): Globe3DInstance | null {
  // WebGLRenderer 构造时向 canvas 要 webgl2 上下文，拿不到直接 throw——统一折返回
  // null，调用方回退软渲染。此刻 canvas 上还没有任何 2d context（GlobeStage 在后端
  // 未决时不下场画 2d），上下文类型互斥的坑已被时序挡住。
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  // 球盘外透明：星与锚点叠层透出来（软渲染的 vis 掩码外像素不动 = 同一语义）
  renderer.setClearColor(0x000000, 0)
  const geometry = new THREE.SphereGeometry(1, 96, 64)
  const uniforms = {
    uCube: { value: null as THREE.CubeTexture | null },
    uSpin: { value: 0 },
    uTilt: { value: 0 },
    /** 0 = 夜档、1 = 日档（见 globeLight.ts）。分支在片元里是**一致分支**
     *  （uniform 驱动，一个 draw call 里所有片元同值），代价可忽略 */
    uLightMode: { value: 0 },
    /** 边缘光的**线性**色：uRimLin * add 是线性空间的加性项，别用 sRGB 值去乘 */
    uRimLin: { value: new THREE.Vector3(...GLOBE_RIM_LIN) },
    /** 夜档：x 临边下限、y 边缘光起点、z 带宽、w 强度（w 现为 0，见 applyLight） */
    uNight: { value: new THREE.Vector4() },
    /** 日档：x ambient、y key 强度、z 边缘光强度、w 备用 */
    uDay: { value: new THREE.Vector4() },
    uKeyDir: { value: new THREE.Vector3() },
    uRimDir: { value: new THREE.Vector3() },
  }
  /**
   * 把某一档的配方塞进 uniform。**数值全部从 globeLight.ts 读**——那边是唯一真源，
   * 这里只是搬运工；在 shader 里再抄一遍常量就等于给自己留了一个会漂的副本
   * （CPU 档与 GPU 档画出来的球不一样，而且只有肉眼看得出）。
   */
  const applyLight = (mode: GlobeEarth): void => {
    if (mode === 'night') {
      const r = GLOBE_LIGHT_RECIPE.night
      uniforms.uLightMode.value = 0
      // w = rimGain = 0（2026-10-06 起夜档不加边缘光）→ 片元里 add ≡ 0，
      // 只剩临边衰减。这里照搬配方，**别在 shader 里写死 0**：两处不一致时只有肉眼看得出。
      uniforms.uNight.value.set(r.limbFloor, r.rimStart, r.rimWidth, r.rimGain)
      return
    }
    const r = GLOBE_LIGHT_RECIPE.day
    uniforms.uLightMode.value = 1
    uniforms.uDay.value.set(r.ambient, r.key, r.rimGain, 0)
    uniforms.uKeyDir.value.fromArray(r.keyDir as unknown as number[])
    uniforms.uRimDir.value.fromArray(r.rimDir as unknown as number[])
  }
  // 初始 = **恒等光照**（mul ≡ 1、add ≡ 0）：create 与 setLight 之间若落了帧，画出来的
  // 就是未补光照的原图（= 补光照之前的样子），是最安全的中性值。真档位由 GlobeStage 在
  // create 之后立刻用 `prefs.globeEarth` 顶进来（见 setLight）。
  // ⚠️ 两个分支都必须是恒等——uLightMode 选中哪一支都不许先替用户染一层：
  //   night：limbFloor=1 → limb ≡ 1（zm 项乘 0）；rimGain=0 → t 再大也不加。
  //   day：ambient=1、key=0 → mul ≡ 1；rimGain=0 → add ≡ 0。
  uniforms.uNight.value.set(1, 1, 1, 0)
  uniforms.uDay.value.set(1, 0, 0, 0)
  let lightMode: GlobeEarth | null = null
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    // 透明：球外像素走 alpha=0，叠层（星/锚点 SVG）才透得出来
    transparent: true,
  })
  const mesh = new THREE.Mesh(geometry, material) // 位姿不转几何：mesh/group 只是挂载点
  const group = new THREE.Object3D() // （倾角/自转全在 shader 的采样方向里，见 VERT 注释）
  group.add(mesh)
  const scene = new THREE.Scene()
  scene.add(group)
  // 正交相机 = projectLatLon 同款投影，锚点才逐点压在球面上；半径 1 = 取景半高 1，
  // 球缘顶满画布四边（.momo-globe-canvas 100%×100% + border-radius:50% 的既有口径）
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 2

  // 渲染目标自检：clientWidth × DPR 变了才重设（缩放 / resize / 跨屏都从这进）。
  // 每帧读 clientWidth 会强制 layout，但渲染只在位姿变化时发生（按需渲染），
  // 且拖拽路径本来就每帧读一次 clientWidth（dragPose 的分母），同一笔账不新增。
  //
  // ⚠️ **首帧必须能穿过「未布局」这一关**（2026-10-05 踩实）：`create()` 在
  //    `loadGlobe3D().then` 里跑，那一刻 canvas 可能刚挂上还没 layout
  //    （`clientWidth === 0`）——旧实现遇 0 直接 return，于是 **drawing buffer
  //    一直停在 three 的默认 300×150**，而 CSS 把这个小缓冲拉到几百 px，
  //    画面被拉伸 + 大半个球落在缓冲外 → **看起来就是一片黑**。
  //    现在的口径：0 尺寸时用**上一次的 CSS 尺寸**兜底（首次还没有值时用固定 300）。
  //    BUG-150：兜底**不能**读 `canvas.width`——那是已乘过 DPR 的物理像素，
  //    `setSize` 会再乘一次 DPR，隐藏期间（render / 贴图完成的 paint 都会调
  //    syncSize）逐次放大到 2048²，白占大块 WebGL 缓冲。lastW/lastH 记的是 CSS 尺寸。
  let lastW = 0
  let lastH = 0
  let lastDpr = 0
  const syncSize = (): boolean => {
    let w = canvas.clientWidth
    let h = canvas.clientHeight
    if (w === 0 || h === 0) {
      // 未布局：用上一次的 CSS 尺寸兜底（无值 = 300），不 return，避免缓冲锁死在默认尺寸
      w = lastW || 300
      h = lastH || 300
    }
    const dpr = window.devicePixelRatio || 1
    if (w === lastW && h === lastH && dpr === lastDpr) return true
    lastW = w
    lastH = h
    lastDpr = dpr
    const scale = Math.min(dpr, MAX_BACKING_SIZE / Math.max(w, h))
    renderer.setPixelRatio(scale)
    // 非正方形取景时球仍取短边满幅（正方画布下不走这两支，防御性保圆不变形）
    if (w >= h) {
      camera.left = -w / h
      camera.right = w / h
      camera.top = 1
      camera.bottom = -1
    } else {
      camera.left = -1
      camera.right = 1
      camera.top = h / w
      camera.bottom = -h / w
    }
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false) // false = 不碰 style：展示尺寸归 CSS（--globe-zoom 真尺寸）
    return true
  }
  // create 当场跑一次：把缓冲尺寸从「three 默认 300×150」推到真实尺寸。
  // 此刻若还没布局，上面那条兜底会先用属性尺寸定一版，之后每次 render 的自检
  // 会在真实尺寸出现时再纠正一次（lastW/lastH 变了 → 重设）。
  syncSize()

  /** 最近一次渲染的位姿：上下文恢复后按它补一帧（按需渲染，没人会再来叫 render） */
  let lastPose: readonly [number, number] | null = null

  const render = (lat: number, lng: number): void => {
    lastPose = [lat, lng]
    // ⚠️ 尺寸自检**放在贴图判定之前**（2026-10-05）：旧顺序里没贴图就 return，
    //    连带 syncSize 也跑不到，drawing buffer 会一直停在 three 的默认小尺寸。
    //    现在无论有没有贴图，每次 render 都先把缓冲尺寸对齐一次（幂等，无额外开
    //    销：尺寸没变时 syncSize 内部直接短路）。
    syncSize()
    if (uniforms.uCube.value === null) {
      return // 贴图没到：软渲染首帧前也是空白，同一节奏
    }
    // 位姿只进 shader uniform，**不动 group.rotation**（见 VERT 顶部注释：
    // 转几何会与转方向恒等抵消）。group 保留恒等变换——它是 scene→mesh 的
    // 挂载点，也留着以后要加真几何动画（如球面外元素）时的位置。
    // tiltRad / yawRad 内部取负（采样 = 叠层世界变换的逆，推导见 globe3dMath
    // 文件头）：这里原样传 store 位姿，别在这里再乘 −1。
    uniforms.uTilt.value = tiltRad(lat)
    uniforms.uSpin.value = yawRad(lng)
    // ⚠️ **must set `uniformsNeedUpdate` every frame**（2026-10-05 踩实）：
    //    three 只在「材质变了 / program 变了」时刷 ShaderMaterial 的 uniforms
    //    （源码 `if ( material.id !== _currentMaterialId ) refreshMaterial = true`）。
    //    同一个材质连续渲染时 refreshMaterial 为 false → **uSpin 冻结**，表现为
    //    「转球没反应 / 每个视角渲染出同一张图」。这条是唯一的补刷入口
    //    （`if ( material.isShaderMaterial && material.uniformsNeedUpdate === true )`）。
    material.uniformsNeedUpdate = true
    renderer.render(scene, camera)
  }

  // 运行期 GPU 上下文丢失（BUG-122b：长命 Electron 进程里是现实事件——驱动重置 / 休眠唤醒 /
  // 上下文数超限）。three 自己挂了 lost（preventDefault，允许浏览器恢复）与 restored
  // （重建 GL 状态）两个监听；它管不了的是**按需渲染**这一层：恢复之后没有人再来叫 render，
  // 球停在黑屏直到用户碰它。这里补两件事：丢失记一条日志（可 grep，按 AGENTS §2.4 不进字典），
  // 恢复后让贴图重新上传、按最后的位姿补一帧。
  // 不降级到软渲染：同一个 canvas 上 2d 与 webgl2 上下文互斥（GlobeStage 的 backend3dRef 纪律）。
  const onContextLost = (): void => {
    console.debug('[Momo] 星球 WebGL 上下文丢失，等待浏览器恢复')
  }
  const onContextRestored = (): void => {
    console.debug('[Momo] 星球 WebGL 上下文已恢复，补画一帧')
    lastW = 0 // 尺寸自检重跑：恢复后的 drawing buffer 未必还是原尺寸
    const cube = uniforms.uCube.value
    if (cube) cube.needsUpdate = true
    material.needsUpdate = true
    if (lastPose) render(lastPose[0], lastPose[1])
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  return {
    render,
    setTexture(tex) {
      // cube map（2026-10-04）：六面各回填一张画布 → CubeTexture。极点落在
      // **+Y/-Y 面正中**，天然无等距圆柱的极点奇异（这正是换 cube 的理由）。
      //
      // 六面尺寸不齐时 CubeTexture 会异步抛 GL 错（try/catch 拦不住，球黑），
      // globeTexture.loadGlobeCube 已判过；这里再稳一道，不合格直接不换。
      if (tex.faces.length !== 6 || tex.size <= 0) {
        return
      }
      const tiles = tex.faces.map((data) => {
        const cv = document.createElement('canvas')
        cv.width = tex.size
        cv.height = tex.size
        const ctx = cv.getContext('2d')
        if (!ctx) throw new Error('globe3d: no 2d context')
        ctx.putImageData(new ImageData(data, tex.size, tex.size), 0, 0)
        return cv
      })
      // three.js CubeTexture 的构造顺序 = +X,-X,+Y,-Y,+Z,-Z（与 px/nx/py/ny/pz/nz 对齐）
      const t = new THREE.CubeTexture(tiles as unknown as HTMLImageElement[])
      t.colorSpace = THREE.SRGBColorSpace // 不设会被当线性色输出，整体发灰
      // ① needsUpdate 必设：three 的上传入口判 `source.version`，而 Texture 的
      //    setter 会级联到 source（`this.version++; this.source.needsUpdate = true`）——
      //    不顶这一下纹理永远不上 GPU，球是纯黑的（且没有任何报错）。
      // ② 关 mipmap：CubeTexture 默认 minFilter 带 mipmap，上传时还要跑一次
      //    glGenerateMipmap——那正是本机记过的 cube 异步失败现场
      //    （`GL_INVALID_VALUE`，球黑且 try/catch 拦不住）。球是顶满画布的正交
      //    投影，实际落在放大侧，线性过滤足够，不需要 mip 那一级。
      t.generateMipmaps = false
      t.minFilter = THREE.LinearFilter
      t.magFilter = THREE.LinearFilter
      t.needsUpdate = true
      uniforms.uCube.value?.dispose()
      uniforms.uCube.value = t
      material.needsUpdate = true
    },
    setLight(mode) {
      // 档位没变就早退：applyLight 会写 uniform，但**不置 uniformsNeedUpdate 也不
      // 主动重绘**——换档的重绘由调用方（GlobeStage）负责，这里只负责把参数摆好。
      if (mode === lightMode) return
      lightMode = mode
      applyLight(mode)
      material.uniformsNeedUpdate = true
    },
    dispose() {
      // 先摘监听：下面的 forceContextLoss 会派 webglcontextlost，别把主动释放记成「丢失」
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      geometry.dispose()
      uniforms.uCube.value?.dispose()
      material.dispose()
      renderer.dispose()
      // 星球视图切走即卸载，一次会话可能反复进出：主动丢上下文，别攒到 Chromium
      // 的上下文数上限把页面其它 WebGL 用途挤掉（forceContextLoss 幂等，可重复调）
      renderer.forceContextLoss()
    },
  }
}

const factory: Globe3DFactory = { create: createInstance }

// IIFE 产物唯一的对外面：main.js 经 globe3dLoader 读这个全局。
// scripts/globe3d-deploy.test.mts 拿它当产物完整性标记（构建半途而废的文件没有它）。
;(globalThis as { __momoGlobe3D?: Globe3DFactory }).__momoGlobe3D = factory
