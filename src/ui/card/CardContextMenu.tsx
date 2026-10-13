import React, { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUi } from '../store'
import { CARD_MENU_ACTIONS } from '../registry/cardActions'

export interface CardContextMenuProps {
  /** 视口坐标（clientX / clientY） */
  x: number
  y: number
  path: string
  isPinned: boolean
  onClose: () => void
}

/** 菜单估算尺寸：把落点夹回包含块内用（规格见 styles.css .momo-pop-menu） */
const MENU_W = 160
const MENU_H = 48

const CardContextMenu: React.FC<CardContextMenuProps> = ({ x, y, path, isPinned, onClose }) => {
  const toggleNotePin = useUi((s) => s.toggleNotePin)
  const ref = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // BUG-176d：关闭时把焦点还给打开菜单的元素（键盘路径：卡根 Shift+F10 / 菜单键）。
  // 渲染期快照（同 BatchBar 的 BUG-167a 纪律）——被动 effect 跑时 DOM 已变，
  // activeElement 早被浏览器摘回 body。
  const prevFocusRef = useRef<Element | null>(null)
  if (prevFocusRef.current === null) prevFocusRef.current = document.activeElement

  useEffect(() => {
    // 挂载时抓一次菜单节点：cleanup 里再读 `ref.current`，规则会判「读到的是可能已
    // 换过的 ref」；本 effect 无依赖表、只跑一次，抓下来的就是同一个节点，语义不变。
    const menuEl = ref.current
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuEl && !menuEl.contains(target)) {
        onCloseRef.current()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      // 焦点归还：只在「焦点掉到 body / 还悬在将被卸载的菜单里」时才还——
      // 用户点去别的可聚焦元素时那个元素自己会拿焦点，别跟人抢。
      const active = document.activeElement
      const lost = active === null || active === document.body || (menuEl !== null && menuEl.contains(active))
      const prev = prevFocusRef.current
      if (lost && prev instanceof HTMLElement && prev.isConnected) prev.focus()
    }
  }, [])

  const handlePin = useCallback(() => {
    toggleNotePin(path)
    onCloseRef.current()
  }, [toggleNotePin, path])

  // 菜单挂到 .momo-app 根上，**不留在卡片里**（设计稿把它定义为「全屏定位元素」）：
  // ① 焦点滚动会把退后的卡 transform: scale(0.96) + blur(2.3px)，留在卡里的菜单
  //    会跟着变小变糊；② 挂到 app 根后包含块就是 .momo-app（position: relative），
  //    坐标换算只有一个基准。portal 目标用 closest 现找，不新增容器节点。
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setHost((anchorRef.current?.closest('.momo-app') as HTMLElement | null) ?? null)
  }, [])

  // BUG-128d：菜单声明的 role=menu 里子项是裸 button（无 role=menuitem）、弹层既不
  // focus 也无方向键——AT 读到一个空 menu。host 定下（portal 挂上菜单）后把焦点
  // 收进第一项，↑↓ 在项间移动（onKeyDown 在菜单上）。
  useEffect(() => {
    if (!host) return
    const el = ref.current
    if (!el) return
    const first = el.querySelector<HTMLElement>('[role="menuitem"]')
    ;(first ?? el).focus()
  }, [host])

  // 定位：absolute + 相对**自己的 offsetParent**（= portal 后的 .momo-app）换算。
  // 不直接写 clientX/clientY：.workspace-leaf 的 contain:strict 会让 fixed 的包含块
  // 变成 leaf；也不写死「相对 .momo-app」再在调用方换算——包含块到底是哪个定位
  // 祖先由 CSS 决定（.momo-main / .momo-group 都是 relative），
  // offsetParent 正是浏览器算出来的那个，跟着它换算永远对齐光标（v0.9.0 第一版
  // 按 app 换算，被 .momo-main 的侧栏宽度带偏过，见工单偏离 3 的追记）。
  const [position, setPosition] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const base = (el.offsetParent as HTMLElement | null) ?? document.documentElement
    const baseRect = base.getBoundingClientRect()
    const w = base.clientWidth || window.innerWidth
    const h = base.clientHeight || window.innerHeight
    const pad = 8
    let nx = x - baseRect.left
    let ny = y - baseRect.top
    if (nx + MENU_W > w - pad) nx = w - MENU_W - pad
    if (ny + MENU_H > h - pad) ny = h - MENU_H - pad
    if (nx < pad) nx = pad
    if (ny < pad) ny = pad
    setPosition({ x: nx, y: ny })
  }, [x, y, host])

  const menu = (
    <div
      ref={ref}
      className="momo-pop-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        if (items.length === 0) return
        const idx = items.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          items[(idx + 1) % items.length].focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          items[(idx - 1 + items.length) % items.length].focus()
        }
      }}
    >
      {/* 菜单项走 registry/cardActions.tsx 的 CARD_MENU_ACTIONS（R8b；当前只有
          置顶一枚，P5 起「分享到广场」进来）——加一项改注册表，不动这里 */}
      {CARD_MENU_ACTIONS.map((a) => (
        <Fragment key={a.id}>{a.render({ path, isPinned, onPick: handlePin })}</Fragment>
      ))}
    </div>
  )

  // host 未定（首帧）时先留个不可见锚点拿 closest；定了就 portal 到 app 根。
  if (!host) return <span ref={anchorRef} style={{ display: 'none' }} />
  return createPortal(menu, host)
}

export default CardContextMenu
