import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'

// 回顾页头部（自 Review.tsx 拆出）：第 N 张 / 共 M 张 + 连续记录天数 + 进度条。
// 这一段是「看到哪了」的唯一真源：步进文案、streak 的有无条件（≤0 整段不渲染）
// 与 progressbar 的 aria 三件套都收在这里，Review 只管翻张。

export interface ReviewHeaderProps {
  /** 当前张的下标（0 起；文案与进度都按 index + 1 填） */
  index: number
  /** 本批总张数 */
  total: number
  /** 连续记录天数；≤0 时 streak 整段不渲染 */
  streak: number
}

export function ReviewHeader({ index, total, streak }: ReviewHeaderProps): React.JSX.Element {
  const filled = Math.round(((index + 1) / total) * 100)
  return (
    <>
      <div className="momo-review-top">
        <span className="momo-review-step">{copy.review.step({ index: index + 1, total })}</span>
        {streak > 0 && (
          <span className="momo-review-streak">
            <Icon name="flame" size={14} />
            {copy.review.streak(streak)}
          </span>
        )}
      </div>

      <div className="momo-review-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
        <span className="momo-review-bar-fill" style={{ width: `${filled}%` }} />
      </div>
    </>
  )
}
