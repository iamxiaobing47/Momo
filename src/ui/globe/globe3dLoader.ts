// globe3d.js（three.js 档）的装载器——main.js 侧唯一碰「脚本注入」的环节。
//
// Obsidian 插件宿主里没有可用的 ESM 动态 import（main.js 是 CJS，相对路径解析不到
// 插件目录），独立产物的加载走 app:// URL 注入 <script>：**与贴图那条路不同**——
// 贴图 2026-10-13 起改走「caps 读字节 → blob: URL」（资源 URL 跨源会把 canvas 污染成
// 跨源），而 <script> 不吃 CORS、经典脚本照常跨源装载。不碰 eval、不吃 CSP 的亏。
// 工厂在 window.__momoGlobe3D 上（globe3dStage.ts 挂的），经典脚本执行完才派发 load 事件，
// onload 里必然拿得到。
//
// 任何失败（URL 空 / onerror / 超时 / 产物里没有工厂）都 resolve(null)：调用方
// （GlobeStage）回退 canvas 软渲染。模块级缓存**只存成功**（与 loadGlobeCube 同款
// 理由：一次失败锁死整个会话只会表现为「永远软渲染」，重试救得回文件晚到的情况）。

import type { Globe3DFactory, Globe3DInstance } from './globe3dTypes'
import { withAssetRev } from './globeAssetRev'

/** 真环境里脚本加载不该超过几百 ms；15s 是兜死线，超时按失败处理（回退软渲染） */
const LOAD_TIMEOUT_MS = 15_000

declare global {
  interface Window {
    __momoGlobe3D?: Globe3DFactory
  }
}

let cached: Promise<Globe3DFactory | null> | null = null

export function loadGlobe3D(url: string): Promise<Globe3DFactory | null> {
  if (url === '') {
    return Promise.resolve(null)
  }
  if (cached !== null) {
    return cached
  }
  const promise = new Promise<Globe3DFactory | null>((resolve) => {
    const script = document.createElement('script')
    const settle = (value: Globe3DFactory | null): void => {
      window.clearTimeout(timer)
      // 只缓存成功：失败清掉这一格，下次挂载重试（贴图装载同款口径）
      if (value === null && cached === promise) cached = null
      script.remove()
      resolve(value)
    }
    const timer = window.setTimeout(() => {
      settle(window.__momoGlobe3D ?? null)
    }, LOAD_TIMEOUT_MS)
    script.onload = () => {
      settle(window.__momoGlobe3D ?? null)
    }
    script.onerror = () => {
      settle(null)
    }
    script.src = withAssetRev(url)
    document.head.appendChild(script)
  })
  cached = promise
  return promise
}

/**
 * 工厂 → 实例的**守梯创建**（BUG-183b）：`create` 按契约只在 WebGL 不可用时返回
 * null，但损坏的 `getContext` 桩 / 极端环境会让它**抛错**。旧实现让异常冒成
 * rejection：`Promise.all` 进 `.catch` 报「贴图解码失败」（口径不符——解码其实
 * 成功）、`backend3dRef` 永远停在 undefined → 连软渲染球都出不来，只剩黑卡 +
 * 说明条。这里把「返回 null」与「抛错」并到同一条回退路径：异常只留日志，
 * 调用方照常拿到 null 走软渲染。
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
