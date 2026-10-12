import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import type { ReviewMode } from '../../../momo/review'
import { isRepeatClick } from '../../shared/activationGate'
import { Segmented, TextButton } from '../../kit'

// 回顾模式的顶栏控件：模式分段 + 换一批 + 结束回顾。
// 从 shell/Topbar.tsx 拆出（自管订阅：只订 reviewMode 等回顾字段）。

export function ReviewControls(): React.JSX.Element {
  const { reviewMode, setReviewMode, newReviewBatch, setMode } = useUi(
    useShallow((s) => ({
      reviewMode: s.reviewMode,
      setReviewMode: s.setReviewMode,
      newReviewBatch: s.newReviewBatch,
      setMode: s.setMode,
    })),
  )
  return (
    <>
      <Segmented
        ariaLabel={copy.review.modeAria}
        value={reviewMode}
        onChange={setReviewMode}
        items={(
          [
            ['random', copy.review.mode.random],
            ['week', copy.review.mode.week],
            ['month', copy.review.mode.month],
            ['stale', copy.review.mode.stale],
            ['onthisday', copy.review.mode.onthisday],
          ] as Array<[ReviewMode, string]>
        ).map(([value, label]) => ({ value, label }))}
      />
      {/* BUG-184d：「换一批」是一次新的抽取 + 一批 reviewSeen 落盘（非幂等）——
          双击的第二下会再抽一批、把第一批 10 条静默标成「刚看过」（week/month/stale
          档下 7/30 天不再入池）。与 BUG-136i（写点什么）同一条连击闸。 */}
      <TextButton
        onClick={(e) => {
          if (isRepeatClick(e.detail)) return
          newReviewBatch()
        }}
      >
        {copy.review.refresh}
      </TextButton>
      <TextButton onClick={() => setMode('list')}>{copy.review.end}</TextButton>
    </>
  )
}
