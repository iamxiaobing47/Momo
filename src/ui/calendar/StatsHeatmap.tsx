import { memo, useMemo, useRef, useState } from 'react'
import { dayOfCached, useUi } from '../store'
import { buildWeeks } from '../../momo/dates'
import { HeatLegend, useCellSize } from '../kit'
import { CalendarGrid } from './CalendarGrid'
import { CalendarHead } from './CalendarHead'
import { useTodayKey } from '../hooks/useTodayKey'

// 活跃度日历（v0.5.4，concept-momo-stats 新维度）：
// 侧栏热力图（Heatmap.tsx）的「统计页完整版」——按**自然年**铺开，列 = 周、行 = 星期
// （与侧栏同款周日开头），一次看完整年的疏密；年份可翻页，边界 = 库内最早一年 ~ 今年。
// 数据、色阶（l0–l4）、点击交互（toggleFilterDate）与侧栏热力图**同一套口径**，
// 区别只在窗口（自然年 vs 滚动 N 个月）与落点（这里点了直接跳列表，侧栏点在原位筛）。
// 格子尺寸由容器宽度实测（ResizeObserver），53 列在常规面板宽下都放得进、不横向滚动；
// 格子压到 6px 下限仍放不下的极窄面板由 cal-body 的 overflow-x 兜底成卡内滚动。
//
// 版面已拆（口径注释各在新文件里）：CalendarHead = 卡头（标题 + 年份导航），
// CalendarGrid = cal-body 里的星期 / 月份 / 格子。图例在 kit/HeatLegend（P1 收敛）。
// 本文件只留：年份 state、byDay / weeks / labelByCol 三个 memo、cellPx 实测与 pickDay。

function StatsHeatmapImpl(): React.JSX.Element {
  const entries = useUi((s) => s.entries)
  const filterDates = useUi((s) => s.filterDates)
  const filterByDates = useUi((s) => s.filterByDates)

  const today = useTodayKey()
  const thisYear = Number(today.slice(0, 4))
  // BUG-170：年份是**派生值**而不是 state。「用户翻到哪一年」记在 manualYear 里，
  // 没翻过（null）就跟随 thisYear。旧实现是 useState(thisYear)——只在挂载时取一次，
  // 面板常开跨过 12/31 → 1/1 时 thisYear 翻了、year 停在旧值：单年份库的 multiYear
  // 会 false→true 翻络、箭头凭空出现，「下一年」判定（year >= thisYear）也跟着松，
  // 点过去是一张空的 2027；而年份胶囊还写着 2026。D-12 承诺「跨零点后 today 翻转，
  // 未来格与年份边界跟着翻页」——未来格兑现有了，year 这一半在这儿补上。
  const [manualYear, setManualYear] = useState<number | null>(null)
  const year = manualYear ?? thisYear
  const mainRef = useRef<HTMLDivElement>(null)

  // v0.6.7 起卡头只留标题 + 年份导航，yearTotal / yearActiveDays 随口径小字一起退役
  // （年度条数与活跃天数在「记录习惯」「记录天数」卡里有同源数字）
  const { byDay, earliestYear } = useMemo(() => {
    const map = new Map<string, number>()
    let earliest: string | null = null
    for (const e of entries) {
      const d = dayOfCached(e)
      map.set(d, (map.get(d) ?? 0) + 1)
      if (!earliest || d < earliest) earliest = d
    }
    return {
      byDay: map,
      earliestYear: earliest ? Number(earliest.slice(0, 4)) : thisYear,
    }
  }, [entries, thisYear])

  // 自然年周列矩阵：1 月 1 日回溯到所在周的周日（原 buildYear 口径，heatWeeks
  // 的 alignToSunday 分支保留的就是它）；「未来格」判定移到渲染处读 today
  //（D-12：跨零点后 today 翻转，未来格与年份边界跟着翻页）
  const { weeks, monthLabels } = useMemo(
    () => buildWeeks(new Date(year, 0, 1), new Date(year, 11, 31), byDay, { alignToSunday: true }),
    [year, byDay],
  )

  // v0.7.4：数据只有一个年份时没有可翻的页——收起箭头（年份胶囊单独渲染，见 JSX）
  const multiYear = earliestYear < thisYear

  // 格子尺寸实测：6–15px 夹取。ref 挂在 CalendarGrid 的 momo-cal-main 上——量的是
  // 格子区可用宽（星期列、列间隙都在它外面/显式声明），列间 2px gap 在 hook 里按
  // (cols−1) 扣，整行才压得进容器（旧口径只减固定 14px、漏算 53 列的间隙，
  // 日历会被挤出卡片右缘约 100px）
  const cols = Math.max(1, weeks.length)
  const cellPx = useCellSize(mainRef, cols, { min: 6, max: 15, gap: 2, initial: 13 })

  // 格子太窄时月份标签隔月显示（与侧栏热力图同款降密策略）
  const labelStep = cellPx >= 13 ? 1 : 2
  const labelByCol = useMemo(() => {
    // 先按 col 折叠，只留每列**最后一条**（BUG-24）：alignToSunday 且 1 月 1 日非周日
    // 时，walk 从去年 12 月起步，col 0 会连着记「界外 12 月」与「本年 1 月」。全显档
    // 靠 Map 后写覆盖前写拿到正确结果，而按 idx 奇偶的降密档会把界外那条留下、1 月
    // 被跳掉——第一列从此钉死「12月」。折叠先于翻倍过滤，奇偶才作用在真月份上。
    const collapsed: Array<{ label: string; col: number }> = []
    const byCol = new Map<number, number>()
    for (const m of monthLabels) {
      const at = byCol.get(m.col)
      if (at === undefined) {
        byCol.set(m.col, collapsed.length)
        collapsed.push(m)
      } else {
        collapsed[at] = m // 后写胜：同 col 的界外月让给后面的真月
      }
    }
    const map = new Map<number, string>()
    collapsed.forEach((m, idx) => {
      if (labelStep === 1 || idx % 2 === 0) map.set(m.col, m.label)
    })
    return map
  }, [monthLabels, labelStep])

  const pickDay = (day: string) => {
    // BUG-78d：统计页语境走**单维下钻**（filterByDates 会清掉其余维度——与小时 /
    // 星期 / 趋势柱同一套 drillPatch 口径）。旧实现 toggleFilterDate 保留其它筛选：
    // 格子按全库计数，列表却是「已有筛选 ∩ 该日」，数字对不上；且回到统计页
    // 再点同一已选日会取消筛选却照样跳列表，像点了没反应还换了页。
    // 点击 = 把该日设为唯一日期筛选并跳列表（已选日再点 = 仍筛这一天，不再弹回）。
    // 不再跟手 setMode('list')（BUG-200）：drillPatch 已带 mode:'list'，再调一次
    // setMode 的复位语义会把 drillPastOnly 闸静默撤掉（BUG-181a）。
    filterByDates([day])
  }

  return (
    <div className="momo-calendar">
      <CalendarHead year={year} earliestYear={earliestYear} thisYear={thisYear} multiYear={multiYear} onYear={setManualYear} />
      <CalendarGrid
        containerRef={mainRef}
        cellPx={cellPx}
        cols={cols}
        labelByCol={labelByCol}
        weeks={weeks}
        today={today}
        filterDates={filterDates}
        onPickDay={pickDay}
      />
      <HeatLegend />
    </div>
  )
}

// memo（与侧栏 Heatmap 同）：entries 不变时年份翻页 / 筛选高亮只在内部 state 里滚
export const StatsHeatmap = memo(StatsHeatmapImpl)
