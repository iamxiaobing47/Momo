// 底部批量条的实际高度 → CSS 变量 `--momo-fab-h`（R5 骨架拆分，原 App.tsx 的
// fab effect；2026-09-22 窄面板遮挡修复）：
// 面板窄的时候五颗按钮横排放不下，批量条会缠绕成 2–4 行，高度不再是固定的 52px。
// `.momo-selecting .momo-content` 的底部预留就按这个**实测值**算
// （`calc(var(--momo-fab-h, 52px) + 48px)`），否则最后几张卡片会被它盖住——
// 这正是窄侧边栏里「多选后看不见最后一条」的成因。
// 面板宽度变化会改变行数，所以用 ResizeObserver 跟着重测；拿到 0（未布局 / 测试环境）
// 时清掉变量，让 CSS 用 52px 兜底（宽面板下本来就是一行）。
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { LangPref } from '../../momo/types'
import type { MainMode } from '../store'

export function useFabHeightVar(
  appRef: RefObject<HTMLDivElement | null>,
  fabRef: RefObject<HTMLDivElement | null>,
  selectMode: boolean,
  mode: MainMode,
  // 语言切换只重挂根 div（<div key={lang}>），App 自身不重挂——依赖里必须带 lang，
  // 否则 ResizeObserver 还盯着已卸载的旧 fab、`--momo-fab-h` 写在旧根上，
  // 新 `.momo-app` 落回 52px 兜底（BUG-28；useViewAnchorSync 同款写法）
  lang: LangPref,
): void {
  useEffect(() => {
    const app = appRef.current
    if (!app) return
    const el = fabRef.current
    if (!el) {
      app.style.removeProperty('--momo-fab-h')
      return
    }
    const sync = () => {
      const h = el.offsetHeight
      if (h > 0) app.style.setProperty('--momo-fab-h', `${h}px`)
      else app.style.removeProperty('--momo-fab-h')
    }
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [selectMode, mode, lang, appRef, fabRef])
}
