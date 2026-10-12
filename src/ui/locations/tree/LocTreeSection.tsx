import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { copy } from '../../../momo/i18n'
import { filterLocTreeByLevels, type LocTreeNode } from '../../../momo/locations'
import { useUi } from '../../store'
import { Icon } from '../../shared/icons'
import { LocFilterMenu, MENU_W } from './LocFilterMenu'
import { LocTreeRows } from './LocTreeRows'

// 侧栏「全部地点」区块（v0.9.31 ④ 从顶栏浮层搬家到侧栏；2026-10-01 晚地点页面
// 撤除后**常驻**，与标签树平级）：一个是按标签浏览、一个是按地点浏览筛选，
// 两套树各自开关（prefs.sections.locations）。
//
// 交互：**点一个节点 = 加一个筛选条件，再点它 = 去掉那一个**（多选并集，
// 集合的加减与「祖先 / 后代去重」都在 store 的 toggleLocation）。顶栏浮层时代
// 的「点当前选中行 = 清除过滤（回全部地点）」在单选模型下成立，多选之后不再有
// 「当前那一行」这回事——aria-pressed 仍是每行自己的开关语义。
//
// 树恒完整（从**全库** entries 建，见 useListDerivations）：筛了以后整棵树还在，
// 换地区不用先清。展开态随组件自管（侧栏常驻，没有「关掉再开还原」的场景）。
//
// 标题行右端那颗漏斗（2026-10-01，用户要求「全部地点应该有过滤按钮」）=
// **层级过滤**：四颗 chips（全部 / 大洲 / 国家 / 地点）**可多选**（2026-10-10
// 起，用户要求「比如同时选大洲和地点」），勾哪几级这棵树就只显示哪几级——
// 没勾的级收走、子孙顶上父级位，树形照旧。只动侧栏显示——不动主区筛选（那是
// filterLocations + locLevel）、不清任何筛选，纯函数在 momo/locations/locTree.ts，
// 浮层在同目录 LocFilterMenu.tsx。

/** 侧栏「全部地点」：标题行 + 层级过滤漏斗 + 大洲 → 国家 → 城市三级树 */
export function LocTreeSection({ nodes }: { nodes: readonly LocTreeNode[] }): React.JSX.Element | null {
  const { filterLocations, locTreeLevels, locTreeExpand, toggleLocation, toggleLocTreeLevel } = useUi(
    useShallow((s) => ({
      filterLocations: s.filterLocations,
      locTreeLevels: s.locTreeLevels,
      locTreeExpand: s.locTreeExpand,
      toggleLocation: s.toggleLocation,
      toggleLocTreeLevel: s.toggleLocTreeLevel,
    })),
  )
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  // 档位过滤（纯函数，momo 层）：all / 空集 = 完整树；否则只留勾中的级。hook 要在
  // 下面的 0 地点早退**之前**——条件 return 之后的 hook 会随节点数变化改变调用次序。
  const shown = useMemo(() => filterLocTreeByLevels(nodes, locTreeLevels), [nodes, locTreeLevels])
  // 完整树 = 没在过滤（['all'] / 空集）：漏斗的激活态与「全部」chip 的选中态共用它
  const full = locTreeLevels.length === 0 || locTreeLevels.includes('all')

  // 全库 0 个地点：整块不渲染（地点是筛选条件，没有条件就没有「空态」可言；
  // 想建地点有两条路：卡片操作行那颗 mappin（F3）、多选批量条（F4））
  if (nodes.length === 0) return null

  /**
   * 漏斗 → 浮层落点：换算成**相对 `.momo-app`** 的偏移（浮层 absolute，基准是
   * 面板）。按钮在标题行右端，落点按「按钮右缘 - 浮层宽」右对齐挂在它下面——
   * 与 TagTreeToolbar 的 anchorBelow 同一算法（宽从 LocFilterMenu import，
   * 别在两处各写一个估值）。落点**先算好再进 updater**：updater 是渲染期跑的，
   * 那时 currentTarget 已交还框架，量不到按钮位置。
   */
  const toggleMenu = (e: ReactMouseEvent<Element>) => {
    const el = e.currentTarget as HTMLElement
    const hostRect = el.closest('.momo-app')?.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const anchor = {
      x: rect.right - (hostRect?.left ?? 0) - MENU_W,
      y: rect.bottom + 4 - (hostRect?.top ?? 0),
    }
    setMenu((prev) => (prev ? null : anchor))
  }

  return (
    <>
      <div className="momo-loctree-head">
        <span className="momo-loctree-title">{copy.location.all}</span>
        {/* 工具行：一颗层级过滤漏斗。按钮与激活态复用标签区那套 .momo-tagbtn
            （两棵树的工具行长成一个样）；激活 = 当前不在完整树档。同样不挂
            title（面板级禁用原生气泡），名字走 aria-label。 */}
        <div className="momo-loctree-tools">
          <button
            type="button"
            className={`momo-tagbtn momo-tagbtn-filter${full ? '' : ' momo-tagbtn-on'}`}
            aria-haspopup="dialog"
            aria-expanded={menu !== null}
            aria-label={copy.location.treeFilterAria}
            onClick={toggleMenu}
          >
            <Icon name="filter" size={13} strokeWidth={1.7} />
          </button>
        </div>
      </div>
      {/* 空态（勾的级下一个节点都没有）在 LocTreeRows 里面分支——放在外面与它是
          同位置异构元素，空 ↔ 非空切换会把整棵树连 collapsed 一起卸载（BUG-169）。 */}
      <LocTreeRows
        nodes={shown}
        filterKeys={filterLocations}
        expand={locTreeExpand}
        onPick={toggleLocation}
      />
      {menu && (
        <LocFilterMenu
          x={menu.x}
          y={menu.y}
          levels={locTreeLevels}
          onPick={toggleLocTreeLevel}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
