/**
 * ユーザーに届くエラー文言（`throw new Error(...)` → 上位の Notice）。
 * 開発者ログ（console.*）はここに置かない：ログは安定・grep可能であるべきで、
 * 言語に追従しない。
 */
export const errors = {
  /** 編集中にファイルが外部から削除 / 改名された */
  fileGone: (path: string): string => `ファイルが存在しません（削除または名前変更された可能性があります）：${path}`,
  /** タグ名の検証（数字以外の文字が最低1つ必要） */
  invalidTag: (tag: string): string => `「${tag}」はタグに使えません（数字以外の文字が最低1つ必要です）`,
  /** 一括ソフト削除の途中失敗（成功件数を添えて誤解を防ぐ） */
  deletePartial: (d: { done: number; reason: string }): string =>
    `${d.done}件削除しましたが、${d.done + 1}件目で失敗：${d.reason}`,
  /** 一括復元の途中失敗 */
  restorePartial: (d: { done: number; reason: string }): string =>
    `${d.done}件復元しましたが、${d.done + 1}件目で失敗：${d.reason}`,
  /** ゴミ箱を空にする途中失敗 */
  purgePartial: (d: { done: number; reason: string }): string =>
    `${d.done}件削除したところでエラー：${d.reason}`,
  /** 汎用の書き込み失敗 */
  writeFailed: (detail: string): string => `書き込みに失敗しました：${detail}`,
  /**
   * 一括ゴミ箱登録の保存に失敗（B08：data.json の書き込み失敗。再読み込み後、
   * これらの項目の元のパスは失われる可能性がある）。同一セッションで1回だけ
   * 表示し、繰り返しの通知にはしない。
   */
  trashRegisterSaveFailed: (detail: string): string =>
    `ゴミ箱の登録を保存できませんでした：${detail}。再読み込み後、これらの項目の元のパスが失われる可能性があります。`,
  /** 設定の書き込み失敗（data.json の書き込み失敗で設定を黙って捨てない） */
  prefsSaveFailed: (detail: string): string => `設定の保存に失敗しました：${detail}`,
  /** 単件の復元失敗（一括の失敗は restorePartial へ） */
  restoreFailed: (detail: string): string => `復元に失敗しました：${detail}`,
  /** 単件の完全削除失敗（一括の失敗は purgePartial へ） */
  purgeFailed: (detail: string): string => `完全削除に失敗しました：${detail}`,
  /**
   * 一覧の読み込み失敗：見えているのは古い内容で、気づいたのはコンソールだけ——
   * 常設バナーに載せる一文。書き込みは一度きりの結果（Notice）だが、読み込みは
   * 続く状態なので常設にする。二文目は削れない：古い一覧を最新と誤読させないため。
   */
  refreshFailed: (detail: string): string =>
    `一覧の更新に失敗しました：${detail}。最後に読み込んだ内容を表示しています。`,
  /**
   * プラグイン初期化の失敗（BUG-130a）：ディスク読み書きの失敗で init が reject し、
   * プラグインの読み込み自体が失敗して通知も出なかった。今は縮退状態で読み込み、
   * 「パネルは開くがデータが不完全かもしれない」ことをこの通知で伝える。
   */
  initFailed: (detail: string): string =>
    `初期化に失敗しました：${detail}。プラグインは縮退状態で読み込まれ、一部のデータが不完全な可能性があります。`,
  /**
   * ノート移住の失敗（設定ページでルート / 本文フォルダを変え「移す」を選んだ側；
   * service.migrateNotes）。**既に移したファイルは元に戻し、フォルダ設定は
   * 変更しない**——この一句は文言に残す必須：移住が半ばで失敗したとき最悪なのは
   * 「ファイルは新フォルダ・設定はまだ旧フォルダ」の宙吊り状態で、ロールバック
   * すれば移住前の完全な現場がそのまま残る。
   */
  notesMigrateFailed: (detail: string): string =>
    `ノートの移住に失敗しました：${detail}。既に移したファイルは元に戻し、フォルダ設定は変更していません。`,
}
