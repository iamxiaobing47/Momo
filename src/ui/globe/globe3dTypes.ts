// main.js 与 globe3d.js（three.js 档）的**边界契约**，只放类型、零运行时：
// 两侧各自 import 这里，运行期经 window.__momoGlobe3D 全局交接（globe3dLoader 注入
// script，globe3dStage 挂工厂）。main.js 一侧绝不 import globe3dStage 本体——
// 那会把整个 three 拖进 main.js，onload 的 parse 账白算（见 globe3dStage 文件头）。
// scripts/globe3d-deploy.test.mts 钉着这条纪律。

import type { GlobeEarth } from './globeLight'

/**
 * 解码后的 cube map 贴图（2026-10-04 起从等距圆柱换成 cube 六面）。
 * 面顺序固定 px/nx/py/ny/pz/nz（three.js CubeTexture 构造顺序），六面同边长。
 * 与 globeTexture.GlobeCubeData 同形，避免跨 chunk 依赖。
 */
export interface Globe3DTextureData {
  /** 每面边长（px） */
  size: number
  /** 六面像素（RGBA，长度 size²×4），顺序 px/nx/py/ny/pz/nz */
  faces: Uint8ClampedArray<ArrayBuffer>[]
}

/** 一次挂载的三维渲染实例（与一块 canvas 一一对应，卸载即 dispose） */
export interface Globe3DInstance {
  /**
   * 画一帧。按需渲染：不内部转 rAF，调用方（GlobeStage 的 paint 路径）位姿变了才调。
   * 内部每次自检画布 clientWidth/Height × devicePixelRatio，变了自动重设渲染目标——
   * 缩放（CSS 真尺寸）、窗口 resize、跨屏 DPR 变化都从这条路进来，不用额外通知。
   * 贴图未就绪（setTexture 没调过）时是空操作。
   */
  render(lat: number, lng: number): void
  /** 换 cube 贴图（解码完成时调一次）：旧纹理就地释放。失败静默（球黑一帧不致命） */
  setTexture(tex: Globe3DTextureData): void
  /**
   * 换光照档（2026-10-05）。两档的差别只在光照配方，几何与采样方向完全一样：
   * 夜档只补「临边衰减」（无边缘光，2026-10-06 起）、日档走 globe.html 的
   * ambient + key + 背面边缘光。
   * 配方常量从 globeLight.ts 读（与 CPU 档同一份），这里只负责塞进 uniform。
   * 档位没变时是幂等空操作，创建后不调则保持夜档。
   */
  setLight(mode: GlobeEarth): void
  /** 释放 GPU 侧一切（几何 / 材质 / 纹理 / 上下文）。卸载后实例不可再用 */
  dispose(): void
}

/** globe3d.js 暴露在 window.__momoGlobe3D 上的工厂 */
export interface Globe3DFactory {
  /**
   * 在给定 canvas 上初始化三维渲染。WebGL 上下文拿不到（禁 GPU / 驱动黑名单 /
   * jsdom 等环境）返回 null，调用方回退 canvas 软渲染。同一块 canvas 只许 create
   * 一次（2d 与 webgl2 上下文互斥，回退判定发生在任何 2d getContext 之前）。
   */
  create(canvas: HTMLCanvasElement): Globe3DInstance | null
}
