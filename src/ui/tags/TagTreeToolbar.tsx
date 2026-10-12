import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { isTagFilterActive, type TagFilterState } from '../../momo/tags'
import { TagFilterMenu, MENU_W as FILTER_MENU_W } from './TagFilterMenu'
import { TagSortMenu, MENU_W as SORT_MENU_W } from './TagSortMenu'
import { Icon } from '../shared/icons'

// 侧栏标签区的工具行（v0.9.18）：`TagTree` 里「全部标签」那一行 + 摘要条 + 两个浮层。
//
// 为什么单独一个文件：`TagTree.tsx` 拆出置顶区 / 过滤框 / 两个浮层之后仍贴着组件层的
// 行数红线（≤ 250 行，见 docs/design/architecture/components.md §4），而这一块**自洽**——
// 它不碰展开态、不碰行渲染，只认 store 里的排序键与两组筛选，往外**什么都不需要**。
//
// 职责边界：**只负责「用哪个口径看标签」这件事**。真正决定「哪些标签行在列表里」的
// 是 `momo/tags/tagFilter.ts` + `momo/tags/tagSort.ts` 两道纯函数，接线在 TagTree 里 —— 这里
// 只写值、不读列表，所以排序 / 筛选换口径时它自己不重排任何东西。
//
// 两枚按钮都是**开关**（关着就开、开着就关，且互斥），开关语义写在这里而不是靠遮罩
// 兜底 —— 理由见 `toggleMenu`。

/** 摘要条上一枚条件：组 + 该组当前取值的展示名 */
type FilterChip = { group: keyof TagFilterState; name: string }

/**
 * 偏离默认的那些条件（每组最多一枚：组内单选互斥，见 momo/tags/tagFilter.ts）。
 * 值名一律从 copy.meta 的两张表读——「7 天内 / 有配图」这些展示名只有一个
 * 出处，别在摘要条里再抄一遍（抄了就会漂）。
 */
function activeChips(filter: TagFilterState): FilterChip[] {
  const chips: FilterChip[] = []
  if (filter.time !== 'all') chips.push({ group: 'time', name: copy.meta.tagTimeFilter[filter.time] })
  if (filter.attachments !== 'all') {
    chips.push({ group: 'attachments', name: copy.meta.tagAttachmentFilter[filter.attachments] })
  }
  return chips
}

