import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { SIDEBAR_WIDTH, clampSidebarWidth } from '../../momo/types'
import { copy } from '../../momo/i18n'

// 侧栏拖宽手柄（UI-11）。pointerdown 后 setPointerCapture 捕获在手柄上，
// 拖动过程直接写 `--momo-sidebar-width`（不动 React state，拖动零重渲），
// 松手才回调一次让 store 落盘（data.json）；双击恢复默认，左右方向键 ±24px。
// 面板总宽的 60% 是拖动上限（clampSidebarWidth 只管绝对区间）。

export function ResizeHandle({
  sidebarSide,
  sidebarWidth,
  appRef,
  onCommit,
}: {
  sidebarSide: 'left' | 'right'
  sidebarWidth: number
  /** 面板根节点：CSS 变量写在它上面，拖动期间零 React 渲染 */
  appRef: React.RefObject<HTMLDivElement | null>
  /** 松手时提交最终宽度（store.setPrefs → data.json） */
  onCommit: (width: number) => void
}) {
  // D-11：三个 window 监听收进一个按 dragging 驱动的 effect。旧写法在 pointerdown
  // 里 addEventListener、只在 pointerup / pointercancel 时摘除——而它用了
  // setPointerCapture，拖拽途中面板被卸载（视图关闭 / 切密度 → root.unmount）时
  // 浏览器发的是 lostpointercapture，**不是** pointerup：三个监听永久残留在
  // window 上。收进 effect 后卸载时 cleanup 照样跑，监听一定摘得掉。
  //
  // 另一半（不能回頭把用户拖好的宽度弄丢）：卸载发生时如果拖拽还没结束，
  // 就把这轮的结果落盘——旧行为是「监听残留 + 松手时仍能提交」顺带做到了这点
  // （app.sidebar-drag 的 Q1 第二条用例锁的就是那个意图），现在改成显式补一次。
  const [dragging, setDragging] = useState(false)
  const lastRef = useRef(sidebarWidth)
  /** 这一轮拖拽是否已提交过：onUp 与卸载补提交都可能走到，只许落一次盘 */
  const committedRef = useRef(true)
  // 最新回调 / 宽度 / 拖拽态经 ref 读取：下面的卸载补提交只挂一次，不跟着 deps 重挂
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const sidebarWidthRef = useRef(sidebarWidth)
  sidebarWidthRef.current = sidebarWidth
  const draggingRef = useRef(false)
  // 拖动全程复用的面板 rect：pointerdown 时量一次。拖动期间面板总宽不变，而
  // getBoundingClientRect 每次 pointermove 读一次会强制布局（BUG-70c）。
  const rectRef = useRef<DOMRect | null>(null)

  useEffect(() => {
    if (!dragging) return
    const app = appRef.current
    // 拖动全程给 app 根挂 momo-resizing，CSS 借它关掉 sidebar / handle 的 320ms
    // width 过渡（那是折叠/展开动画的参数）：留着的话侧栏永远追不上指针，松手后
    // 主区还要多回流 ~320ms，卡片看起来「跳一下」。classList 直写、不进 state，
    // 「拖动零 React 渲染」不破；摘除只走下面的 cleanup（正常松手的
    // setDragging(false) 与拖拽中卸载都经过它），与监听同进同出。
    app?.classList.add('momo-resizing')
    const measure = (clientX: number): number => {
      const rect = rectRef.current
      if (!rect) return sidebarWidth
      const max = Math.max(SIDEBAR_WIDTH.min + 80, Math.floor(rect.width * 0.6))
      const raw = sidebarSide === 'right' ? rect.right - clientX : clientX - rect.left
      return Math.min(max, clampSidebarWidth(Math.round(raw)))
    }
    const commit = (): void => {
      if (committedRef.current) return
      committedRef.current = true
      if (lastRef.current !== sidebarWidth) onCommit(lastRef.current)
    }
    const onMove = (ev: PointerEvent) => {
      lastRef.current = measure(ev.clientX)
      appRef.current?.style.setProperty('--momo-sidebar-width', `${lastRef.current}px`)
    }
    const onUp = () => {
      draggingRef.current = false
      setDragging(false)
      commit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      app?.classList.remove('momo-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      // 「拖拽被卸载打断时的补提交」不放在这里：这个 cleanup 在 deps 变更时同样
      // 会跑，历史上 onCommit 是 JSX 内联箭头（App 每次重渲都是新引用），拖拽途中
      // App 一旦重渲就会提前提交，松手时的最终宽度反而进不了 store（BUG-11）。
      // 现在 App 传的是 useCallback 的 commitSidebarWidth（引用稳定），但仍把补提交
      // 留在下面只跑一次的卸载 effect 里——任何 deps 变更路径下都只提交一次。
    }
  }, [dragging, sidebarSide, sidebarWidth, onCommit, appRef])

  // 拖拽被**真卸载**打断（视图关闭 / 切密度 → root.unmount）：监听已随上面的
  // cleanup 摘掉，这里把这轮结果落盘（D-11 的后半段意图，app.sidebar-drag Q1）。
  useEffect(
    () => () => {
      if (!draggingRef.current || committedRef.current) return
      committedRef.current = true
      if (lastRef.current !== sidebarWidthRef.current) onCommitRef.current(lastRef.current)
    },
    [],
  )

  const resizeKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    onCommit(clampSidebarWidth(sidebarWidth + (e.key === 'ArrowLeft' ? -24 : 24)))
  }

  return (
    <div
      className="momo-resize-handle"
      role="separator"
      aria-orientation="vertical"
      // BUG-128f：可聚焦 separator 必须给可及名 + 值区间（旧实现三样都缺——
      // 键盘能 ±24px 改宽却读不出当前宽度）。
      aria-label={copy.panel.sidebar.resizeAria}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={sidebarWidth}
      tabIndex={0}
      onPointerDown={(e) => {
        const app = appRef.current
        if (!app || e.buttons !== 1) return
        e.preventDefault()
        lastRef.current = sidebarWidth
        committedRef.current = false
        draggingRef.current = true
        // 面板总宽在拖动期间不变：rect 只在这一刻量一次，measure 全程复用（BUG-70c）
        rectRef.current = app.getBoundingClientRect()
        // 捕获在手柄上：指针移出手柄窗口外仍收到 move/up
        e.currentTarget.setPointerCapture(e.pointerId)
        // flushSync：监听住在 effect 里，必须在本 handler 返回前就位——否则
        // 紧随其后的 pointermove 会落在没有监听器的窗口上（拖拽头几像素丢失）。
        flushSync(() => setDragging(true))
      }}
      onDoubleClick={() => onCommit(SIDEBAR_WIDTH.default)}
      onKeyDown={resizeKeyboard}
    />
  )
}
