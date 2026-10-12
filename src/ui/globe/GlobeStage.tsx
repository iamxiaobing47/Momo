import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { locNodeCovers, locOverlappingFilterKey } from '../../momo/locations'
import { GLOBE_TWEEN_MS, GLOBE_VIEW, easeInOutCubic, focusPoseFor, samePose, tweenPose } from './globeMath'
import {
  GLOBE_CANVAS_SIZE,
  halveCube,
  renderFrame,
  type GlobeCube,
} from './globeRender'
import { loadGlobeCube } from './globeTexture'
import { globeLightFor } from './globeLight'
import { loadGlobe3D, createBackendSafe } from './globe3dLoader'
import type { Globe3DInstance } from './globe3dTypes'
import { GlobeSurface, frameSizeFor } from './globeSurface'
import {
  gestureDown,
  gestureMove,
  gestureUp,
  ZOOM_MAX,
  zoomCapFor,
  zoomFor,
  type GlobeAnchorItem,
  type GlobeDrag,
} from './globeGesture'
import { locScrollerOf } from '../locations/locScroll'
import { GlobeOverlay } from './GlobeOverlay'

// 星球舞台（F7）：canvas 画球 + SVG 叠锚点，拖拽 / 滚轮缩放 / 选中转向三件事。
//
// 这一层只做**接线**，能力各在自己文件里（换宿主时照这几条搬）：
//   globeMath      投影与位姿纯函数（含拖拽灵敏度、转向缓动）
//   globeRender    静态表 + 每帧平移采样（球面 → 屏幕像素的映射；软渲染档）
//   globeSurface   表缓存与「运动档 / 静止档」两套分辨率（无 React、无 DOM；软渲染档）
//   globeGesture   指针序列 → 位姿 / 命中（无 React、无 DOM 事件）
//   globeTexture   贴图解码（唯一碰 DOM 的一环）
//   globe3d*       GPU 档：位姿映射（globe3dMath）、独立 chunk 舞台（globe3dStage，
//                  three.js，不进 main.js）、script 装载器（globe3dLoader）
// 剩下必须住在这里的：store 读写、后端定档与 paint 分发、canvas 尺寸与
// putImageData（软渲染档）、React 事件、rAF。
//
// **双后端**（2026-10-04 起）：globe3d.js（three.js）装载成功且 WebGL 可用 →
// GPU 档（paint 全量转发给 Globe3DInstance.render，运动档降分辨率 / 签名跳帧 /
// mip 那套都不需要——一帧一个球的 GPU 成本≈0）；装载失败 / WebGL 拿不到 / 没有
// caps 的测试环境 → 原软渲染档，一行行为不变。两条路共用位姿（store）、手势、
// 叠层与贴图解码管线，切换只发生在 paint 一处。
//
// **每帧渲染怎么走**（2026-10-02 性能重排）：
//   拖拽与转向的每一帧都在 rAF 回调里**先 paint（建表 + 采样 + putImageData）
//   再写 store**。旧写法是反过来——paint 住在 commit 之后的 useEffect 里，
//   React 的被动 effect 要等浏览器画完才跑：叠层（SVG，随提交同步）已经在新位姿，
//   画布还停在上一帧，球比光点慢半拍；而 effect 里那次画与「下一帧 rAF 里的画」
//   各建一张表，60fps 下就是双倍 CPU。现在画布与叠层同一个 tick 到位，
//   那个兜底 effect 只服务「没有交互者也变了」的情况（挂载 / 贴图到达 /
//   moving 翻转），paint 内部按签名跳过，绝不会把同一帧画两遍。
//
// 数据流（store 是位姿唯一真源，组件不私藏）：
//   locGlobeLat / locGlobeLng ← 拖拽与转向 tween 都写回 store（setGlobePose）；
//   locJumpSeq 是「转向」的唯一信号——点球上光点（与侧栏「全部地点」树共用
//   toggleLocation）都会顶一次序号，转不转向只由下面那一个 effect 说了算。
//
// 运动档（moving）：拖拽中或转向中都把画布降到 GLOBE_MOVING_SIZE——
//   倾角每帧都在变、静态表跟着每帧重算（缓冲复用，见 globeSurface），满档 560²
//   一帧就够把 60Hz 预算吃穿（实测最坏一帧 16.6~17.2ms）。停下那一刻再以 560²
//   重画一帧，清晰度不折。运动期还把贴图换成半尺寸（mip）：400² 配 1024²/面的
//   cube 是 5.12 texel/px，点采样走样会让灯光在转动时闪（见 globeRender.halveCube）。
//
// 滚轮缩放仅在宽布局启用（matchMedia 镜像 95-responsive.css 的堆叠断点，
// 见 GlobeView 挂载处传入的 zoomable）；窄布局下面板自身可能就在滚动，
// 截滚轮会把「滚列表」变成「放大星球」。
//
// 缩放怎么落地：**只把系数交给 CSS**（style 上的 --globe-zoom，宽高由
// 60-design.css 的 calc(400px · zoom) 一起长）。曾经这里是 transform: scale()——
// 布局盒子不跟着长，球放大到 1.5× 就溢出卡片、被 .momo-globe-card 的 overflow: hidden
// 沿卡沿切掉（2026-10-01 用户报「地图扩大之后，地球会被遮盖」）。改成真尺寸后
// 卡片随之长高、球永远完整，命中换算 / 拖拽灵敏度 / 画布缓冲利用率三处自动跟上，
// 而 CSS 尺寸变化不触发重绘（重绘只吃贴图 / 位姿 / moving），放大本身零渲染成本。
// 上限由 zoomCapFor 按取景框夹取，别让它长到把面板视口吃光。

