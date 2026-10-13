/**
 * ランダムふりかえり（Review.tsx + App トップバーのふりかえり方法セグメント）。
 * ふりかえり那颗卡就是主页面的 `Card`（2026-10-13），卡内文案（时间戳 / 操作行 /
 * 「在 Obsidian で開く」）は `copy.card` 側。
 */
import type { ReviewMode } from '../../review'

/** random と stale が空になる唯一の理由は**母集団が空**（ノートがないか、現在の
 *  絞り込みが命中しない）：stale は sort + slice なので母集団が空でなければ必ず出る
 *  （`momo/review/review.ts` 参照）。同じ実感を二通りに書かない。 */
const emptyPool = (brand: string): string => `ふりかえりできる${brand}がありません`

export const review = {
  /** バッチが空のときの見出し（抽法ごと）——ブランド語は引数経由 */
  empty: {
    onthisday: (brand: string): string => `往年の今日に該当する${brand}はありません`,
    stale: emptyPool,
    week: '1週間以上見ていないものはありません',
    month: '1か月以上見ていないものはありません',
    random: emptyPool,
  },

  backToAll: 'すべてのノートに戻る',
  /** トップバー：バッチを引き直す / ふりかえりを終える */
  refresh: '更新',
  end: 'ふりかえりを終える',
  /** ふりかえり画面の上部にある**絞り込みの閲覧専用表示**（BUG-123b の見える側）。
   *  バッチはふりかえりに入った瞬間の `matched()` のスナップショットであり、その画面では
   *  サイドバーの絞り込み項目が丸ごとロックされ、トップバーにも検索枠がない——
   *  「このバッチが何で絞られているか」を言える場所がここだけに残る（変更はできない）。
   *  `search` はこの行だけの補い：絞り込みバーは検索カプセルを出さない（リスト画面では
   *  検索枠がすぐ上にある）が、ふりかえり画面には検索枠がまったくない。 */
  filters: {
    label: '適用中の絞り込み',
    search: (q: string): string => `検索「${q}」`,
  },
  /** 1バッチ見終わり：`このバッチの10枚を見終わりました`（単位は「バッチ」に統一） */
  doneBatch: (count: number): string => `このバッチの${count}枚を見終わりました`,
  newBatch: '次のバッチを引く',
  /** 進捗：`3枚目 / 全10枚` */
  step: (d: { index: number; total: number }): string => `${d.total}枚中 ${d.index}枚目`,
  /** 連続記録：`12日連続` */
  streak: (days: number): string => `${days}日連続`,
  prev: '前へ',
  next: '次へ',

  /** ふりかえり方法（トップバーセグメントの値と表示名）。
   *  BUG-127b：この五つはトップバーのセグメント（一行・省略号なし）に並ぶ。ja は
   *  zh（計 342px）より幅を食うので、意味を落とさず最短の形に——seg 截断守卫は
   *  パネル幅のマトリクス（960/720/620/560/480/430）で言語ごとに測り、はみ出すと
   *  丸ごと赤にする。総予算は 390px 前後。 */
  mode: {
    random: 'ランダム',
    week: '1週間未見',
    month: '1か月未見',
    stale: '長らく未見',
    onthisday: '往年の今日',
  } satisfies Record<ReviewMode, string>,
  /** セグメントコンテナの aria-label */
  modeAria: 'ふりかえり方法',
}
