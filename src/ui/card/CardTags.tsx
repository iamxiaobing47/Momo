import { memo } from 'react'
import { useUi } from '../store'
import { tagKey } from '../../momo/tags'

/**
 * 卡片上的标签胶囊行：**唯一还需要跟着 `filterTags` 变的部分**，所以那份订阅
 * 只挂在它身上（AGENTS.md §5 的收敛思路，但只收敛这一行——整套 Context 的
 * 收益摊到整卡上并不划算）。
 *
 * 早先这行 JSX 直接写在 Card 里，Card 因此订阅 `filterTags`：点任一标签 chip
 * 就让全列表每张卡重渲一遍（每张重建整棵元素树：标题 / 元信息行 / 4 个操作
 * 按钮 / MarkdownBody），而真正需要变的只是这 2–3 个 pill。抽成**模块级**
 * 子组件后重渲范围缩到卡片的一行，卡片本体（含 MarkdownBody）原样不动。
 * 必须是模块级：写在 Card 函数体里会让它每次渲染都换一个新类型，
 * React 直接卸载重挂，比不抽还糟。
 */
export const CardTags = memo(function CardTags({
  tags,
  bottom,
  selectMode,
  locked,
}: {
  tags: readonly string[]
  /** 排布在卡片底部（prefs.tagPosition === 'bottom'） */
  bottom?: boolean
  /** 多选模式：pill 不筛标签，点击冒泡到卡片根节点完成勾选 */
  selectMode?: boolean
  /**
   * 筛选锁着（回顾档，BUG-123b）：pill 退回**纯展示**——批次是进档那一刻
   * `matched()` 的快照，点标签既不重抽也不该改动用户回头看到的那份筛选，
   * 所以渲染成不吃指针 / hover 的 span（`momo-card-tag-locked`）。
   * 选中环照旧按 `filterTags` 点亮：那正是「这批是怎么筛出来的」这句话。
   */
  locked?: boolean
}) {
  const filterTags = useUi((s) => s.filterTags)
  if (tags.length === 0) return null
  return (
    <div className={`momo-card-tags${bottom ? ' momo-card-tags-bottom' : ''}`}>
      {tags.map((t) => {
        // 传身份键：筛选按 key 比较（ADR-004），显示仍是原样大小写
        const key = tagKey(t)
        // 展示态：同一个 class 串少一颗 button——鼠标指针与 hover 反色都由 CSS
        // 的 `button.momo-card-tag:hover` / `.momo-card-tag-locked` 两条收口。
        if (locked) {
          return (
            <span
              key={t}
              className={`momo-card-tag${filterTags.includes(key) ? ' momo-card-tag-on' : ''} momo-card-tag-locked`}
            >
              #{t}
            </span>
          )
        }
        return (
          <button
            key={t}
            className={`momo-card-tag${filterTags.includes(key) ? ' momo-card-tag-on' : ''}`}
            onClick={(e) => {
              // 多选模式：不筛标签，让点击冒泡到卡片根节点完成勾选
              if (selectMode) return
              e.stopPropagation()
              useUi.getState().toggleTag(key)
            }}
          >
            #{t}
          </button>
        )
      })}
    </div>
  )
})
