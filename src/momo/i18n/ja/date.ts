/**
 * 日付と時間の文言。
 *
 * 曜日名はかつて4か所で別々に書かれていたため、「起点 + 粒度」ごとにここへ集約。
 * 日本語の曜日は1字がそのまま短縮形を兼ねる。
 */
export const date = {
  /** 月曜起点・正式名：統計の曜日分布軸 */
  weekdayMonFirst: ['月', '火', '水', '木', '金', '土', '日'],
  /** 日曜起点：JS `getDay()` と同じ添字 */
  weekdaySunFirst: ['日', '月', '火', '水', '木', '金', '土'],
  /** 月曜起点・1字（統計ページのコンパクト軸） */
  weekdayCharMonFirst: ['月', '火', '水', '木', '金', '土', '日'],
  /** 日曜起点・1字（ヒートマップ左側の行ラベル） */
  weekdayCharSunFirst: ['日', '月', '火', '水', '木', '金', '土'],
  /** 時間帯の名（0–5時 / 6–11時 / 12–17時 / 18–23時） */
  hourBucket: ['深夜', '午前', '午後', '夜'],
  weekend: '週末',

  /** `2026-09-19 · 金`（リストのグループ見出し） */
  groupTitle: (dayKey: string, weekday: string): string => (weekday ? `${dayKey} · ${weekday}` : dayKey),
  /** `2026年9月`（ヒートマップの年・月軸） */
  yearMonth: (year: number, month: number): string => `${year}年${month}月`,
  /** `9月` */
  month: (month: number): string => `${month}月`,
  /** `9月19日` のような「月/日」短縮ラベル */
  monthDay: (month: number, day: number): string => `${month}月${day}日`,
  /** `14時`（時間帯フィルターのチップ） */
  hour: (hour: number): string => `${hour}時`,
  /** `14–18時`（時間帯の範囲） */
  hourRange: (from: number, to: number): string => `${from}–${to}時`,
  /** `9/14/20時`（連続しない時間帯の列挙） */
  hourList: (list: string): string => `${list}時`,

  /** `9/14 週`（トレンドの週軸ラベル） */
  weekPoint: (month: number, day: number): string => `${month}/${day} 週`,

  /** 相対日付（ふりかえりページのヘッダー） */
  today: '今日',
  yesterday: '昨日',
  daysAgo: (days: number): string => `${days}日前`,
  /** 未来の日付（予約・予定のエントリ、BUG-125c）：「今日」にまとめない */
  daysLater: (days: number): string => `${days}日後`,
  monthsAgo: (months: number): string => `${months}か月前`,
  yearsAgo: (years: number): string => `${years}年前`,
}
