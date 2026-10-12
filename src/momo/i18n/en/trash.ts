/** Trash (Trash.tsx) */
export const trash = {
  /** No title since 2026-10-10 (BUG-160: no dialog carries a top-left title) —
   *  "Delete permanently" and the primary button are one sentence; the question
   *  is carried by the message */
  purgeOne: {
    message: (name: string): string => `Permanently delete “${name}”? This cannot be undone.`,
    confirm: 'Delete permanently',
  },
  /** Empty state (brand word goes through the param).
   *  BUG-126b: the old copy promised a 30-day auto-cleanup that doesn't exist
   *  (purge only runs on user click); deleted entries stay in the vault until then. */
  emptyTitle: 'The trash is empty',
  emptySub: (brand: string): string => `Deleted ${brand} entries stay here until you delete them for good in the trash`,
  /** Retention note at the top of the list */
  retention: 'Deleted notes stay here until you delete them for good in the trash.',
  /** Card body placeholder: reading this entry failed, shown so it can’t be mistaken for an empty note (BUG-95) */
  readFailed: 'Couldn’t read the content — will retry automatically',
  restore: 'Restore',
  purge: 'Delete permanently',
  /** Topbar: restore everything */
  restoreAll: 'Restore all',
  /** Topbar: restore everything (double confirmation, BUG-83) — one click pours every
   *  entry back into the vault, so it confirms with the count like “Empty” does.
   *  No title since 2026-10-10 (BUG-160): "Restore all" and the primary button are one sentence */
  restoreAllConfirm: {
    message: (d: { count: number; brand: string }): string =>
      `Restore all ${d.count} ${d.brand} entries in the trash back to their original locations?`,
    confirm: 'Restore all',
  },
  /** Topbar: empty the trash (double confirmation). Irreversibility is carried by the
   * danger button and the “cannot be undone” footer of the confirm dialog.
   * No title since 2026-10-10 (BUG-160): "Empty trash" is already the topbar button's word */
  purgeAll: {
    message: (d: { count: number; brand: string }): string =>
      `Permanently delete the ${d.count} ${d.brand} entries in the trash?`,
    confirm: 'Empty',
    button: 'Empty trash',
  },
}
