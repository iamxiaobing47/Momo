import { useLayoutEffect, useState, type RefObject } from 'react'

// 格子尺寸实测：ResizeObserver 量「要被格子填满的那个元素」的宽 → 每列像素。
// ref 必须挂在与格子区同宽的容器上（统计页是 momo-cal-main，侧栏是 momo-heat-scroll），
// 量出来的就是可用宽，调用方不用再预估星期列之类的旁侧开销。
// 列间 gap 由调用方声明（gap × (cols−1) 从可用宽里扣，公式漏算间隙会把整行挤出
// 容器右缘——统计页 53 列 × 2px 就是 104px，v0.7.x 的溢出即此）；再扣 1px 亚像素
// 余量，整行总宽压在 clientWidth 整数线下，取整向上也不会触发横向滚动条。
// clamp 区间与初始值由调用方给（统计页 6–15px 夹取，侧栏不夹取、跟随容器）。
export function useCellSize(
  ref: RefObject<HTMLElement | null>,
  cols: number,
  opts: { min: number; max: number; gap: number; initial: number },
): number {
  const [px, setPx] = useState(opts.initial)
  const { min, max, gap, initial } = opts
  // useLayoutEffect：首帧绘制前量好，避免 initial 估计值先按错误尺寸溢出一帧
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const compute = () => {
      const w = el.clientWidth
      if (w > 0) setPx(Math.max(min, Math.min(max, (w - gap * (cols - 1) - 1) / cols)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, cols, min, max, gap, initial])
  return px
}
