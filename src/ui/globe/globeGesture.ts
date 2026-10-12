// 星球舞台的手势（F7）：拖拽两轴、轻点命中、滚轮缩放。
//
// 全是**纯函数 + 一个小状态对象**（GlobeDrag），不碰 React、不碰 DOM 事件：
// GlobeStage 只做三件事——把 React 事件里的坐标读出来、调这里的函数、
// 把结果写回 store。好处是这套手感（灵敏度 / 夹取 / 命中判定 / 多指规则）
// 能在 node 里逐条钉住，换成别的画布宿主时也能整份搬走。
//
// 「按位移分流」是这里的核心：同一个指针序列，位移小 = 点击（就近选中锚点），
// 位移大 = 拖拽（转球）。所以抬手那一刻才判定，按下时不做任何事。

import { GLOBE_VIEW, dragPose, projectLatLon, type GlobePose } from './globeMath'

/** 摆上球的一个锚点（GlobeView 从地点分组算好坐标传进来；这里只管命中） */
export interface GlobeAnchorItem {
  /** 地名（**坐标字典的键**、球上悬停浮出的那个名字）。v0.9.30 起锚点是地点级的：
   *  粗档分组（大洲 / 国家）下一组会贡献多枚锚点，每枚仍是一个具体地点 */
  location: string
  /** 该地点所属组的组键（当前 locLevel 下）：选中态与「点一下就跳过去」用它。
   *  locFilter 存的是组键不是地名，所以命中判定也得按组键比 */
  key: string
  /** 该地点的**完整路径键**（恒 name 档：`亚洲\u0000中国\u0000北京`）。
   *  与 key 的分工：key 是当前档位的组（粗档下同组多枚锚点会重复），full 是这个
   *  地点自己——按节点键找转向目标时，用 full 才分得出「点的是哪一枚」。 */
  full: string
  /** 侧栏列表行文字 = 该地点的完整路径（`亚洲 · 中国 · 北京`）。球上悬停浮出的
   *  仍是 location（光点附近只放得下一个地名，路径会撞到别的点） */
  label: string
  count: number
  lat: number
  lon: number
}

/** 指针位移小于这个数（viewBox 单位）算点击，超过算拖拽 */
export const CLICK_SLOP = 6
/**
 * 轻点命中的最大距离（viewBox 单位，300 见方的舞台）：约等于锚点圈外径。
 *
 * 它同时是 GlobeOverlay 里那颗**不可见悬停圈**的半径（v0.9.26）——地名只在悬停时出现，
 * 而光点本身只有 2.6~8 个单位、鼠标压不准，所以悬停范围交给这颗圈。
 * 两处共用一个常量是刻意的：**「看得到名字」与「点得中」必须是同一个圈**，
 * 分开写就会出现「悬停浮出名字、抬手却选不中」这种只在真实鼠标下才暴露的错位。
 */
export const HIT_RADIUS = 12
/**
 * 缩放上限（1 = 舞台原尺寸，只放大不缩小）。
 *
 * 2.6 是这么来的：静止档画布随之换到第三档 880²（stillSizeFor），而 880 已经贴着
 * 两个天花板——贴图正对观察者的半球只有 1024 texel（再大就在丢细节），建表+采样
 * 也已经是一帧的量级。再往上不是"更清楚"，是"更糊且更卡"。
 */
export const ZOOM_MAX = 2.6
/** 滚轮灵敏度：每 1px deltaY 改多少缩放 */
export const ZOOM_PER_PX = 0.0015
/**
 * 取景框留白（px）：球放大到顶时上下各留这一口气，别让夜空卡顶死视口。
 *
 * 取的是「卡的上下内距（16×2）+ 一点余量」这个量级，不是某个设计稿数字——
 * 它只决定放大停在哪儿，肉眼分辨不出差别，所以不必跟着设计稿改。
 */
const ZOOM_FRAME_PAD = 64

/** 舞台的 CSS 尺寸（clientWidth/Height）。两个方向都用来定「拖多远 = 转多少度」 */
export interface GlobeViewport {
  width: number
  height: number
}

/** 一次拖拽的登记：指针 id + 上一次位置 + 累计位移（判点击还是拖拽） */
export interface GlobeDrag {
  id: number
  x: number
  y: number
  moved: number
}

/**
 * 按下。已经在拖时返回 null——**多指只认第一根**。
 *
 * 不这么做的话第二根手指会顶掉登记，而第一根手指抬手时又按 id 对不上，
 * 于是「拖拽中」这个状态被提前收掉：画布在手指还按着的时候弹回满档重画
 * （视觉上卡一下），而这段拖拽也就丢了。
 */
