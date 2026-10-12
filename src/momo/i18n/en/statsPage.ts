/**
 * Stats page (Stats.tsx / everything outside StatsHeatmap).
 *
 * Card titles live in `cardTitle`: the settings section-toggle list groups by
 * STATS_GROUPS and the names must match the card headers on the page — one
 * copy serves both.
 */
export const statsPage = {
  /** Drill-down tooltip: click a stat to jump back to all notes, filtered */
  drill: {
    /** Shared prefix (tests assert which drill entries a page has via it) */
    prefix: 'All notes · filter: ',
    label: (label: string): string => `All notes · filter: ${label}`,
    /** With a hint: `All notes · filter: Long-note ratio (≥ 200 chars)` */
    labelHint: (label: string, hint: string): string => `All notes · filter: ${label} (${hint})`,
    hours: (d: { hour: number; count: number }): string =>
      `All notes · filter: ${d.hour}:00 (${d.count} notes)`,
    weekday: (d: { weekday: string; count: number }): string =>
      `All notes · filter: ${d.weekday} (${d.count} notes)`,
    /** Trend bar, week grain: `All notes · filter: week of 2026-09-14 (12 notes)` */
    week: (d: { from: string; count: number }): string =>
      `All notes · filter: week of ${d.from} (${d.count} notes)`,
    /** Trend bar, month grain: `All notes · filter: Sep 2026 (12 notes)` */
    month: (d: { axis: string; count: number }): string =>
      `All notes · filter: ${d.axis} (${d.count} notes)`,
    tag: (path: string): string => `All notes · filter: #${path}`,
    /** Locations (v0.9.33; all-notes since 2026-10-01 evening): sets the location
     *  filter (store's filterByLocation) — same wording as the tag one now */
    location: (label: string): string => `All notes · filter location: ${label}`,
    tagCountBin: (label: string): string => `All notes · filter: ${label}`,
    /** Tag-count histogram · 0-bin only: the zh source concatenates a noun after the
     *  label, so the zero bin ("No tags") needs its own self-contained string (BUG-13) */
    untagged: 'All notes · filter: No tags',
  },

  /** Empty state when the library is empty */
  empty: {
    title: 'No stats yet',
    sub: (brand: string): string => `Write your first ${brand} and your recording habits will grow here`,
  },

  /** Overview strip */
  overview: {
    title: 'Recording overview',
    weekRhythm: 'This week’s rhythm',
    /** `↑ last week +3` (arrow supplied by the caller) */
    weekVsPrev: (d: { arrow: string; prev: number }): string => `${d.arrow} last week +${d.prev}`,
    streak: 'Current streak',
    streakOngoing: 'Ongoing',
    /** `Broken for 4 days` */
    streakBroken: (days: number): string => `Streak broken for ${days} days`,
    streakToday: 'Nothing written today',
    activeRatio: 'Active-day ratio',
    activeRatioSub: (d: { days: number; windowDays: number }): string => `${d.days} / ${d.windowDays} days`,
    peakHours: 'Peak hours',
    /** `12 notes fall here` */
    peakSub: (count: number): string => `${count} notes fall here`,
    noRecords: 'No records yet',
    weekend: 'Weekend recording',
    weekendNoSample: 'Not enough weekend or weekday samples',
    weekendMore: 'More active on weekends',
    weekdayMore: 'More active on weekdays',
    weekendSame: 'Weekdays and weekends alike',
  },

  /** Custom range editor */
  range: {
    from: 'Start date',
    to: 'End date',
    /** Connector between the two date inputs */
    sep: 'to',
    /** Quick preset: `Last 30 days` */
    preset: (days: number): string => `Last ${days} days`,
    apply: 'Apply',
  },

  /** Trend cards */
  trend: {
    /** Card-head pill: `Peak Sep · 12 notes` */
    peak: (d: { label: string; count: number }): string => `Peak ${d.label} · ${d.count} notes`,
    /** "Recording time" head pill: `14:00 · 12 notes` (no "peak" prefix) */
    peakHour: (d: { hour: number; count: number }): string => `${d.hour}:00 · ${d.count} notes`,
    /** Trailing "this week / this month" at the axis end */
    lastWeek: (label: string): string => `${label} · this week`,
    lastMonth: (label: string): string => `${label} · this month`,
  },

  /** Key figures row */
  kpi: {
    total: 'Total notes',
    /** `+12 30d` */
    last30: (count: number): string => `+${count} 30d`,
    /** `Longest 2519 chars` */
    maxLength: (chars: number): string => `Longest ${chars} chars`,
    tags: 'Tags',
    /** `2.3 tags per note` */
    avgTags: (avg: number): string => `${avg} tags per note`,
    activeDays: 'Active days',
    active30Label: 'Active in last 30 days',
    /** `12 / 30 days` */
    active30Value: (active: number): string => `${active} / 30 days`,
  },

  /** Content quality card */
  quality: {
    avg: 'Avg length',
    median: 'Median length',
    longRatio: 'Long-note ratio',
    /** `≥ 200 chars` */
    longHint: (minChars: number): string => `≥ ${minChars} chars`,
    untagged: 'Untagged',
  },

  /** Milestones */
  milestone: {
    /** Note-count milestone: `Note #1000` */
    notes: (target: number): string => `Note #${target}`,
    /** Streak milestone: `30-day streak` */
    streak: (target: number): string => `${target}-day streak`,
    /** `12 notes to go` */
    remaining: (d: { remaining: number; unit: string }): string => `${d.remaining} ${d.unit} to go`,
    next: 'Next',
    allDone: 'Every milestone has been reached',
    /** `since 06-14` */
    since: (day: string): string => `since ${day}`,
  },

  /** Recording habits card */
  habits: {
    currentStreak: 'Current streak',
    bestStreak: 'Best streak',
    monthNew: 'New this month',
    /** "Last month N" for comparison */
    monthPrev: (count: number): string => `${count} last month`,
    avgPerActiveDay: 'Avg per active day',
    bestDay: 'Most productive day',
    /** With a date: `Most productive day · 09-14` */
    bestDayOn: (md: string): string => `Most productive day · ${md}`,
    maxDayShare: 'Single-day concentration',
  },

  /** Sub-section titles on the page */
  subSection: {
    weekdayDist: 'Weekday distribution',
    newTags: 'New tags · first seen in the last 30 days',
    coldTags: 'Cold tags · untouched for 90+ days',
    attachmentTrend: 'Attachment trend',
    continentCoverage: 'Entries by continent',
    newLocs: 'New places · first visit in the last 30 days',
    coldLocs: 'Cold places · no visit in 90+ days',
    recentLocs: 'Recently visited',
  },

  /** Card titles (shared verbatim with the settings section-toggle list) */
  cardTitle: {
    trend: 'Recording trend',
    time: 'Recording time',
    habits: 'Recording habits',
    milestones: 'Milestones',
    lifecycle: 'Tag lifecycle',
    tagDist: 'Tags per note',
    lengthDist: 'Length distribution',
    records: 'Longest notes',
    review: 'Review',
    attachments: 'Attachments',
    locScale: 'Footprint',
    locRank: 'Top locations',
    locDist: 'Locations per note',
    locLifecycle: 'Location lifecycle',
  },

  /** Tag lifecycle card */
  tagLife: {
    noTags: 'No tags yet',
    newNone: 'No new tags in these 30 days',
    coldNone: 'Everything updated within 90 days; no cold tags',
    /** `3 notes · untouched for 45 days` */
    coldValue: (d: { count: number; days: number }): string => `${d.count} notes · untouched for ${d.days} days`,
    singleUse: 'One-off tags',
    /** `3 / 12 (25%)` */
    singleUseValue: (d: { count: number; total: number; ratio: string }): string =>
      `${d.count} / ${d.total} (${d.ratio})`,
    top3: 'Top 3 concentration',
  },

  /** Longest notes card */
  records: {
    empty: 'No data yet',
  },

  /** Review card */
  review: {
    recent30: 'Reviewed in last 30 days',
    recent7: 'Reviewed in last 7 days',
    oldest: 'Longest unreviewed',
    reviewed: 'Reviewed',
    unreviewed: 'Not reviewed',
    coverage: 'Coverage',
  },


  /** ⑤ Locations group (v0.9.33): footprint / top locations / locations per note / lifecycle */
  loc: {
    /** Shared empty footnote: no locations at all in range */
    empty: 'No locations yet',
    /** Footprint card scalar rows */
    scale: {
      locCount: 'Distinct locations',
      country: 'Countries',
      continent: 'Continents',
      avgLocs: 'Locations per note',
      /** Count + ratio assembled by the caller (`3 notes · 75%`) */
      noLoc: (d: { count: number; ratio: string }): string => `No location (${d.count} notes · ${d.ratio})`,
    },
    /** Top-locations card: row value */
    rankValue: (count: number): string => `${count} notes`,
    /** Location lifecycle card */
    life: {
      newNone: 'No new places in these 30 days',
      coldNone: 'Visited within 90 days; no cold places',
      recentNone: 'No locations yet',
      /** `3 notes · 45 days since last visit` */
      coldValue: (d: { count: number; days: number }): string =>
        `${d.count} notes · ${d.days} days since last visit`,
      singleVisit: 'One-off locations',
      /** `2 / 8 (25%)` */
      singleVisitValue: (d: { count: number; total: number; ratio: string }): string =>
        `${d.count} / ${d.total} (${d.ratio})`,
      top3: 'Top 3 concentration',
    },
  },

  /** Attachments card */
  attachments: {
    total: 'Total attachments',
    totalBytes: 'Total size',
    entriesWithImages: (): string => 'Notes with images',
    imageRatio: 'With-image ratio',
  },
}
