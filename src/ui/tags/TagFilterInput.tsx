import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { copy } from '../../momo/i18n'
import { useUi } from '../store'
import { Icon } from '../shared/icons'
import { TagMatchMenu, MENU_W as MATCH_MENU_W } from './TagMatchMenu'

// 侧栏标签树的过滤输入框（自 TagTree.tsx 拆出）：受控值由 TagTree 持有，
// 过滤本身走 momo/tagFilter 的 filterTagNodes（纯逻辑，不进这里）。
// placeholder 从字典读（tags.filterPlaceholder），别在组件里写字面量。
//
// 2026-10-12：输入框右侧多一枚「两圆交叠」按钮 + 它的浮层（TagMatchMenu），切
// **多选标签时主区卡片怎么组合**（并集 / 交集）。它跟着输入框而不是挤进工具行
// （TagTreeToolbar 那两颗管「侧栏显示哪些标签行」）：一个是筛哪些行，一个是已
// 选中的那些行怎么读，入口贴着输入框才找得到。整块自己渲染浮层——与
// TagTreeToolbar 同款，浮层跟着按钮走，是这一块的私事。
//
// 交集时按钮亮灯（momo-tagbtn-on）：主区筛选条不露痕迹（用户裁决），侧栏这枚是
// 唯一的常驻线索。单标签时两值等价，亮与不亮没有可察差异——那是预期的。

export interface TagFilterInputProps {
  /** 当前过滤词 */
  value: string
  /** 输入回调（TagTree → setTagFilter） */
  onChange: (value: string) => void
}

export function TagFilterInput({ value, onChange }: TagFilterInputProps): React.JSX.Element {
  const tagMatchMode = useUi((s) => s.tagMatchMode)

  /** 浮层落点（null = 关着；坐标已换算成相对 .momo-app 的偏移）。
   *  BUG-82d：from = 唤起那颗按钮——关浮层后焦点还它（PopDialog.returnFocus） */
  const [matchMenu, setMatchMenu] = useState<{ x: number; y: number; from: HTMLElement } | null>(null)

  /**
   * 落点算法与 TagTreeToolbar.anchorBelow 逐字同款（地点树 LocTreeSection 也是抄的
   * 这一份）：按钮在**右端**，所以落点按「按钮右缘 - 浮层宽」算——浮层右对齐着按钮
   * 挂在它下面，而不是从按钮左缘往右铺开。浮层是 `position: absolute`、基准是
   * `.momo-app`，直接写视口坐标会偏出面板。宽从 TagMatchMenu import（MENU_W），
   * 别在这里另写一份估值。为什么抄第三遍而不抽公共函数：调用点各只有一行，抽出去
   * 要把「事件 → 元素」的取法（currentTarget）一并搬走，读起来反而远。
   */
  const anchorBelow = (e: ReactMouseEvent<Element>, menuW: number) => {
    const el = e.currentTarget as HTMLElement
    const hostRect = el.closest('.momo-app')?.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return {
      x: rect.right - (hostRect?.left ?? 0) - menuW,
      y: rect.bottom + 4 - (hostRect?.top ?? 0),
    }
  }

  return (
    <>
      <div className="momo-tagfilter-row">
        <input
          className="momo-tagfilter momo-input"
          type="text"
          placeholder={copy.tags.filterPlaceholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        {/* 开关语义同工具行那两颗（点一下开、再点一下关）：关着时它只亮交集态。
            不挂 title——面板里一律禁用原生 title，名字走 aria-label。 */}
        <button
          type="button"
          className={[
            'momo-tagbtn',
            'momo-tagbtn-match',
            tagMatchMode === 'intersection' ? 'momo-tagbtn-on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-haspopup="dialog"
          aria-expanded={matchMenu !== null}
          aria-label={copy.tags.matchAria}
          onClick={(e) => {
            // 落点先算好再进 updater：React 的 updater 是渲染期才跑的，那时合成事件
            // 上的 currentTarget 已经交还给框架了，不能在里面量按钮位置（同 toggleMenu）。
            const anchor = anchorBelow(e, MATCH_MENU_W)
            const from = e.currentTarget as HTMLElement
            setMatchMenu((prev) => (prev ? null : { ...anchor, from }))
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Icon name="venn" size={13} strokeWidth={1.7} />
        </button>
      </div>

      {matchMenu && (
        <TagMatchMenu
          x={matchMenu.x}
          y={matchMenu.y}
          onClose={() => setMatchMenu(null)}
          returnFocus={() => matchMenu.from}
        />
      )}
    </>
  )
}
