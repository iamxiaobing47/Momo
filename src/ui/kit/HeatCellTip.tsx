import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { copy } from '../../momo/i18n'
import { parseDay } from '../../momo/dates'

// 热力图格子的悬浮提示（2026-09-28）：某格的「9月28日 · 3 条」——日期 + 当日 Momo 条数。
// 侧栏滚动窗（Heatmap.tsx）与统计页整年日历（CalendarGrid.tsx）**共用**：两处格子
// 本就是同一套数据与色阶口径（见 StatsHeatmap.tsx 头注释），没理由只有一处有提示。
//
// 为什么是 portal 到 .momo-app 的自定义浮层、而不是原生 `title`：v0.9.2 起明确否决
// 原生 title（stats/drill.tsx 注释列了六条罪：黑底白字与 accent 体系割裂、悬停约 1 秒
// 才弹、格子小而密时扫过排队弹出又消失、贴面板边缘被窗口裁掉、键盘聚焦不显示、触屏
// 失效）。 portal + 绝对定位一并解决「被裁」：格子住在 .momo-heat-scroll
// （overflow-x: hidden，纵向同算 auto）与 .momo-sidebar-inner（overflow-y: auto）里，
// 放在格子内的浮层必被其中一层裁掉；挂到 .momo-app 根后包含块唯一（它是 position:
// relative，定位基准与 CardContextMenu 同一套）。宿主不现找锚点，而是 show 时从格子
// closest('.momo-app') 一并取来——常驻组件没有「开菜单那一刻」可挂锚。
//
// trigger 用 mouseover / mouseout 而不是 mouseenter / mouseleave：格子是无子元素的
// div，两者等价，而前者在 jsdom 里派发原生 mouseover 就能触发 React 处理器
// （enter/leave 要靠 relatedTarget 合成，测试里不可靠），heatmap-render 的用例因此
// 不需要给 React 补 shim。
//
// BUG-212（2026-10-12）：格子的 aria-label 与这里 show 的文字同文（heatTipText），
// 而 Obsidian 对 aria-label 也弹原生黑底气泡（body 委托 pointerover[aria-label]）——
// 不压制的话每格悬停一次弹两枚。`.momo-heat-cell` 上的 `--no-tooltip: true` 把
// 原生的那枚关掉（Obsidian 源码：getComputedStyle(...).trim() === "true" 即跳过），
// 自建提示与读屏名都不动；守卫见 scripts/aria-tooltip-css.test.mts。

/** 提示内容：日期键 + 当日条数 → 「9月28日 · 3 条」（文案唯一入口在字典） */
export function heatTipText(key: string, count: number): string {
  const d = parseDay(key)
  return copy.heatmap.tip(copy.date.monthDay(d.getMonth() + 1, d.getDate()), count)
}

export interface HeatTipState {
  /** 提示文字（调用方hover时由 heatTipText 生成） */
  text: string
  /** portal 宿主 = 格子最近的 .momo-app（show 时一并取好，免去找宿主的第二帧） */
  host: HTMLElement | null
  /** 格子中心的视口 x（clientX 口径） */
  cx: number
  /** 格子上 / 下边的视口 y：上方放不下就翻到下面 */
  top: number
  bottom: number
}

export interface HeatTipApi {
  /** 当前提示；null = 不显示 */
  tip: HeatTipState | null
  /** 格子悬浮入口：el 传格子元素本身（量它的rect定位） */
  show: (key: string, count: number, el: HTMLElement) => void
  /** 离开格子（或任何滚动 / 尺寸变化）：收起 */
  hide: () => void
}

/** 与提示边缘的最小间距（视口 / .momo-app 根内） */
const PAD = 8
/** 提示与格子之间的缝隙 */
const GAP = 6

export function useHeatTip(): HeatTipApi {
  const [tip, setTip] = useState<HeatTipState | null>(null)
  const visible = tip !== null

  const show = useCallback((key: string, count: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    // 宿主跟着格子现找（closest）：不新增容器节点，也不留「首帧 anchor 不存在、
    //     effect 空依赖只跑一次」的坑——CardContextMenu 是开菜单时才挂组件，
    //     HeatTip 常驻在热力图里，那种拿法永远拿不到宿主。
    const host = el.closest<HTMLElement>('.momo-app')
    setTip({ text: heatTipText(key, count), host, cx: r.left + r.width / 2, top: r.top, bottom: r.bottom })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  // 提示是瞬态物：滚动 / 窗口尺寸一变，格子的视口位置就失真。追着重算是白费
  // （侧栏滚动时格子在动、统计页窄面板下日历自己还会横向滚），直接收起更稳——
  // 用户停止滚动后光标仍在格子上，但提示不重新弹出，直到下一次移入。
  // scroll 用捕获阶段：.momo-sidebar-inner / .momo-cal-body 的滚动不冒泡到 window。
  useLayoutEffect(() => {
    if (!visible) return
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [visible, hide])

  return { tip, show, hide }
}

/**
 * 悬浮提示本体：portal 到 .momo-app 根（宿主持在 tip.host 里，show 时从格子
 * closest 出来），绝对定位置相对于自己的 offsetParent。
 * pointer-events: none 写在 CSS 里（.momo-heat-tip），提示覆盖光标时不会抢 hover。
 */
export function HeatTip({ tip }: { tip: HeatTipState | null }): React.JSX.Element | null {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  // 位置：默认在格子上方；上方贴边就翻到下面；左右夹回包含块内。
  // 在 useLayoutEffect 里算——挂载同帧、首帧绘制前就定好位，不会看到它先在 (0,0) 闪一下。
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || !tip) return
    const base = (el.offsetParent as HTMLElement | null) ?? document.documentElement
    const br = base.getBoundingClientRect()
    const w = base.clientWidth || window.innerWidth
    const tw = el.offsetWidth
    const th = el.offsetHeight
    let x = tip.cx - br.left - tw / 2
    let y = tip.top - br.top - th - GAP
    if (y < PAD) y = tip.bottom - br.top + GAP
    if (x + tw > w - PAD) x = w - PAD - tw
    if (x < PAD) x = PAD
    setPos({ x, y })
  }, [tip])

  if (!tip || !tip.host) return null
  return createPortal(
    <div ref={boxRef} className="momo-heat-tip" style={{ left: pos.x, top: pos.y }} role="tooltip">
      {tip.text}
    </div>,
    tip.host,
  )
}
