import { useLayoutEffect, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import {
  TAG_ATTACHMENT_FILTERS,
  TAG_TIME_FILTERS,
  type TagAttachmentFilter,
  type TagTimeFilter,
} from '../../momo/tags'
import { PopDialog } from '../kit'

// 侧栏标签区的筛选浮层（v0.9.18）：两组 chip（最近使用 / 附件）+ 左下角「清除全部」。
//
// 两组都是**单选互斥**（一组里同时选「7 天」和「90 天」没有意义：并集就是 90 天，
// 而侧栏也摆不下多选）；组与组之间取**交集** —— 口径全在 momo/tags/tagFilter.ts 的
// applyTagFilter 里，这里只负责接线与呈现。
//
// v0.9.18 还有过第三组「层级」（把树拉平，只留一级 / 只留末级），v0.9.19 按用户裁决
// 移除：没嵌套标签时三个选项长得一样，有嵌套时又没人说得清「顶层 / 叶子」。
// 余下两组**都不改变树形**，所以列表永远按树渲染（缩进 + 展开箭头）。
//
// 筛选是**会话内 transient**（不落盘）：它是「我现在想找点东西」的临时意图，
// 重开面板还留着会让人莫名其妙少了半屏标签。排序才落盘（见 TagSortMenu）。
//
// 「清除全部」放左下角文字钮（与 TagEditMenu 的置顶 / 删除同位），点完**不关浮层** ——
// 用户要看着后面的标签列表恢复过来，才知道真清干净了。

/**
 * 弹层尺寸。宽用于边界夹取 + TagTree 算落点时的右对齐（那边 `import { MENU_W }`）。
 * 236 是**上限**：窄侧栏（232px 那档）下 CSS 的 `.momo-pop-free { max-width:
 * calc(100% - 16px) }` 会把它收到面板宽内，chip 组自然换行——所以要按两行估算高度。
 * 高只是边界夹取的估算，不追求精确（同 TagEditMenu 的 MENU_H 口径）。
 */
export const MENU_W = 236
const MENU_H = 240

/** 一组 chip：组名 + 一行口径说明 + 单选互斥的选项 */
function Group<T extends string>({
  label,
  hint,
  values,
  current,
  nameOf,
  onPick,
}: {
  label: string
  hint: string
  values: readonly T[]
  current: T
  nameOf: (value: T) => string
  onPick: (value: T) => void
}) {
  return (
    <div className="momo-tagfgroup">
      <div className="momo-tagfgroup-head">
        <span className="momo-tagfgroup-label">{label}</span>
        {/* 每组一行说明：两组都被问过「这是啥意思」（2026-09-28 用户反馈）——
            层级那组直接因此被砍掉，剩下的两组改成「组名 + 一行人话」。
            口径的准话在 momo/tags/tagFilter.ts，这里只放人话版——写太长会挤破 236px。 */}
        <span className="momo-tagfgroup-hint">{hint}</span>
      </div>
      <div className="momo-tagfgroup-chips">
        {values.map((value) => {
          const on = value === current
          return (
            <button
              key={value}
              className={`momo-tagchip ${on ? 'momo-tagchip-on' : ''}`}
              aria-pressed={on}
              onClick={() => onPick(value)}
            >
              {nameOf(value)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TagFilterMenu({
  x,
  y,
  onClose,
  returnFocus,
}: {
  x: number
  y: number
  onClose: () => void
  /** BUG-82d：焦点归还落点（工具行上那颗筛选按钮），见 PopDialog.returnFocus */
  returnFocus?: () => HTMLElement | null
}) {
  const tagFilter = useUi((s) => s.tagFilter)
  const setTagFilter = useUi((s) => s.setTagFilter)
  const clearTagFilter = useUi((s) => s.clearTagFilter)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // x / y 已由调用方换算成「相对 .momo-app」的偏移；这里再按面板尺寸夹回可视区内
  // （弹层是 absolute 定位，坐标基准就是面板，不是窗口）。
  // 夹完**同值就不 set**（理由同 TagSortMenu：setPos 造新对象，白搭一轮渲染）。
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
      ariaLabel={copy.tags.filterAria}
      style={{ left: pos.left, top: pos.top, width: MENU_W }}
      dialogRef={menuRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      onMaskClick={onClose}
      returnFocus={returnFocus}
      footerLeft={
        <div className="momo-pop-footleft">
          <button className="momo-pop-textbtn" onClick={() => clearTagFilter()}>
            {copy.tags.filterClear}
          </button>
        </div>
      }
    >
      <Group
        label={copy.tags.filterGroupTime}
        hint={copy.tags.filterHintTime}
        values={TAG_TIME_FILTERS}
        current={tagFilter.time}
        nameOf={(value: TagTimeFilter) => copy.meta.tagTimeFilter[value]}
        onPick={(value: TagTimeFilter) => setTagFilter({ time: value })}
      />
      <Group
        label={copy.tags.filterGroupAttachment}
        hint={copy.tags.filterHintAttachment}
        values={TAG_ATTACHMENT_FILTERS}
        current={tagFilter.attachments}
        nameOf={(value: TagAttachmentFilter) => copy.meta.tagAttachmentFilter[value]}
        onPick={(value: TagAttachmentFilter) => setTagFilter({ attachments: value })}
      />
    </PopDialog>
  )
}
