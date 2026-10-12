/**
 * 統計ページ（Stats.tsx / StatsHeatmap 以外の部分）。
 *
 * カードタイトルは `cardTitle` に集約：設定ページの区画スイッチ一覧は
 * STATS_GROUPS ごとに表示され、名前はページ上のカード見出しと一致しなければ
 * ならない——2か所でこの1份を共用する。
 */
export const statsPage = {
  /** ドリルダウンのツールチップ：統計の数字から、絞り込み付きでノート一覧へ戻る */
  drill: {
    /** 共通の接頭辞（テストはこれで「このページの下掘り入口」を特定する） */
    prefix: 'すべてのノートへ · 絞り込み：',
    label: (label: string): string => `すべてのノートへ · 絞り込み：${label}`,
    /** 補足付き：`すべてのノートへ · 絞り込み：長文比率（≥ 200字）` */
    labelHint: (label: string, hint: string): string => `すべてのノートへ · 絞り込み：${label}（${hint}）`,
    hours: (d: { hour: number; count: number }): string =>
      `すべてのノートへ · 絞り込み：${d.hour}時（${d.count}件）`,
    weekday: (d: { weekday: string; count: number }): string =>
      `すべてのノートへ · 絞り込み：${d.weekday}（${d.count}件）`,
    /** トレンド棒・週粒度：`すべてのノートへ · 絞り込み：2026-09-14 の週（12件）` */
    week: (d: { from: string; count: number }): string =>
      `すべてのノートへ · 絞り込み：${d.from} の週（${d.count}件）`,
    /** トレンド棒・月粒度：`すべてのノートへ · 絞り込み：2026年9月（12件）` */
    month: (d: { axis: string; count: number }): string =>
      `すべてのノートへ · 絞り込み：${d.axis}（${d.count}件）`,
    tag: (path: string): string => `すべてのノートへ · 絞り込み：#${path}`,
    /** 場所（v0.9.33。2026-10-01 夜から「すべてのノート」へ）：その場所を地点フィルタに
     *  設定する（store の filterByLocation）——タグと同じ句式になった */
    location: (label: string): string => `すべてのノートへ · 場所で絞り込み：${label}`,
    tagCountBin: (label: string): string => `すべてのノートへ · 絞り込み：${label}のタグ`,
    /** タグ数分布・0 段専用：ラベルが既に「タグなし」と名詞込みのため（BUG-13） */
    untagged: 'すべてのノートへ · 絞り込み：タグなし',
  },

  /** ライブラリが空のときの空状態 */
  empty: {
    title: 'まだ統計がありません',
    sub: (brand: string): string => `最初の${brand}を書けば、ここにあなたの記録習慣が育ちます`,
  },

  /** 概観ストリップ */
  overview: {
    title: '記録の概観',
    weekRhythm: '今週のリズム',
    /** `↑ 先週 +3`（矢印は呼び出し元が渡す） */
    weekVsPrev: (d: { arrow: string; prev: number }): string => `${d.arrow} 先週 +${d.prev}`,
    streak: '連続記録',
    streakOngoing: '進行中',
    /** `4日途切れました` */
    streakBroken: (days: number): string => `${days}日途切れました`,
    streakToday: '今日はまだ書いていません',
    activeRatio: '記録日数の割合',
    activeRatioSub: (d: { days: number; windowDays: number }): string => `${d.days} / ${d.windowDays}日`,
    peakHours: 'ピーク時間帯',
    /** `12件がここに集中` */
    peakSub: (count: number): string => `${count}件がここに集中`,
    noRecords: 'まだ記録がありません',
    weekend: '週末の記録',
    weekendNoSample: '週末または平日のサンプルが不足',
    weekendMore: '週末のほうが活発',
    weekdayMore: '平日のほうが活発',
    weekendSame: '平日も週末も同じくらい',
  },

  /** カスタム範囲の編集バー */
  range: {
    from: '開始日',
    to: '終了日',
    /** 2つの日付入力の間の接続詞 */
    sep: '〜',
    /** クイック指定：`直近30日` */
    preset: (days: number): string => `直近${days}日`,
    apply: '適用',
  },

  /** トレンドカード */
  trend: {
    /** カード見出しの pill：`ピーク 9月 · 12件` */
    peak: (d: { label: string; count: number }): string => `ピーク ${d.label} · ${d.count}件`,
    /** 「記録時間」の pill：`14時 · 12件`（「ピーク」接頭辞なし） */
    peakHour: (d: { hour: number; count: number }): string => `${d.hour}時 · ${d.count}件`,
    /** 軸の右端の「今週 / 今月」 */
    lastWeek: (label: string): string => `${label} · 今週`,
    lastMonth: (label: string): string => `${label} · 今月`,
  },

  /** 主要指標行 */
  kpi: {
    total: '総ノート',
    /** `+12 30日` */
    last30: (count: number): string => `+${count} 30日`,
    /** `最長 2519字` */
    maxLength: (chars: number): string => `最長 ${chars}字`,
    tags: 'タグ',
    /** `1件あたり 2.3個` */
    avgTags: (avg: number): string => `1件あたり ${avg}個`,
    activeDays: '記録日数',
    active30Label: '直近30日の活動',
    /** `12 / 30日` */
    active30Value: (active: number): string => `${active} / 30日`,
  },

  /** コンテンツ品質カード */
  quality: {
    avg: '平均文字数',
    median: '中央値',
    longRatio: '長文比率',
    /** `≥ 200字` */
    longHint: (minChars: number): string => `≥ ${minChars}字`,
    untagged: 'タグなし',
  },

  /** マイルストーン */
  milestone: {
    /** 件数マイルストーン：`1000件目のノート` */
    notes: (target: number): string => `${target}件目のノート`,
    /** 連続記録マイルストーン：`30日連続記録` */
    streak: (target: number): string => `${target}日連続記録`,
    /** `あと12件` */
    remaining: (d: { remaining: number; unit: string }): string => `あと${d.remaining}${d.unit}`,
    next: '次',
    allDone: 'すべてのマイルストーンを達成済み',
    /** `06-14 から` */
    since: (day: string): string => `${day} から`,
  },

  /** 記録習慣カード */
  habits: {
    currentStreak: '現在の連続記録',
    bestStreak: '最長連続記録',
    monthNew: '今月の新規',
    /** 比較側の「先月 N」 */
    monthPrev: (count: number): string => `先月 ${count}`,
    avgPerActiveDay: '活動日の平均',
    bestDay: '最も生産的な日',
    /** 日付付き：`最も生産的な日 · 09-14` */
    bestDayOn: (md: string): string => `最も生産的な日 · ${md}`,
    maxDayShare: '単日集中度',
  },

  /** ページ内の小見出し */
  subSection: {
    weekdayDist: '曜日分布',
    newTags: '新規タグ · 直近30日で初出現',
    coldTags: '冷えたタグ · 90日以上未更新',
    attachmentTrend: '添付の推移',
    continentCoverage: '大陸ごとの件数',
    newLocs: '新しい場所 · 30日以内に初めて行った',
    coldLocs: '冷えた場所 · 90日以上行っていない',
    recentLocs: '最近行った場所',
  },

  /** カードタイトル（設定ページの区画スイッチ一覧と同一の一份） */
  cardTitle: {
    trend: '記録トレンド',
    time: '記録時間',
    habits: '記録習慣',
    milestones: 'マイルストーン進捗',
    lifecycle: 'タグのライフサイクル',
    tagDist: 'タグ数分布',
    lengthDist: '文字数分布',
    records: '最長ノート',
    review: 'ふりかえり',
    attachments: '添付統計',
    locScale: '足の広がり',
    locRank: '場所ランキング',
    locDist: 'ノートあたりの場所数',
    locLifecycle: '場所のライフサイクル',
  },

  /** タグライフサイクルカード */
  tagLife: {
    noTags: 'まだタグがありません',
    newNone: 'この30日間は新しいタグがありません',
    coldNone: '直近90日以内にすべて更新されており、冷えたタグはありません',
    /** `3件 · 45日未更新` */
    coldValue: (d: { count: number; days: number }): string => `${d.count}件 · ${d.days}日未更新`,
    singleUse: '使い切りのタグ',
    /** `3 / 12（25%）` */
    singleUseValue: (d: { count: number; total: number; ratio: string }): string =>
      `${d.count} / ${d.total}（${d.ratio}）`,
    top3: 'Top 3 集中度',
  },

  /** 最長ノートカード */
  records: {
    empty: 'まだデータがありません',
  },

  /** ふりかえりカード */
  review: {
    recent30: '直近30日のふりかえり',
    recent7: '直近7日のふりかえり',
    oldest: '最も長く未ふりかえり',
    reviewed: 'ふりかえり済み',
    unreviewed: '未ふりかえり',
    coverage: 'カバー率',
  },

  /** ⑤ 場所グループ（v0.9.33）：足の広がり / ランキング / 場所数分布 / ライフサイクル */
  loc: {
    /** 四カード共通の空状態フッター：範囲内に場所が一つもない */
    empty: '場所がまだありません',
    /** 足の広がりカードの標量行 */
    scale: {
      locCount: '場所の総数',
      country: '国',
      continent: '大陸',
      avgLocs: 'ノートあたりの場所数',
      /** 件数と割合は呼び出し側で組み立てる（`3 件 · 75%`） */
      noLoc: (d: { count: number; ratio: string }): string => `場所なし（${d.count} 件 · ${d.ratio}）`,
    },
    /** 場所ランキングカードの行値 */
    rankValue: (count: number): string => `${count} 件`,
    /** 場所のライフサイクルカード */
    life: {
      newNone: 'この30日新しい場所はありません',
      coldNone: '90日以内に行っており、冷えた場所はありません',
      recentNone: '場所がまだありません',
      /** `3 件 · 最後に行ってから45日` */
      coldValue: (d: { count: number; days: number }): string =>
        `${d.count} 件 · 最後に行ってから${d.days}日`,
      singleVisit: '一度きりの場所',
      /** `2 / 8（25%）` */
      singleVisitValue: (d: { count: number; total: number; ratio: string }): string =>
        `${d.count} / ${d.total}（${d.ratio}）`,
      top3: 'Top 3 集中度',
    },
  },

  /** 添付統計カード */
  attachments: {
    total: '添付の総数',
    totalBytes: '合計サイズ',
    entriesWithImages: (brand: string): string => `画像付き${brand}`,
    imageRatio: '画像付きの割合',
  },
}
