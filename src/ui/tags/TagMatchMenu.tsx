import { useLayoutEffect, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { TAG_MATCH_MODES } from '../../momo/types'
import { PopDialog, PopRow } from '../kit'

// 多选标签的组合方式浮层（2026-10-12）：点「过滤标签」输入框右侧那枚「两圆交叠」
// 按钮唤起。两行——并集 / 交集，点完即关（同 TagSortMenu）。
//
// 为什么它**不**进工具行（TagTreeToolbar 那颗漏斗的筛选浮层里）：工具行两枚按钮管
// 「侧栏显示哪些标签行」，这里管「主区怎么组合用户点中的那些标签」——一个是挑候选，
// 一个是读命中口径。挤进同一个浮层会让「筛选」这一词同时指两件事。
//
// 与筛选浮层另一处不同：它改的是**视图偏好**（落盘，ADR-003），筛选是会话内 transient。
// 所以这里没有「清除全部」——两行都是合法值，没有「回到未设状态」可言（并集只是默认值，
// 不是空态）。
//
// 两行各带一句口径（copy.tags.matchUnionHint / matchIntersectionHint）：名字「并集 /
// 交集」只是术语，用户要的是「点下去我的卡片列表会怎么变」。副文走 .momo-pop-sub，
// 行高因此从固定 28 改成随内容（见 30-pop/001-pop.css 的 .momo-pop-list-twoline）。

/**
 * 弹层尺寸。宽同时用于两处：这里的边界夹取，以及 TagFilterInput 算落点时的右对齐
 * （那边 `import { MENU_W }`，别在两处各写一个数）。236 与筛选浮层同宽——两颗按钮在
 * 侧栏上下相邻，浮层一样宽才不显得歪。
 * 高只是边界夹取的估算（2026-10-13 删掉组名与口径说明后：两行各约 36 + 间距与内距）。
 */
export const MENU_W = 236
const MENU_H = 96

export function TagMatchMenu({
  x,
  y,
  onClose,
  returnFocus,
}: {
  x: number
  y: number
  onClose: () => void
  /** BUG-82d：焦点归还落点（过滤框右侧那颗组合方式按钮），见 PopDialog.returnFocus */
  returnFocus?: () => HTMLElement | null
}) {
  const tagMatchMode = useUi((s) => s.tagMatchMode)
  const setTagMatchMode = useUi((s) => s.setTagMatchMode)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // x / y 已由调用方换算成「相对 .momo-app」的偏移；这里再按面板尺寸夹回可视区内。
  // 用面板（.momo-app）而不是窗口尺寸 —— 弹层是 absolute 定位，坐标基准就是它。
  // 夹完**同值就不 set**：setPos 每次都造新对象，无脑 set 会为了一个没变的落点多渲一轮
  // （落点夹取恒等是很常见的：调用方给的坐标本来就在可视区内）。同 TagSortMenu。
  useLayoutEffect(() => {
    const host = menuRef.current?.closest('.momo-app') as HTMLElement | null
    const w = host?.clientWidth ?? window.innerWidth
    const h = host?.clientHeight ?? window.innerHeight
    const left = Math.max(8, Math.min(x, Math.max(8, w - MENU_W - 8)))
    const top = Math.max(8, Math.min(y, Math.max(8, h - MENU_H - 8)))
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  }, [x, y])

  return (
    <PopDialog
      variant="free"
      ariaLabel={copy.tags.matchAria}
      style={{ left: pos.left, top: pos.top, width: MENU_W }}
      dialogRef={menuRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      onMaskClick={onClose}
      returnFocus={returnFocus}
    >
      {/* 无标题弹层（BUG-160 起 dialog 左上角不放标题，2026-10-13 连组名与它下面那句
          口径说明一起删了——同 TagFilterMenu 的组名说明：两行的副文已经各自说清口径）。
          两行选项的行高随内容（.momo-pop-list-twoline）。 */}
      <div className="momo-pop-list momo-pop-list-twoline">
        {TAG_MATCH_MODES.map((mode) => (
          <PopRow
            key={mode}
            label={
              <>
                <span>{copy.meta.tagMatch[mode]}</span>
                <span className="momo-pop-sub">
                  {mode === 'union' ? copy.tags.matchUnionHint : copy.tags.matchIntersectionHint}
                </span>
              </>
            }
            on={mode === tagMatchMode}
            onClick={() => {
              setTagMatchMode(mode)
              onClose()
            }}
          />
        ))}
      </div>
    </PopDialog>
  )
}
