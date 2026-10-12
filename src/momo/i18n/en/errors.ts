/**
 * Error copy surfaced to the user (`throw new Error(...)` → Notice upstream).
 * Developer logs (`console.error('[Momo] …')`) stay where they are: logs must
 * be stable and greppable, not localized.
 */
export const errors = {
  /** The file vanished mid-edit (deleted / renamed externally) */
  fileGone: (path: string): string => `File not found (it may have been deleted or renamed): ${path}`,
  /** Tag validation (needs at least one non-digit character) */
  invalidTag: (tag: string): string => `“${tag}” cannot be used as a tag (needs at least one non-digit character)`,
  /** Batch soft-delete partially failed (reports how many already succeeded) */
  deletePartial: (d: { done: number; reason: string }): string =>
    `Deleted ${d.done} entries; entry ${d.done + 1} failed: ${d.reason}`,
  /** Batch restore partially failed */
  restorePartial: (d: { done: number; reason: string }): string =>
    `Restored ${d.done} entries; entry ${d.done + 1} failed: ${d.reason}`,
  /** Emptying the trash partially failed */
  purgePartial: (d: { done: number; reason: string }): string =>
    `Cleared ${d.done} entries, then hit an error: ${d.reason}`,
  /** Generic write failure */
  writeFailed: (detail: string): string => `Write failed: ${detail}`,
  /**
   * A batch trash registration failed to persist (B08: the data.json write failed,
   * so these entries' original paths may be lost on reload). Shown at most once
   * per session so it never turns into repeated noise.
   */
  trashRegisterSaveFailed: (detail: string): string =>
    `Could not save the trash registration: ${detail}. The original paths of these entries may be lost after reload.`,
  /** Preferences write failure (a failed data.json write must not silently drop prefs) */
  prefsSaveFailed: (detail: string): string => `Failed to save preferences: ${detail}`,
  /** Single restore failure (batch failures use restorePartial) */
  restoreFailed: (detail: string): string => `Restore failed: ${detail}`,
  /** Single permanent-delete failure (batch failures use purgePartial) */
  purgeFailed: (detail: string): string => `Delete failed: ${detail}`,
  /**
   * List read failure: the user is looking at stale data and only the console knows.
   * Persistent banner (reads are a lasting state, writes are one-shot results).
   * The second sentence must stay — without it the stale list reads as current.
   */
  refreshFailed: (detail: string): string =>
    `Failed to refresh. ${detail}. Showing the notes loaded last time.`,
  /**
   * Plugin init failure (BUG-130a): a failed disk read/write used to reject
   * init → the plugin failed to load with no visible message. Now we load in a
   * degraded state and show this so the user knows the panel opened but data
   * may be incomplete.
   */
  initFailed: (detail: string): string =>
    `Initialization failed: ${detail}. The plugin loaded in a degraded state; some data may be incomplete.`,
  /**
   * Notes migration failure (settings changed root / cards path and "Move
   * them" was chosen; service.migrateNotes). Everything already moved is put
   * back and the folder settings stay untouched — the sentence must say so:
   * the worst outcome of a half-finished migration is files in the new folder
   * while the settings still point at the old one.
   */
  notesMigrateFailed: (detail: string): string =>
    `Could not move your notes: ${detail}. Everything already moved was put back and the folder settings were not changed.`,
}
