import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import { Icon, type IconName } from '../../shared/icons'
import { sortAscendingOf, sortKeyOf, withSortDirection, withSortKey } from '../../../momo/core'
import { REPEAT_WATCH_MS, isRepeatClick } from '../../shared/activationGate'
import type { SortKey, SortMode } from '../../../momo/types'

// 顶栏排序控件（v0.9.19）：**一颗图标按钮 + 一个两段式弹层**。
//
// 取代的是原来并排的两件控件：「排序依据」文字分段（更新时间 / 创建时间，150px）
// + 方向文字按钮（「由旧到新」，78px），中间还夹一个顶栏间距 10px —— 合计 238px。
// 现在这一整块收成一颗 34px 的按钮，四个状态一个不少。
//
// 为什么是 34px 而不是 .momo-icon-btn 的 30px：顶栏这一排同族控件都是 34
// （`.momo-segmented` 高 34——星球那颗 2026-10-01 起也进分段了，随它 34；
// `.momo-panel-toggle` 2026-09-30 起是 40×40，用户连着两次点名要大，不随本族），
// 照 30 写会让它矮一档，摆在一排 34 中间看着小一号（2026-09-28 用户反馈）。
//
// 为什么弹层分「排序依据 / 排序方向」两组而不是平铺四项：这两个维度是正交的，
// 用户应当一眼看出自己改的是哪一半；平铺会让「更新时间」上下相邻两行只差一个箭头
// （2026-09-28 视觉稿 §2，用户挑的两段式）。
//
// 外观复用既有骨架 `.momo-pop-menu`（卡片右键菜单那套：160px 起 / 项高 32 /
// 选中用签名色），本组件只补两件它没有的：**锚定定位**（右键菜单跟鼠标坐标走，
// 这里换成「挂在一颗固定位置的按钮下方」）与**宽度**（勾列删掉后内容只剩 ≈104px，
// 160px 白留 50+px 空白），见 styles.src/60-design.css 的
// `.momo-sortwrap .momo-pop-menu`。**除了宽度，不造第二套浮层骨架。**
//
// 交互：点按钮开合；Esc 关并把焦点还给按钮；点按钮以外任何地方关（document 的
// pointerdown 冒泡，菜单项自己的 click 先跑，所以点选项是「选中并关」而不是「先关」）。
// 不做方向键漫游：菜单只有四行、两组各自单选，Tab 够用（工单「有意不做」有记）。
//
// 分层：本文件在 ui/，不 import obsidian；排序语义全在 momo/core/sort.ts（纯函数，
// 单测覆盖），这里只做「把当前 SortMode 摆成两组选中态」与「点哪项设哪态」。

/** 时间键的顺序 = 菜单里的行序（与既有的「更新时间在前」一致，不改用户肌肉记忆） */
const KEYS: readonly SortKey[] = ['updated', 'created']

/** 方向：由新到旧在前（默认态），由旧到新在后 */
const DESC_FIRST: readonly boolean[] = [false, true]

/** 时间键 / 方向 → 那行的图标（显式查表：加成员时漏一处编译不过） */
const KEY_ICON: Record<SortKey, IconName> = { updated: 'clock', created: 'calendar' }

/** 菜单里的一行：行图标 + 文字。
 *
 *  **没有勾**（2026-09-28 用户裁决：「毕竟已经有颜色了」）：选中态由签名色承担
 *  （`.momo-pop-menu-item-on` 给 accent 字色），再挂一枚勾是同一件事说两遍，
 *  还把每行左侧切掉 14px 的槽位。语义仍走 `menuitemradio`（两组各自单选），
 *  读屏照旧读出「已选中 / 未选中」——**视觉信号减一个，无障碍信号一个没少**。
 *
 *  于是行内容 = 图标 + 文字，字体与左侧内距全部继承 `.momo-pop-menu-item`
 *  （padding 0 8px / gap 10px），不为「少了一列」补任何 CSS。 */
function SortMenuItem({
  on,
  icon,
  text,
  onClick,
}: {
  on: boolean
  icon: IconName
  text: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      className={'momo-pop-menu-item' + (on ? ' momo-pop-menu-item-on' : '')}
      onClick={onClick}
    >
      <Icon name={icon} size={14} />
      <span>{text}</span>
    </button>
  )
}

