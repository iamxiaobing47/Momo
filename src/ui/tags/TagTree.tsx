import { memo, useMemo, useState, type ReactNode } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { flattenTagTree, type TagNode } from '../../momo/tags'
import { applyTagFilter, isTagFilterActive } from '../../momo/tags'
import { sortTagTree } from '../../momo/tags'
import type { MomoEntry } from '../../momo/types'
import { TagEditMenu } from './TagEditMenu'
import { TagFilterInput } from './TagFilterInput'
import { TagTreePinnedArea } from './TagTreePinnedArea'
import { TagTreeToolbar } from './TagTreeToolbar'
import { Icon } from '../shared/icons'
import { useTodayKey } from '../hooks/useTodayKey'

// 标签树（ADR-004 / concept-momo-tags / concept-momo-views）：
// v0.5 版面（设计稿 §1 侧栏）从「chip 云」改成**行式列表**——一行 = 圆点 + #名称 + 数量，
// 子级缩进一格、圆点转灰。理由：侧栏只有 232px，chip 云在标签一多时会挤成三四行换行，
// 数量列也对不齐；行式列表每行固定 28px、数量右对齐，扫读更快（设计稿同款）。
//
// 保留下来的行为（**不是**设计稿画的，但都是已确认的产品能力，不能为了像稿子而删）：
// - 展开箭头只管展开 / 收起，**点行本体才筛选**；
// - **置顶入口只有右键菜单**（2026-09-19 用户裁决：取消拖拽，右键更好用）：
//   右键任一行 → 「置顶 / 取消置顶」（外加改名 / 删除，见 TagEditMenu）。
//   置顶顺序 = 置顶的先后（先置顶的在前），不再提供重排。
// 依赖约束：ui/ 不 import obsidian。
//
// 拆出去的块：TagTreePinnedArea = 置顶 chip 区，TagFilterInput = 名称过滤输入框，
// TagTreeToolbar = 「全部标签」那一行 + 摘要条 + 两个浮层（它自洽到**什么都不需要**：
// 不碰展开态、不碰行渲染，只认 store 里的排序键与两组筛选）。
// 本文件留：row() / flatten() 的行式列表、展开 state、右键弹层接线，
// 以及**筛选与排序的接线**，和这一块的**排版顺序**。
//
// 排版顺序（2026-09-30 用户裁决，见下方 JSX 注释）：
//   TagTreeToolbar → TagTreePinnedArea → TagFilterInput → .momo-taglist
// 即「段首（标题 + 工具行 / 摘要条）→ 置顶 → 过滤框 → 列表」。**顺序就是这一块的产品形态**，
// 别按「置顶应该在最上面」的直觉把置顶区挪回工具栏之前（曾经如此，用户要求下移）。
// 间距随之从「置顶区在段首」调成了「接着段首」（styles.src/60-design.css 的 .momo-pin-area）。
//
// v0.9.18 起列表的口径不再写死——数据流是两道纯函数（都在 momo/ 下，可单测）：
//   ① applyTagFilter(entries, nodes, tagFilter, nameQuery, now) —— 时间 → 附件 → 名称
//      （BUG-110c 起前两道逐条目取交集，所以要 entries：节点的聚合值只用来显示，不参与筛）；
//   ② sortTagTree(①的结果, tagSort) —— 只在渲染前覆盖顺序。
// ①的三道都**只剪枝、不改变树形**（v0.9.19 前那道会把树拉平的「层级筛选」已移除），
// 所以列表永远是树：子级缩进、有子级的行带展开箭头，排序在各级内部生效。
// 排序键落盘（prefs.tagSort 是视图偏好，ADR-003）；两组筛选与名称词都是会话内
// transient（重开面板还留着会让人莫名其妙少了半屏标签），见 store/types.ts。
// 口径本身的文档（三键、三道、为什么这个顺序）见 docs/design/architecture/tags.md。

/**
 * 顶层标签前 3 名用签名色圆点（古铜 / 苔绿 / 陶土，与设计稿 §1 的三种点色一致），
 * 其余与全部子级用细灰点。这是**展示层的排名配色**——由列表顺序决定，不是数据字段，
 * 也不写进任何 Momo；换一批标签，颜色跟着排名走。
 */
const TOP_DOT_TONES = ['var(--momo-accent)', 'var(--momo-sage)', 'var(--momo-clay)'] as const
/** 子级 / 前三名之外的圆点色（设计稿的 #D6D2CA 对应到这枚令牌） */
const SUB_DOT_TONE = 'var(--momo-ink-6)'

