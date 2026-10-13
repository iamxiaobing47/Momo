// 视图联动（v0.9.15）的两步（R5 骨架拆分，原 App.tsx 的两条 effect）：
// ① 非焦点密度的锚点跟踪——`.momo-content` 滚动时（rAF 节流、passive 监听）把
//    「视口最上面那张卡」写进视图锚点；
// ② 切密度即落位——新密度挂载完（布局阶段，早于绘制）把落点定下来。
// 机制与取舍全在 viewAnchor.ts，这里只留挂载接线。
//
// 2026-10-12：网格档整体移除，原先为它写的那条分支（进网格回第一张、网格不参与
// 锚点，BUG-210）随视图一起删掉——现在只剩「焦点档自己认领 / 其余档归位到锚点卡」。
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { clearAnchor, pickTopPath, readAnchor, restoreAnchor, writeAnchor } from '../shared/viewAnchor'
import type { Density } from '../../momo/types'
import { useUi } from '../store'

export function useViewAnchorSync(
  appRef: RefObject<HTMLDivElement | null>,
  lang: string,
  density: Density,
): void {
  // ① 锚点跟踪（passive effect）
  //   · 焦点密度下 `.momo-content` 不含可滚内容（`.momo-focus-wrap` 吃满高度），
  //     这边天然安静；焦点卡的锚点由 FocusScroll 按焦点下标写（它是现成状态，
  //     不花布局读）。密度判断只是防御，不指望 CSS 一直这么兜着。
  //   · 每帧最多一次 elementFromPoint（O(1)，FocusScroll 同款），不逐槽位读 rect；
  //     把当前锚点递给 `keep`，让「锚点没动」的那些帧一次 rect 就返回（不必从顶往下扫）。
  //   · **依赖 lang**：语言切换以 key 重挂整棵子树（.momo-content 是新节点），
  //     监听必须跟着重挂——漏了它，listener 留在被卸载的旧节点上，跟踪静默失效。
  useEffect(() => {
    // lang 不参与监听逻辑，只标记「整棵子树已按 key 重挂」：`.momo-content` 换成了新
    // 节点，监听必须重挂到它上面（漏了 = listener 留在被卸载的旧节点上，跟踪静默失效）。
    // body 里显式读一次，它才算**真依赖**——只写进依赖表会被规则判成多余依赖。
    void lang
    const app = appRef.current
    const scroller = app?.querySelector<HTMLElement>('.momo-content')
    if (!app || !scroller) return
    let raf = 0
    const track = () => {
      raf = 0
      if (useUi.getState().density === 'focus') return
      // 滚到顶 = 没有「当前卡」，清锚点。scrollAppToTop 归零 scrollTop 后，这次
      // 程序化滚动自己触发的 scroll 事件也会走到这儿——不清的话，「回家」刚清掉的
      // 锚点又被「最上面那张卡」填回去，clearAnchor 形同虚设。
      if (scroller.scrollTop === 0) {
        clearAnchor(app)
        return
      }
      const path = pickTopPath(scroller, readAnchor(app))
      if (path) writeAnchor(app, path)
    }
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(track)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [lang, appRef])

  // ② 切密度即落位（layout effect，早于绘制）
  // 新密度挂载完把落点定下来——用户切的是看法，位置该是说得清的那一个：
  //   · 进**焦点**：跳过——它滚内层 `.momo-focus`、落点是「居中」不是「贴顶」，
  //     由 FocusScroll 挂载时自己认领（见那边同名的 useLayoutEffect）；
  //   · 进**列表**：把锚点那张送到视口顶部。
  // 首挂不落位（还没有锚点）。
  const prevDensityRef = useRef<Density | null>(null)
  useLayoutEffect(() => {
    const prev = prevDensityRef.current
    prevDensityRef.current = density
    if (prev === null || prev === density || density === 'focus') return
    restoreAnchor(appRef.current)
  }, [density, appRef])
}
