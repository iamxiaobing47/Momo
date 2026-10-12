import { useEffect, useRef, useState } from 'react'
import { copy } from '../../../momo/i18n'
import type { LocTreeNode } from '../../../momo/locations'
import type { LocTreeExpand } from '../../../momo/types'
import { Icon } from '../../shared/icons'

// 地点层级树的渲染（「大洲分组卡」，2026-10-01 用户比稿定案；比稿页
// docs/design/mockups/loc-group-card-v2.html）。**大洲 = 卡 · 国家 = 行 · 地点 = 芯片**。
//
// 为什么换造型：缩进三层行那版一屏 12 行 348px（侧栏是**固定高度**的，标签树
// 被顶到屏外），而选中态只是一圈 0.5px 级细金边，在最暗的主题上几乎看不出
// 「我现在筛着伦敦」。卡片版把同样的数据压到约 287px，并且三级各有一个明确
// 的选中面（整行 / 整行 / 整枚芯片），全屏金色仍然只出现一处。
//
// ⚠️ **「卡」现在只剩排版语义，没有框了**（2026-10-03 用户裁定「全部地点不要有
// 背景色」）：CSS 里 `data-card='1'` 的 surface-2 底与 1px 描边**都已撤掉**，
// 那条属性如今只回答「这个大洲有没有子级」（组件据此决定 `.momo-locnode-body`
// 渲不渲染），不再承担任何视觉。树上唯一还带框的是地点芯片——于是「大洲/国家
// 是文字、地点是胶囊」，层级靠字重档（13px/600/ink 对 12px/500/ink-3）读出来。
// 组件侧一行未改，改的只是那张脸的 CSS（见 styles.src/60-design.css 同名段）。
//
// **交互模型一个字没改**（这是换造型的前提；2026-10-01 晚「地点页面」撤除后
// 从单选变多选，点谁加谁 / 再点那颗 = 取消那颗，祖先节点不点亮）：三级都可点、
// 点谁筛谁、再点当前那颗 = 取消该节点。DOM 契约也照旧——
// `.momo-locnode` / `-row` / `-label` / `-count` / `-twisty` / `-row-on` / `-on`
// / `data-depth` / `aria-pressed` 全部保留（`scripts/app.drill.test.mts` 十几条
// 断言与 `scripts/shots/scenes.ts` 的截图场景都钉着它们），新增的只有
// `.momo-locnode-head`（头 = twisty + 行，卡片态要它把 hover / 选中收在头那一行）、
// `.momo-locnode-body`（体 = 国家列 / 芯片行）与 `data-card`（有子级的大洲才是卡）。
//
// 为什么外壳还是**一颗节点一个** `.momo-locnode`：`q(tree, '.momo-locnode')` 的
// 文档序 = 亚洲 → 中国 → 北京 → 上海（卡包着它的体，前序即层级序），与旧版
// 「兄弟平铺」取到的顺序逐字相同。
//
// 展开态住本组件（useState）：侧栏常驻，没有「关掉再开还原展开」的场景，
// 进 store 只会白占一个字段。**三级默认全展开**（2026-10-01 用户要求「全部地点
// 里要显示地点」：欧洲 → 英国 → 伦敦一路可见，地点不再藏在 twisty 后面）。
// 卡片态下 twisty 收的是卡片的体（一整洲的国家），国家行上收的是那一国的芯片。
//
// **要不要画这颗 twisty 由 prefs.locTreeExpand 决定**（2026-10-01 用户要求
// 「在设置里添加配置，有两种：全展开没有展开按钮 / 可以展开和折叠」）：
// - `all`（默认）：一颗都不画——连 `.is-leaf` 占位也不画。于是头就是那一行，
//   大洲 / 国家的地名直接顶到卡的内缘。为什么不留占位撑住对齐：留了的话地名
//   在卡左内缘 28px 处，而地点芯片在 12px 处（芯片行是国家的体，自带 4px 内距）
//   ——**芯片会戳到它父级地名的左边**。不留占位反而让三级成一个正常的嵌套
//   （大洲 / 国家 8px，芯片 12px），232px 侧栏里还多出 20px 给长地名。
// - `fold`：有子级的节点画按钮、没有的仍画 `.is-leaf` 占位行首对齐；
//   展开态照旧从「全展开」起步（收起集恒空集），所以切档不会让内容突然消失。
// 两档下的收起集是同一个 state：all 档忽略它、fold 档读它，来回切档能回到
// 用户上次收的那几支，不白丢。
//
// 两处沿用既有的裁决：① twisty（展开 / 收起）与行（过滤动作）是**并排两颗
// button**——行内嵌按钮是非法 HTML、读屏能把一行念成两处焦点；② 祖先不点亮
// （「筛着上海」时亚洲 / 中国都不亮），避免一眼看过去两处金。
//
// 消费者：侧栏「全部地点」区块（src/ui/locations/tree/LocTreeSection.tsx）。组件只吃
// 数据 + 回调，容器由调用方给；「再点一次 = 取消」这条语义住在 store 的
// toggleLocation（aria-pressed 的开关语义），本组件只管渲染与上报。

