// 星球画布的表缓存（F7）。
//
// 这一层只回答一个问题：**这一帧该用哪张静态表**。上层（GlobeStage）只管把
// canvas 调好尺寸、把表交给 renderFrame；下层（globeRender）只管建表与采样。
// 没有 React、没有 DOM 类型，所以能直接在 node 里读秒与单测。
//
// 两档（对应「球在动 / 球静止」这两种完全不同的成本结构）：
//
//   运动档（moving = true：拖拽中 或 选中转向 tween 中）
//     倾角每帧都在变 → 表内容每帧都得重算。这时**不量化**（量化会在慢速拖拽时让
//     贴图相对锚点抖出 1px 台阶），画布也降档（GLOBE_MOVING_SIZE），
//     同倾角的那一帧原样复用（横拖不动倾角 = 一帧都不用重算）。
//     重算走的是**复用缓冲**（createGlobeTable 只在换档时分配一次，之后
//     fillGlobeTable 就地重填）——每帧 new 一张的话 400² 是 1.37MB/帧的分配速率，
//     GC 顿挫比建表本身更伤手感。
//
//   静止档（moving = false）
//     倾角是离散的几次落点 → 按 0.5° 量化后缓存复用，画布满档 560²（随缩放换档、
//     按 DPR 缩放封顶 880，见 frameSizeFor）。
//     缓存张数有上限（见 SURFACE_TABLE_LIMIT）：一张 560² 的表约 2.8MB，
//     不设上限的话「拖到各个倾角都停一下」会一路涨上去。
//
// 为什么运动/静止要用两套表：静止档的表是**量化**过的倾角（0.5° 一步），
// 直接拿去当运动档用会让球面与锚点差最多 0.25°（≈0.6px）——那正是「叠层几何
// 必须与画布球一致」这条老账，两档的表各归各的，不互相借。

import {
  GLOBE_MOVING_SIZE,
  GLOBE_STILL_MAX,
  buildGlobeTable,
  createGlobeTable,
  fillGlobeTable,
  latKeyOf,
  stillSizeFor,
  type GlobeTable,
} from './globeRender'

/**
 * 静止档缓存的**字节**预算（不是张数）：一张表 = 方向向量 dx/dy/dz 各 4B/px +
 * vis 1B/px = **13B/px**（2026-10-04 换 cube 前是 u0/v0 两项 = 9B/px，方向向量
 * 多一项）。
 *
 * 为什么不按张数：画布会随缩放换档（stillSizeFor，560→720→880，再乘 DPR 封顶 880），一张 880² 的表
 * ≈ 10.1MB，是 560² 那张（≈4.1MB）的 2.5 倍。按张数封顶的话，放大状态下缓存占用
 * 会跟着涨 2.5 倍——原来 8 张会变成 80MB，而它们服务的还是同一件事
 * （「反复看同几个倾角」）。按字节封顶则三种档位下的占用都一样。
 *
 * 32MB 这个值是照「每 B/px 变贵、但档位张数一个不少」反推的：560² 存 8 张 /
 * 720² 存 4 张 / 880² 存 3 张，与 9B/px + 22MB 时代逐档相同。
 *
 * 一次 180° 转向最多碾过 360 个 0.5° 键，缓存对转向没有帮助（键全不重样）。
 */
export const SURFACE_TABLE_BYTES = 32 * 1024 * 1024

/** 一张 size² 的表占多少字节（见 SURFACE_TABLE_BYTES） */
export function tableBytesOf(size: number): number {
  return size * size * 13
}

/**
 * 某个尺寸下能缓存几张：按字节预算折算，至少 1 张（否则表刚建就丢，等于没有缓存）。
 * 这是导出函数而不是私有的 because 回归测试要能直接验证折算结果。
 */
export function tableLimitFor(size: number): number {
  const n = Math.floor(SURFACE_TABLE_BYTES / tableBytesOf(size))
  return n < 1 ? 1 : n
}

/**
 * 这一帧的画布边长：球在动就降档（不看缩放——拖拽要的是帧率），停下就按缩放挑档。
 *
 * `zoom` 只在静止档起作用，而静止档的表是按 (倾角, 尺寸) 缓存的：尺寸落在
 * stillSizeFor 的少数几档上、再乘同一个 `dpr`，所以连续滚轮不会把缓存打穿。
 *
 * `dpr` 是 devicePixelRatio：画布内部像素要落到设备像素——2× 屏默认 zoom 下
 * 560 对 800 设备像素只有 0.7×，比模块在 texel/px 上的口径还松。乘完**硬顶
 * GLOBE_STILL_MAX(880)**：880 已贴显存与建表成本天花板，3× 屏不许爆。
 * 运动档不吃 DPR——400² 是帧率明账，像素数翻倍会直接吃穿 60Hz 预算。
 */
