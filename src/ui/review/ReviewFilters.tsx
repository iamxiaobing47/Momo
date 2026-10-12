import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { tagNodeMapOf } from '../../momo/tags'
import { collectActiveFilters } from '../shell/activeFilters'

// 回顾档顶部的**筛选回显**（只读；BUG-123b 的可见面）。
//
// 为什么需要这一行：回顾批次是**进档那一刻** `matched()` 的快照（`store/review.ts` 的
// `newReviewBatch`），而回顾档的侧栏筛选区块整块被锁住（inert + 压暗，改筛选在这儿
// 无效）、顶栏又没有搜索框——「这批是按什么筛出来的」在回顾页上一句 visible 的话都
// 没有，用户只能盲猜。这里把它原样摆出来，且**只摆不改**。
//
// **挂位 = 列表档筛选条那一个**（AppLayout 里 `FilterBar` 旁边，顶栏分隔线之下、
// 内容区之上，左对齐一排）：筛选条件在哪个模式都长在同一个地方，用户不必重新找；
// 也因此它不进 `.momo-review` 那棵居中列——回顾卡片该在哪儿还在哪儿，布局零改动，
// 且滚动画面的同时这一行始终钉在顶上（不跟着滚走）。
//
// 与筛选条（FilterBar）的两点分工：
// 1. **哪些维度出胶囊、文案怎么拼、什么顺序**：原样复用 `collectActiveFilters`——同一
//    真源，不另抄一份标签口径（那正是 BUG-101 / BUG-126 一再复发的地方）。五个 remove
//    传 noop：回显行里没有 ✕ 也没有「清除」按钮，它们一次都不会被调。
// 2. **搜索**：筛选条刻意不出搜索胶囊（列表档顶栏的搜索框就近看得见），回顾档**没有**
//    搜索框，所以这里补一枚。搜过的词会把池子筛窄，不留痕迹就是「筛了却看不见」。
//
// 只读的落法：胶囊渲染成 `<span>` 而不是 `<button>`——没有点击热区、没有 onClick、
// 不进 Tab 序。没有生效中的筛选时返回 null（DOM 上什么也不加）。

const noop = (): void => {}

export function ReviewFilters(): React.JSX.Element | null {
  // 订阅面与 FilterBar 一致（九个筛选字段 + 搜索 + 界面语言 + 标签显示名映射）：
  // `search` 在这里要订——回显行是回顾档唯一交代它的地方；`lang` 也要订——地点胶囊
  // 的文案按当前语言拼路径（同 FilterBar 那条 memo 依赖）。
  const { filterDates, filterTags, filterLocations, untaggedOnly, filterHours, filterWeekdays, filterLength, filterTagCount, filterReviewed, search, tagByKey, lang } =
    useUi(
      useShallow((s) => ({
        filterDates: s.filterDates,
        filterTags: s.filterTags,
        filterLocations: s.filterLocations,
        untaggedOnly: s.untaggedOnly,
        filterHours: s.filterHours,
        filterWeekdays: s.filterWeekdays,
        filterLength: s.filterLength,
        filterTagCount: s.filterTagCount,
        filterReviewed: s.filterReviewed,
        search: s.search,
        lang: s.lang,
        // 身份键 → 节点（标签显示名取该键下首次出现的原样写法，ADR-004）；
        // tagNodeMapOf 走 derived 的单槽缓存，entries 引用不变时返回同一个 Map。
        tagByKey: tagNodeMapOf(s.entries),
      })),
    )

  const chips = useMemo(() => {
    // 只要 id + label：remove 那一半在只读行上没有消费者
    const out = collectActiveFilters({
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
      toggleFilterDate: noop,
      toggleTag: noop,
      toggleLocation: noop,
      setUntaggedOnly: noop,
      clearDrill: noop,
    }).map((f) => ({ id: f.id, label: f.label }))
    // 搜索词排在最后（它是「最临时的那个条件」，且回显行是它唯一的可见处）
    const q = search.trim()
    if (q !== '') out.push({ id: 'search', label: copy.review.filters.search(q) })
    return out
  }, [
    filterDates,
    filterTags,
    filterLocations,
    untaggedOnly,
    filterHours,
    filterWeekdays,
    filterLength,
    filterTagCount,
    filterReviewed,
    search,
    tagByKey,
    lang,
  ])

  if (chips.length === 0) return null
  // `momo-filterbar` = 与列表档筛选条同一个挂位与几何（内距 / 44px 最小高 / 换行，
  // 窄档那一档的内距也一起跟着走，不另起一套），`momo-review-filters` 只补「只读」
  // 那一半的差别（中性配色 + cursor 归位）。
  return (
    <div className="momo-filterbar momo-review-filters">
      <span className="momo-review-filters-label">{copy.review.filters.label}</span>
      {chips.map((c) => (
        <span key={c.id} className="momo-filter-chip">
          <span className="momo-filter-text">{c.label}</span>
        </span>
      ))}
    </div>
  )
}
