import type { ReactNode } from 'react'

// 空态外壳：主区 / 回收站 / 回顾 / 统计页五处逐字同形（.momo-empty + 可选的
// -icon / -title / -sub + 动作按钮）。`icon` 原样渲染不套 wrapper——
// 两个调用点一个自带 .momo-empty-icon 的 svg（统计页）、一个套 div（空库），
// 包一层就会改 DOM。带 Icon + 裸文字的那份（LoadingEmpty）形状不同，保持原样。

export interface EmptyStateProps {
  icon?: ReactNode
  title?: ReactNode
  sub?: ReactNode
  /** 「清除筛选」「回到全部」这类动作按钮，由调用方给（文案走各自 copy 键） */
  action?: ReactNode
  children?: ReactNode
}

export function EmptyState({ icon, title, sub, action, children }: EmptyStateProps) {
  return (
    <div className="momo-empty">
      {icon}
      {title !== undefined && <div className="momo-empty-title">{title}</div>}
      {sub !== undefined && <div className="momo-empty-sub">{sub}</div>}
      {action}
      {children}
    </div>
  )
}
