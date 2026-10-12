/**
 * **列挙型に結びついた**表示メタデータ（配色名、アイコン名、統計グループ名…）。
 *
 * `Record<列挙, …>` で宣言するので、「列挙にメンバーを足したのに文言を書き忘れる」
 * とコンパイルで弾かれる。
 */
import type { BrandIcon, BundledFontId, ColorScheme, StatsGroupKey, TagSortKey } from '../../types'
import type { TagAttachmentFilter, TagTimeFilter } from '../../tags'
import { CHAR_BIN_UPPER } from '../../stats/constants'

/**
 * 文字数分布の段ラベル：数字はすべて **CHAR_BIN_UPPER から派生**（BUG-105b）。
 * 上界は「含む」なので最終段は ≥ 801 —— 手で写した「800字以上」は 800 を
 * 隣り合う二つの段に出現させ、ドリルダウンの絞り込み（≥ 801）と画面上で食い違っていた。
 * 数字は一つの真源から来るので写し間違いは物理的に起こらず、変更は
 * constants.ts の一箇所で済む。
 */
const charBin: string[] = [
  ...CHAR_BIN_UPPER.map((upper, i) =>
    i === 0 ? `≤ ${upper}字` : `${CHAR_BIN_UPPER[i - 1] + 1}–${upper}字`,
  ),
  `${CHAR_BIN_UPPER[CHAR_BIN_UPPER.length - 1] + 1}字以上`,
]

export const meta = {
  /** 統計ページの5グループの見出し（順序は types.ts の STATS_GROUPS 次第） */
  statsGroup: {
    output: 'アウトプット',
    rhythm: '記録のリズム',
    tagSystem: 'タグ体系',
    locations: '場所',
    content: '内容とふりかえり',
  } satisfies Record<StatsGroupKey, string>,

  /** 配色スキーム：名前 + 一言説明（スキームカードの主・副テキスト）。
   *  鍵の順序 = 表示順（COLOR_SCHEMES）：2026-10-11 から先頭の mist-blue（霧藍）がデフォルト。
   *  2026-10-12 の改名で id はスキーム名そのものの英語に（notion→mist-blue …）——表示名は変更なし。 */
  colorScheme: {
    'mist-blue': {
      name: '霧藍',
      desc: '純白のベース + 細いグレーの線 + 霧藍のアクセント。',
    },
    'moss-green': {
      name: '苔緑',
      desc: '冷灰白のベース + 白いカード + 青緑のテーマ。',
    },
    'clam-white': {
      name: '蛤白',
      desc: '温かな蛤の紙色 + 石青の操作色 + 朱砂のアクティビティ。敦煌の鉱物顔料。',
    },
    stepfun: {
      name: 'StepFun',
      desc: '晴空青の紙面 + 電光ステップブルー + ミント→シアン→青→紫のアクティビティ、右上是ピクセル紫。',
    },
    'ink-night': {
      name: '墨夜',
      desc: '濃炭のベース + 明るい文字 + 琥珀のテーマ（ダーク）。',
    },
  } satisfies Record<ColorScheme, { name: string; desc: string }>,

  /** 左上のブランドアイコン名（名前は短く。「デフォルト」は名前に書かない） */
  brandIcon: {
    leaf: '葉',
    stack: '三段の山',
    flame: '炎',
    pencil: '鉛筆',
    tag: 'タグ',
    clock: '時計',
    shuffle: 'シャッフル',
    chart: '棒グラフ',
  } satisfies Record<BrandIcon, string>,

  /** 内蔵オープンソースフォントの名前（v0.9.16、id = types/prefs.ts の
   *  BUNDLED_FONTS。Record 全キー保証——1 つでも欠けたらコンパイルエラー）。
   *  フォント名は固有名詞：日本語環境でも各フォントの通称をそのまま使う。
   *  v0.9.42：タイルは幅 116px・名前行 11px、**硬線 ~90px**。以前は括弧書きで
   *  日本語通称まで足していたが、「Noto Sans SC（源ノ角ゴシック）」は実測 170px で
   *  名前ごと省略記号に切れていた（ユーザーには見えない ja 側の同じ不具合）。
   *  通称は名前に混ぜない——zh/meta.ts と同じ割り切り（向こうの注釈に理由がある）。 */
  fontName: {
    wenkai: '霞鶩文楷',
    notosans: 'Noto Sans SC',
    notoserif: 'Noto Serif SC',
    jetbrains: 'JetBrains Mono',
  } satisfies Record<BundledFontId, string>,

  /** 文字数分布の5段（添字は stats.ts の charBins と対応）；数字は上の charBin から派生 */
  charBin,

  /** 1件あたりのタグ数の4段（tagCountBuckets の添字と対応） */
  tagCountBin: ['タグなし', '1個', '2個', '3個以上'],

  /** ノート一件あたりの場所数の四段（v0.9.33、locCountBuckets と添字対応） */
  locCountBin: ['場所なし', '1個', '2個', '3個以上'],

  /** サイドバーのタグ並べ替えキー名（v0.9.18）。TAG_SORT_KEYS の順に表示 */
  tagSort: {
    count: '件数',
    attachments: '添付数',
    name: '名前',
  } satisfies Record<TagSortKey, string>,

  /** サイドバーのタグ絞り込み · 最近の使用（v0.9.18） */
  tagTimeFilter: {
    all: 'すべて',
    // 「以内」不能省：光写『7日』在日语里最自然的读法是『7天前那一天』，
    // 与口径（最近 7 天之内）相反（BUG-32；zh『7 天内』/ en『Within 7 days』同义）
    '7d': '7日以内',
    '30d': '30日以内',
    '90d': '90日以内',
    older: 'それ以前',
  } satisfies Record<TagTimeFilter, string>,

  /** サイドバーのタグ絞り込み · 添付（v0.9.18） */
  tagAttachmentFilter: {
    all: 'すべて',
    with: '画像あり',
    without: 'テキストのみ',
  } satisfies Record<TagAttachmentFilter, string>,
}
