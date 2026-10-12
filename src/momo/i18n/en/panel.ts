/**
 * Main panel (App / Card / Composer / filter chips / multi-select toolbar /
 * stats topbar). The brand word always goes through `brand`.
 */
import type { SortKey } from '../../types/prefs'

export const panel = {
  /** Composer */
  composer: {
    entry: (brand: string): string => `New ${brand}, opened in the Obsidian editor`,
    /** Button label */
    placeholder: 'Write something',
  },

  /** Pinning (card context menu / tag manager share this pair) */
  pin: 'Pin',
  unpin: 'Unpin',

  /** Backfill (filter bar entry: the button shown when exactly one date filter is active; arg = local day YYYY-MM-DD) */
  backfill: {
    toDay: (day: string): string => `Backfill to ${day}`,
  },

  /** Sidebar navigation */
  nav: {
    allNotes: 'All notes',
    review: 'Random review',
    stats: 'Stats',
    trash: 'Trash',
  },

  /** Screen-reader name for the narrow (≤620px) topbar mode segmented: it replaces
      the whole sidebar menu once the sidebar is hidden */
  navAria: 'Switch view',

  /** Sidebar quick stats */
  quickStats: {
    notes: 'Notes',
    tags: 'Tags',
    days: 'Days',
  },

  /** Sidebar show/hide */
  sidebar: {
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
    /** Accessibility name for the resize handle (role=separator; ← → = ±24px) — BUG-128f */
    resizeAria: 'Drag to resize the sidebar',
  },

  searchPlaceholder: 'Search notes',

  /** Density switch (segmented control) */
  density: {
    aria: 'Switch view',
    list: 'List view',
    focus: 'Focus view: vertical scroll, one card in focus, neighbours blurred',
  },

  /** Sorting (topbar sort button + its two-section menu) */
  sort: {
    /** Menu accessible name (the menu itself has "Sort by" / "Direction" group labels) */
    menuAria: 'Sort order',
    groupKey: 'Sort by',
    groupDir: 'Direction',
    asc: 'Oldest first',
    desc: 'Newest first',
    key: {
      updated: 'Updated',
      created: 'Created',
    } satisfies Record<SortKey, string>,
    /** Button title / aria: `Sort: Updated · Newest first` (both args are already localized) */
    button: (key: string, dir: string): string => `Sort: ${key} · ${dir}`,
  },

  /** Multi-select */
  select: {
    enter: 'Select',
    all: 'Select all',
    exit: 'Exit selection',
    cancelAria: 'Cancel selection',
    /** Bottom floating bar: `3 selected` */
    count: (n: number): string => `${n} selected`,
  },

  /** Filter chips */
  chip: {
    untagged: 'Untagged',
    /** `Hours 22:00` */
    hours: (label: string): string => `Hours ${label}`,
    /** `301–800 chars` (the tag-count chip wraps a range label) */
    tagCount: (range: string): string => `tags: ${range}`,
    reviewed: 'Reviewed',
    unreviewed: 'Not reviewed',
    reviewed7: 'Reviewed in last 7 days',
    reviewed30: 'Reviewed in last 30 days',
    /** Range chips: `≤ 50 chars` / `≥ 801 chars` / `301–800 chars` */
    range: {
      atMost: (max: number, unit: string): string => `≤ ${max} ${unit}`,
      atLeast: (min: number, unit: string): string => `≥ ${min} ${unit}`,
      between: (min: number, max: number, unit: string): string => `${min}–${max} ${unit}`,
    },
  },

  /** Empty / loading states */
  empty: {
    loading: 'Loading…',
    /** Library is empty */
    title: 'Nothing here yet',
    /** `Tap “Write something…” above to record your first note` */
    hint: (composerLabel: string): string => `Tap “${composerLabel}…” above to write your first note`,
    /** Filters matched nothing */
    filtered: (brand: string): string => `No ${brand} matches the current filters`,
    clearFilters: 'Clear filters',
  },

  /** Q12: accessible name for the focus view's focusable scroll container (role=group) */
  focusStageAria: 'Focus view; use arrow keys or Home/End to flip cards',

  /** Bottom batch bar (multi-select) */
  batch: {
    addTag: 'Add tags',
    removeTag: 'Remove tags',
  },

  /** Stats topbar right side (range segments only) */
  statsToolbar: {
    rangeAria: 'Stats range',
    range: {
      all: 'All',
      d90: 'Last 90 days',
      ytd: 'This year',
      custom: 'Custom',
    },
  },
}
