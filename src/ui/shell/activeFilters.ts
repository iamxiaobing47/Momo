import type { TagNode } from '../../momo/tags'
import { copy } from '../../momo/i18n'
import { locKeyLabel } from '../../momo/locations'
import { hourChipLabel, rangeChipLabel, weekdayChipLabel } from './chipLabels'
import type { ReviewedFilter } from '../store/types'

/** 回顾筛选的胶囊文案（v0.9.37，穷举四档：漏一档编译不过）。
 *  两个时间窗档必须显示自己的名字——它们筛出来的集合与「已回顾」并不相同，
 *  笼统写「已回顾」会让用户以为自己看的是全部回顾过的。
 *
 *  写成函数、调用时现读：`copy` 是 Proxy，只在**读取那一刻**按当前语言解析；
 *  模块级快照读到的永远是求值那一刻的语言（恒为 zh——setLocale 全部晚于模块
 *  求值），en/ja 下四档胶囊会永远中文（BUG-04 同款，BUG-101 在拆文件时复发）。
 *  静态纪律见 scripts/copy-snapshot-guard.test.mts。 */
const reviewedChipLabel = (f: ReviewedFilter): string => {
  const labels = {
    reviewed: copy.panel.chip.reviewed,
    unreviewed: copy.panel.chip.unreviewed,
    recent7: copy.panel.chip.reviewed7,
    recent30: copy.panel.chip.reviewed30,
  } satisfies Record<ReviewedFilter, string>
  return labels[f]
}

// 筛选条「活跃筛选条件」的组装（自 FilterBar.tsx 拆出的纯函数）：
// 九个筛选字段 + 标签显示名 → 一排可移除胶囊的 id / label / remove。
// `search` 刻意不出胶囊（敲字不该在筛选条上刷一条，App 原实现同口径）。
//
// 为什么值得单独一个文件：FilterBar 本身只该管渲染（订阅哪些字段、怎么摆按钮），
// 而「哪些维度该出胶囊、每条怎么拼文案、点 ✕ 调哪个 action」是另一件事——
//  push 的顺序就是胶囊的排列顺序，改它的人只该看这里。

/** 一枚可移除的筛选胶囊（FilterBar 只负责渲染） */
export interface ActiveFilter {
  /** 稳定键（React key + 日后按 id 移除的凭据） */
  id: string
  /** 胶囊文案（已本地化；区间 / 罗列口径见 chipLabels） */
  label: string
  /** 点 ✕（各自调自己的 store action，互不影响其它维度） */
  remove: () => void
}

/** `collectActiveFilters` 的入参：九个筛选字段 + 标签显示名映射 + 五个移除动作 */
export interface CollectActiveFiltersInput {
  /** 热力图选中的日期集（多选，逐日一枚胶囊） */
  filterDates: readonly string[]
  /** 标签筛选的身份键（每键一枚胶囊，显示名走 tagByKey） */
  filterTags: readonly string[]
  /** 地点筛选的层级节点键（每键一枚胶囊，文案 = 路径，见 locKeyLabel） */
  filterLocations: readonly string[]
  /** 只看无标签 */
  untaggedOnly: boolean
  /** 按小时（0–23） */
  filterHours: readonly number[]
  /** 按星期（0=周一…6=周日） */
  filterWeekdays: readonly number[]
  /** 按正文字符数闭区间 */
  filterLength: { min: number; max: number } | null
  /** 按标签个数闭区间 */
  filterTagCount: { min: number; max: number } | null
  /** 按回顾记录 */
  filterReviewed: ReviewedFilter | null
  /** 身份键 → 节点（标签显示名取该键下首次出现的原样写法） */
  tagByKey: ReadonlyMap<string, TagNode>
  toggleFilterDate: (day: string) => void
  toggleTag: (key: string) => void
  toggleLocation: (key: string) => void
  setUntaggedOnly: (value: boolean) => void
  clearDrill: (dim: 'hours' | 'weekdays' | 'length' | 'tagCount' | 'reviewed') => void
}

/**
 * 活跃筛选条件（渲染成可移除的胶囊；v0.5.2 起不带色点 —— 点不携带任何信息
 * （全部同色），只是选中态上的一块视觉噪音）。v0.7.0 起统计页下钻的新维度
 * （小时 / 星期 / 字数 / 标签个数 / 回顾）也各出一枚胶囊；2026-10-01 起地点筛选
 * 也从这里出——地点降级成筛选维度之后它必须像标签一样**看得见、点得掉**，
 * 否则就是「筛了地点，界面上一句话都不说」。
 */
export function collectActiveFilters(input: CollectActiveFiltersInput): ActiveFilter[] {
  const {
    filterDates,
    filterTags,
    filterLocations,
    untaggedOnly,
    filterHours,
    filterWeekdays,
    filterLength,
    filterTagCount,
    filterReviewed,
    tagByKey,
    toggleFilterDate,
    toggleTag,
    toggleLocation,
    setUntaggedOnly,
    clearDrill,
  } = input

  const out: ActiveFilter[] = []
  for (const d of filterDates) {
    out.push({ id: `d:${d}`, label: d, remove: () => toggleFilterDate(d) })
  }
  for (const k of filterTags) {
    out.push({
      id: `t:${k}`,
      label: `#${tagByKey.get(k)?.displayPath ?? k}`,
      remove: () => toggleTag(k),
    })
  }
  // 地点胶囊紧跟标签之后（两个「内容维度」并排，与侧栏两棵树的位置同序）。
  // 文案 = 节点键折成的路径（`亚洲 · 中国 · 北京`）——与树行 / pill 同一个读法；
  // 节点键本身是给比对用的（分隔符是控制字符），不能直接上屏。
  for (const k of filterLocations) {
    out.push({ id: `l:${k}`, label: locKeyLabel(k), remove: () => toggleLocation(k) })
  }
  if (untaggedOnly) out.push({ id: 'untagged', label: copy.panel.chip.untagged, remove: () => setUntaggedOnly(false) })
  if (filterHours.length > 0) {
    out.push({
      id: 'hours',
      label: copy.panel.chip.hours(hourChipLabel(filterHours)),
      remove: () => clearDrill('hours'),
    })
  }
  if (filterWeekdays.length > 0) {
    out.push({ id: 'weekdays', label: weekdayChipLabel(filterWeekdays), remove: () => clearDrill('weekdays') })
  }
  if (filterLength) {
    out.push({
      id: 'length',
      label: rangeChipLabel(filterLength, copy.common.unit.char),
      remove: () => clearDrill('length'),
    })
  }
  if (filterTagCount) {
    out.push({
      id: 'tagCount',
      label: copy.panel.chip.tagCount(rangeChipLabel(filterTagCount, copy.common.unit.item)),
      remove: () => clearDrill('tagCount'),
    })
  }
  if (filterReviewed) {
    out.push({
      id: 'reviewed',
      // v0.9.37 起四档各有各的文案：原先的二元三目会把两个时间窗档都显示成
      // 「未回顾」——用户点了「近 7 天回顾」，胶囊却写着「未回顾」，等于没交代
      // 清楚自己正在看什么。reviewedChipLabel 里的 Record 穷举保住漏一档编译不过。
      label: reviewedChipLabel(filterReviewed),
      remove: () => clearDrill('reviewed'),
    })
  }
  return out
}
