/**
 * Confirmation modal copy (views/caps `openConfirmModal` and its callers).
 * Strings that carry the brand word take `brand` — never hard-code "Momo".
 */
export const dialog = {
  /** Left side of the footer on destructive confirmations */
  irreversible: 'This cannot be undone',
  /** Backfill modal (views/caps `pickBackfillDay`): hint / primary action.
   *  No title since 2026-10-10 (BUG-160: no dialog carries a top-left title) —
   *  "Backfill to a past day" and the primary button "Backfill" are one sentence. */
  backfill: {
    // Shape matches zh's `(brand) => string`; en copy names no brand here
    hint: (): string => 'An empty entry is created under that day and opened in the editor.',
    confirm: 'Backfill',
  },
  /** Future-write modal (views/caps `pickFutureDay`): the mirror of backfill, only the clamp is flipped */
  future: {
    hint: (): string => 'An empty entry is created under that day and opened in the editor.',
    confirm: 'Write',
  },
  /**
   * Migration prompt shown before a notes-path change takes effect (settings ->
   * storage paths; implementation in views/settings/notesMigration.ts). Every
   * change of root / notes folder asks first whenever notes would be left
   * behind — the old behaviour saved the path silently and the entries simply
   * vanished from the panel.
   *
   * Three answers, all worded for "a new path has just been typed":
   * - `migrate` (primary): move the files and their trash records, then save;
   * - `keep`: save the path only and leave the files where they are;
   * - Esc / backdrop / `cancel`: nothing happens, the input reverts.
   *
   * No title since 2026-10-10 (BUG-160): the question is carried by the hint and
   * the three buttons themselves.
   */
  notesMigrate: {
    hint: (d: { from: string; to: string; count: number }): string =>
      `The cards path is changing from “${d.from}” to “${d.to}”, and ${d.count} notes still live in the old place. Moving them relocates the files and their trash records together; leaving them keeps the files put and those notes disappear from the panel until you move them yourself.`,
    migrate: 'Move them',
    keep: 'Change path only',
  },
  /**
   * Confirmation before a file-path change is saved (settings -> File
   * paths; implementation: `askDirChange` in views/settings/notesMigration.ts).
   * This page decides where Momo's files live, so every change asks first:
   * confirming continues (and the migration prompt may follow), cancelling
   * reverts the input and the preview tree together.
   *
   * `row` draws one "name: old -> new" line; when no row actually changed
   * (value typed back to the original, or "reset" while already at defaults)
   * the modal is not shown at all.
   *
   * No title since 2026-10-10 (BUG-160): the question is carried by the hint,
   * the changed rows and the "Apply changes" button.
   */
  dirChange: {
    hint: 'They take effect as soon as you confirm. Existing files are not moved for you; if a cards-path change would leave notes behind, the next step asks whether to move them.',
    confirm: 'Apply changes',
    row: (name: string, from: string, to: string): string => `${name}: ${from} → ${to}`,
  },
}