export function frameSizeFor(moving: boolean, zoom: number, dpr = 1): number {
  if (moving) return GLOBE_MOVING_SIZE
  const scaled = Math.round(stillSizeFor(zoom) * dpr)
  return scaled > GLOBE_STILL_MAX ? GLOBE_STILL_MAX : scaled
}

/**
 * 静态表缓存。一个画布一个实例（GlobeStage 用 useRef 持有），不共享——
 * 表里存的是**某个具体分辨率**的像素映射，实例化一份缓存比到处传 size 干净。
 *
 * 内存账：
 *   运动档缓冲 pools —— 每个 size 一张，常驻 2.1MB(400²)。这是拿内存换 GC 的
 *     明账：运动档一帧重填一次，不复用的话每秒 80~160MB 的分配速率会把 GC 逼出
 *     可见顿挫（量过，见 globeRender 文件头）。
 *   静止档缓存 rest —— 合计封顶 SURFACE_TABLE_BYTES（32MB），只在「反复看同几个
 *     倾角」时才有意义，超了按插入顺序丢最老的。
 */
export class GlobeSurface {
  /**
   * 键 = 倾角量化键 × 1000 + 尺寸（尺寸都在三位以内，拼一个数省一层对象）。
   *
   * 为什么尺寸要进键：静止档的画布随缩放在 560/720/880 三档间跳（stillSizeFor，
   * 再按 DPR 缩放、封顶 880），
   * 同一个倾角在三档下是**三张不同的表**。只按倾角做键的话，切档会把上一档的表
   * 当成命中（表里的像素映射是按 size 建的，对不上就是错的画面），或者反过来
   * 每次切档都重建成 miss——两种都是 bug。
   */
  private rest = new Map<number, GlobeTable>()
  /** 运动档缓冲（按 size 复用，不随帧分配）；pools.size 有上限，见 movingTable */
  private pools = new Map<number, GlobeTable>()
  private live: { lat: number; size: number; table: GlobeTable } | null = null

  /**
   * 取这一帧该用的表。size 必须与调用方给 canvas / ImageData 的边长一致；
   * 对不上就重算（换档时必然发生一次，之后各自命中）。
   *
   * ⚠️ 运动档返回的是**复用缓冲**：内容只在下一次 tableFor(moving=true) 时被覆盖，
   * 调用方必须在当帧内用完（GlobeStage 的重绘 effect 正是这么用的），别把这张表
   * 存起来跨帧拿着。
   */
  tableFor(lat: number, size: number, moving: boolean): GlobeTable {
    if (moving) return this.movingTable(lat, size)
    this.live = null
    return this.restTable(lat, size)
  }

  private movingTable(lat: number, size: number): GlobeTable {
    const kept = this.live
    if (kept && kept.lat === lat && kept.size === size) return kept.table
    let table = this.pools.get(size)
    if (!table) {
      // 运动档只跑 400² 一档（frameSizeFor 里 moving 时不看 zoom / DPR），这里是保险：
      // 真被塞进来一堆尺寸就整袋清掉重来，别让缓冲自己变成内存洞。
      if (this.pools.size >= 4) this.pools.clear()
      table = createGlobeTable(size)
      this.pools.set(size, table)
    }
    fillGlobeTable(table, lat)
    this.live = { lat, size, table }
    return table
  }

  private restTable(lat: number, size: number): GlobeTable {
    const key = latKeyOf(lat) * 1000 + size
    const hit = this.rest.get(key)
    if (hit) return hit
    // 先腾地方再建表：建完再发现有旧的要丢，中间那一瞬两张大表同时在手里
    let bytes = 0
    for (const t of this.rest.values()) bytes += tableBytesOf(t.size)
    while (bytes + tableBytesOf(size) > SURFACE_TABLE_BYTES && this.rest.size > 0) {
      const oldest = this.rest.keys().next().value
      if (oldest === undefined) break
      bytes -= tableBytesOf(this.rest.get(oldest)!.size)
      this.rest.delete(oldest)
    }
    const table = buildGlobeTable(size, latKeyOf(lat))
    this.rest.set(key, table)
    return table
  }
}
