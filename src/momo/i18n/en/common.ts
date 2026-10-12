/** Cross-module shared words and units (used in several places, wording must stay consistent) */
export const common = {
  cancel: 'Cancel',
  confirm: 'OK',
  delete: 'Delete',
  close: 'Close',
  clear: 'Clear',
  /** Button on the read-failure banner (read failure is a persistent state → "Retry") */
  retry: 'Retry',
  /** "All-library scope" pill on stat cards unaffected by the time range */
  allLibrary: 'All-time',
  /** Marker on "most productive day" when that day was an import, not productivity */
  importDay: 'Import day',

  /** Count units: the word after a number */
  unit: {
    note: 'notes',
    day: 'days',
    item: 'items',
    char: 'chars',
    hour: 'h',
  },
}
