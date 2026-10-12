import type { ButtonHTMLAttributes, ReactNode } from 'react'

// 文字按钮：顶栏 / 筛选条 / 空态六处逐字同形，收敛到这一份。
// 带图标的那批原本手写 `style={{display:'inline-flex',alignItems:'center',gap:4}}`
// （排序 / 进入多选 / 筛选项…共 6 处）；无图标的那批没有这段样式——
// 以「有没有 icon」决定带不带，两类调用点的 DOM 都与原来逐字一致。

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  danger?: boolean
  children: ReactNode
}

export function TextButton({ icon, danger, children, ...rest }: TextButtonProps) {
  return (
    <button
      className={`momo-textbtn${danger ? ' momo-textbtn-danger' : ''}`}
      style={icon ? { display: 'inline-flex', alignItems: 'center', gap: 4 } : undefined}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
