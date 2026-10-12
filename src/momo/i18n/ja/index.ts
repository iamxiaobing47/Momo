/**
 * 日本語のコピー辞書。
 *
 * ディレクトリの形状 = 意味領域（`zh/` と同じ）。ここに `as const` を付けない：
 * 辞書の文字列は置換可能な `string` でなければならない。型の守りは
 * i18n/index.ts の `Record<Locale, Dict>` が担う。
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

export const ja = {
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
