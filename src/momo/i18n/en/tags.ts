/**
 * Tag copy: sidebar tag tree (TagTree), tag manager (TagEditMenu), batch
 * add/remove picker (BatchTagPicker). Shared wording lives here once.
 */
export const tags = {
  // ---- Sidebar tag tree ----
  collapseChildren: 'Collapse subtags',
  expandChildren: 'Expand subtags',
  pinnedArea: 'Pinned',
  pinHint: 'Right-click a tag below to pin it',
  all: 'All tags',
  filterPlaceholder: 'Filter tags...',

  // ---- Sidebar tag sorting & filtering (v0.9.18) ----
  /** Button beside "All tags N"; its label is the current key (copy.meta.tagSort) */
  sortAria: 'Sort tags',
  /** Accessible name of the funnel button */
  filterAria: 'Filter tags',
  /** Group names (option names live in copy.meta.tagTimeFilter / tagAttachmentFilter) */
  filterGroupTime: 'Recently used',
  filterGroupAttachment: 'Attachments',
  /** One-line hint under each group label: both groups have been asked "what does this mean" */
  filterHintTime: 'By the newest note in the tag',
  filterHintAttachment: 'By whether the tag has notes with images',
  /** Filter popover, bottom: clears both groups (leaves the name input alone) */
  filterClear: 'Clear all',
  /** Empty state when filtering leaves nothing (the pinned area above is unaffected) */
  filterEmpty: 'No tags match',
  /** Button inside that empty state */
  filterEmptyClear: 'Clear filters',
  /** Accessible name of the sort button: `Sort by Count` (the button shows only the key name) */
  sortButton: (name: string): string => `Sort by ${name}`,
  /** Accessible name of a summary chip: `Remove filter: 7 days` */
  filterChipRemove: (name: string): string => `Remove filter: ${name}`,

  // ---- Tag manager (opened from a tag chip context menu) ----
  manageAria: 'Tag management',
  renamePlaceholder: 'Rename to… (parent/child supported)',
  /** Rename preview: `Rename #reading (incl. subtags) to #books` */
  previewRename: (from: string, to: string): string => `Rename #${from} (incl. subtags) to #${to}`,
  mergeSection: 'Merge into an existing tag',
  noMatch: 'No matching tags',
  /** "N total" beside a candidate */
  total: (count: number): string => `${count} total`,
  // 2026-10-10 起没有 deleteTitle（BUG-160：所有 dialog 左上角都不放标题）——确认框标题与主动作按钮重复
  deleteMessage: (tag: string, brand: string): string =>
    `This removes #${tag} from all ${brand} entries (only the tag itself; its subtags stay).`,
  deleteConfirm: 'Delete tag',
  /** Button copy while writing (rename / delete) */
  writing: 'Writing…',
  rename: 'Rename',

  // ---- Batch add / remove tag picker ----
  batch: {
    /** Footer left: `3 selected` (moved there 2026-10-10 when the head title went away) */
    selected: (count: number): string => `${count} selected`,
    /** The one counter-intuitive rule of remove mode, spelled out */
    noteRemove: 'Only the tag itself is removed; subtags stay',
    pickRemove: (brand: string): string => `Search the tags on these ${brand} entries…`,
    pickAdd: 'Search or create a tag…',
    pendingRemove: 'To remove',
    pendingAdd: 'To add',
    /** Q11: the ✕ on a pending chip in the batch tag picker (screen readers name which one) */
    chipRemove: (t: string): string => `Remove tag #${t}`,
    groupCooccur: 'Often appear together',
    groupAll: 'All tags',
    groupOwned: (brand: string): string => `On these ${brand} entries`,
    emptyNoMatch: 'No matching tags',
    emptyNoneOwned: (brand: string): string => `The selected ${brand} entries have no tags yet`,
    emptyNoTags: 'No tags yet — type and press Enter to create one',
    createNew: (tag: string): string => `Create #${tag}`,
    summaryNoneOwned: 'None of the selected entries have these tags',
    summaryAllHave: 'Every chosen tag is already there',
    /** Footer summary: `To add 3 · will touch 5 entries` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending} · will touch ${d.willWrite} entries`,
    /** Row marker in add mode: this entry already has them all */
    rowHas: 'Has all',
    applyingRemove: 'Removing…',
    applyingAdd: 'Adding…',
    applyRemove: 'Remove tags',
    applyAdd: 'Add tags',
  },

  // ---- Write summaries (caps-layer Notices). Full success stays silent — the result
  //  is visible on the cards; only skipped / failed (a mismatch with "N selected") pops ----
  notice: {
    /** Batch add with skips / failures: `3 updated · 2 skipped · 1 failed` (zero items omitted) */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `Tags added: ${d.updated} updated${d.skipped > 0 ? `, ${d.skipped} skipped` : ''}${
        d.failed > 0 ? `, ${d.failed} failed` : ''
      }`,
    /** Batch remove with skips / failures: same wording, skipped = did not have it anyway */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `Tags removed: ${d.updated} updated${d.skipped > 0 ? `, ${d.skipped} skipped` : ''}${
        d.failed > 0 ? `, ${d.failed} failed` : ''
      }`,
    /** Rename/merge with failures: `Renamed #reading (incl. subtags) to #books (3 entries)` */
    renamed: (d: { from: string; to: string; updated: number; failed: number }): string =>
      `Renamed #${d.from} (incl. subtags) to #${d.to} (${d.updated} entries)${
        d.failed > 0 ? `, ${d.failed} failed` : ''
      }`,
    /** Delete tag with failures (only the exact tag, same scope as deleteMessage) */
    deleted: (d: { tag: string; updated: number; failed: number }): string =>
      `Removed #${d.tag} from ${d.updated} entries${d.failed > 0 ? `, ${d.failed} failed` : ''}`,
  },
}
