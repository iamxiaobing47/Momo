/**
 * Display metadata bound to domain enums (color scheme names, icon names,
 * stats group names…). Declared with `Record<enum, …>` so that adding an enum
 * member without copy fails to compile.
 */
import type { BrandIcon, FontRole, ColorScheme, StatsGroupKey, TagSortKey } from '../../types'
import type { TagAttachmentFilter, TagTimeFilter } from '../../tags'
import { CHAR_BIN_UPPER } from '../../stats/constants'

/**
 * Body-length bin labels: every number is **derived from CHAR_BIN_UPPER**
 * (BUG-105b). The upper bounds are inclusive, so the last bin is ≥ 801 —
 * hand-copying it as "800+" put 800 in two neighboring labels while the
 * drill-down filtered ≥ 801. Numbers come from the one source; a typo is
 * physically impossible, and changes only happen in constants.ts.
 */
const charBin: string[] = [
  ...CHAR_BIN_UPPER.map((upper, i) =>
    i === 0 ? `≤ ${upper} chars` : `${CHAR_BIN_UPPER[i - 1] + 1}–${upper} chars`,
  ),
  `${CHAR_BIN_UPPER[CHAR_BIN_UPPER.length - 1] + 1}+ chars`,
]

export const meta = {
  /** The semantic groups on the stats page (order from STATS_GROUPS) */
  statsGroup: {
    output: 'My output',
    rhythm: 'Recording rhythm',
    tagSystem: 'Tag system',
    locations: 'Locations',
    content: 'Content & review',
  } satisfies Record<StatsGroupKey, string>,

  /** Color schemes: name + one-line description (scheme cards).
   *  Key order = display order (COLOR_SCHEMES): mist-blue first = default since 2026-10-11.
   *  Names mirror the scheme ids (2026-10-12 rename — no borrowed product names). */
  colorScheme: {
    'mist-blue': {
      name: 'Mist blue',
      desc: 'Pure white base, thin grey lines, mist-blue accent.',
    },
    'moss-green': {
      name: 'Moss green',
      desc: 'Cool grey-white base, white cards, teal theme.',
    },
    'clam-white': {
      name: 'Clam white',
      desc: 'Warm clam-white paper, azurite interactions, cinnabar activity. Dunhuang mineral pigments.',
    },
    stepfun: {
      name: 'StepFun',
      desc: 'Sky-cyan surfaces + electric step blue + mint→cyan→blue→violet activity ramp; violet primary action.',
    },
    'ink-night': {
      name: 'Ink night',
      desc: 'Charcoal base, light text, amber theme (dark mode).',
    },
  } satisfies Record<ColorScheme, { name: string; desc: string }>,

  /** Brand icon names (shape picker in settings; kept short) */
  brandIcon: {
    leaf: 'Leaf',
    stack: 'Stack',
    flame: 'Flame',
    pencil: 'Pencil',
    tag: 'Tag',
    clock: 'Clock',
    shuffle: 'Shuffle',
    chart: 'Bars',
  } satisfies Record<BrandIcon, string>,

  /** Obsidian font-role names (v1.0.0; ids = FONT_ROLES in types/prefs.ts).
   *  These map to the three font settings under Obsidian's Appearance settings. */
  fontRole: {
    interface: 'Interface',
    text: 'Text',
    monospace: 'Monospace',
  } satisfies Record<FontRole, string>,

  /** The body-length bins (indices match charBins in stats.ts); numbers come from charBin above */
  charBin,

  /** The four tags-per-entry bins (indices match tagCountBuckets) */
  tagCountBin: ['No tags', '1 tag', '2 tags', '3+ tags'],

  /** Locations per note, four bins (v0.9.33, index-aligned with locCountBuckets) */
  locCountBin: ['No locations', '1 location', '2 locations', '3+ locations'],

  /** Sidebar tag sort keys (v0.9.18). The popover renders them in TAG_SORT_KEYS order */
  tagSort: {
    count: 'Count',
    attachments: 'Attachments',
    name: 'Name',
  } satisfies Record<TagSortKey, string>,

  /** Sidebar tag filter · time group (v0.9.18) */
  tagTimeFilter: {
    all: 'All',
    '7d': 'Within 7 days',
    '30d': 'Within 30 days',
    '90d': 'Within 90 days',
    older: 'Older',
  } satisfies Record<TagTimeFilter, string>,

  /** Sidebar tag filter · attachments group (v0.9.18) */
  tagAttachmentFilter: {
    all: 'All',
    with: 'With images',
    without: 'Text only',
  } satisfies Record<TagAttachmentFilter, string>,

}
