import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'

// 回顾页底部导航（自 Review.tsx 拆出）：上一个 / 下一个两键。翻张动作由调用方注入
// （Review 绑到 store 的 reviewPrev / reviewNext），这里只负责「第 0 张禁上一个」
// 这一条禁用规则；键盘 ← → / 空格是根节点上的，不在这两个按钮里。
// v0.5.2 起底部收成两键。

export interface ReviewNavProps {
  /** 是否已在第 0 张（禁用「上一个」） */
  atFirst: boolean
  /** 上一个（Review → reviewPrev） */
  onPrev: () => void
  /** 下一个（Review → reviewNext） */
  onNext: () => void
}

export function ReviewNav({ atFirst, onPrev, onNext }: ReviewNavProps): React.JSX.Element {
  return (
    <div className="momo-review-acts">
      <button className="momo-btn" disabled={atFirst} onClick={onPrev}>
        <Icon name="chevron-left" size={15} />
        {copy.review.prev}
      </button>
      <button className="momo-btn momo-btn-primary" onClick={onNext}>
        {copy.review.next}
        <Icon name="chevron-right" size={15} />
      </button>
    </div>
  )
}
