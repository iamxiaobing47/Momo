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
      // 落盘（2026-10-24）：此前只 set 不存——reviewMode 不在持久化清单里，重载
      // 插件 / 重启 Obsidian 后静默掉回「随机」，用户选的「一周未看」以为还在生效
      // （2026-10-24 报障「随机回顾不随机」的成因之一）。与 sortMode 同一条路。
      get().setPrefs({ reviewMode: mode })
      get().newReviewBatch()
    },

    /**
     * 抽一批回顾：池子 = 当前筛选命中的 Momo（matched()）。抽完只盖**第一张**的
     * 展示时间——它此刻就摆在屏上；其余的翻页到哪张盖哪张（`reviewNext`），没翻到
     * 的不进 `reviewSeen`（2026-10-24 改，此前整批在抽的瞬间全盖：连点「换一批」
     * 就把一批**从没看过**的卡冻结在「一周 / 一月未看」窗外，week/month 档越换越空）。
     * 整批共用抽批那一刻的时间戳（`reviewEpoch`）：同一批里来回翻不重复落盘。
     */
    newReviewBatch() {
      const { reviewMode, reviewSeen, reviewCount } = get()
      const batch = pickReview(get().matched(), reviewMode, reviewSeen, reviewCount)
      if (batch.length === 0) {
        set({ reviewBatch: [], reviewIndex: 0, reviewEpoch: '' })
        return
      }
      const now = new Date().toISOString()
      const first = batch[0]
      const nextSeen = { ...reviewSeen, [first.path]: now }
      set({ reviewBatch: batch, reviewSeen: nextSeen, reviewIndex: 0, reviewEpoch: now })
      // N08：同上——失败时 caps 层已提示，这里只接住 rejection
      void get().caps?.savePrefs({ reviewSeen: nextSeen })?.catch(() => {})
    },

    reviewNext() {
      const { reviewBatch, reviewIndex, reviewSeen, reviewEpoch } = get()
      // 允许走到 reviewBatch.length —— 那正是「本轮已看完」的收尾态
      const next = Math.min(reviewBatch.length, reviewIndex + 1)
      const entry = reviewBatch[next]
      // 翻到哪张盖哪张：写的是本批的 reviewEpoch（幂等——来回翻同一张不重复落盘；
      // 批次是测试直接塞进 store 时 epoch 为空，退回当场时刻，宁可多写一次也不错写旧值）
      if (entry && reviewSeen[entry.path] !== reviewEpoch) {
        const stamp = reviewEpoch || new Date().toISOString()
        const nextSeen = { ...reviewSeen, [entry.path]: stamp }
        set({ reviewIndex: next, reviewSeen: nextSeen })
        void get().caps?.savePrefs({ reviewSeen: nextSeen })?.catch(() => {})
        return
      }
      set({ reviewIndex: next })
    },

    reviewPrev() {
      set({ reviewIndex: Math.max(0, get().reviewIndex - 1) })
    },
  }
}
