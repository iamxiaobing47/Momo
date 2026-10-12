import type { MouseEvent as ReactMouseEvent } from 'react'
import type { TagNode } from '../../momo/tags'
import { copy } from '../../momo/i18n'

// 侧栏置顶区（自 TagTree.tsx 拆出）：常驻的一行 chip，即便为空也显示右键置顶的
// 发现入口（行本体上没有置顶按钮，空置顶区里的提示就是它）。置顶顺序 = 置顶的先后
// （先置顶的在前），不再提供重排。
// 反查不到节点的置顶键（标签被删了 / 还没重建树）退回键的最后一段当名字、计数记 0。

export interface TagTreePinnedAreaProps {
  /** 置顶标签的身份键列表（store.pinned；顺序即展示顺序） */
  pinned: readonly string[]
  /** 当前选中的标签筛选（chip 的点亮态：momo-chip-on） */
  filterTags: readonly string[]
  /** 身份键 → 节点（TagTree 用 flattenTagTree 摊平得来，供反查名字 / 计数） */
  byKey: ReadonlyMap<string, TagNode>
  /** 点 chip = 筛 / 不筛这一棵子树（store.toggleTag，与行本体同一套） */
  toggleTag: (key: string) => void
  /** 右键 chip 唤标签管理弹层（TagTree.openEdit：坐标换算 + 打开 TagEditMenu） */
  openEdit: (tag: string, virtual: boolean, e: ReactMouseEvent<Element>) => void
}

export function TagTreePinnedArea({
  pinned,
  filterTags,
  byKey,
  toggleTag,
  openEdit,
}: TagTreePinnedAreaProps): React.JSX.Element {
  return (
    <div className="momo-pin-area">
      <div className="momo-sidebar-label">{copy.tags.pinnedArea}</div>
      <div className="momo-pin-list">
        {pinned.length === 0 && <span className="momo-pin-hint">{copy.tags.pinHint}</span>}
        {pinned.map((key) => {
          const node = byKey.get(key)
          const label = node ? node.name : (key.split('/').filter(Boolean).pop() ?? key)
          return (
            <button
              key={key}
              className={`momo-chip momo-pin-chip ${
                filterTags.includes(key) ? 'momo-chip-on' : ''
              }`}
              aria-pressed={filterTags.includes(key)}
              onClick={() => toggleTag(key)}
              onContextMenu={(e) => openEdit(node?.displayPath ?? key, !node || node.isVirtual, e)}
            >
              <span className="momo-tag-label">#{label}</span>
              <span className="momo-chip-count">{node ? node.totalCount : 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
