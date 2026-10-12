import type { LocContinent, LocTreeLevel } from '../../locations'

/** Display names for continents (keys = canonical names, see locRegions.CONTINENT_LIST).
 *  Writing six of seven will not compile. */
const CONTINENT: Record<LocContinent, string> = {
  亚洲: 'Asia',
  欧洲: 'Europe',
  非洲: 'Africa',
  北美洲: 'North America',
  南美洲: 'South America',
  大洋洲: 'Oceania',
  南极洲: 'Antarctica',
}

/**
 * Locations (F1, phase one; since 2026-10-01 evening the location *page* is gone and
 * locations are a filter dimension of All notes plus two of its views): the sidebar
 * "All locations" tree (the filter entry), the location group flow (a view tier),
 * cross-reference pills, single-card edit popup, the batch "set locations" popup,
 * the empty state, and the globe view. Peer of the tags domain — the two concepts are
 * parallel (both live in frontmatter) and their copy stays apart.
 */
export const location = {
  // ---- Group flow (entries with no location are dropped from the grouped view
  //  entirely: no virtual group, not shown) ----
  /** Group header screen-reader name: `Beijing, 12 notes` */
  groupAria: (loc: string, count: number): string => `${loc}, ${count} notes`,
  /** Joiner for a location path (v0.9.30 continent · country · place):
   *  `Asia · China · Beijing`. The three *names* go through
   *  `locDisplay.displayLocName` (locale-aware since 2026-10-06) — this is only
   *  the gap between them. */
  pathSep: ' · ',
  /** Display names for continents (keys = the canonical names in
   *  `CONTINENT_LIST`; country names are reverse-derived from the alias table in
   *  locDisplay.ts — not duplicated here) */
  continent: CONTINENT,

  // ---- Sidebar "All locations" (v0.9.31 ④; always visible since 2026-10-01 evening) ----
  /** Section title = the full list of places; clicking a node adds a filter, clicking it again removes it */
  all: 'All locations',
  /** Accessibility name for a tree node (v0.9.31): `China, 12 notes` */
  nodeAria: (label: string, count: number): string => `${label}, ${count} notes`,
  /** Expand / collapse twisty accessibility names */
  treeExpand: 'Expand',
  treeCollapse: 'Collapse',
  /** The funnel at the right of the section head (2026-10-01): view this tree by
   *  level; several levels can be picked at once since 2026-10-10 */
  treeFilterAria: 'Filter locations by level',
  /** Group label inside the popover */
  treeFilterGroup: 'Level',
  /** One-line scope note in the popover: several levels can be picked at once;
   *  only this sidebar tree; the display granularity is the separate
   *  "Grouping & display" preference */
  treeFilterHint: 'Pick several levels at once; how coarse each level reads is the "Grouping & display" setting',
  /** The four tier names (bound to the LocTreeLevel enum: a missing name fails the build) */
  treeLevel: {
    all: 'All',
    continent: 'Continent',
    country: 'Country',
    place: 'Place',
  } satisfies Record<LocTreeLevel, string>,
  /** None of the picked levels has a node (e.g. "Country" when every location is a top-level name) */
  treeLevelEmpty: 'No locations at the picked levels yet',

  // ---- Cross-reference pill (multi-location) ----
  pillAria: (loc: string): string => `Filter by location: ${loc}`,

  // ---- Location gazetteer (built-in world cities; the suggestions section while searching) ----
  /** Section label separating in-vault locations from gazetteer cities in the result list */
  rosterSection: 'World cities',

  // ---- Empty state (library has zero locations) ----
  emptyTitle: 'No locations yet',
  emptySub: 'Tag entries with locations to filter them by place',
  emptyCta: 'Add locations to entries',
  emptyBack: 'Browse all entries first',
  /** The frontmatter sample at the bottom of the empty state (hand-writing is the second path) */
  emptyFmHint: 'Or write it straight into a note’s frontmatter:',
  emptyFmKey: 'locations',
  emptyFmItem: 'Beijing',

  // ---- Single-card edit popup (the 5th mappin in the card action row) ----
  edit: {
    aria: 'Edit locations',
    pick: 'Search or create a location…',
    /** Toggling writes immediately, so the footer only has "Done" — no "Apply" */
    done: 'Done',
    createNew: (loc: string): string => `Create ${loc}`,
  },

  // ---- Batch locations (multi-select → fab buttons 5 / 6: add / remove) ----
  batch: {
    /** Short labels on the two fab buttons (fit the narrow bar; since 2026-10-12 the
     *  accessible name is the label itself — BUG-212: the former ariaAdd / ariaRemove
     *  differed only by a contextually obvious "Batch", i.e. redundant inside the
     *  batch bar, and those two keys were what leaked the black tooltip; deleted) */
    fabAdd: 'Add locations',
    fabRemove: 'Remove locations',
    /** Footer left: `3 selected` (2026-10-10 the header title went away, so it moved from top-right to bottom-left) */
    selected: (count: number): string => `${count} selected`,
    /** The only counter-intuitive point of remove mode: candidates are not the whole vault, only what these entries really have */
    noteRemove: (brand: string): string => `Only locations actually on these ${brand} notes`,
    pickAdd: 'Search or create a location…',
    pickRemove: (brand: string): string => `Search the locations on these ${brand} notes…`,
    pendingAdd: 'To add',
    pendingRemove: 'To remove',
    /** Q11: the ✕ on a pending chip in the batch location picker */
    chipRemove: (l: string): string => `Remove location ${l}`,
    groupAll: 'All locations',
    groupOwned: (brand: string): string => `On these ${brand} notes`,
    emptyNoMatch: 'No matching locations',
    emptyNoLocations: 'No locations yet — type and press Enter to create one',
    createNew: (loc: string): string => `Create ${loc}`,
    summaryNoneOwned: 'None of the selected entries have these locations',
    summaryAllHave: 'Every chosen location is already there',
    /** Footer summary: `To add 3 · will touch 5 entries` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending} · will touch ${d.willWrite} entries`,
    /** Right column: how many entries get it added / removed */
    rowAdd: (n: number): string => `+${n}`,
    rowRemove: (n: number): string => `−${n}`,
    rowHas: 'Has all',
    /** Row aria names (BUG-176e): the right column is a bare `+N / Has all / −N` —
     *  aria must tell the same thing instead of the group total. */
    rowAddAria: (loc: string, n: number): string => `${loc}, will be added to ${n} entries`,
    rowHasAria: (loc: string): string => `${loc}, already in the selected set`,
    rowRemoveAria: (loc: string, n: number): string => `${loc}, will be removed from ${n} entries`,
    applyingAdd: 'Adding…',
    applyingRemove: 'Removing…',
    applyAdd: 'Add locations',
    applyRemove: 'Remove locations',
  },

  // ---- Input validation (inline hint, never a Notice) ----
  /** Shown under the input past the character limit. BUG-126d: the limit comes in
   *  as a param (callers pass LOCATION_MAX_CHARS) — no hard-coded 20 in the dict. */
  tooLong: (max: number): string => `A location is at most ${max} characters`,
  /** A continent name cannot be a location (BUG-52) */
  continentName: 'A continent cannot be a location',
  /** At most the cap locations per note (LOCATIONS_MAX), enforced before write (BUG-52).
   *  BUG-126d: the cap comes in as a param (callers pass LOCATIONS_MAX). */
  tooMany: (max: number): string => `At most ${max} locations per note`,

  // ---- Write summaries (caps-layer Notices). Full success stays silent; only
  //  skipped / failed (a mismatch with "N selected") pops ----
  notice: {
    /** Batch add with skips / failures: `3 updated · 2 skipped · 1 failed` (zero items omitted) */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `Locations added: ${d.updated} updated${d.skipped > 0 ? `, ${d.skipped} skipped` : ''}${
        d.failed > 0 ? `, ${d.failed} failed` : ''
      }`,
    /** Batch remove with skips / failures: same wording */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `Locations removed: ${d.updated} updated${d.skipped > 0 ? `, ${d.skipped} skipped` : ''}${
        d.failed > 0 ? `, ${d.failed} failed` : ''
      }`,
  },

  // ---- Globe view & location group flow (view tiers of All notes since 2026-10-01 evening) ----
  globe: {
    /** The two icons in the view segmented: aria names; on/off is conveyed by aria-pressed */
    toggleAria: 'Globe view',
    /** Screen-reader name of the stage (canvas is invisible to AT; anchors are
     *  tapped directly on the globe) */
    stageAria: (n: number): string => `Globe with ${n} location anchors; tap an anchor to filter the cards below`,
    stageEmpty: 'Globe, no anchors to show',
    /** BUG-81a: notes carry locations but none resolves to a coordinate */
    noCoordsHint: 'Your notes have locations, but none of them has coordinates yet — add latitudes and longitudes under Settings → Locations to light up the globe.',
    /** BUG-122b: the earth texture failed to decode (missing or damaged in the plugin folder) and no globe is on screen */
    // v1.0.0: missing textures usually mean the globe asset pack isn't installed (the
    // store / BRAT only ship the three core files) — the notice carries the download
    // button so it can be fixed right on this page.
    textureFailed: 'The earth texture couldn’t load, so the globe surface can’t be drawn right now — the dots still work. Download the globe asset pack to restore the texture files (~7MB; the plugin’s only network access).',
    packDownload: 'Download globe asset pack',
    packDownloading: (done: number, total: number): string => `Downloading ${done}/${total}…`,
    packFailed: (n: number): string => `Download failed (${n} files) — check your network and retry`,
  },
  /** Aria name of the "grouped by location" view tier (group flow: one stream, scrolled down) */
  groupViewAria: 'Group by location',
}