function GlobeStageInner({
  anchors,
  zoomable,
  active,
  onTextureFailed,
}: {
  anchors: readonly GlobeAnchorItem[]
  zoomable: boolean
  /** 当前是否可见（星球视图常驻、切走时隐藏）：隐藏时不画，显示那一拍补一帧 */
  active: boolean
  /** 贴图解码的成败（BUG-122b）：手上一颗球都没有时报 true，GlobeView 据此出说明条 */
  onTextureFailed?: (failed: boolean) => void
}): React.JSX.Element {
  // 回调走 ref：贴图 effect 的依赖只认 paint 与档位，换个回调引用不该撤掉在途的解码
  const onTextureFailedRef = useRef(onTextureFailed)
  onTextureFailedRef.current = onTextureFailed
  // BUG-168b：active 的 ref 镜像（与 movingRef / zoomRef 同款）。「画不画」的判据
  // 原来只落在兜底 effect 一处（`if (active) paint(...)`），交互路径（拖拽 / 转向 /
  // 补完帧）径直 paint——切走视图后 tween 的 rAF 没人打断（跳转 effect 的依赖只有
  // locJumpSeq、cleanup 不跑），剩余 ~20 帧每帧在 display:none 的画布上做一次
  // fillGlobeTable(400²) ≈6ms + renderFrame + putImageData，外加一次 React 提交
  // 让 GlobeOverlay 对全库锚点重跑投影。视觉上唯一的关联点（切回星球视图时 tween
  // 还在跑）正是希望的行为，所以只闸 paint、不打断 tween。
  const activeRef = useRef(active)
  activeRef.current = active
  const rotLat = useUi((s) => s.locGlobeLat)
  const rotLng = useUi((s) => s.locGlobeLng)
  const globeEarth = useUi((s) => s.globeEarth)
  const filterLocations = useUi((s) => s.filterLocations)
  const locJumpSeq = useUi((s) => s.locJumpSeq)
  const setGlobePose = useUi((s) => s.setGlobePose)
  const toggleLocation = useUi((s) => s.toggleLocation)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** ImageData 按尺寸各留一张：两档来回切时不再反复 new（560² 一张 1.25MB，
      之前每拖一轮都要在松手那一刻分配一次——正好落在用户最敏感的那一帧） */
  const imgsRef = useRef(new Map<number, ImageData>())
  const surfaceRef = useRef<GlobeSurface | null>(null)
  // 惰性单例：useRef 的初值表达式每次渲染都会求值（map 白建），这里只要一个
  surfaceRef.current ??= new GlobeSurface()
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  /**
   * 解码后的贴图 / 运动档半尺寸：只住 ref 不住 state——它们不进 JSX，进 state
   * 只会多触发一次整棵树重渲，而「首帧之前那次重渲」一个观众都没有。
   * 代价是 paint 与几个回调都从 ref 里取（见下方 paint）。
   */
  const texRef = useRef<GlobeCube | null>(null)
  /**
   * 三维后端（three.js 档，globe3d.js 惰性装载）：undefined = 未决（脚本装载中）；
   * null = 不可用（装载失败 / WebGL 上下文拿不到）→ 走下面的软渲染路径；
   * 实例 = GPU 档。未决期间 paint 是空操作——**不许**先在 canvas 上建 2d context：
   * 2d 与 webgl2 上下文互斥，抢先画 2d 会把 3D 档永久堵死，回退判定只有一次机会。
   */
  const backend3dRef = useRef<Globe3DInstance | null | undefined>(undefined)
  /** 运动档贴图（每面降一半尺寸）：400² 画布配 1024²/面 的 cube 是 5.12 texel/px，
      点采样必走样、转动时灯光会闪（量过，见 halveCube 注释） */
  const mipRef = useRef<GlobeCube | null>(null)
  /**
   * 画布上当前这一帧的签名（lat / lng / size / 用的哪张贴图）。paint 直接画完
   * 就记下它；commit 之后的兜底 effect 见到同一个签名就跳过——一帧只建一张表。
   */
  const drawnRef = useRef<{ lat: number; lng: number; size: number; tex: GlobeCube } | null>(null)
  const dragRef = useRef<GlobeDrag | null>(null)
  /**
   * BUG-81d：双指捏合（触屏缩放的唯一入口——滚轮只在宽布局，touch-action:none
   * 又封了浏览器双指缩放，旧实现第二根手指直接被 gestureDown 丢弃，捏合时球
   * 反而照着第一指拖转）。登记两指的 id 与**当前位**，缩放比 = 距离比；旋转
   * 照旧由 A 指驱动。null = 没在捏合。
   */
  const pinchRef = useRef<{
    a: number
    b: number
    ax: number
    ay: number
    bx: number
    by: number
    dist0: number
    zoom0: number
  } | null>(null)
  const rafRef = useRef(0)
  /**
   * 当前这一段转向 tween 的目的位姿（没在转 = null）。
   *
   * BUG-136c：取消一枚地点筛选**不发起**新转向（BUG-122a），但旧实现里
   * `onPointerDown` 会把在飞的 rAF 直接 cancel 掉，接着 effect 又在 `isRemoval`
   * 处早退——球于是停在一个**没有任何选择能解释**的角度上，而且位姿是会话态
   * （`setLocView` 明确保留它），跨切视图 / 切密度一直留着。
   * 双击同一枚光点（选中 → 再点取消）正好踩中：第二下的 `pointerdown` 杀掉第一下
   * 起的转向。修法是「按下不再杀 tween」（见 onPointerMove），而真被跳转打断时
   * 把这一段**补完**——用户上一动作要去的那个地方是明确的（见 interruptedRef）。
   */
  const turnToRef = useRef<{ lat: number; lng: number } | null>(null)
  /**
   * 被跳转打断的那一段 tween 原本要去哪（cleanup 写入，下一次 effect 消费一次）。
   *
   * 只在「取消筛选」这一支用它补完（其余支要么起新 tween 接管、要么拖拽接管）；
   * 消费即清，避免陈值影响后续的取消。
   */
  const interruptedRef = useRef<{ lat: number; lng: number } | null>(null)
  /** 球在动（拖拽中 / 转向中）：降分辨率换帧率，见文件头 */
  const [moving, setMoving] = useState(false)
  /** moving 的 ref 镜像：rAF / 空闲回调里要读「此刻还在不在动」，
      那里看到的 state 是某次渲染的快照，会旧一帧（setMovingBoth 同步维护它） */
  const movingRef = useRef(false)
  /** 改运动态的唯一入口：state 给叠层用，ref 给 rAF / 空闲回调用 */
  const setMovingBoth = (v: boolean): void => {
    movingRef.current = v
    setMoving(v)
  }
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  /**
   * 地球档（`prefs.globeEarth`）的 ref 镜像：`paint` 的依赖是空的（用 useCallback
   * 钉住引用，见它的注释），读不到闭包里的档位，每帧又都要用它取光照表——所以走
   * ref，与 zoomRef 同一个理由。由下面那个同步 effect 维护。
   */
  const earthRef = useRef(globeEarth)

  // BUG-69d：给 GlobeOverlay 的位姿对象钉住引用。内联字面量每次渲染都是新对象，
  // memo 过的叠层会被它无谓作废；位姿真变了（拖拽 / 转向）才换引用、才重渲叠层。
  const overlayPose = useMemo(() => ({ lat: rotLat, lng: rotLng }), [rotLat, rotLng])

  /**
   * 画一帧（本组件唯一碰 canvas 的地方）：定尺寸 → 取表 → 采样 → putImageData。
   * 签名与画布上当前这一帧相同就原样返回——交互路径（拖拽 / 转向）已经画过它，
   * commit 后的兜底 effect 靠这个跳过，不会把同一帧画两遍。
   *
   * 只读 ref（贴图 / mip / canvas / 缓存 / zoom），所以用 useCallback 钉住引用：
   * texture effect 把它放依赖里才不会每渲染重跑一次（重跑会撤销排上的空闲回调）。
   *
   * 缩放经 `zoomRef` 读而不是入参：静止档的画布随放大在 stillSizeFor 的三档之间
   * 换档（560 / 720 / 880），再乘 `devicePixelRatio` 并封顶 880（2× 屏默认 zoom
   * 也够 1.1× 设备像素）。换档就是换 `size`——`drawnRef` 的签名里带 size，
   * 所以档位变了自然重画，档位内连续滚轮则一帧都不多画。
   */
  const paint = useCallback((lat: number, lng: number, isMoving: boolean): void => {
    const canvas = canvasRef.current
    const tex = texRef.current
    if (!canvas || !tex) return
    const b3d = backend3dRef.current
    if (b3d === undefined) return // 后端未决：等它定档（见 backend3dRef 注释）
    if (b3d) {
      // GPU 档：软渲染的「签名跳帧」纪律不搬过来——一帧一个球的 GPU 成本≈0，
      // 重复画无害，而实例的尺寸 / DPR / 缩放自检恰恰需要每次 render 都跑
      // （globe3dStage.render 的注释）。运动档降分辨率也不存在，isMoving 只剩
      // 「叠层淡入淡出」一个观众。
      b3d.render(lat, lng)
      return
    }
    const size = frameSizeFor(isMoving, zoomRef.current, window.devicePixelRatio || 1)
    const use = isMoving ? (mipRef.current ?? tex) : tex
    const drawn = drawnRef.current
    if (drawn && drawn.lat === lat && drawn.lng === lng && drawn.size === size && drawn.tex === use) return
    if (canvas.width !== size) {
      canvas.width = size
      canvas.height = size
    }
    const ctx = ctxRef.current ?? canvas.getContext('2d')
    if (!ctx) return
    ctxRef.current = ctx
    let img = imgsRef.current.get(size)
    if (!img) {
      img = ctx.createImageData(size, size)
      imgsRef.current.set(size, img)
    }
    const table = surfaceRef.current?.tableFor(lat, size, isMoving)
    if (!table) return
    // 光照只在软渲染档逐帧参与（GPU 档是材质里的 uniform，一次设定每次绘制都生效）：
    // globeLightFor 命中模块级缓存，逐帧调用只是一次 Map.get。光照与**位姿无关**
    // （灯跟着相机），所以「哪一档」是唯一输入，不进 tableFor 的缓存键。
    renderFrame(use, table, lng, img, globeLightFor(earthRef.current))
    ctx.putImageData(img, 0, 0)
    drawnRef.current = { lat, lng, size, tex: use }
  }, [])

  // 兜底重绘：位姿 / 运动态变了就画一帧。交互路径（拖拽 / 转向）已在 rAF 里画过
  // 同一帧（paint 按签名跳过），这里只剩「没有交互者也变了」的情况——挂载、
  // 贴图到达、moving 翻转。都不变时零重绘（idle 不烧 rAF）。
  //
  // zoom 也在依赖里：CSS 那头已经把盒子放大了，静止档的画布要跟着 stillSizeFor
  // 换档，不重画就还是旧分辨率——「放大后变糊」。
  useEffect(() => {
    if (active) paint(rotLat, rotLng, moving)
  }, [rotLat, rotLng, moving, zoom, active])

  // 贴图与光照**都按档走**（`prefs.globeEarth`）：贴图只解码一次（切进星球视图 →
  // 拖拽 → 切走再回来都不重解码；换档则是另一套 URL，自然另解码一次）。六面 URL 由
  // caps 按档给（插件目录下的独立产物，不再内联进 main.js——那 1.95MB base64 把 bundle
  // 抬到 2.7MB，插件 onload 的 parse+eval 实测 ~50ms 里它占大头）；没有 caps 的
  // 环境（jsdom 测试 / 截图 harness）拿不到 URL，直接不画球，只留 SVG 叠层。
  //
  // 三维后端（globe3d.js）与贴图**并行**装载，但第一帧要等两边都就绪：后端未决时
  // paint 是空操作（2d / webgl2 上下文互斥，回退判定只有一次机会，见
  // backend3dRef）。GPU 档首帧因此比软渲染晚一次 idle（贴图要过 putImageData 上
  // GPU），换来的是零 CPU 光栅化；首装的 script 装载（几百 ms）与解码重叠，实际
  // 到球时间由两者较慢者决定。后端定档失败 / WebGL 拿不到 → 本会话内软渲染兜底，
  // 用户无感。
  useEffect(() => {
    let alive = true
    let idleHandle: number | null = null
    const st = useUi.getState()
    const urls = st.caps?.globeCubeUrls?.(globeEarth) ?? []
    if (urls.length !== 6) return
    // 换档（已经建过实例）：光照**立刻**切，不等新贴图到位。那 ~40ms 里画出来的是
    // 「新光照 + 旧贴图」，比「旧光照 + 新贴图」好得多（夜灯配日地球的强受光会把
    // 城市灯光整片洗掉，而日地球配夜档的临边衰减只是暗一点）。贴图随后由 finish 换。
    backend3dRef.current?.setLight(globeEarth)
    // 换档时旧档的半尺寸 mip 必须作废：软渲染运动档会拿 `mipRef ?? tex`，
    // 留着就是拿上一档的半尺寸图去画这一档（脏得看不出来源）。
    mipRef.current = null
    const backendReady = loadGlobe3D(st.caps?.globe3dUrl?.() ?? '').then((factory) => {
      if (!alive) return
      // ⚠️ **只在未决时 create**：本 effect 的依赖里有档位，换档会重跑，而同一个
      //    canvas 上的 webgl2 上下文只有一个（getContext 按类型幂等、返回同一个），
      //    再包一层 WebGLRenderer 就是两个渲染器管同一份上下文，dispose 谁都错。
      if (backend3dRef.current === undefined) {
        // create 内部兜 WebGL 失败返回 null（jsdom / 禁 GPU 等）；装载失败 factory
        // 本身就是 null——两条路都落到软渲染档。
        // BUG-183b：create **抛错**（而非按契约返回 null）也要走同一条回退——旧实现
        // 让它冒成 rejection：Promise.all 进 .catch 报「贴图解码失败」（口径不符，
        // 解码其实成功）、backend3dRef 永远停在 undefined → 连软渲染球都出不来，
        // 只剩黑卡 + 说明条。守梯创建见 globe3dLoader.createBackendSafe。
        const inst = createBackendSafe(factory, canvasRef.current)
        // 档位初值必须由这里顶进去：globe3dStage 的初值是**恒等光照**（不猜用户想
        // 要哪档，见那边的 uNight/uDay 注释），不叫 setLight 就只是「没补光照的原图」。
        inst?.setLight(globeEarth)
        backend3dRef.current = inst
      }
    })
    void Promise.all([loadGlobeCube(urls), backendReady])
      .then(([t]) => {
        if (!alive) return
        texRef.current = t
        onTextureFailedRef.current?.(false)
        // 首帧（解码完立刻画，GPU 档此时贴图未上、由 setTexture 在 finish 里补）：
        // 六面解码本身 ~40ms（Chromium 实测，外部文件走 app:// 还省掉 base64→二进制
        // 那一步）；软渲染档的 mip 挪进空闲回调，用户先看到球。
        const now = useUi.getState()
        paint(now.locGlobeLat, now.locGlobeLng, true)
        const finish = (): void => {
          if (!alive) return
          // BUG-168a：finish 是 rIC / setTimeout **直接调的浏览器回调**，不是 Promise
          // 的 .then 续体——里面的 throw 不会变成 rejection，下面那道 .catch 接不到，
          // 会冒成 idle 回调里的未捕获异常。典型触发：canvas 上下文数耗尽 /
          // 极端内存压力下 `getContext('2d')` 返回 null（setTexture 第一行就抛）。
          // GPU 档中招的后果：uCube 恒 null → render() 每次在 syncSize 后 return →
          // 黑卡 + 一圈光点；而 onTextureFailedRef?.(false) 上面已经报过「成功」、
          // texRef.current = t 也已写，.catch 那道 `texRef.current === null` 判据
          // 同样不成立——BUG-122b 特意加的说明条永远出不来，用户分不清「坏了」
          // 和「在加载」。所以这里整段 try 住，按同一条失败口径收尾。
          try {
            if (backend3dRef.current) {
              // GPU 档：六面上 CubeTexture（旧纹理就地释放）；运动档半尺寸 mip 不存在
              backend3dRef.current.setTexture(t)
            } else {
              // mip（每面降一半）只服务软渲染的运动档：算出来之前运动档退回原图
              // （?? tex 那一支），球照转。
              try {
                mipRef.current = halveCube(t)
              } catch {
                /* 半尺寸导出失败不算致命 */
              }
            }
          } catch (e) {
            console.error('[Momo] 星球贴图上屏失败', e)
            // 与解码失败同口径：texRef 置回 null（这一颗上不了屏、等于没有），
            // 让 GlobeView 出持续态说明条。换档失败时旧贴图可能还在 GPU 上，
            // 此时条会误报——罕见失败的次要一侧，比静默黑卡好。
            texRef.current = null
            onTextureFailedRef.current?.(true)
          }
          // 补满档静止帧（首帧是降档画的）：首帧 size=400（软渲染运动档），这里是
          // 静止档（≥560），`drawnRef` 的签名带 size，签名不同必然放行这一帧——mip
          // 换进 ref 后贴图身份也变了，即便同 size 也不会被跳。已经手动拖 / 转起来
          // 就别拿一帧 560² 去插队——交互自己的收尾帧会补这次清晰度（见
          // onPointerUp / tween 末帧），而且拖拽每帧都重画。GPU 档这一帧与
          // setTexture 后的首次渲染重合，重复画无害。
          if (!movingRef.current) {
            const latest = useUi.getState()
            paint(latest.locGlobeLat, latest.locGlobeLng, false)
          }
        }
        idleHandle = window.requestIdleCallback ? window.requestIdleCallback(finish) : window.setTimeout(finish, 0)
      })
      .catch((e: unknown) => {
        // 解码不出来：不画球，只留 SVG 叠层（星与锚点还看得见）。
        // **不清 texRef**——首装时它本来就是 null（等于原语义），而换档失败时保留
        // 原来那颗球比「切一下档球没了」好得多。
        // BUG-122b：旧实现静默吞掉——「黑卡 + 一圈光点」与「功能坏了」看起来一样。现在记一条
        // 日志（开发者可 grep），且**手上一颗球都没有**时让 GlobeView 出一条持续态说明；
        // 换档失败但旧球还在时只记日志（画面仍是好的，不打扰）。
        if (!alive) return
        console.error('[Momo] 星球贴图解码失败', e)
        if (texRef.current === null) onTextureFailedRef.current?.(true)
      })
    return () => {
      alive = false
      if (idleHandle !== null) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleHandle)
        else window.clearTimeout(idleHandle)
      }
    }
  }, [paint, globeEarth])

  // GPU 实例的释放**只在卸载**，不放在上面那个 effect 的 cleanup 里：那个 effect
  // 的依赖含档位，切一次档就要 dispose 一次然后重新 create——同一个 canvas 上的
  // webgl2 上下文只有一个（getContext 幂等），重建既闪一下又多付一份上下文开销。
  // 「视图切走即卸载」的原意就是卸载，不是换档。
  useEffect(() => {
    return () => {
      // 几何 / 材质 / 纹理 / 上下文一起释放；一次会话反复进出星球视图，不主动丢
      // 上下文会攒到 Chromium 的上下文数上限
      backend3dRef.current?.dispose()
      backend3dRef.current = undefined
    }
  }, [])

  // 档位 → ref 镜像（paint 依赖为空，读不到闭包里的档位，见 earthRef 注释）。
  // 声明在贴图 effect **之前**：同一次提交里 effect 按声明顺序跑，换档那一拍先
  // 更新 ref，后面异步回来的重绘才拿到新档的光照表。
  useEffect(() => {
    earthRef.current = globeEarth
  }, [globeEarth])

  // 光照查表（每档一次，60ms 上下）在空闲时先烘好：首帧 paint 就不会吃到这笔。
  // 只是**提前**——paint 里那次 globeLightFor 照样能补，所以空闲回调没赶上也不
  // 出错（它是幂等的模块级缓存）。
  useEffect(() => {
    const warm = (): void => {
      globeLightFor(globeEarth)
    }
    const handle = window.requestIdleCallback ? window.requestIdleCallback(warm) : window.setTimeout(warm, 0)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [globeEarth])

  // 选中转向：locJumpSeq 变了才发起（拖拽不碰序号，不会误触发）。
  // 挂载时跳过第一次——带着选中项进星球（切走再回来）要保留当时的角度，
  // 不等于要重新转向一次（F7b：rotLat / rotLng / 选中项全部保留）。
  const skipFirst = useRef(true)
  /** 上一次转向 effect 看到的筛选集合：判「这一跳是不是取消」（BUG-122a） */
  const prevFiltersRef = useRef<readonly string[]>(useUi.getState().filterLocations)
  useEffect(() => {
    // BUG-122a：取消不是跳转意图。toggleLocation 取消时照样顶序号（分组流的「✕ 掉最后
    // 一枚 = 回流顶」靠它），旧实现于是在已选 ≥2 枚时取消任意一枚，球自己转向插入序
    // 里的新末位。这里认「集合严格变小且没有新成员」= 取消，不转；ref 每次都记，
    // 拖拽中 / 首次跳过也不例外。
    const curFilters = useUi.getState().filterLocations
    const prevFilters = prevFiltersRef.current
    prevFiltersRef.current = curFilters
    const isRemoval = curFilters.length < prevFilters.length && curFilters.every((k) => prevFilters.includes(k))
    // 被跳转打断的那一段转向（去处由 cleanup 记下）：**看一次就消费掉**，
    // 别让陈值在后面的某次取消里把球拉回一个旧地方（BUG-136c）。
    const interrupted = interruptedRef.current
    interruptedRef.current = null
    // BUG-69c：拖拽中不发起转向。触屏双指时（指 1 拖球、指 2 点侧栏树 →
    // toggleLocation → locJumpSeq++）两个写入者会逐帧抢位姿：tween 的 rAF 与
    // onPointerMove 的 setGlobePose 互相覆盖，球抖动；且 tween 中途抬手会把
    // movingRef 置 false，空闲补帧见 !movingRef 就拿满档帧插队。拖拽优先。
    if (dragRef.current) return
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    if (isRemoval) {
      // 取消筛选本身**不发起**新转向（BUG-122a，球不自己转去剩下的末位），但旧实现
      // 把在飞的 tween 直接 cancel 掉、又在这里早退——球于是停在一个**没有任何选择
      // 能解释**的角度上（双击同一枚光点 = 选中→取消，必然踩中；BUG-136c）。
      // 补完被打断的那一段：那是用户上一个动作明确要去的地方，不是「自己转去别处」。
      if (interrupted !== null) {
        if (activeRef.current) paint(interrupted.lat, interrupted.lng, false)
        setGlobePose(interrupted.lat, interrupted.lng)
      }
      return
    }
    const st = useUi.getState()
    // 多选（2026-10-01）之后「这次要转向哪一个」= **最后加进来的那个节点**
    // （集合顺序即加入顺序，与 LocationFlow 的滚动落点同一口径）。
    const filter = st.filterLocations[st.filterLocations.length - 1]
    if (filter === undefined || filter === '') return
    // 转到哪一点：三档优先——
    //   ① 这次选中自带的焦点坐标（点球上光点）：粗档下同一组有好几枚
    //      锚点、组键相同，只有点击处知道用户点的是哪一枚，别转去组里条数最多的那枚；
    //   ② 锚点组键与过滤节点**等值**（细档下就是它自己）；
    //   ③ 完整路径被过滤节点**覆盖**的第一枚（侧栏「全部地点」树选中大洲 / 国家时，
    //      过滤节点是组的祖先路径，等值比较一枚都对不上 → 以前整颗球毫无反应）。
    const focus = st.locGlobeFocus
    const target =
      focus !== null
        ? { lat: focus.lat, lon: focus.lon }
        : (anchors.find((a) => a.key === filter) ?? anchors.find((a) => locNodeCovers(filter, a.full)))
    if (!target) return
    const from = { lat: st.locGlobeLat, lng: st.locGlobeLng }
    const to = focusPoseFor(target.lon)
    // 已经在位：不空转那 340ms。经度是 360° 周期的等价值（拖到几百度、tween 落点是
    // 浮点和），拿 `===` 判会几乎永远不成立 → 球一动不动也降档闪一下
    if (samePose(from, to)) return
    setMovingBoth(true)
    const t0 = performance.now()
    const step = (): void => {
      const t = Math.min(1, (performance.now() - t0) / GLOBE_TWEEN_MS)
      // 末帧直接落 `to`：累加出来的终点只与目标同余（差 1e-14 / 360），
      // 一路带着这点漂移走，下一次的 samePose 就得靠容差兜
      const pose = t < 1 ? tweenPose(from, to, easeInOutCubic(t)) : to
      // 先画后写 store：画布（paint）与叠层（store → React 提交）在同一个 rAF
      // tick 内一起到位。反过来的话画布要等 commit 之后的被动 effect，球会比
      // 光点慢一帧；且兜底 effect 见同一个签名会跳过，不会画第二遍。
      // BUG-168b：隐藏态不画（见 activeRef 注释）——tween 照旧走完，切回视图时
      // 兜底 effect 的 active 翻转会补上当前位姿那一帧。
      if (activeRef.current) paint(pose.lat, pose.lng, true)
      setGlobePose(pose.lat, pose.lng)
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(step)
      } else {
        rafRef.current = 0
        turnToRef.current = null // 到达终点：这一段不再「被谁打断」（BUG-136c）
        setMovingBoth(false)
        if (activeRef.current) paint(pose.lat, pose.lng, false) // 停在终点：满档重画一帧
      }
    }
    turnToRef.current = to
    rafRef.current = window.requestAnimationFrame(step)
    // 清账：卸载 / 下一次跳转都要停掉上一段，别留孤儿 rAF 往 store 写位姿。
    // （setMovingBoth(false) 在卸载时是空操作，React 会忽略已卸载组件的更新）
    // BUG-81b：守卫要罩住 cleanup——旧实现只挡了 effect 体：拖拽中筛选变化
    // （触屏双指：指 1 拖球、指 2 点侧栏树 → locJumpSeq++）会先跑 cleanup 把
    // moving 无条件复位，effect 体才被 dragRef 挡住——手指还按着、球还在拖，
    // 兜底 effect 却插进一帧满档静止帧（掉帧），叠层标签也在拖拽中闪现。
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
        // 记下这一段原本要去哪：下一次 effect 若判定「取消筛选」就补完它（BUG-136c）。
        // 只有**真取消了在飞的 rAF** 才记——拖拽接管时 rafRef 已被 onPointerMove 清零，
        // 这里不会把一段早被手指接管的 tween 误记成「被打断」。
        interruptedRef.current = turnToRef.current
      }
      if (!dragRef.current) setMovingBoth(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 序号是跳转的唯一信号，见上
  }, [locJumpSeq])

  // 缩放上限 = 取景框夹取（见 globeGesture.zoomCapFor）。取景框取**滚动区**
  // （.momo-content，与列表共用同一颗，locScrollerOf 是它的唯一真源），
  // 不是窗口：面板可能只占窗口一条边，拿窗口高去卡球会算出「面板里放不下」的假上限。
  //
  // 球未放大时的边长 = 当前 clientWidth ÷ 当前缩放：宽档恒 400，堆叠档就是列宽，
  // 两档都不必在 JS 里再写一个基准尺寸（窄档滚轮本来就关着，这条是顺带能算）。
  //
  // 不挂 ResizeObserver：上限只是「别大到吃光视口」的兜底，而球已经不会越出卡片
  // （缩放走真尺寸、卡片跟着长高），窗口变小后的唯一后果是卡比视口高——那本来就
  // 该滚，不是错。每次滚轮现场量一次就够，别为它多挂一个观察者。
  const zoomCap = (): number => {
    const stage = stageRef.current
    if (!stage) return ZOOM_MAX
    const scroller = locScrollerOf(stage.closest<HTMLElement>('.momo-app'))
    return zoomCapFor(stage.clientWidth / zoomRef.current, scroller?.clientHeight ?? 0)
  }

  // 滚轮缩放（宽布局限定；passive:false 才能 preventDefault 掉面板滚动）。
  // 挂在**舞台容器**而不是 canvas 上：SVG 叠层在 canvas 上面，滚在星点 / 标签上时
  // 事件不会落到 canvas，挂 canvas 会变成「只有在空白处滚才缩放」。
  useEffect(() => {
    if (!zoomable) return
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent): void => {
      const next = zoomFor(zoomRef.current, e.deltaY, zoomCap())
      // BUG-69b：已在上 / 下限时这一滚不改变缩放，就不要 preventDefault——
      // 否则停在顶格继续滚，面板（.momo-content）也滚不动，滚轮像坏了一样。
      // 只有确实要缩放的那一滚才吃掉事件。
      if (next === zoomRef.current) return
      e.preventDefault()
      zoomRef.current = next
      setZoom(next)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoomable])

  // BUG-81e：跨显示器拖动窗口 / 改系统缩放后 devicePixelRatio 变了——frameSizeFor
  // 每次读的是当下 DPR，但兜底 effect 的依赖里没有它，变化后没有任何触发重画的
  // 路径：球在旧档背备上发虚（或过采样）直到下一次交互。监听 resize + 分辨率
  // 变化（matchMedia 的 resolution query 在 dpr 变走的那一刻 fire，fire 完重挂
  // 到新值上），各补一帧满档静止帧。
  useEffect(() => {
    const repaint = (): void => {
      const st = useUi.getState()
      paint(st.locGlobeLat, st.locGlobeLng, false)
    }
    // matchMedia 不存在的环境（jsdom / 老 Electron）退化为只听 resize——
    // 那里本来也没有 DPR 变化（FocusScroll 的 prefersReducedMotion 同款守卫）
    if (typeof window.matchMedia !== 'function') {
      window.addEventListener('resize', repaint)
      return () => window.removeEventListener('resize', repaint)
    }
    let mq: MediaQueryList | null = null
    const onChange = (): void => {
      repaint()
      // 旧 query 的 dpr 已经不再匹配，重挂到当前值上才能接住下一次变化
      mq?.removeEventListener('change', onChange)
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mq.addEventListener('change', onChange)
    }
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    mq.addEventListener('change', onChange)
    window.addEventListener('resize', repaint)
    return () => {
      mq?.removeEventListener('change', onChange)
      window.removeEventListener('resize', repaint)
    }
  }, [paint])

  // 拖拽（两轴：横 yaw / 竖倾角）+ 轻点命中。指针事件全挂在舞台容器上：锚点的
  // <circle> 不做点击处理，抬手时按累计位移判定「拖过了还是点中了」，
  // 点中了再由 globeGesture 就近找一个正面锚点。
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    // BUG-53：只认左键 / 主指针。右键 / 中键不注册拖拽——Windows 上右键释放会弹
    // 原生上下文菜单，若 pointerup 先送达页面，轻点路径照跑、累计位移≈0 通过容差，
    // 命中最近锚点后 toggleLocation：右键点球 = 误改地点筛选；原生菜单吞掉
    // pointerup 时 dragRef 还会卡住、moving 停在 true，后续左键也起不了拖拽。
    // （多指的第二根由 gestureDown 挡下，`isPrimary` 在合成事件里恒为 false，不可用。）
    if (e.button !== 0) return
    // 这里**刻意不**取消在飞的转向 tween（BUG-136c）：按下这一刻还分不出是「点一下」
    // 还是「拖球」——旧实现按下即 cancel，于是单击一枚正在转向的光点（双击的第二下
    // 更是必然）就把那一段杀掉，球停在半途、且没有任何选择能解释那个角度。
    // 真拖起来时由 onPointerMove 接管（「拖拽优先」的原意不变，只是判据从「按下」
    // 收窄成「拖起来了」）。
    const next = gestureDown(dragRef.current, e.pointerId, e.clientX, e.clientY)
    if (!next) {
      // BUG-81d：第二根手指 = 进入捏合。起始距离取两指当前位（第一指用拖拽
      // 登记的最新位），距离比驱动缩放；dist0 太小不起步（两指并拢的误触会
      // 让比例爆炸）。第二指同样 setPointerCapture：拖出手势窗松手仍收得到。
      const drag = dragRef.current
      const dist0 = drag ? Math.hypot(e.clientX - drag.x, e.clientY - drag.y) : 0
      // BUG-183a：`gestureDown` 返回 null 有两种含义——「已在拖（多指）」与「失败」。
      // 只有**另一根**指针才许登记为第二指：同 id（up 丢失后 dragRef 残留的幽灵指针）
      // 一旦被当「第二指」，move 会早退只走缩放、up 又被 pinch.b 分支吞掉——
      // 自愈路径（同 id 的下一次 up 清 dragRef）整条被吃，球再也拖不动。
      if (drag && e.pointerId !== drag.id && !pinchRef.current && dist0 > 4) {
        e.currentTarget.setPointerCapture(e.pointerId)
        pinchRef.current = {
          a: drag.id,
          b: e.pointerId,
          ax: drag.x,
          ay: drag.y,
          bx: e.clientX,
          by: e.clientY,
          dist0,
          zoom0: zoomRef.current,
        }
      }
      return
    }
    dragRef.current = next
    setMovingBoth(true)
    // 按下这一帧就降档画掉（mip 没就绪时运动档退回原图）：别等 commit 之后的
    // 兜底 effect——那要等浏览器先画一帧旧的，手指已经按下去了球还停在满档。
    const st = useUi.getState()
    paint(st.locGlobeLat, st.locGlobeLng, true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    // BUG-81d：捏合中先更新两指位与缩放（距离比 × 起始缩放，夹在 [1, 取景上限]，
    // 与滚轮同一把尺子）。A 指继续落回下面的旋转路径；B 指没有拖拽登记、只管缩放。
    const pinch = pinchRef.current
    if (pinch) {
      if (e.pointerId !== pinch.a && e.pointerId !== pinch.b) return
      if (e.pointerId === pinch.a) {
        pinch.ax = e.clientX
        pinch.ay = e.clientY
      } else {
        pinch.bx = e.clientX
        pinch.by = e.clientY
      }
      const dist = Math.hypot(pinch.bx - pinch.ax, pinch.by - pinch.ay)
      const nextZoom = Math.min(zoomCap(), Math.max(1, pinch.zoom0 * (dist / pinch.dist0)))
      if (nextZoom !== zoomRef.current) {
        zoomRef.current = nextZoom
        setZoom(nextZoom)
      }
      if (e.pointerId === pinch.b) return
    }
    const st = useUi.getState()
    const moved = gestureMove(
      dragRef.current,
      e.pointerId,
      e.clientX,
      e.clientY,
      { lat: st.locGlobeLat, lng: st.locGlobeLng },
      { width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight },
    )
    if (!moved) return
    dragRef.current = moved.drag
    if (moved.pose) {
      // 真拖起来了：此刻才从转向手里接管位姿（BUG-69c 的「拖拽优先」原意不变，
      // BUG-136c 只是把接管时机从「按下」收窄到「真的动了」）。两枚 ref 一起清：
      // 这一段 tween 的去处从此不再「被补回来」（手指的位姿说了算）。
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      turnToRef.current = null
      interruptedRef.current = null
      // 先画后写 store，同 tween：球与光点同一个 tick 到位
      paint(moved.pose.lat, moved.pose.lng, true)
      setGlobePose(moved.pose.lat, moved.pose.lng)
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    // BUG-81d：捏合中抬手分两种（旧多指合同「第二根抬手不许收掉拖拽」仍然成立）：
    //   · B 抬手 → 只收捏合，A 的拖拽与运动态原样继续（A 还握着这次拖拽）；
    //   · A 抬手 → 拖拽与捏合一并收掉，补满档静止帧（A 的累计位移早超容差，
    //     本来也不会命中锚点，跳过命中判定与旧路径同结果）。
    const pinch = pinchRef.current
    if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
      pinchRef.current = null
      if (e.pointerId === pinch.b) return
      dragRef.current = null
      setMovingBoth(false)
      const st = useUi.getState()
      paint(st.locGlobeLat, st.locGlobeLng, false)
      return
    }
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return // 不是本指针：连运动态都不动（多指）
    dragRef.current = null
    setMovingBoth(false)
    const stage = e.currentTarget
    const st = useUi.getState()
    // 客户端坐标 → viewBox 坐标（读 DOM 矩形只能在这里做；命中判定保持纯函数）
    const box = stage.getBoundingClientRect()
    const scale = GLOBE_VIEW / (box.width || 1)
    const hit = gestureUp(
      drag,
      e.pointerId,
      { width: stage.clientWidth },
      { lat: st.locGlobeLat, lng: st.locGlobeLng },
      anchors,
      { vx: (e.clientX - box.left) * scale, vy: (e.clientY - box.top) * scale },
    )
    // BUG-69a：先做命中判定。绝大多数点选都会发起转向，而转向下一帧就降回运动档，
    // 这一帧满档（zoom>2 时 880² 建表 + 采样 ≈ 22ms）只活一帧、纯属白做；
    // tween 的末帧会补上清晰度。只有这次点击**不会转向**（没命中 / 命中即取消 /
    // 已在位）才在这里补满档静止帧。
    //
    // 「这一枚亮着没有」必须与叠层同一把尺（BUG-136d）：GlobeOverlay 用 locKeyActive
    // ——集合里任一节点**覆盖**锚点的完整路径即点亮（粗档选了「中国」，其下城市点全亮）；
    // 旧实现这里用 `filterLocations.includes(hit.key)`（**等值**），于是亮着的点被判成
    // 「没选」→ 走加法支 → 再经 toggleLocation 的祖先-后代规范化，把国家**收窄成一座城**
    // （粗档反向：把城市放宽成整个国家）。两边现在共用 locOverlappingFilterKey。
    const litByKey = hit === null ? null : locOverlappingFilterKey(st.filterLocations, hit.full)
    const willTurn =
      hit !== null &&
      litByKey === null &&
      !samePose({ lat: st.locGlobeLat, lng: st.locGlobeLng }, focusPoseFor(hit.lon))
    if (!willTurn) {
      // 松手这一刻补满档静止帧（球整个拖动期都是 400²）。放在这里而不是留给
      // commit 之后的兜底 effect：那一帧晚一个 paint，抬手会看见一帧糊的。
      paint(st.locGlobeLat, st.locGlobeLng, false)
    }
    if (hit) {
      // 再点同一枚 = 取消那个筛选（设计稿画面三「再点一次 = 收起卡片」的延续）。
      // **取消的是让它亮的那一个节点**（与上面的点亮判定同一把尺，见
      // locOverlappingFilterKey 的注释）。清除时 focus 一起清（toggleLocation 那支），
      // tween effect 认出「集合严格变小」= 取消——球不转向（BUG-122a），被打断的那段
      // 由 interruptedRef 补完（BUG-136c）。
      if (litByKey === null) toggleLocation(hit.key, { lat: hit.lat, lon: hit.lon })
      else toggleLocation(litByKey, null)
    }
  }

  // BUG-53：pointercancel 是「手势被系统取消」（掌拒 / OS 接管 / 触控笔失效），
  // 不是用户抬手——只清拖拽态 + 补一张静止帧，**跳过命中判定**，否则一个没点成的
  // 被取消手势只要累计位移小于容差也会 toggleLocation，选中/取消用户没点的东西。
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>): void => {
    // BUG-81d：捏合成员被系统取消 = 与抬手同一条收尾（B 走只收捏合、A 走全收，
    // 均不命中、不把取消当点选——BUG-53 的口径）
    const pinch = pinchRef.current
    if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
      pinchRef.current = null
      if (e.pointerId === pinch.b) return
      dragRef.current = null
      setMovingBoth(false)
      const st = useUi.getState()
      paint(st.locGlobeLat, st.locGlobeLng, false)
      return
    }
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    dragRef.current = null
    setMovingBoth(false)
    const st = useUi.getState()
    paint(st.locGlobeLat, st.locGlobeLng, false)
  }

  return (
    <div
      ref={stageRef}
      className="momo-globe-stage"
      role="img"
      aria-label={
        anchors.length > 0 ? copy.location.globe.stageAria(anchors.length) : copy.location.globe.stageEmpty
      }
      // 缩放走**真尺寸**而不是 transform: scale()：只把缩放系数交给 CSS
      // （60-design.css 的 width: calc(400px · var(--globe-zoom))，高度交给
      // aspect-ratio 跟），卡片随之长高，球永远是完整的。
      //
      // 为什么不能用 scale：布局盒子不跟着长，球的视觉尺寸就溢出卡片，被
      // .momo-globe-card 的 overflow: hidden 沿卡沿切掉上下两截（2026-10-01
      // 用户报「地图扩大之后地球会被遮盖」）。改成真尺寸后三处自动跟上：
      //   ① 命中换算 GLOBE_VIEW / box.width（onPointerUp 现场量）
      //   ② 拖拽灵敏度 dragPose 的分母（横穿球宽 = 180°）
      //   ③ 画布后备缓冲跟着放大换档：静止档在 stillSizeFor 的三档之间跳
      //      （560 / 720 / 880²），再乘 devicePixelRatio 并封顶 880。880² 对上
      //      ZOOM_MAX 2.6 下 dpr=1 的 1040px 显示尺寸是 0.85:1，略有不足但换不来
      //      更糊的 texture（见 globeGesture 的 ZOOM_MAX 注释：880 已经贴着两个
      //      天花板，2×/3× 屏同样封在 880，不跟着 DPR 爆炸）。
      // 而 CSS 尺寸变化本身零渲染成本（重绘只吃贴图 / 位姿 / moving / 换档），
      // 连续滚轮在档位内不重建表。aspect-ratio 那条坑见 .momo-globe-stage 的注释。
      style={{ '--globe-zoom': zoom } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <canvas
        ref={canvasRef}
        width={GLOBE_CANVAS_SIZE}
        height={GLOBE_CANVAS_SIZE}
        className="momo-globe-canvas"
      />
      <GlobeOverlay
        anchors={anchors}
        pose={overlayPose}
        selected={filterLocations}
        moving={moving}
      />
    </div>
  )
}

/** BUG-69d：GlobeView 因与球无关的 store 变化重渲时，anchors（useMemo 稳定）与
 * zoomable 都不变就不进这一层，避免整棵锚点 SVG 被无谓 diff；球自身的 store
 * 订阅（位姿 / 筛选 / 运动态）照旧驱动它重渲。 */
export const GlobeStage = memo(GlobeStageInner)
