/**
 * 中文文案字典（**唯一**存放界面人话的地方）。
 *
 * 目录形状 = 语义域，不是文件名：`panel` = 主面板、`stats` = 统计页、`settings` = 设置页……
 * 新增文案时先想「这句话属于哪个域」，别再往组件里内联。
 *
 * 这里不加 `as const`：字典的字符串必须是**可替换的 `string`**，
 * 否则加英文时 `en: Dict` 会被要求逐字相等。类型守卫靠 index.ts 的 `Record<Locale, Dict>`。
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

export const zh = {
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

/** 完整字典的形状：任何一门语言都必须满足它（缺键 = 编译不过） */
export type Dict = typeof zh