export function gestureDown(current: GlobeDrag | null, id: number, x: number, y: number): GlobeDrag | null {
  if (current) return null
  return { id, x, y, moved: 0 }
}

/** 移动的结果：新的登记 + 新位姿（位移为 0 时 pose 为 null，别白写一次 store） */
export interface GlobeMove {
  drag: GlobeDrag
  pose: GlobePose | null
}

/**
 * 移动。非本指针（多指里的另一根 / 已抬起的旧 id）返回 null。
 * 灵敏度见 globeMath.dragPose：横穿整个球宽 / 球高各转 180°。
 */
export function gestureMove(
  drag: GlobeDrag | null,
  id: number,
  x: number,
  y: number,
  pose: GlobePose,
  view: GlobeViewport,
): GlobeMove | null {
  if (!drag || drag.id !== id) return null
  const dx = x - drag.x
  const dy = y - drag.y
  const next: GlobeDrag = { id, x, y, moved: drag.moved + Math.abs(dx) + Math.abs(dy) }
  if (dx === 0 && dy === 0) return { drag: next, pose: null }
  return { drag: next, pose: dragPose(pose.lat, pose.lng, dx, dy, view.width, view.height) }
}

/**
 * 抬手：返回被点中的锚点（没点中就 null）。
 *
 * 判定分两步：① 位移超过容差就按拖拽算（拖完松手不该选中球上任何一个点）；
 * ② 否则在**正面**锚点里找最近的一个，超出 HIT_RADIUS 算点空。
 * `at` 是已经换算到 viewBox 坐标的指针位置（换算要读 DOM 矩形，留在组件里做）。
 *
 * 容差随舞台实际宽度缩放：CLICK_SLOP 是 viewBox 单位，400px 的舞台上
 * 1 单位 ≈ 0.93px，窄布局把球缩到 200px 时也还是「一小段位移」。
 */
export function gestureUp(
  drag: GlobeDrag | null,
  id: number,
  view: Pick<GlobeViewport, 'width'>,
  pose: GlobePose,
  anchors: readonly GlobeAnchorItem[],
  at: { vx: number; vy: number },
): GlobeAnchorItem | null {
  if (!drag || drag.id !== id) return null
  if (drag.moved > CLICK_SLOP * ((view.width || GLOBE_VIEW) / GLOBE_VIEW)) return null
  let best: GlobeAnchorItem | null = null
  let bestD = HIT_RADIUS
  for (const a of anchors) {
    const p = projectLatLon(a.lat, a.lon, pose.lat, pose.lng)
    if (!p.visible) continue // 背面的点看不见，也不该被点到
    const dist = Math.hypot(p.x - at.vx, p.y - at.vy)
    if (dist < bestD) {
      bestD = dist
      best = a
    }
  }
  return best
}

/**
 * 这一档能放到多大：球未放大时的边长 × 取景框高，夹在 [1, ZOOM_MAX]。
 *
 * 为什么要这条：缩放改成**真尺寸**之后（GlobeStage 写 --globe-zoom，卡片跟着
 * 长高，见 60-design.css 的 .momo-globe-stage），球不再会被卡沿裁掉；这条管的是
 * 另一头——别让球长到把整个面板视口吃光，于是放大停在一屏能看完的位置。
 *
 * 量不到就退到 ZOOM_MAX：宁可放到顶，也别因为一次读数失败把缩放锁死在 1。
 */
export function zoomCapFor(basePx: number, framePx: number): number {
  if (!(basePx > 0) || !(framePx > 0)) return ZOOM_MAX
  const room = (framePx - ZOOM_FRAME_PAD) / basePx
  return room > ZOOM_MAX ? ZOOM_MAX : room < 1 ? 1 : room
}

/**
 * 滚轮 → 新缩放。向上滚（deltaY < 0）放大，夹在 [1, cap]：
 * 只放大不缩小，是因为「比原尺寸还小」会让球离开卡片的视觉中心，
 * 而缩小本来也没有第二个用处（想看清就放大）。
 *
 * `cap` 由调用方按取景框算（zoomCapFor），默认 ZOOM_MAX——量不到取景框的那条
 * 退化路径与单测都走这一档。
 */
export function zoomFor(zoom: number, deltaY: number, cap: number = ZOOM_MAX): number {
  const next = zoom - deltaY * ZOOM_PER_PX
  return next > cap ? cap : next < 1 ? 1 : next
}