export function TagTreeToolbar() {
  const tagSort = useUi((s) => s.tagSort)
  const tagFilter = useUi((s) => s.tagFilter)
  const setTagFilter = useUi((s) => s.setTagFilter)

  /** 两个浮层的落点（null = 关着；坐标已换算成相对 .momo-app 的偏移）。
   *  BUG-82d：from = 唤起那颗按钮——关浮层后焦点还它（PopDialog.returnFocus） */
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number; from: HTMLElement } | null>(null)
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number; from: HTMLElement } | null>(null)

  const filterChips = activeChips(tagFilter)

  /**
   * 工具行按钮 → 浮层落点（换算成**相对 `.momo-app`** 的偏移：浮层是 `position: absolute`，
   * `.momo-app` 是它的定位基准，直接写视口坐标会偏出面板）。
   * 按钮在工具行**右端**，所以落点按「按钮右缘 - 浮层宽」算：浮层右对齐着按钮挂在它下面，
   * 而不是从按钮左缘往右铺开。宽从两个浮层里 import（MENU_W），别在这里另写一份估值——
   * 那两处一漂，对齐就散。
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

  /**
   * 两枚按钮的**开关**语义：关着就开在按钮右下角，开着就关掉；同时顺手关掉另一个浮层
   * （两枚按钮是同一块状态的两个面板，一起摊在 232px 侧栏里会互相压）。
   *
   * 为什么自己判开关、而不是靠遮罩兜底：`.momo-pop-mask` 是全屏 `position:fixed` 遮罩
   * （styles.src/30-pop.css），真实浏览器里浮层开着时点按钮，命中的其实是遮罩、由遮罩把
   * 浮层关掉——但那是**外壳的行为**，遮罩一换层 / 一去掉，按钮就退化成「原地重开一次」。
   * 开关写在按钮自己身上才是它的契约，也才测得到（jsdom 没有命中测试，遮罩挡不住点击）。
   *
   * 落点先算好再进 updater：React 的 updater 是渲染期才跑的，那时合成事件上的
   * `currentTarget` 已经交还给框架了，不能在里面量按钮位置。
   */
  const toggleMenu = (which: 'sort' | 'filter', e: ReactMouseEvent<Element>) => {
    const anchor = anchorBelow(e, which === 'sort' ? SORT_MENU_W : FILTER_MENU_W)
    // BUG-82d：唤起那颗按钮随落点一起存——关浮层后焦点还它
    const from = e.currentTarget as HTMLElement
    const setOther = which === 'sort' ? setFilterMenu : setSortMenu
    const setSelf = which === 'sort' ? setSortMenu : setFilterMenu
    setOther(null)
    setSelf((prev) => (prev ? null : { ...anchor, from }))
  }

  /** 摘掉摘要条上的一枚条件（那一组回到「全部」）。组内单选，所以「摘掉」== 「不限」 */
  const dropChip = (group: FilterChip['group']) => {
    if (group === 'time') setTagFilter({ time: 'all' })
    else setTagFilter({ attachments: 'all' })
  }

  return (
    <>
      <div className="momo-taghead">
        <span className="momo-taghead-title">{copy.tags.all}</span>

        {/* 工具行右端（v0.9.19 起标题旁不再带全库标签数：那个数字和列表对不上号，
            反而让人拿来跟行数较真——列表显示的是筛选/排序后的行，两回事）。
            排序按钮的文字是**当前键名**（「数量 / 附件数 / 名称」）：光一枚图标说不出
            现在按什么排，而按钮本身就是那块状态的显示器。
            两枚都**不挂 title**：面板里一律禁用原生 title（黑底 OS 气泡与面板视觉语言不搭，
            app.drill 有用例守着），名字走 aria-label —— 那句已经写全了状态。 */}
        <div className="momo-taghead-tools">
          <button
            type="button"
            className="momo-tagbtn momo-tagbtn-sort"
            aria-haspopup="menu"
            aria-expanded={sortMenu !== null}
            aria-label={copy.tags.sortButton(copy.meta.tagSort[tagSort])}
            onClick={(e) => toggleMenu('sort', e)}
          >
            <span className="momo-tagbtn-text">{copy.meta.tagSort[tagSort]}</span>
            <Icon name="chevron-down" size={11} strokeWidth={2} />
          </button>

          <button
            type="button"
            className={`momo-tagbtn momo-tagbtn-filter ${
              isTagFilterActive(tagFilter) ? 'momo-tagbtn-on' : ''
            }`}
            aria-haspopup="dialog"
            aria-expanded={filterMenu !== null}
            aria-label={copy.tags.filterAria}
            onClick={(e) => toggleMenu('filter', e)}
          >
            <Icon name="filter" size={13} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {/* 摘要条：只在偏离默认时出现，把「现在筛着什么」摆在列表正上方（浮层关掉之后
          这是唯一的线索）。点一枚 = 摘掉那一组；两组全摘完，条自己消失。
          同样不挂 title：名字（「移除筛选：7 天」）走 aria-label，见工具行那条注释。 */}
      {filterChips.length > 0 && (
        <div className="momo-tagfbar">
          {filterChips.map((chip) => (
            <button
              key={chip.group}
              type="button"
              className="momo-tagchip momo-tagchip-on"
              aria-label={copy.tags.filterChipRemove(chip.name)}
              onClick={() => dropChip(chip.group)}
            >
              {chip.name}
              <Icon name="close" size={10} strokeWidth={2.2} />
            </button>
          ))}
        </div>
      )}

      {/* 两个浮层（各自夹取落点、Esc / 点遮罩关闭）。它们由工具行自己渲染：
          浮层跟着按钮走，是这一块的私事。 */}
      {sortMenu && (
        <TagSortMenu x={sortMenu.x} y={sortMenu.y} onClose={() => setSortMenu(null)} returnFocus={() => sortMenu.from} />
      )}
      {filterMenu && (
        <TagFilterMenu
          x={filterMenu.x}
          y={filterMenu.y}
          onClose={() => setFilterMenu(null)}
          returnFocus={() => filterMenu.from}
        />
      )}
    </>
  )
}
