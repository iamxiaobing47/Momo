import { useLayoutEffect, useRef, useState } from 'react'
import { copy } from '../../../momo/i18n'
import { LOC_TREE_LEVELS, type LocTreeLevel, type LocTreeLevels } from '../../../momo/locations'
import { PopDialog } from '../../kit'

// 侧栏「全部地点」树的层级过滤浮层（2026-10-01 单选；2026-10-10 起**多选**）：
// 四颗 chips（全部 / 大洲 / 国家 / 地点）可同时勾几级，口径 = momo/locations/
// locTree.ts 的 `filterLocTreeByLevels`（纯函数：只保留勾中的级，树形照旧），
// 这里只接线与呈现——同 TagFilterMenu 的分工（那边两组单选，这边一组多选）。
//
// 与标签区筛选浮层的三点差别：
// ① 只有一组、没有「清除全部」底栏：四颗里就有一颗「全部」，点它即回完整树，
//    chips 自己说得清（PopDialog 的底栏只在真有内容时渲染，这里什么都不给）；
// ② 选完**不关浮层**（同标签区）：用户要看着后面的树变才知道生效了——
//    关浮层的入口是 Esc / 点遮罩 / 再点一次标题行那颗漏斗；
// ③ 复用标签浮层的视觉件（`.momo-tagfgroup` / `.momo-tagchip`）：两棵树的
//    工具行本来就该长成一个样，不为它再造一套 pill 样式。
//
// 「全部」这颗在多选下的语义 = **复位**（不是组内的一份子）：点它回
// `['all']` = 完整三级树；反过来只要勾了具体级，它就熄灭。一级都不勾时
// （把最后一级也点掉）同样回 `['all']`——没有条件就是全部，同筛选 chip 常例。
//
// 两条口径边界（与 momo/locations/locTree.ts 的四条对齐）：只影响**侧栏这棵树**——
// 不动主区筛选（那是 `filterLocations` 与落盘 pref `locLevel` 的口径），也不清
// `filterLocations`（主区还筛着的地区照筛，档位下看不到选中行而已）。

/**
 * 弹层宽度：一组 4 枚 chip，比标签区那个两组版（236）窄一档。宽同时用于
 * 边界夹取与 LocTreeSection 算落点时的右对齐（那边 `import { MENU_W }`）。
 * 高只是夹取估算（同 TagFilterMenu 的 MENU_H 口径，不追求精确）——多选后
 * 组名下一行口径说明仍是一行字，高度估值不变。
 */
export const MENU_W = 208
const MENU_H = 168

export function LocFilterMenu({
  x,
  y,
  levels,
  onPick,
  onClose,
}: {
  /** 落点（已由调用方换算成「相对 .momo-app」的偏移） */
  x: number
  y: number
  /** 当前勾了的级（chips 的选中态；['all'] / 空 = 完整三级树） */
  levels: LocTreeLevels
  /** 勾 / 取消一级（'all' = 复位）：store 的 toggleLocTreeLevel */
  onPick: (level: LocTreeLevel) => void
  onClose: () => void
}): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 按面板尺寸夹回可视区（弹层 absolute，坐标基准是 .momo-app 不是窗口）。
  // 夹完**同值就不 set**（同 TagSortMenu / TagFilterMenu：setPos 造新对象，
  // 白搭一轮渲染）。
  useLayoutEffect(() => {
    const host = menuRef.current?.closest('.momo-app') as HTMLElement | null
    const w = host?.clientWidth ?? window.innerWidth
    const h = host?.clientHeight ?? window.innerHeight
    const left = Math.max(8, Math.min(x, Math.max(8, w - MENU_W - 8)))
    const top = Math.max(8, Math.min(y, Math.max(8, h - MENU_H - 8)))
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  }, [x, y])

  // 「全部」亮不亮只看「此刻是不是完整树」——具体级勾了几颗与它无关
  const full = levels.length === 0 || levels.includes('all')

  return (
    <PopDialog
      variant="free"
      ariaLabel={copy.location.treeFilterAria}
      style={{ left: pos.left, top: pos.top, width: MENU_W }}
      dialogRef={menuRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      onMaskClick={onClose}
    >
      <div className="momo-tagfgroup">
        <div className="momo-tagfgroup-head">
          <span className="momo-tagfgroup-label">{copy.location.treeFilterGroup}</span>
          {/* 一行口径说明（同标签区两组：组名下一行人话，写太长会挤破 208px） */}
          <span className="momo-tagfgroup-hint">{copy.location.treeFilterHint}</span>
        </div>
        <div className="momo-tagfgroup-chips">
          {LOC_TREE_LEVELS.map((value) => {
            const on = value === 'all' ? full : levels.includes(value)
            return (
              <button
                key={value}
                type="button"
                className={`momo-tagchip${on ? ' momo-tagchip-on' : ''}`}
                aria-pressed={on}
                onClick={() => onPick(value)}
              >
                {copy.location.treeLevel[value]}
              </button>
            )
          })}
        </div>
      </div>
    </PopDialog>
  )
}
