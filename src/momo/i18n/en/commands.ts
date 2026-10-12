/**
 * Command palette / Ribbon / editor context-menu copy.
 *
 * The brand word (default "Momo") must never be hard-coded: `prefs.brandName`
 * is user-editable (settings, Appearance), so every string takes `brand`.
 */
export const commands = {
  /** Editor context menu: save a selected Markdown range as an entry */
  saveSelection: (brand: string): string => `Save to ${brand}`,
  /** Ribbon icon tooltip */
  ribbon: (brand: string): string => brand,
  openPanel: (brand: string): string => `Open ${brand}`,
  newEntry: (brand: string): string => `New ${brand}`,
  /** Backfill: pick a day in the command palette and add an entry to a past day */
  backfill: 'Backfill to a past day…',
  /** Schedule ahead: pick a day in the command palette and add an entry to a future day (the mirror of backfill) */
  future: 'Write to a future day…',
  /** Tab context menu (shorter — no "panel" prefix) */
  moveToLeft: 'Move to left sidebar',
  moveToRight: 'Move to right sidebar',
}
