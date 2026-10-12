import { DEPTH_RADIUS, MOUNT_RADIUS } from './geometry'

// 焦点滚动的「窗口挂载判定」（自 FocusScroll 的渲染段拆出）：**纯计算**——输入是
// 当前焦点下标，输出是每个槽位该不该挂真卡片、退后档距离。没有 React 状态、没有
// DOM 测量、没有 JSX。
//
// 之所以单独放一个文件：这段是「挂载窗口」的唯一真源，窗口半径一动，挂载数与滑行
// 途中的挂载/卸载行为就跟着变——单独一个文件才好对着测。
//
// **占位高度已随「一屏一卡」退场（v0.9.15 三轮）**：槽位高度由 CSS 定死
// （`height: var(--momo-focus-h)`，一屏），空槽不再需要估算高度，估算口径
// （实测均值 / 50px 取整档 / 夹取区间 / PLACEHOLDER_*）整体下线——滚动条长度
// 从此天生精确。几何与占位的取舍史见 FocusScroll.tsx 头部「一屏一卡」段。

/** 单个槽位的窗口 spec：两个值都直接当 props 下发，所以必须稳定（焦点不动就不许变） */
export interface FocusWindowSpec {
  /** 是否挂载真卡片：只挂焦点 ±MOUNT_RADIUS 的槽位，更远的只留「定高空槽」 */
  mounted: boolean
  /** 离焦点的距离，窗口外夹到 DEPTH_RADIUS + 1（窗口外的 props 因此恒定） */
  depth: number
}

/**
 * 挂载窗口解析器（给单个下标问槽位）。**惰性求值**：调用方在 `entries.map` 里
 * 逐项问，不给几百个行一次性分配 spec 对象。
 *
 * `glide` 是**滑行终点下标**（自管补间的目标；没有滑行时传 focus 即可）。窗口取
 * `[min(focus, glide) − R, max(focus, glide) + R]`：滑行途中焦点钉在目标卡上不动，
 * 中间的卡全落在窗口里——于是整个滑行过程**一次挂载 / 卸载都不发生**（真库里每次
 * 挂载都是一次 MarkdownRenderer，那正是「连滚几张就卡一下」的主力）。
 */
export function useFocusWindow(
  focus: number,
  glide: number,
): (index: number) => FocusWindowSpec {
  const lo = Math.min(focus, glide) - MOUNT_RADIUS
  const hi = Math.max(focus, glide) + MOUNT_RADIUS

  return (index) => {
    const mounted = index >= lo && index <= hi
    return {
      mounted,
      // 距离夹在上界内：窗口外的 props 因此恒定，焦点一动它们不必重渲
      depth: Math.min(Math.abs(index - focus), DEPTH_RADIUS + 1),
    }
  }
}