function TagTreeImpl({ nodes, entries }: { nodes: TagNode[]; entries: readonly MomoEntry[] }) {
  const filterTags = useUi((s) => s.filterTags)
  const pinned = useUi((s) => s.pinned)
  const toggleTag = useUi((s) => s.toggleTag)
  const tagSort = useUi((s) => s.tagSort)
  const tagFilter = useUi((s) => s.tagFilter)
  const clearTagFilter = useUi((s) => s.clearTagFilter)

  const byKey = useMemo(() => flattenTagTree(nodes), [nodes])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  /** 右键唤起的标签管理弹层（置顶 / 改名 / 合并 / 删除） */
  const [edit, setEdit] = useState<{ tag: string; virtual: boolean; x: number; y: number; from: HTMLElement } | null>(null)
  /** 「过滤标签」输入框的值（本组件的瞬时状态，与 store 里那两组结构化筛选分开） */
  const [nameQuery, setNameQuery] = useState('')

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 时间窗口以「今天」为准。用 useTodayKey 的当日键当依赖：跨零点后自动重算（D-12，
  // 与统计页 / 热力图同一套机制），否则面板常开时「7 天」的窗口终点永远停在挂载那一刻。
  // 有了这个键，`new Date()` 只在挂载与翻页时各构造一次——不在渲染体里反复 new（AGENTS §3.2）。
  const todayKey = useTodayKey()
  const now = useMemo(() => new Date(), [todayKey])

  const filteredNodes = useMemo(
    () => applyTagFilter(entries, nodes, tagFilter, nameQuery, now),
    [entries, nodes, tagFilter, nameQuery, now],
  )
  // sortTagTree 返回**新数组**（不能就地排：buildTagTree 的结果被 tags/derived.ts 按 entries
  // 引用做了单槽 memo，就地排会把缓存改脏）——所以这里可以放心当只读输入用。
  const shownNodes = useMemo(() => sortTagTree(filteredNodes, tagSort), [filteredNodes, tagSort])

  const filterActive = isTagFilterActive(tagFilter)
  const hasFilter = filterActive || nameQuery.trim() !== ''

  /**
   * 打开标签管理弹层。坐标要换算成**相对 `.momo-app`** 的偏移：
   * 弹层是 `position: absolute`（.momo-app 是 position:relative），
   * 若直接写 clientX/clientY（视口坐标）会偏出面板（同见 TagEditMenu 顶部注释）。
   */
  const openEdit = (tag: string, virtual: boolean, e: ReactMouseEvent<Element>) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    const host = el.closest('.momo-app')
    const hostRect = host?.getBoundingClientRect()
    // 键盘触发（Shift+F10 / 菜单键）时浏览器给的 clientX/Y 是 0,0——
    // 这时改用行自身的位置，否则弹层会跑到面板左上角。
    const byPointer = e.clientX !== 0 || e.clientY !== 0
    const rect = el.getBoundingClientRect()
    const x = byPointer ? e.clientX : rect.left + 8
    const y = byPointer ? e.clientY : rect.bottom + 4
    // from（BUG-82d）：焦点归还的落点 = 刚右键 / Shift+F10 的那一行。右键的
    // currentTarget 就是行本身（PinnedArea 的 chip 同理），关弹层后焦点回它。
    setEdit({ tag, virtual, x: x - (hostRect?.left ?? 0), y: y - (hostRect?.top ?? 0), from: el })
  }

  if (nodes.length === 0 && pinned.length === 0) return null

  /** 一行 = 圆点 + #名称 + 数量 +（有子级时）展开箭头。行本体是 div[role=button]，
   *  这样展开箭头可以嵌真的 button（嵌套 button 是非法结构）。 */
  const row = (node: TagNode, depth: number, rank: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.key)
    const dot = depth > 1 ? SUB_DOT_TONE : (TOP_DOT_TONES[rank] ?? SUB_DOT_TONE)
    // 右列数字跟着排序键走：按「附件数」排却显示条数，用户看不出凭什么 2 张排在 5 条前面
    const count = tagSort === 'attachments' ? node.withImageCount : node.totalCount
    return (
      <div
        key={node.key}
        role="button"
        tabIndex={0}
        // BUG-128e：与地点树同形，补 aria-pressed（「点一下=加筛选、再点=取消」的
        // 切换语义必须读得出来；此前只有 .momo-tagrow-on 一个视觉类）。
        aria-pressed={filterTags.includes(node.key)}
        // 层级缩进（每级 16px，与设计稿 .tr.sub 的 padding-left 同量级）
        style={depth > 1 ? { marginLeft: (depth - 1) * 16 } : undefined}
        className={`momo-tagrow ${depth > 1 ? 'momo-tagrow-sub' : ''} ${
          node.isVirtual ? 'momo-tagrow-virtual' : ''
        } ${filterTags.includes(node.key) ? 'momo-tagrow-on' : ''} ${
          isOpen ? 'momo-tagrow-open' : ''
        }`}
        onClick={() => toggleTag(node.key)}
        onContextMenu={(e) => openEdit(node.displayPath, node.isVirtual, e)}
        onKeyDown={(e) => {
          // 行内嵌着一颗**真按钮**（展开三角，见下面 hasChildren 那支）：焦点落在它
          // 上面时的回车 / 空格归它自己。不判 target 的话，这里冒泡收到的 keydown
          // 会 preventDefault 掉三角自己的激活——键盘「展开」变成给这一行加筛选
          // （鼠标那条路有 stopPropagation，没事）。BUG-136g
          if (e.target !== e.currentTarget) return
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          toggleTag(node.key)
        }}
      >
        <span className="momo-tagrow-dot" style={{ background: dot }} />
        <span className="momo-tagrow-name">#{node.name}</span>
        <span className="momo-tagrow-count">{count}</span>
        {hasChildren && (
          <button
            className={`momo-tag-caret ${isOpen ? 'momo-tag-caret-open' : ''}`}
            aria-label={isOpen ? copy.tags.collapseChildren : copy.tags.expandChildren}
            aria-expanded={isOpen}
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(node.key)
            }}
          >
            {/* 线条 chevron（同面板其它图标）：展开朝下，收起转 -90° 朝右（CSS 过渡） */}
            <Icon name="chevron-down" size={13} strokeWidth={1.8} />
          </button>
        )}
      </div>
    )
  }

  /** 行式列表：展开的子级**紧跟父行之后**、同级缩进，父行与兄弟仍按顺序排。 */
  const flatten = (list: TagNode[], depth: number, rank: number): ReactNode[] =>
    list.flatMap((node, i) => {
      const own = row(node, depth, depth === 1 ? i : rank)
      if (node.children.length === 0 || !expanded.has(node.key)) return [own]
      return [own, ...flatten(node.children, depth + 1, rank)]
    })

  return (
    <>
      {/* 「全部标签」+ 工具行 + 摘要条 + 两个浮层（v0.9.19 起标题旁不带全库标签数：
          那个数字与列表对不上号，反而让人拿来跟行数较真——列表显示的是筛选 / 排序
          之后的行，两回事。速览三格里的标签数还在，要看总量去那儿看）。
          整块拆在 TagTreeToolbar（它不碰展开态与行渲染，只认 store 的排序键与两组筛选）。 */}
      <TagTreeToolbar />

      {/* 置顶区常驻（即便为空）：行上没有置顶按钮，空置顶区里的提示就是右键置顶的发现入口。
          **不受排序与筛选影响**（用户亲手挑出来的入口，被筛掉就失去意义了）。
          位置（2026-09-30 用户裁决）：从「全部标签」标题行**上方**下移到它之后、过滤框正上方——
          标题行是这一块的段首（标题 + 排序 / 筛选工具行），置顶区属于**内容**，排在段首之后；
          于是侧栏自上而下就是「段首 → 置顶 → 过滤框 → 标签列表」一条直线。 */}
      <TagTreePinnedArea
        pinned={pinned}
        filterTags={filterTags}
        byKey={byKey}
        toggleTag={toggleTag}
        openEdit={openEdit}
      />

      <TagFilterInput value={nameQuery} onChange={setNameQuery} />

      <div className="momo-taglist">
        {shownNodes.length === 0 && hasFilter ? (
          /* 空态：「清除筛选」把两组**和**名称词一起清。只清两组的话，若空态是名称词
             造成的，点完还是空的——按钮等于没反应。 */
          <div className="momo-tagempty">
            <span className="momo-tagempty-text">{copy.tags.filterEmpty}</span>
            <button
              type="button"
              className="momo-tagempty-btn"
              onClick={() => {
                clearTagFilter()
                setNameQuery('')
              }}
            >
              {copy.tags.filterEmptyClear}
            </button>
          </div>
        ) : (
          flatten(shownNodes, 1, 0)
        )}
      </div>

      {/* 右键标签管理（置顶 / 改名 / 合并 / 删除） */}
      {edit && (
        <TagEditMenu
          tag={edit.tag}
          virtual={edit.virtual}
          x={edit.x}
          y={edit.y}
          onClose={() => setEdit(null)}
          returnFocus={() => edit.from}
        />
      )}
    </>
  )
}

// memo（v0.5.3 性能）：nodes 来自 entries 的 memo 派生，引用稳定；
// 不包 memo 的话 App 的每次渲染（每个搜索键入字符）都会重渲整棵标签树。
export const TagTree = memo(TagTreeImpl)