export function SortControl(): React.JSX.Element {
  const { sortMode, setSortMode } = useUi(
    useShallow((s) => ({ sortMode: s.sortMode, setSortMode: s.setSortMode })),
  )
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  /** 关菜单后那个还在等「第二下」的 document 监听（摘除函数；用法见 pick，BUG-136j） */
  const guardRef = useRef<(() => void) | null>(null)
  // 卸载时摘掉还在等第二击的那个监听（pick 之后窗口内组件被卸载的窄窗）
  useEffect(() => () => guardRef.current?.(), [])

  // 只在开着的时候挂监听：关着时每个 pointerdown 都过一次 contains 是白费。
  // 依赖整个 open 而不是「挂一次 + ref 读状态」，是为了让监听与渲染出的菜单同生共死
  // （菜单没渲染时绝不该有全局监听在跑）。
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onPointerDown = (ev: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) close()
    }
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      close()
      // 焦点还给按钮：Esc 关掉菜单后用户还在键盘上，焦点不该凭空消失
      btnRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const key = sortKeyOf(sortMode)
  const ascending = sortAscendingOf(sortMode)
  const dirLabel = ascending ? copy.panel.sort.asc : copy.panel.sort.desc
  /** 按钮名 = 完整当前态（「排序：更新时间 · 由新到旧」）。图标省掉的是像素，不是信息 */
  const label = copy.panel.sort.button(copy.panel.sort.key[key], dirLabel)

  /** 选一项：设状态 + 关菜单。两者一起做——菜单是「点哪项就是哪项」的直给式，
   *  没有「应用」按钮，留着菜单开着会让用户以为还要再确认一次。
   *
   *  `next !== sortMode` 那层判断不是省事：store 的 setSortMode 无条件落盘
   *  （见 store/prefs.ts 的 setSortPref），所以点当前已选中的那一项会白写一次
   *  data.json。菜单照关——用户的意图是「就要这个」，不是「我要取消」。
   *
   *  BUG-136j：菜单是绝对定位浮层，正压在卡片列上方（`.momo-sortmenu` 挂在按钮
   *  下方）。菜单一关就没了，而双击的第二下紧接着 hit 到**菜单下面**那张卡片——
   *  卡片的 onClick 是 `openInEditor`，于是「选个排序」顺手在 Obsidian 里打开一篇
   *  无关笔记。这里在关菜单的同一个手势里再吞掉一次点击：双击的第二下
   *  `detail === 2`（浏览器数好的连击，与落点是否还在菜单上无关），在 document 的
   *  捕获段拦掉它——菜单项自己的 click 已经跑完了，不会误伤。 */
  const pick = (next: SortMode): void => {
    if (next !== sortMode) setSortMode(next)
    setOpen(false)
    guardRef.current?.() // 上一发还没等到第二下就撤掉，别叠监听
    const onCapture = (ev: MouseEvent): void => {
      const swallow = isRepeatClick(ev.detail)
      cleanup()
      if (!swallow) return
      ev.stopPropagation()
      ev.preventDefault()
    }
    const cleanup = (): void => {
      document.removeEventListener('click', onCapture, true)
      guardRef.current = null
    }
    document.addEventListener('click', onCapture, true)
    guardRef.current = cleanup
    // 窗口过了没人来点也得摘掉监听（不挂定时器的话它会一直等到下一次 click）
    window.setTimeout(() => {
      if (guardRef.current === cleanup) cleanup()
    }, REPEAT_WATCH_MS)
  }

  return (
    <div className="momo-sortwrap" ref={wrapRef}>
      {/* 刻意**不挂 title**：面板里一律不用原生 title（v0.9.0 用户裁决，
          app.drill 有一条守卫扫全面板），黑底 OS 气泡与这套视觉语言不搭。
          图标省掉的是像素，语义由 aria-label 完整承担（含当前态与方向）。 */}
      <button
        ref={btnRef}
        type="button"
        className={'momo-icon-btn momo-sortbtn' + (open ? ' momo-sortbtn-on' : '')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* 图标 = 当前方向：两条横线说明「这是排序」，箭头指向说明「朝哪边」。
            两态只翻箭头（见 icons.tsx 的 sort-desc / sort-asc 注释） */}
        <Icon name={ascending ? 'sort-asc' : 'sort-desc'} size={16} />
      </button>

      {open && (
        <div className="momo-pop-menu momo-sortmenu" role="menu" aria-label={copy.panel.sort.menuAria}>
          <div className="momo-pop-seclabel">{copy.panel.sort.groupKey}</div>
          {KEYS.map((k) => (
            <SortMenuItem
              key={k}
              on={k === key}
              icon={KEY_ICON[k]}
              text={copy.panel.sort.key[k]}
              onClick={() => pick(withSortKey(sortMode, k))}
            />
          ))}

          {/* 分组之间的细分隔线：两组语义不同（依据 / 方向），靠一条线断开比只靠间距清楚 */}
          <div className="momo-sortmenu-sep" />

          <div className="momo-pop-seclabel">{copy.panel.sort.groupDir}</div>
          {DESC_FIRST.map((asc) => (
            <SortMenuItem
              key={String(asc)}
              on={asc === ascending}
              icon={asc ? 'arrow-up' : 'arrow-down'}
              text={asc ? copy.panel.sort.asc : copy.panel.sort.desc}
              onClick={() => pick(withSortDirection(sortMode, asc))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
