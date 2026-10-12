import { dayKey } from '../../momo/dates'

/**
 * Momo 的「日期键」= `createdAt` 折算到**本地日历日**（与文件名一致）。
 * 旧实现取 ISO 前 10 位（UTC 日期），UTC+8 凌晨会与文件名差一天（工单 WO-1）。
 * 这里保留 `dayOf` 这个名字，Heatmap / App / Card 等既有引用不用改。
 */
export const dayOf = dayKey

// N11 缓存已下沉到 momo/dates 的 dayKeyCached（Q3）：groupByDate（momo 层）与
// ui 侧共用同一份按条目身份的 WeakMap——两份缓存只会白占内存。名字保持
// dayOfCached，既有引用（Review / matched / 两张热力图）不用改。
export { dayKeyCached as dayOfCached } from '../../momo/dates'
