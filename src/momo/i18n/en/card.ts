/** Copy shared by Momo cards and the random review card */
export const card = {
  /** Read-only browsing mode: the top-right "open in Obsidian (edit)" on cards */
  openInEditor: 'Open in Obsidian (edit)',
  copyBody: 'Copy body text',
  /** BUG-205: transient hint while in the success state (1400ms check icon), same rename mechanism as the failure state */
  copied: 'Copied',
  /** B12: button hint when the clipboard is unavailable (insecure context / permission denied) */
  copyFailed: 'Copy failed: the browser does not allow clipboard access',
  addTag: 'Add a tag to this entry',
  /** The 4th mappin button in the card action row (F3): opens the per-card location editor */
  setLocation: 'Set locations for this entry',
  /** Backfill trace: hover tip on the small calendar before the card timestamp */
  backfilled: {
    tip: 'Backfilled from a past day: created on that day, modified just now',
  },
  /** Scheduled trace: the mirror of backfill — hover tip on the small clock before the timestamp */
  scheduled: {
    tip: 'Written to a future day: created on that day, modified just now',
  },
}
