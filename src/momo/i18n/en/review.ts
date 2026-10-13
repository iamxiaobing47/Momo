/**
 * Random review (Review.tsx + App topbar review-mode segments).
 * The review card is the main-page `Card` (2026-10-13), so everything inside it
 * (timestamp / action row / open-in-Obsidian) reads `copy.card`.
 */
import type { ReviewMode } from '../../review'

/** The only way `random` / `stale` come up empty is an **empty pool** (no notes, or the
 *  active filter matched nothing) — `stale` is sort + slice, so a non-empty pool always
 *  yields cards (see `momo/review/review.ts`). One honest sentence for both. */
const emptyPool = (brand: string): string => `No ${brand} to review yet`

export const review = {
  /** Empty-batch titles (per draw mode) — brand word goes through the param */
  empty: {
    onthisday: (brand: string): string => `Nothing from your ${brand} on this day in past years`,
    stale: emptyPool,
    week: 'Nothing has gone unseen for a week',
    month: 'Nothing has gone unseen for a month',
    random: emptyPool,
  },

  backToAll: 'Back to all notes',
  /** Topbar: redraw the batch / end the session */
  refresh: 'Refresh',
  end: 'End review',
  /** Read-only echo of the active filters at the top of the review page (the visible
   *  half of BUG-123b): the batch is a snapshot of `matched()` taken the moment you
   *  entered review, while the sidebar filter blocks are locked and the topbar has no
   *  search box in this mode — so "what is this batch filtered by" has exactly one
   *  place left to say it, here (read-only by design). `search` exists only for this
   *  row: the filter bar deliberately omits the search pill (the search box sits right
   *  there in list mode), but review mode has no search box at all. */
  filters: {
    label: 'Current filters',
    search: (q: string): string => `Search “${q}”`,
  },
  /** Batch finished: `You’ve seen all 10 cards in this batch` */
  doneBatch: (count: number): string => `You’ve seen all ${count} cards in this batch`,
  newBatch: 'Draw another batch',
  /** Progress: `Card 3 of 10` */
  step: (d: { index: number; total: number }): string => `Card ${d.index} of ${d.total}`,
  /** Streak: `12-day streak` */
  streak: (days: number): string => `${days}-day streak`,
  prev: 'Previous',
  next: 'Next',

  /** Review modes (segmented control values and labels).
   *  BUG-127b: these five sit in the topbar segment — one row, no ellipsis, and it
   *  shares its row with the search box / view switch (see Segmented.tsx). English
   *  runs wider than zh (342px total), so each name is the shortest form that still
   *  reads as a mode. Total budget ≈390px.
   *  （当年量这件事的 seg 截断守卫随截图工具链移除，2026-10-13；改名前自己在
   *   Obsidian 里切 en / ja 看那一排会不会出省略号。） */
  mode: {
    random: 'Random',
    week: 'Week unseen',
    month: 'Month unseen',
    stale: 'Stale',
    onthisday: 'On this day',
  } satisfies Record<ReviewMode, string>,
  /** Segmented control container aria-label */
  modeAria: 'Review mode',
}
