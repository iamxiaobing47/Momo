import { useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'

// free 变体浮层的落点（六个调用点共用一份：标签管理 / 标签排序 / 标签筛选 /
// 组合方式 / 地点层级 / 单卡地点编辑）。此前每个调用点各抄一份
// `closest('.momo-app')` + 夹取，还各自维护一个 MENU_H / POP_H **估值**当上界。
//
// 症状（2026-10-14 用户报「dialog 出现的位置不固定，有时离鼠标很远」）：
// 估值按「候选列表撑满 + 底栏」的最坏情况预留，而弹层实际高度多数时候远小于它
// ——标签管理弹层的候选列表是**按输入框里当前标签名过滤**的（预填的就是当前标签），
// 多数标签一个候选都没有、整颗弹层只有 ~125px 高，估值却是 398。
// 真 Chromium 实测（1076×776 面板，同一颗弹层、真实高 125px）：
//
//   右键 y=151 → 落在 151（贴住鼠标）     右键 y=470 → 落在 382（差 88）
//   右键 y=760 → 落在 382（差 378！）
//
// 即：面板下半部分右键，弹层被按「最坏高度」顶到面板中部——离鼠标一整个屏幕。
// 修法就是 BUG-133g 当时自己写下的那条（「更稳的做法是量真实弹层高度后再夹」）：
// **先量再夹**。TagMatchMenu 早就按这个口径量宽度（`el?.offsetWidth || MENU_W`），
// 这里把它推广到全部六个调用点的宽高。jsdom 无布局（offsetWidth/Height 恒 0）→
// 退回调用方的估值，测试行为与估值年代逐值一致（估值因此降级成「量不到时的兜底」，
// 不再是落点真源；001-pop.css 那条「改度量要同步改估算值」只对这条兜底路径仍成立）。
//
// 夹取口径本身一个字没改（仍在面板内、仍留 8px 边距），只是把「面板高 - 估值」
// 换成「面板高 - 实测高」——放得下就贴着锚点，放不下才上移，且只上移刚好够的量。
// 尺寸变化（标签管理弹层的候选列表随输入长出来 / 缩回去）由 ResizeObserver 接着
// 重算：只按打开那一刻的高度夹，列表长出来后底栏会被挤出面板（BUG-133g 的原症状）。

/** 夹取安全边距：与 .momo-pop-free 的 `max-width: calc(100% - 16px)` 同一把尺 */
const PAD = 8

/** 量不到尺寸时的兜底（jsdom / 元素还没挂上）；宽高都是**上限**语义 */
export interface FreePopSize {
  w: number
  h: number
}

export interface FreePopOptions {
  /** 额外并进 style 的键（排序 / 筛选那几个浮层的定宽、组合方式的 max-content） */
  style?: CSSProperties
  /** x 的语义：left（默认）= 目标**左**缘；'right' = 目标**右**缘——宽度随内容
   *  收的浮层（组合方式是 `max-content`）只能按右缘对齐锚点，左缘随实测宽反推 */
  anchor?: 'left' | 'right'
}

export interface FreePopPlacement {
  /** 原样交给 PopDialog 的 dialogRef。用**回调 ref**：元素一挂上就重算尺寸，
   *  单卡地点弹层那种「先留锚点、portal 落定后才画弹层」的两段挂载也跟得上 */
  dialogRef: (el: HTMLDivElement | null) => void
  style: CSSProperties
}

/**
 * @param x,y    调用方算好的目标落点（相对 `.momo-app`；语义见 opts.anchor）
 * @param size   兜底尺寸（各调用点的 MENU_W/MENU_H、POP_W/POP_H）
 * @param opts   额外 style + 锚缘口径
 */
export function useFreePopPlacement(
  x: number,
  y: number,
  size: FreePopSize,
  opts: FreePopOptions = {},
): FreePopPlacement {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const fbW = size.w
  const fbH = size.h
  const anchor = opts.anchor ?? 'left'

  useLayoutEffect(() => {
    if (el === null) return
    const measure = (): void => {
      const host = el.closest<HTMLElement>('.momo-app')
      const w = host?.clientWidth ?? window.innerWidth
      const h = host?.clientHeight ?? window.innerHeight
      // 量真实尺寸；量不到（jsdom 无布局）就退回调用方的估值
      const dw = el.offsetWidth || fbW
      const dh = el.offsetHeight || fbH
      const want = anchor === 'right' ? x - dw : x
      const left = Math.max(PAD, Math.min(want, Math.max(PAD, w - dw - PAD)))
      const top = Math.max(PAD, Math.min(y, Math.max(PAD, h - dh - PAD)))
      // 夹完同值就不 set：setPos 造新对象，无脑 set 会为了一个没变的落点多渲一轮
      setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
    }
    measure()
    // ResizeObserver 只是「尺寸变了再夹一次」的增强：环境没给（部分 jsdom 用例不装
    // 这个全局）就跳过——首帧那次夹取不依赖它，与 useCellSize 的用法保持一致。
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, x, y, fbW, fbH, anchor])

  return { dialogRef: setEl, style: { ...opts.style, left: pos.left, top: pos.top } }
}
