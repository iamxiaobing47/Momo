import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { tagNodeMapOf } from '../../momo/tags'
import { Icon } from '../shared/icons'
import { TextButton } from '../kit'
import { isRepeatClick, REPEAT_WATCH_MS } from '../shared/activationGate'
import { collectActiveFilters } from './activeFilters'

// 筛选条（v0.5 起筛选胶囊从顶栏移下来，顶栏留给搜索 / 视图 / 排序 / 多选）。
// 自管订阅：胶囊的生成要看八个筛选字段 + 标签显示名，全在 store 里——这里自己订，
// App 只负责「只在列表模式渲染」这一条。
// 「哪些维度出胶囊、每条怎么拼」的组装逻辑在 activeFilters.ts（collectActiveFilters），
// 本文件只剩订阅 + 渲染。

export function FilterBar() {
  // 与 App 原实现同一份依赖面：九个筛选字段 + 标签显示名映射（`search` 不出胶囊，
  // 刻意不在依赖里——敲字不该重建胶囊列表）。
  const { filterDates, filterTags, filterLocations, untaggedOnly, filterHours, filterWeekdays, filterLength, filterTagCount, filterReviewed, tagByKey, lang } =
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
        // 界面语言（2026-10-06）：地点胶囊的文案 = `locKeyLabel`，它按当前语言拼
        // 路径（三级都过 displayLocName）。memo 住胶囊就得把语言列进依赖，否则
        // 切语言后那颗「亚洲 · 中国」会停在旧语言（locations.ts 的 locGroupOf
        // 文件头点名了这一处）。
        lang: s.lang,
        // 标签树 / 身份键映射由 entries 派生（ADR-004）：显示取该键下首次出现的原样写法。
        // tagNodeMapOf 走 derived 的单槽缓存，entries 引用不变时返回同一个 Map。
        tagByKey: tagNodeMapOf(s.entries),
      })),
    )
  const { toggleFilterDate, toggleTag, toggleLocation, setUntaggedOnly, clearDrill, clearFilters } = useUi(
    useShallow((s) => ({
      toggleFilterDate: s.toggleFilterDate,
      toggleTag: s.toggleTag,
      toggleLocation: s.toggleLocation,
      setUntaggedOnly: s.setUntaggedOnly,
      clearDrill: s.clearDrill,
      clearFilters: s.clearFilters,
    })),
  )
  const caps = useUi((s) => s.caps)

  // BUG-167b：第一下把整条筛选条卸掉之后，双击的第二下会按坐标落到下面的卡片上
  // （readOnly=false 时把一篇无关笔记在 Obsidian 里打开）。BUG-136f 的吞闸挂在
  // **条自己**的 onClickCapture 上——而清掉最后一枚胶囊 / 点「清除」的第一下恰好
  // 是让条消失的那一下，闸随条一起卸载，第二下无人可拦。
  // 所以在第一下（冒泡到按钮、条还在）就往**不会卸载的** `.momo-app` 根上挂一个
  // 短时捕获段闸：500ms 内detail>=2 的连击第二下整个吞在面板里。程序化派发的
  // click（detail=0）与慢双击（detail 各为 1）都不受影响。
  const guardAfterSelfUnmount = (e: React.MouseEvent): void => {
    const root = e.currentTarget.closest<HTMLElement>('.momo-app')
    if (!root) return
    const onCap = (ev: Event): void => {
      if (!isRepeatClick((ev as MouseEvent).detail)) return
      ev.stopPropagation()
      ev.preventDefault()
    }
    root.addEventListener('click', onCap, { capture: true })
    window.setTimeout(() => root.removeEventListener('click', onCap), REPEAT_WATCH_MS)
  }

  const activeFilters = useMemo(
    () =>
      collectActiveFilters({
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
      }),
    [
      filterDates,
      filterTags,
      filterLocations,
      untaggedOnly,
      lang,
      tagByKey,
      filterHours,
      filterWeekdays,
      filterLength,
      filterTagCount,
      filterReviewed,
      toggleFilterDate,
      toggleTag,
      toggleLocation,
      setUntaggedOnly,
      clearDrill,
    ],
  )

  if (activeFilters.length === 0) return null
  // ⑤ 补记入口之二：日期筛选**只剩一天**时，在胶囊后面出一枚「补记到 X」。
  // 时机是故意的——用户刚把列表聚到某一天，正是想把漏掉的那条补回来的时候；
  // 多选了一天就歧义（补到哪天？），那时不出，走命令面板自己选。
  // 与命令面板（main.ts 的 backfill-Momo）共用 caps.backfillNew 同一条落库路。
  const backfillDay = filterDates.length === 1 ? filterDates[0] : undefined
  return (
    <div
      className="momo-filterbar"
      onClickCapture={(e) => {
        // 点掉一枚胶囊后整排**立刻**左移一格，双击的第二下就落到邻座那颗按钮上——
        // 可能是另一枚筛选（想留的被静默删掉），最坏是尾巴上的「清除筛选」（一把清掉
        // 搜索词 + 九个维度）。胶囊卸载是筛选状态变化的必然结果，改不动；能做的是把
        // 「同一个手势的第二下」认出来吞掉：`click.detail >= 2` 就是浏览器数好的那次
        // 连击。必须在**捕获段**拦——落点已经在别的按钮上了，冒泡段已经晚了（BUG-136f）。
        if (!isRepeatClick(e.detail)) return
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      {activeFilters.map((f) => (
        <button
          key={f.id}
          className="momo-filter-chip"
          onClick={(e) => {
            f.remove()
            guardAfterSelfUnmount(e)
          }}
        >
          <span className="momo-filter-text">{f.label}</span>
          <Icon name="close" size={12} strokeWidth={1.8} />
        </button>
      ))}
      {backfillDay !== undefined && (
        <TextButton
          icon={<Icon name="calendar" size={14} />}
          // caps.backfillNew 失败时先 notice 再 rethrow（N08 分工）——这里 catch 只为
          // 不让它沿 void 链漏成 unhandled rejection（BUG-27，全仓同一形状）
          onClick={() => void caps?.backfillNew?.(backfillDay)?.catch(() => {})}
        >
          {copy.panel.backfill.toDay(backfillDay)}
        </TextButton>
      )}
      <TextButton
        onClick={(e) => {
          clearFilters()
          guardAfterSelfUnmount(e)
        }}
      >
        {copy.common.clear}
      </TextButton>
    </div>
  )
}
