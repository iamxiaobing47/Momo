import type { LocContinent, LocTreeLevel } from '../../locations'

/** 大陸の表示名（キー = 規範名、locRegions.CONTINENT_LIST 参照）。七つのうち
 *  六つしか書かなければコンパイルが通らない。 */
const CONTINENT: Record<LocContinent, string> = {
  亚洲: 'アジア',
  欧洲: 'ヨーロッパ',
  非洲: 'アフリカ',
  北美洲: '北アメリカ',
  南美洲: '南アメリカ',
  大洋洲: 'オセアニア',
  南极洲: '南極',
}

/**
 * 地点（location、F1一期。2026-10-01 夜に「地点ページ」を廃止し、地点は
 * 「すべてのノート」の絞り込み軸 + その2つのビューになった）：サイドバーの
 * 「すべての地点」ツリー（絞り込み入口）、地点グループフロー（ビューの一档）、
 * 相互参照ピル、単一カードの場所ポップアップ、一括「場所を設定」ポップアップ、
 * 空状态、地球ビュー。tags ドメインと対になる概念（どちらも frontmatter に住む）
 * なので、文言は交えない。
 */
export const location = {
  // ---- グループフロー（地点がない記事はグループ表示に出さない：仮想グループも作らない）----
  /** グループヘッダーの読み上げ名：`東京、12件` */
  groupAria: (loc: string, count: number): string => `${loc}、${count}件`,
  /** 地点パスの接続記号（v0.9.30 大陸 · 国 · 地点）：`アジア · 中国 · 北京`。
   *  三つの**名前**は `locDisplay.displayLocName` が受け持つ（2026-10-06 から
   *  表示言語に追従）——ここが管するのはその間の一枠だけ。 */
  pathSep: ' · ',
  /** 大陸の表示名（キー = `CONTINENT_LIST` の規範名。国の三言語名は
   *  locDisplay.ts が別名表から逆引きするのでここには書かない） */
  continent: CONTINENT,

  // ---- サイドバー「すべての地点」（v0.9.31 ④。2026-10-01 夜から常置）----
  /** 区块タイトル = 地点の全リスト。ノードをクリックで絞り込み、もう一度で解除 */
  all: 'すべての地点',
  /** ツリーノードの読み上げ名（v0.9.31）: `中国、12 件` */
  nodeAria: (label: string, count: number): string => `${label}、${count} 件`,
  /** 展開 / 折りたたみツイストの読み上げ名 */
  treeExpand: '展開',
  treeCollapse: '折りたたむ',
  /** 見出し行右端の漏斗（2026-10-01）：このツリーをレベルで見る。2026-10-10 から複数選可 */
  treeFilterAria: 'レベルで地点を絞り込み',
  /** ポップアップ内のグループ名 */
  treeFilterGroup: 'レベル',
  /** 四档の表示名（LocTreeLevel 枚举に绑定：成员を足して名前を忘れるとコンパイルエラー） */
  treeLevel: {
    all: 'すべて',
    continent: '大陸',
    country: '国',
    place: '地点',
  } satisfies Record<LocTreeLevel, string>,
  /** 選んだレベルにノードがひとつもない（「外婆家」のようなトップ级地名だけの库で「国」を選んだ等） */
  treeLevelEmpty: '選んだレベルには地点がまだありません',

  // ---- 相互参照ピル（複数地点）----
  pillAria: (loc: string): string => `地点で絞り込み：${loc}`,

  // ---- 地点名簿（内蔵の世界都市名簿、検索時の候補セクション）----
  /** ライブラリ内の地点と名簿の都市を分ける小見出し */
  rosterSection: '世界の都市',

  // ---- 空状态（ライブラリ内に地点がひとつもない）----
  emptyTitle: '地点がまだありません',
  emptySub: '記事に地点を付けると、地点で絞り込めます',
  emptyCta: '記事に地点を付ける',
  emptyBack: 'まずすべての記事を見る',
  /** 空状态の下部にある frontmatter の例（手書きが二番目の経路） */
  emptyFmHint: 'ノートの frontmatter に直接書くこともできます：',
  emptyFmKey: 'locations',
  emptyFmItem: '北京',

  // ---- 単一カードの場所ポップアップ（カード操作行の5番目の mappin）----
  edit: {
    aria: '地点を編集',
    pick: '地点を検索または新規作成…',
    /** 選ぶとすぐ書き込まれるので、フッターにあるのは「完了」だけ——「适用」はない */
    done: '完了',
    createNew: (loc: string): string => `${loc} を新規作成`,
  },

  // ---- 一括「場所を追加 / 解除」（複数選択 → fab の5 / 6番目）----
  batch: {
    /** fab の2つのボタンの短いラベル（狭いバーに収まる；2026-10-12 から読み上げ名は
     *  このラベル自身——BUG-212：かつての ariaAdd / ariaRemove は文脈上自明の「一括」
     *  が付くだけの繰り返しで、黒底ツールチップを漏らした当の鍵。削除済み） */
    fabAdd: '地点を追加',
    fabRemove: '地点を解除',
    /** フッター左列：`3件選択中`（2026-10-10 ヘッダータイトルが消えたので、右上から左下へ） */
    selected: (count: number): string => `${count}件選択中`,
    /** 解除モード唯一の直感に反する点：候補は全ライブラリではなく、このブランドのノートに本当にある地点だけ */
    noteRemove: (brand: string): string => `この${brand}に本当にある地点だけ`,
    pickAdd: '地点を検索または新規作成…',
    pickRemove: (brand: string): string => `これらの${brand}に付いている地点を検索…`,
    pendingAdd: '追加予定',
    pendingRemove: '解除予定',
    /** Q11：一括地点ポップの予約チップ ✕ */
    chipRemove: (l: string): string => `地点 ${l} を削除`,
    groupAll: 'すべての地点',
    groupOwned: (brand: string): string => `この${brand}に付いている`,
    emptyNoMatch: '一致する地点がありません',
    emptyNoLocations: '地点がまだありません。入力してEnterで新規作成',
    createNew: (loc: string): string => `${loc} を新規作成`,
    summaryNoneOwned: '選んだ地点はどれもありません',
    summaryAllHave: 'すべて含まれています',
    /** ボトムバーの要約：`追加予定 3個 · 5件を変更予定` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending}個 · ${d.willWrite}件を変更予定`,
    /** 右列：何件に追加されるか / 何件から外れるか */
    rowAdd: (n: number): string => `+${n}`,
    rowRemove: (n: number): string => `−${n}`,
    rowHas: 'すべて含む',
    /** 行の読み上げ名（BUG-176e）：右列は `+N / すべて含む / −N` の裸数字相当——
     *  aria は同じ口径で読み、グループ総数は読まない。 */
    rowAddAria: (loc: string, n: number): string => `${loc}、${n}件に追加します`,
    rowHasAria: (loc: string): string => `${loc}、選択済みです`,
    rowRemoveAria: (loc: string, n: number): string => `${loc}、${n}件から外します`,
    applyingAdd: '追加中…',
    applyingRemove: '解除中…',
    applyAdd: '地点を追加',
    applyRemove: '地点を解除',
  },

  // ---- 入力チェック（パネル内の即时表示。Noticeにはしない）----
  /** 文字数上限超過時に入力欄の下に出る赤文字。BUG-126d：上限は引数
   *  （呼び出し側が LOCATION_MAX_CHARS を渡す）——辞書に 20 と書かない。 */
  tooLong: (max: number): string => `地点は最長${max}文字です`,
  /** 大陸名は地点にできない（BUG-52） */
  continentName: '大陸名は地点にできません',
  /** 1件につき地点は上限まで、書き込み前に弾く（BUG-52）。BUG-126d：上限は
   *  引数（呼び出し側が LOCATIONS_MAX を渡す）——辞書に 8 と書かない。 */
  tooMany: (max: number): string => `1件につき地点は最大${max}つです`,

  // ---- 書き込みの要約通知（caps 层の Notice）----
  // 全件成功では弾まない。スキップ / 失敗があるときだけ出す。
  notice: {
    /** 一括追加でスキップ / 失敗あり：`3件を変更 · 2件をスキップ · 1件が失敗`（0件は表示しない） */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `地点を追加しました：${d.updated}件を変更${
        d.skipped > 0 ? `、${d.skipped}件をスキップ` : ''
      }${d.failed > 0 ? `、${d.failed}件が失敗` : ''}`,
    /** 一括解除でスキップ / 失敗あり：addDone と同じ言い回し */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `地点を解除しました：${d.updated}件を変更${
        d.skipped > 0 ? `、${d.skipped}件をスキップ` : ''
      }${d.failed > 0 ? `、${d.failed}件が失敗` : ''}`,
  },

  // ---- 地球ビューと地点グループフロー（2026-10-01 夜から「すべてのノート」のビュー档）----
  globe: {
    /** ビュー分段のこの2つ：aria 名。オン / オフは aria-pressed で伝える */
    toggleAria: '地球ビュー',
    /** ステージの読み上げ名（canvas は読み上げ不可。アンカーは球の上で直接タップする） */
    stageAria: (n: number): string => `地球、地点アンカー${n}件。アンカーをタップして下のカードを絞り込み`,
    stageEmpty: '地球、表示できるアンカーはありません',
    /** BUG-81a：ノートに場所の記録はあるが、座標が一つも解決できないときの球下ヒント */
    noCoordsHint: 'ノートに場所の記録はありますが、まだ座標がありません。設定 → 場所 で緯度経度を登録すると光点が球に表示されます。',
    /** BUG-122b：地球テクスチャの読み込み失敗（プラグインフォルダ内で欠落・破損）、球が一つも表示できないとき */
    // v1.0.0：テクスチャ欠落はたいてい「地球アセットパック未インストール」（ストア /
    // BRAT は主要3ファイルしか配布しない）。説明帯にダウンロードボタンを載せ、この
    // ページでそのまま補えるようにした。
    textureFailed: '地球のテクスチャを読み込めなかったため、いまは球面を描画できません——光点はそのまま押せます。「地球アセットパック」をダウンロードすると復旧します（約 7MB、プラグイン唯一の通信）。',
    packDownload: '地球アセットパックをダウンロード',
    packDownloading: (done: number, total: number): string => `ダウンロード中 ${done}/${total}…`,
    packFailed: (n: number): string => `ダウンロード失敗（${n} 件）——ネットワークを確認して再試行してください`,
    packFailedMissing: 'このバージョンにはまだアセットパック付きの Release がありません——GitHub から完全版を入手するか、作者のリリースをお待ちください',
    packFailedCorrupt: (n: number): string => `ダウンロード内容の検証に失敗（${n} 件）——プロキシ / ミラーが書き換えた可能性があります。再試行するか完全版をご利用ください`,
  },
  /** 「地点でグループ」ビュー档の aria 名（グループフロー：地点ごとに一続きで下へ） */
  groupViewAria: '地点でグループ',
}
