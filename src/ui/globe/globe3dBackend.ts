// 三维后端的**守梯创建**（BUG-183b）——main.js 侧唯一碰 three 工厂的地方。
//
// 2026-10-13（BUG-219）：本文件原先叫 globe3dLoader.ts，是「globe3d.js 的 `<script>`
// 装载器」（loadGlobe3D + withAssetRev + window.__momoGlobe3D 全局交接）。three 打进
// main.js 之后整段退役——Obsidian 提交评审把「运行期 createElement('script')」列为
// Error（代码混淆），而静态 import 之下本来也没有东西可装载。保留下来的只有下面这条
// 回退口径，它治的是一个**独立的**故障（BUG-183b），与怎么装载无关。
//
// 为什么值得单独成篇：`factory.create` 按契约只在 WebGL 不可用时返回 null，但损坏的
// `getContext` 桩 / 极端环境会让它**抛错**。旧实现让异常冒成 rejection：`Promise.all`
// 进 `.catch` 报「贴图解码失败」（口径不符——解码其实成功）、`backend3dRef` 永远停在
// undefined → 连软渲染球都出不来，只剩黑卡 + 说明条。这里把「返回 null」与「抛错」
// 并到同一条回退路径：异常只留日志，调用方照常拿到 null 走软渲染。
//
// 独立成篇还让「回退口径」有一个能直接喂假工厂的落点（globe-projection.test.mts 的
// BUG-183b 四条形态：正常 / 返回 null / 抛错 / factory 或 canvas 缺席）。

import type { Globe3DFactory, Globe3DInstance } from './globe3dTypes'

/**
 * 工厂 → 实例的**守梯创建**：任何失败（factory / canvas 缺席、create 返回 null、
 * create 抛错）都返回 null，调用方据此走 canvas 软渲染。
 */
export function createBackendSafe(
  factory: Globe3DFactory | null,
  canvas: HTMLCanvasElement | null,
): Globe3DInstance | null {
  if (!factory || !canvas) return null
  try {
    return factory.create(canvas)
  } catch (e) {
    console.error('[Momo] 星球三维实例创建失败，回退软渲染', e)
    return null
  }
}
