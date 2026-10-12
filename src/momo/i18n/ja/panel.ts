/**
 * メインパネル（App / Card / Composer / フィルターチップ / 複数選択バー / 統計トップバー）。
 * ブランド語はすべて `brand` 引数経由：`prefs.brandName` はユーザーが変更できる。
 */
import type { SortKey } from '../../types/prefs'

export const panel = {
  /** 投稿ボックス（Composer） */
  composer: {
    entry: (brand: string): string => `${brand}を新規作成して Obsidian エディターで開く`,
    /** ボタンの文字 */
    placeholder: '何か書く',
  },

  /** ピン留め（カード右クリックメニュー / タグ管理の「ピン留めエリア」共用の語） */
  pin: 'ピン留め',
  unpin: 'ピン留め解除',

  /** 補記（フィルターバー入口：日付フィルタが1日だけのときに出るボタン。引数 = ローカル日 YYYY-MM-DD） */
  backfill: {
    toDay: (day: string): string => `${day} に補記`,
  },

  /** サイドバーナビ */
  nav: {
    allNotes: 'すべてのノート',
    review: 'ランダムふりかえり',
    stats: '統計',
    trash: 'ゴミ箱',
  },

  /** 狭幅（≤620px）顶栏のモード分节の読み上け名——サイドバーが隠れた后は
      メニュー一式の代わりをこれが担う */
  navAria: '表示を切り替え',

  /** サイドバーのサマリー3格 */
  quickStats: {
    notes: 'ノート',
    tags: 'タグ',
    days: '日数',
  },

  /** サイドバーの表示切り替え */
  sidebar: {
    collapse: 'サイドバーを閉じる',
    expand: 'サイドバーを開く',
    /** リサイズハンドルのアクセシブル名（role=separator；← → で ±24px）— BUG-128f */
    resizeAria: 'ドラッグでサイドバーの幅を調整',
  },

  searchPlaceholder: 'ノートを検索',

  /** 表示密度の切り替え（セグメントコントロール） */
  density: {
    aria: 'ビュー切替',
    list: 'リストビュー',
    focus: 'フォーカスビュー：縦スクロールで1枚に集中、上下のカードはぼかし',
  },

  /** 並び順（トップバーの並び替えボタン + その2段メニュー） */
  sort: {
    /** メニューのアクセシブル名（メニュー内に「基準」「方向」のグループ名がある） */
    menuAria: '並び替えの方法',
    groupKey: '並び順の基準',
    groupDir: '方向',
    asc: '古い順',
    desc: '新しい順',
    key: {
      updated: '更新日時',
      created: '作成日時',
    } satisfies Record<SortKey, string>,
    /** ボタンの title / aria：`並び替え：更新日時 · 古い順`（2つの引数はローカライズ済み） */
    button: (key: string, dir: string): string => `並び替え：${key} · ${dir}`,
  },

  /** 複数選択 */
  select: {
    enter: '複数選択',
    all: 'すべて選択',
    exit: '選択を終了',
    cancelAria: '選択をキャンセル',
    /** 下部のフローティングバー：`3件選択中` */
    count: (n: number): string => `${n}件選択中`,
  },

  /** フィルターのチップ */
  chip: {
    untagged: '未分類',
    /** `時間帯 22時` */
    hours: (label: string): string => `時間帯 ${label}`,
    /** `301–800字`（文字数・タグ数チップが範囲ラベルを包む） */
    tagCount: (range: string): string => `${range}のタグ`,
    reviewed: 'ふりかえり済み',
    unreviewed: '未ふりかえり',
    reviewed7: '直近7日のふりかえり',
    reviewed30: '直近30日のふりかえり',
    /** 範囲チップ：`≤ 50字` / `≥ 801字` / `301–800字` */
    range: {
      atMost: (max: number, unit: string): string => `≤ ${max}${unit}`,
      atLeast: (min: number, unit: string): string => `≥ ${min}${unit}`,
      between: (min: number, max: number, unit: string): string => `${min}–${max}${unit}`,
    },
  },

  /** 空状態 / 読み込み中 */
  empty: {
    loading: '読み込み中…',
    /** ライブラリが空のとき */
    title: 'まだ何もありません',
    /** `上の「何か書く…」から最初の1件を`（引数 = 投稿ボックスの文言） */
    hint: (composerLabel: string): string => `上の「${composerLabel}…」から最初の1件を書きましょう`,
    /** フィルターで結果が空になったとき */
    filtered: (brand: string): string => `条件に一致する${brand}はありません`,
    clearFilters: 'フィルターをクリア',
  },

  /** Q12：フォーカスビューのフォーカス可能スクロール領域（role=group）のアクセス可能名 */
  focusStageAria: 'フォーカスビュー。方向キーまたは Home/End でカードを切り替え',

  /** 下部の一括操作バー */
  batch: {
    addTag: 'タグを追加',
    removeTag: 'タグを外す',
  },

  /** 統計ページのトップバー右側（範囲セグメントのみ） */
  statsToolbar: {
    rangeAria: '統計期間',
    range: {
      all: '全期間',
      d90: '直近90日',
      ytd: '今年',
      custom: 'カスタム',
    },
  },
}