/**
 * 窄档阈值（px）：**侧栏**宽度小于它时降级——地点芯片只留地名、藏掉计数
 * （2026-10-01 用户从「① 芯片只留地名不留计数 / ② 大洲卡折叠成单行 / ③ 照排
 * 不管」里选了 ①）。2026-10-01 的比稿页实测：150px 侧栏内宽 132px 时国家行
 * 不折、芯片一行放得下两枚，真正的病是**总高**——所以 ① 是省宽而不是省高，
 * 拿掉计数让最窄档下的地名自己多几个字的空间。
 *
 * 量的是 `.momo-sidebar`（不是这棵树本身）：阈值就是用户能在设置页看到、
 * 能拖的那个「侧栏宽度」，写成一个数比「侧栏宽度减两侧 14px 内距」好读。
 * CSS 侧只是 `.momo-loctree-narrow` 那几条规则，不带数值——阈值只有这一个源。
 */
export const LOC_TREE_NARROW_PX = 200

/** 一颗节点 + 它的子树 */
function NodeRows({
  node,
  filterKeys,
  onPick,
  expand,
  collapsed,
  onToggle,
}: {
  node: LocTreeNode
  /** 已选中的节点键集合（多选；树行只按精确键比对——集合按「祖先/后代去重」规范化过） */
  filterKeys: readonly string[]
  onPick: (key: string) => void
  /** 展开方式（prefs.locTreeExpand）：`all` 一颗 twisty 都不画，见文件头 */
  expand: LocTreeExpand
  /** 被用户收起来的节点键（空集 = 全展开；`all` 档忽略它） */
  collapsed: Set<string>
  onToggle: (key: string) => void
}): React.JSX.Element {
  const hasKids = node.children.length > 0
  const isOpen = !collapsed.has(node.key)
  const on = filterKeys.includes(node.key)
  const depth = node.depth
  /** 地点芯片：没有 twisty、没有体，外壳本身就是那枚胶囊 */
  const isChip = depth === 2
  /** 大洲卡：有子级的大洲才是卡（平铺档下的叶子就是一行普通行） */
  const isCard = depth === 0 && hasKids
  /** 画不画展开钮：只有 `fold` 档画（`all` 档连 `.is-leaf` 占位都不画，见文件头） */
  const fold = expand === 'fold'
  /** 体展不展：`fold` 档看收起集，`all` 档恒开 */
  const bodyOpen = !fold || isOpen

  const row = (
    <button
      type="button"
      className={`momo-locnode-row${on ? ' momo-locnode-row-on' : ''}`}
      aria-label={copy.location.nodeAria(node.label, node.count)}
      aria-pressed={on}
      onClick={() => onPick(node.key)}
    >
      <span className="momo-locnode-label">{node.label}</span>
      <span className="momo-locnode-count">{node.count}</span>
    </button>
  )

  return (
    <div
      className={`momo-locnode${on ? ' momo-locnode-on' : ''}`}
      data-depth={depth}
      data-card={isCard ? '1' : undefined}
    >
      {isChip ? (
        row
      ) : (
        <div className="momo-locnode-head">
          {fold &&
            (hasKids ? (
              <button
                type="button"
                className="momo-locnode-twisty"
                aria-expanded={isOpen}
                aria-label={isOpen ? copy.location.treeCollapse : copy.location.treeExpand}
                onClick={() => onToggle(node.key)}
              >
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
              </button>
            ) : (
              <span className="momo-locnode-twisty is-leaf" aria-hidden="true" />
            ))}
          {row}
        </div>
      )}
      {hasKids && bodyOpen && (
        <div className="momo-locnode-body">
          {node.children.map((child) => (
            <NodeRows
              key={child.key}
              node={child}
              filterKeys={filterKeys}
              onPick={onPick}
              expand={expand}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 树根：收起态自管（空集 = 三级全展开，见文件头）；窄档实测（见 LOC_TREE_NARROW_PX） */
export function LocTreeRows({
  nodes,
  filterKeys,
  onPick,
  expand,
}: {
  nodes: readonly LocTreeNode[]
  /** 已选中的节点键集合（多选并集，见 LocTreeSection） */
  filterKeys: readonly string[]
  onPick: (key: string) => void
  /** 展开方式（prefs.locTreeExpand）：由 LocTreeSection 从 store 传进来 */
  expand: LocTreeExpand
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)

  // 侧栏宽度实测（与 globe 的双档同一套路：ResizeObserver + 与 CSS 类同源的阈值）。
  // 拿到 0 一律当「没量到」（未布局 / jsdom 测试环境 clientWidth 恒为 0）——照宽档
  // 渲染，别让测试环境把窄档形态腌进 DOM 基线（useFabHeightVar 同款纪律）。
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const host = el.closest('.momo-sidebar')
    if (!host) return
    const compute = (): void => {
      const w = host.clientWidth
      setNarrow(w > 0 && w < LOC_TREE_NARROW_PX)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // 「地点」平铺档：树根全是芯片 → 横着排（CSV 见 .momo-loctree-chips）。
  // `all` 档的根恒是 depth 0（buildLocTree 的 roots），所以这个判据只会在
  // filterLocTreeByLevels 只留 depth 2（单独勾「地点」）时为真，不会误伤完整
  // 三级树；多选混级（如「大洲 + 地点」）时根是 depth 0，照常走纵向。
  const chips = nodes.length > 0 && nodes.every((n) => n.depth === 2)

  // BUG-169：空态从 LocTreeSection 挪进来——它在外面与本品是**同位置异构元素**，
  // 空 ↔ 非空切换时 React 把本品连同 collapsed 一起卸载（每次进空态再出来，
  // 用户收起的洲 / 国就被清一遍）。挪进来后本品常驻，状态不丢；DOM 与挪进来之前
  // 逐字一致（外面那颗 div 换成这里返回的同一颗 div，本品的根 div 不再渲染）。
  // BUG-184c：空态也要挂 rootRef——观察器 effect 只在挂载时跑一次，空态挂载时
  // ref 为 null 会让它早退且永不再挂；之后转非空时窄档（芯片收计数）就量不到。
  if (nodes.length === 0) {
    return (
      <div className="momo-loctree-empty" ref={rootRef}>
        {copy.location.treeLevelEmpty}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={`momo-loctree${chips ? ' momo-loctree-chips' : ''}${narrow ? ' momo-loctree-narrow' : ''}`}
    >
      {nodes.map((node) => (
        <NodeRows
          key={node.key}
          node={node}
          filterKeys={filterKeys}
          onPick={onPick}
          expand={expand}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}
