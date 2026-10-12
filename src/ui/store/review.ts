import { pickReview, type ReviewMode } from '../../momo/review'
import type { StoreActions } from './slice'
import type { UiState } from './types'

// 回顾会话：抽批 + 游标。抽批的池子是**当前筛选命中**的 Momo（matched()）——
// 在侧栏选好标签再进「随机回顾」就是**按标签回顾**，不必再造一套入口。

export type ReviewSlice = Pick<UiState, 'setReviewMode' | 'newReviewBatch' | 'reviewNext' | 'reviewPrev'>

export function createReviewSlice({ set, get }: StoreActions): ReviewSlice {
  return {
    /**
     * 切抽法。**只在真的换档时重抽**（BUG-136a）：档位是 select 语义，点亮的那一档
     * 再点一次不该有任何动作——「换一批」有专职按钮（`newReviewBatch`）。
     * 旧实现无条件重抽：点亮档上一次双击 = 抽两批（只有第二批被看见）、把两批共
     * 20 条的 `reviewSeen` 落盘；而 `week` / `month` / `stale` 的池子是按
     * `reviewSeen` 过滤的，于是**没被看过的那 10 条被永久移出「未在一周内回顾」**。
     */
    setReviewMode(mode: ReviewMode) {
      if (mode === get().reviewMode) return
      set({ reviewMode: mode })
      get().newReviewBatch()
    },

    /**
     * 抽一批回顾：池子 = 当前筛选命中的 Momo（matched()）。抽完把本批各条的展示时间
     * 记进 reviewSeen（只服务「很久没看」档；写的是插件偏好不是 Momo 内容）。
     */
    newReviewBatch() {
      const { reviewMode, reviewSeen, reviewCount } = get()
      const batch = pickReview(get().matched(), reviewMode, reviewSeen, reviewCount)
      if (batch.length === 0) {
        set({ reviewBatch: [], reviewIndex: 0 })
        return
      }
      const now = new Date().toISOString()
      const nextSeen = { ...reviewSeen }
      for (const e of batch) nextSeen[e.path] = now
      set({ reviewBatch: batch, reviewSeen: nextSeen, reviewIndex: 0 })
      // N08：同上——失败时 caps 层已提示，这里只接住 rejection
      void get().caps?.savePrefs({ reviewSeen: nextSeen })?.catch(() => {})
    },

    reviewNext() {
      const { reviewBatch, reviewIndex } = get()
      // 允许走到 reviewBatch.length —— 那正是「本轮已看完」的收尾态
      set({ reviewIndex: Math.min(reviewBatch.length, reviewIndex + 1) })
    },

    reviewPrev() {
      set({ reviewIndex: Math.max(0, get().reviewIndex - 1) })
    },
  }
}
