import { useLayoutEffect, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { TAG_SORT_KEYS } from '../../momo/types'
import { PopDialog, PopRow } from '../kit'

// 侧栏标签区的排序浮层（v0.9.18，点工具行上那枚排序按钮唤起）。
//
// 与 TagEditMenu 共用骨架（PopDialog 的 free 变体）：遮罩 + 自由落点 + Esc 关闭 +
// 点遮罩关闭 + 落点夹回面板内。行用 PopRow（check 圈 + 名字）。
//
// **方向不做成可翻转的第二档**：三个键的方向语义都是固定的（数量多→少、
// 附件数多→少、名称 A→Z），没人想看「数量最少的标签」；侧栏 232px 也放不下
// 第二个控件。真要扩展，加键比加控件干净。
//
// 右边那一列数字（列表里的 momo-tagrow-count）会跟着排序键走：按「附件数」排时
// 它显示配图张数，其余两键显示条数 —— 否则用户看不出「凭什么 3 张排在 12 张前面」。

/**
 * 弹层尺寸。宽同时用于两处：这里的边界夹取，以及 TagTree 算落点时的右对齐
 * （那边 `import { MENU_W }`，别在两处各写一个数）。窄档下 CSS 的
 * `.momo-pop-free { max-width: calc(100% - 16px) }` 还会再收一道，所以宽是**上限**。
 * 高只是边界夹取的估算（没有底栏：PopDialog 在 footerLeft / footerActions 都为空时
 * 不渲染底栏，见 kit/PopDialog.tsx）。
 */
export const MENU_W = 176
const MENU_H = 170

export function TagSortMenu({
  x,
  y,
  onClose,
  returnFocus,
}: {
  x: number
  y: number
  onClose: () => void
  /** BUG-82d：焦点归还落点（工具行上那颗排序按钮），见 PopDialog.returnFocus */
  returnFocus?: () => HTMLElement | null
}) {
  const tagSort = useUi((s) => s.tagSort)
  const setTagSort = useUi((s) => s.setTagSort)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // x / y 已由调用方换算成「相对 .momo-app」的偏移；这里再按面板尺寸夹回可视区内。
  // 用面板（.momo-app）而不是窗口尺寸 —— 弹层是 absolute 定位，坐标基准就是它。
  // 夹完**同值就不 set**：setPos 每次都造新对象，无脑 set 会为了一个没变的落点多渲一轮
  // （落点夹取恒等是很常见的：调用方给的坐标本来就在可视区内）。
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
      ariaLabel={copy.tags.sortAria}
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
      <div className="momo-pop-list">
        {TAG_SORT_KEYS.map((key) => (
          <PopRow
            key={key}
            label={copy.meta.tagSort[key]}
            on={key === tagSort}
            onClick={() => {
              setTagSort(key)
              onClose()
            }}
          />
        ))}
      </div>
    </PopDialog>
  )
}
