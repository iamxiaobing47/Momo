/**
 * タグ関係：サイドバーのタグツリー（TagTree）、タグ管理ポップアップ（TagEditMenu）、
 * 一括タグ追加・解除ポップアップ（BatchTagPicker）。共用の語はここに1份。
 */
export const tags = {
  // ---- サイドバーのタグツリー ----
  collapseChildren: '子タグを折りたたむ',
  expandChildren: '子タグを展開',
  pinnedArea: 'ピン留め',
  pinHint: '下のタグを右クリックでピン留めできます',
  all: 'すべてのタグ',
  filterPlaceholder: 'タグを絞り込み...',

  // ---- サイドバーのタグ並べ替えと絞り込み（v0.9.18）----
  /** 「すべてのタグ N」の右にある並べ替えボタン（文字は現在のキー名） */
  sortAria: 'タグの並べ替え',
  /** 絞り込みボタンのアクセシブル名 */
  filterAria: 'タグを絞り込み',
  /** 2グループの行ラベル（選択肢の名前は copy.meta 側） */
  filterGroupTime: '最近の使用',
  filterGroupAttachment: '添付',
  /** 絞り込みポップアップの下部：2グループをまとめて解除（名前入力欄には触れません） */
  filterClear: 'すべて解除',
  /** 絞り込みでタグが残らないときの空状態（上のピン留めは影響を受けません） */
  filterEmpty: '条件に合うタグがありません',
  /** その空状態のボタン */
  filterEmptyClear: '絞り込みを解除',
  /** 並べ替えボタンのアクセシブル名：`件数で並べ替え`（ボタン上はキー名のみ） */
  sortButton: (name: string): string => `${name}で並べ替え`,
  /** 要約チップのアクセシブル名：`絞り込みを解除：7日` */
  filterChipRemove: (name: string): string => `絞り込みを解除：${name}`,

  // ---- 複数選択タグの組み合わせ（2026-10-12、和集合 / 積集合）----
  /** 絞り込み入力欄の右にあるボタンのアクセシブル名。ツール行の漏斗（filterAria）とは
      別物：あれは「サイドバーにどのタグ行を出すか」、これは「選んだタグを主エリアで
      どう組み合わせるか」——上下に隣り合うので、名前は同じ仕事に読されてはいけない。 */
  matchAria: 'タグの組み合わせ',
  /** 各選択肢の一行説明（名前は copy.meta.tagMatch、列挙束縛）。グループ名とその下の
      一行説明は 2026-10-13 に削除（ユーザーの裁决、TagFilterMenu のグループ説明と同じ）：
      選択肢の名前と各々の副文だけで十分伝わる。 */
  matchUnionHint: 'いずれかのタグを含むノートを表示',
  matchIntersectionHint: '選んだタグをすべて含むノートを表示',

  // ---- タグ管理ポップアップ（タグチップの右クリックで開く）----
  manageAria: 'タグ管理',
  renamePlaceholder: '新しい名前…（親/子 をサポート）',
  /** 改名プレビュー：`#読書（子タグ含む）を #阅读 に変更` */
  previewRename: (from: string, to: string): string => `#${from}（子タグ含む）を #${to} に変更`,
  mergeSection: '既存のタグへ統合',
  noMatch: '一致するタグがありません',
  /** 候補の右側の「計 N」 */
  total: (count: number): string => `計${count}`,
  // 2026-10-10 起没有 deleteTitle（BUG-160：所有 dialog 左上角都不放标题）——确认框标题与主动作按钮重复
  deleteMessage: (tag: string, brand: string): string =>
    `すべての${brand}から #${tag} を取り除きます（このタグだけ。子タグには触れません）。`,
  deleteConfirm: 'タグを削除',
  /** 書き込み中のボタン文言（改名 / 削除共用） */
  writing: '書き込み中…',
  rename: '名前を変更',

  // ---- 一括タグ追加 / 解除ポップアップ ----
  batch: {
    /** フッター左列：`3件選択中`（2026-10-10 にヘッダータイトルを外した際ここへ移動） */
    selected: (count: number): string => `${count}件選択中`,
    /** 解除モードの直感に反する点は書き出しておく */
    noteRemove: 'このタグだけ外します。子タグはそのまま',
    pickRemove: (brand: string): string => `これらの${brand}についているタグを検索…`,
    pickAdd: 'タグを検索または新規作成…',
    pendingRemove: '解除予定',
    pendingAdd: '追加予定',
    /** Q11：一括タグポップの予約チップ ✕（どれを外すか読み上げさせる） */
    chipRemove: (t: string): string => `タグ #${t} を削除`,
    groupCooccur: 'よく一緒に現れる',
    groupAll: 'すべてのタグ',
    groupOwned: (brand: string): string => `この${brand}についている`,
    emptyNoMatch: '一致するタグがありません',
    emptyNoneOwned: (brand: string): string => `選択した${brand}にはまだタグがありません`,
    emptyNoTags: 'タグがまだありません。入力してEnterで新規作成',
    createNew: (tag: string): string => `#${tag} を新規作成`,
    summaryNoneOwned: '選んだタグはどれもありません',
    summaryAllHave: 'すべて含まれています',
    /** ボトムバーの要約：`追加予定 3個 · 5件を変更予定` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending}個 · ${d.willWrite}件を変更予定`,
    /** 追加モードで「すでに全部含む」行の印 */
    rowHas: 'すべて含む',
    applyingRemove: '解除中…',
    applyingAdd: '追加中…',
    applyRemove: 'タグを解除',
    applyAdd: 'タグを追加',
  },

  // ---- 書き込みの要約通知（caps 層の Notice）----
  // 全件成功では弾まない（結果はその場で見える）。スキップ / 失敗があって
  // 「N件を選んだのに合わない」ときだけ出す。
  notice: {
    /** 一括追加でスキップ / 失敗あり：`3件を変更 · 2件をスキップ · 1件が失敗`（0件は表示しない） */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `タグを追加しました：${d.updated}件を変更${
        d.skipped > 0 ? `、${d.skipped}件をスキップ` : ''
      }${d.failed > 0 ? `、${d.failed}件が失敗` : ''}`,
    /** 一括解除でスキップ / 失敗あり：addDone と同じ言い回し */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `タグを解除しました：${d.updated}件を変更${
        d.skipped > 0 ? `、${d.skipped}件をスキップ` : ''
      }${d.failed > 0 ? `、${d.failed}件が失敗` : ''}`,
    /** 改名 / 統合で失敗あり */
    renamed: (d: { from: string; to: string; updated: number; failed: number }): string =>
      `#${d.from}（子タグ含む）を #${d.to} に変更しました（${d.updated}件）${
        d.failed > 0 ? `、${d.failed}件が失敗` : ''
      }`,
    /** タグ削除で失敗あり（deleteMessage と同じ範囲） */
    deleted: (d: { tag: string; updated: number; failed: number }): string =>
      `${d.updated}件から #${d.tag} を取り除きました${
        d.failed > 0 ? `、${d.failed}件が失敗` : ''
      }`,
  },
}
