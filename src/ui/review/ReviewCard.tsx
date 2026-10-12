import { useMemo } from 'react'
import type { MomoEntry } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { dayOf, useUi } from '../store'
import { MarkdownBody, splitFirstLine } from '../card'
import { Icon } from '../shared/icons'
import { Spacer } from '../kit'

// 回顾页大卡（自 Review.tsx 拆出）：meta（日期 / 相对时间 / 标签）→ hero（短首行）
// → MarkdownBody（其余正文）→ foot（在 Obsidian 中打开）四段。
// 「短首行升为标题」的 split 也收在这里：它是这一张卡的展示口径，与主页面
// 卡片同源（titleFromFirstLine 全局生效，v0.5.3）。

/** `ISO` → `3 天前`（具体日期已经在旁边写着，这里只是补充相对感）。
 *  未来日期单独一档（`3 天后`，BUG-125c）：旧实现 `days <= 0` 一律「今天」，预写条目的
 *  meta 行左边写 2027-01-05、右边写「今天」，同一张卡两个答案。导出供测试。 */
export function relativeDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((today - then) / 86400000)
  if (days < 0) return copy.date.daysLater(-days)
  if (days === 0) return copy.date.today
  if (days === 1) return copy.date.yesterday
  if (days < 30) return copy.date.daysAgo(days)
  if (days < 365) return copy.date.monthsAgo(Math.round(days / 30))
  return copy.date.yearsAgo(Math.round(days / 365))
}

export interface ReviewCardProps {
  /** 当前回顾的这一张 */
  entry: MomoEntry
  /** 短首行是否升为大字标题（全局偏好；主页面卡片同口径） */
  titleFromFirstLine: boolean
  /** 首行不超过这么多字才升标题（全局偏好，v0.9.12 起可配；主页面卡片同口径） */
  titleMaxChars: number
  /** 多选模式：整卡是勾选热区，不进入编辑 */
  selectMode?: boolean
  /** 当前是否已勾选（点亮态：momo-review-card-on） */
  isChecked: boolean
  onToggleCheck?: (path: string) => void
}

export function ReviewCard({
  entry,
  titleFromFirstLine,
  titleMaxChars,
  selectMode,
  isChecked,
  onToggleCheck,
}: ReviewCardProps): React.JSX.Element {
  const openInEditor = useUi((s) => s.caps?.openInEditor)

  /**
   * memo 必须挂在**所有条件渲染之前**（hook 顺序）：`splitFirstLine` 每次返回
   * 新对象 + 新 body 字符串，不缓存会让 MarkdownBody 的 content effect 每次渲染都
   * 把这一张整篇重渲（同 Card.tsx 的 split，那里踩过）。
   * 批次被刷新换掉、游标越界时调用方不渲染本组件，`entry` 必非空。
   */
  const split = useMemo(
    () => (titleFromFirstLine ? splitFirstLine(entry.content, titleMaxChars) : null),
    [entry, titleFromFirstLine, titleMaxChars],
  )

  return (
    <article
      className={`momo-review-card ${isChecked ? 'momo-review-card-on' : ''}`}
      onClick={() => {
        if (selectMode) onToggleCheck?.(entry.path)
      }}
      // BUG-199：多选态整卡是勾选热区，但也要走键盘（列表卡同款收口见 Card.tsx 的
      // BUG-82a）——role=checkbox / aria-checked / tabIndex + Enter/Space。Space/Enter
      // 在卡上就地勾选并 stopPropagation：回顾根节点把这两键绑成「下一个」（Review.tsx
      // 的 onKeyDown），不拦住会一次按键两个动作；方向键不拦，冒泡到根仍可翻张。
      // 非多选态不加任何属性：没有勾选语义的 checkbox 是假控件，也免动 DOM 基线。
      {...(selectMode
        ? {
            role: 'checkbox' as const,
            'aria-checked': isChecked,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              e.stopPropagation()
              onToggleCheck?.(entry.path)
            },
          }
        : {})}
    >
      <div className="momo-review-meta">
        <span className="momo-review-date">{dayOf(entry.createdAt)}</span>
        <span className="momo-card-dot" />
        <span className="momo-review-date">{relativeDay(entry.createdAt)}</span>
        <Spacer />
        {entry.tags.map((t) => (
          <span key={t} className="momo-pill">
            #{t}
          </span>
        ))}
      </div>

      {split && <h2 className="momo-review-hero">{split.title}</h2>}
      <MarkdownBody
        content={split ? split.body : entry.content}
        className="momo-review-body markdown-rendered"
        cacheKey={entry}
      />

      <div className="momo-review-foot">
        <button
          className="momo-review-open"
          onClick={(e) => {
            e.stopPropagation()
            openInEditor?.(entry.path)
          }}
        >
          {copy.review.openInObsidian}
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </article>
  )
}
