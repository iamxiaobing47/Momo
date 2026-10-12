/**
 * コマンドパレット / Ribbon / エディター右クリックメニューの文言。
 *
 * ブランド語（デフォルト「Momo」）は書き込まない：`prefs.brandName` はユーザーが
 * 変更できる（設定 §外観）ので、すべて `brand` 引数で組み立てる。
 */
export const commands = {
  /** エディター右クリックメニュー：選択した Markdown を Momo として保存 */
  saveSelection: (brand: string): string => `${brand}に保存`,
  /** Ribbon アイコンのツールチップ */
  ribbon: (brand: string): string => brand,
  openPanel: (brand: string): string => `${brand}を開く`,
  newEntry: (brand: string): string => `${brand}を新規作成`,
  /** 補記：コマンドパレットで日付を選び、過去の日に項目を補う */
  backfill: '過去の日に補記…',
  /** 事前書き：コマンドパレットで日付を選び、未来の日に項目を書いておく（補記の鏡） */
  future: '未来の日に書いておく…',
  /** タブ右クリックメニュー（短めに。「パネル」接頭辞なし） */
  moveToLeft: '左サイドバーへ移動',
  moveToRight: '右サイドバーへ移動',
}
