import { useEffect, useRef, useState } from 'react'
import { createSlotInfo, currentEstimate, observeSlot, windowSupported } from './mountWindow'

// 轻槽位（「虚拟滚动」的渲染层，v0.9.13）：靠近视口才把 children（Card）
// 挂进来，离开远了卸载，只留一个带实测高度的空 div 占位——
// 滚动几何与全量挂载时逐像素一致（卸载回填的是量过的原值，不是估值）。
// 机制全在 mountWindow.ts：双阈值滞回、高度缓存、锚点修正、无 IO 回退。
// （曾注：grid 密度（CSS 多列瀑布流）不走这里——那一档 2026-10-12 已整体移除。）
//
// **没有 IntersectionObserver 的环境不套槽位**（jsdom / 老 Electron）：直接渲染
// children。两个好处：① 不白付 N 个组件实例 + N 个 div 的开销（那条路径上没有
// 窗口化可省，全都会挂载）；② 那一侧看到的 DOM 与窗口化前逐字一致，存量 DOM
// 契约测试天然不受影响（窗口化行为由 IO 支持的用例钉死，见
// scripts/window-mount.test.mts——它用假 IO 伪造相交）。

export interface WindowSlotProps {
  /** 条目路径（高度缓存的键；不随排序 / 筛选变） */
  path: string
  /** 在列表里的位次（data-index：测试的假 IO 按它对数，也方便 DevTools） */
  index: number
  children: React.ReactNode
}

/** S7：早退挪到外层——hooks 规则要求条件 return 必须排在所有 hook 之后，
 *  旧写法 `if (!windowSupported()) return …` 出现在 hook 之前，字面违规
 *  （只因该函数在进程内恒定而不可触发，BUG-70a 登记的「零成本挪位」）。 */
export function WindowSlot({ path, index, children }: WindowSlotProps): React.JSX.Element {
  if (!windowSupported()) return <>{children}</>
  return <WindowSlotInner path={path} index={index} children={children} />
}

function WindowSlotInner({ path, index, children }: WindowSlotProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  // 估算高度首挂时快照一次：均值会随新测量漂移，快照后这个槽位的 props 才稳定
  // （focus 的 useFocusWindow 用 50px 取整达成的同一目的）
  const [estimate] = useState(() => currentEstimate())
  // 槽位信息 render 期就创建：占位高度第一帧必须正确，等 effect 补会先闪一帧 0 高度
  const infoRef = useRef<ReturnType<typeof createSlotInfo> | null>(null)
  if (!infoRef.current) {
    infoRef.current = createSlotInfo({ path, estimate, onMount: setMounted })
  }
  const info = infoRef.current

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return observeSlot(el, info)
    // info 首帧创建后不再变（estimate 已快照）；挂载状态由 IO 回调经 setMounted 翻转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      className="momo-slot"
      data-index={index}
      data-path={path}
      data-mounted={mounted ? '1' : '0'}
      style={mounted ? undefined : { height: `${info.usedHeight}px` }}
    >
      {mounted ? children : null}
    </div>
  )
}
