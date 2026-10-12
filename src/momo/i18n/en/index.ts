/**
 * English copy dictionary.
 *
 * Directory shape = semantic domains (same as `zh/`). No `as const` here:
 * dictionary strings must stay replaceable `string`s — the type guard is
 * `Record<Locale, Dict>` in i18n/index.ts.
 */
import { commands } from './commands'
import { card } from './card'
import { common } from './common'
import { date } from './date'
import { dialog } from './dialog'
import { errors } from './errors'
import { heatmap } from './heatmap'
import { location } from './location'
import { meta } from './meta'
import { panel } from './panel'
import { review } from './review'
import { settingsPage } from './settingsPage'
import { statsPage } from './statsPage'
import { tags } from './tags'
import { trash } from './trash'

export const en = {
  card,
  commands,
  common,
  date,
  dialog,
  errors,
  heatmap,
  location,
  meta,
  panel,
  review,
  settingsPage,
  statsPage,
  tags,
  trash,
}
