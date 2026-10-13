import { Fragment, useMemo, type JSX } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import { useTodayKey } from '../hooks/useTodayKey'
import { computeReviewCoverage, computeStats, statsDrillDays } from '../../momo/stats'
import { copy } from '../../momo/i18n'
import { STATS_GROUPS, type StatsGroupKey } from '../../momo/types'
import { parseDay } from '../../momo/dates'
import { monthAxis, monthShort, trendBarDays } from './format'
import { GroupHead } from './cells'
import { EmptyState } from '../kit'
import { RangeEditor } from './RangeEditor'
import { OverviewStrip } from './cards'
import { selectVisibleCards, type StatsCardContext, type StatsCardManifest } from '../registry/statsCards'
import type { StatsDrill, TrendBarPoint } from './types'

// 统计页（v0.4.17 建页，v0.4.18 按设计稿重排视觉层级，v0.6.2 按语义域重组为四组，
// v0.6.3 裁掉低意义维度：标签共现 / 标签健康检查 / 历史快照，「记录之最」只留最长笔记；
// v0.6.4 用户裁决「去掉同比」：移除全部「后半程 vs 前半程」的百分比变化角标；
// v0.6.5 用户裁决「记录间隔，去掉」：移除整张记录间隔卡与间隔分布，只留「多久没写了」；
// v0.6.7 用户裁决「这些提示语文全部都去掉」：卡片口径小字与组副标题整类删除；
// v0.6.8 用户裁决「标签排行，去掉」：标签排行卡移除，标签体系组只剩生命周期 + 标签数分布；
// v0.6.9 用户裁决「字数深度，去掉」：月度平均 / 中位字数双线折线卡移除；
// v0.7.1 用户裁决「生成年度回忆卡片，功能先去掉」：操作栏那颗按钮与 store 的
// copyMemoryCard 一起移除，年度回忆的重做方案进 roadmap 的开发计划）。
// v0.7.3 数据体检四项 P0 建议落地（2026-09-21 优化分析报告，对 420 条真实 Momo 审计）：
// 单日集中度（习惯网格，与「最高产的一天」配对）/ 记录天数占比（概览条，对冲 streak
// 惩罚性）/ 回顾节奏（近 7·30 天回顾 + 最久未回顾，回顾卡扩容、更名「回顾」）。
// v0.7.4 五项修改建议落地（同报告 6.2）：M1 趋势粒度自适应（跨度 < 60 天出周柱，
// 活跃度日历单年份时收起翻页箭头）/ M2 全库卡加「全库」pill（趋势 / 生命周期 /
// 里程碑 / 回顾 / 附件）/ M3 最长笔记可点在 Obsidian 打开 / M4 回顾卡扩容（v0.7.3
// 已随 A2/A3 落地）。
// v0.7.5 清理四项落地（同报告 6.3）：C1 死字段有着落——maxLength 挂总笔记卡副行、
// firstDay 挂里程碑卡脚注（longCount / range 接口不再暴露）；C2 习惯网格删
// 「本周新增」「最近 30 天」两个一屏两现的格子（8 格 → 6 格）；C3 最高产的一天
// 在单日集中度 > 50% 时带「导入日」pill；C4 导出报告补行为维度（回顾节奏 /
// 标签生命周期 / 记录天数占比，当时的 `buildStatsReport` 在 ui/store/report.ts）。
// 本轮用户裁决「移除统计里的导出报告 / 导出笔记 / 复制统计报告」，随后把导出整块清掉：
// 顶栏两颗按钮、操作栏那颗剪贴板按钮，以及操作栏的「导出统计」一起删除；
// `buildStatsReport` / `copyStatsReport` / `statsCopied` / `copy.output.report`
// 整条链移除（`ui/store/report.ts`、`output.ts` 整份删除，C4 那批报告维度只服务这份
// 报告，随之退场）；设置里的「导出格式」「导出目录」两行配置与 caps / service 的
// 导出代码一并不留——插件不再有任何导出入口与导出配置。
// 本轮用户裁决「统计页面里去掉年度目标，配置里也去掉年度目标相关的配置」：年度目标
// 整卡移除（`YearlyGoalCard` / `computeYearlyGoalProgress` / `prefs.yearlyGoal`
// `prefs.yearlyGoalType` / 两组字典条目 / 设置里「年度目标」那行数字输入 + 类型
// 下拉），旧 data.json 的残留键由 serviceDisk 的 strayPrefsCleaned 读盘时删掉。
// v0.9.5（用户反馈「记录趋势这些条状为什么不能点击」）：趋势柱接下钻——v0.7.0
// 「全面可下钻」漏了这张卡（HourBars / WeekdayBars 都接线了，TrendBars 的 `title`
// 算了三版却没有任何消费者）。现在每根柱带着「这一周 / 这一个月」的日期组
// （`trendBarDays`，与柱上数字同源）跳回全部笔记，口径归入 concept 的下钻表。
//
// 版面（四层信息架构；v0.9.x 起第 ④ 层操作栏整层移除，只剩三层）：
//   ① 核心指标行（总笔记带累计走势曲线 / 标签 / 记录天数带活跃环）——规模层，hero；
//   ② 记录概览条（本周节奏 / 连续记录 / 记录天数占比 / 高产时段 / 周末）——状态解读层；
//   ③ 五个语义分组（STATS_GROUPS 驱动顺序，组标题即章节）：
//      我的产出（质量）· 记录节奏（日历 / 趋势 / 习惯）·
//      标签体系（生命周期 / 标签数分布）· 地点（足迹规模 / 排行 / 分布 / 生命，
//      v0.9.33）· 内容与回顾（最长笔记 / 字数分布 / 回顾 / 附件）。
//   分组只影响「在哪里出现」：StatsSections 的存取结构不变，每张卡独立开关不变。
//
// 口径不变（ADR-005 本地确定性统计同口径）：
// - 范围只作用于**数数**的卡片（核心指标 / 内容质量 / 记录时间 / 记录习惯）；
//   月度趋势 / 标签生命周期 / 里程碑是全史概念，永远按全部历史算。
// - 每张卡算哪一段由顶栏的分段控件统一给出（v0.6.7 起卡头不再重复写口径小字）。
// - 图表全部零依赖：曲线是内联 SVG、柱状是纯 div——延续「不引图表库」的口径。
//
// 与设计稿的唯一数据层差异：设计稿的「记录时间」画了 24 小时分布，原实现只有 4 档时段；
// v0.4.18 起 `computeStats.hourlyCounts` 输出 24 档（4 档是它的合并，两处口径同源）。
//
// 组件划分（卡片在 cards/，按 STATS_GROUPS 的语义域分文件）：
//   规模层 → KpiRow · 状态层 → OverviewStrip
//   我的产出 → OutputCards · 记录节奏 → RhythmCards · 标签体系 → TagCards · 内容与回顾 → ContentCards
//   页面家具 → RangeEditor

export function StatsPage() {
  const entries = useUi((s) => s.entries)
  const statsRange = useUi((s) => s.statsRange)
  const statsCustomFrom = useUi((s) => s.statsCustomFrom)
  const statsCustomTo = useUi((s) => s.statsCustomTo)
  const statsRangeEditing = useUi((s) => s.statsRangeEditing)
  const sections = useUi((s) => s.statsSections)
  const attachmentStats = useUi((s) => s.attachmentStats)
  const brandName = useUi((s) => s.brandName)
  const reviewSeen = useUi((s) => s.reviewSeen)
  // v0.7.0 下钻动作：点统计数字带着筛选跳回全部笔记
  // v0.9.33：地点维度也走这条（2026-10-01 晚起——filterByLocation 回列表 + 地点筛选）
  const drill: StatsDrill = useUi(
    useShallow((s) => ({
      filterByTag: s.filterByTag,
      filterUntagged: s.filterUntagged,
      filterByDates: s.filterByDates,
      filterByHours: s.filterByHours,
      filterByWeekdays: s.filterByWeekdays,
      filterByLength: s.filterByLength,
      filterByTagCount: s.filterByTagCount,
      filterByReviewed: s.filterByReviewed,
      filterByLocation: s.filterByLocation,
    })),
  )
  // v0.7.4 最长笔记的「打开这一条」（M3）：与 Review.tsx 同一取法，caps 由 views 层注入
  // 2026-10-01：最长笔记改用主页面上那张真卡片（见 ContentCards 的 RecordsCard），
  // 「打开」由卡片自己的正文点击负责——它自己订 caps，这里不再往下递。
  // v0.9.33：用户手填的地点归属（prefs.locRegions，压过内置字典）递进 computeStats
  // ——统计页的「国家 / 大洲」与侧栏地点树、分组流必须同一把尺子
  const locRegions = useUi((s) => s.locRegions)
  // D-12：「今天」必须是**会翻页**的依赖。旧写法把 `new Date()` 写进 memo 内部、
  // 依赖里没有今天这一项——面板开着跨过周一零点 / 月末 / 年初，「本周节奏」格下钻
  // 打到的还是上一周的日期集，统计口径也停在旧的今天。useTodayKey 到次日零点
  // 自动翻页（见 src/ui/hooks/useTodayKey.ts）。
  const today = useTodayKey()
  const stats = useMemo(
    () =>
      computeStats(entries, parseDay(today), statsRange, { from: statsCustomFrom, to: statsCustomTo }, locRegions),
    [entries, statsRange, statsCustomFrom, statsCustomTo, today, locRegions],
  )
  // BUG-111c：「最久未回顾」是全页唯一**依赖当前日期**却没吃 useTodayKey 的派生值——
  // 上面那条 memo 的教训（D-12）它没吃到：`computeReviewCoverage` 的 now 省略了、
  // 依赖里也没有 today，面板常开跨过午夜时，这格的天数原地不动（挂载多久钉多久）。
  // 注入 parseDay(today)，与 computeStats 同一把尺子；today 进依赖，翻页即重算。
  const reviewCoverage = useMemo(
    () => computeReviewCoverage(entries, reviewSeen, parseDay(today)),
    [entries, reviewSeen, today],
  )

  // 下钻用的两组日期键（本月 / 本周）：与统计页「本月新增」格、概览条「本周节奏」
  // 同一套窗口口径——点下去看到的条数必须和格子上的数字对得上，否则下钻就没了意义。
  // 口径（含 ytd 跨年首周的 1/1 钳制、custom 历史区间的作废）集中在 statsDrillDays，
  // 纯逻辑与测试同源（BUG-55）。（「最近 30 天」的日期组随 v0.7.5 C2 一起退役：
  // 那一格删了，总笔记卡的 +N 30天 胶囊是纯展示、不下钻。）
  const { weekDays, monthDays } = useMemo(
    () => statsDrillDays(parseDay(today), statsRange, { from: statsCustomFrom, to: statsCustomTo }),
    [today, statsRange, statsCustomFrom, statsCustomTo],
  )

  // N13：趋势点展示化 + 峰值派生只依赖 stats，提到 early return 之前的 useMemo 里。
  // 放在下面的 return 之后就成了「条件调用 hook」（entries 为 0 的那条分支不执行），
  // React 会在 hook 顺序上跟你算账——所以 memo 挂在 return 前，early return 只省渲染不省 hook。
  const { trendPoints, trendPeak, trendLast, peakHourCount, peakIndex, hasHours } = useMemo(() => {
    // 趋势点展示化（v0.7.4 粒度自适应）：月粒度「9 月」、周粒度「9/14 周」，
    // 柱组件只认 label / drillLabel / days / count，粒度语义在这一层翻译完。
    // v0.9.5：补 drillLabel（aria-label，带下钻前缀）与 days（该柱覆盖的日期键）——
    // 趋势柱至此可下钻：点一根柱 = 带着「这一周 / 这一个月」的日期组跳回全部笔记，
    // 看到底是哪些 Momo 算出了这根柱（与小时柱 / 星期柱 / 活跃度日历同一套口径）。
    const trendPoints: TrendBarPoint[] = stats.trend.map((p) =>
      stats.trendGranularity === 'week'
        ? {
            key: p.key,
            count: p.count,
            label: copy.date.weekPoint(Number(p.key.slice(5, 7)), Number(p.key.slice(8, 10))),
            drillLabel: copy.statsPage.drill.week({ from: p.key, count: p.count }),
            days: trendBarDays(p.key, 'week', today),
          }
        : {
            key: p.key,
            count: p.count,
            label: monthShort(p.key),
            drillLabel: copy.statsPage.drill.month({ axis: monthAxis(p.key), count: p.count }),
            days: trendBarDays(p.key, 'month', today),
          },
    )
    // 峰值为「Count 最大的那个点」：reduce 一次性扫完，不再指数组的长度/下标；
    // 并列取最前者（旧 indexOf 语义）——严格 > 才换，第一处并列就停。
    const trendPeak =
      trendPoints.length > 0 ? trendPoints.reduce((a, b) => (b.count > a.count ? b : a)) : undefined
    // 峰值小时：用计数而不是 indexOf(spread max)。
    // ① spread 展开 hourlyCounts（24 个数）在旧代码里每渲染一次；
    // ② hourlyCounts[peakIndex] ?? 0 依赖 indexOf 的下标字节顺序，计数版直接给出同值；
    // ③ 用计数版后就不必先求 max 再回头查下标。
    let peakHourCount = 0
    for (const n of stats.hourlyCounts) if (n > peakHourCount) peakHourCount = n
    const peakIndex = stats.hourlyCounts.indexOf(peakHourCount)
    const hasHours = peakHourCount > 0
    const trendLast = trendPoints[trendPoints.length - 1]
    return { trendPoints, trendPeak, trendLast, peakHourCount, peakIndex, hasHours }
    // today 进依赖：BUG-181a 起当期柱的日期组会钳到今天（跨零点要跟着重算）
  }, [stats, today])

  // ---- 卡片层（P4 注册表驱动）：开关键 → manifest → 组件，五处散定义收敛到
  //      registry/statsCards.ts 一张表。组归属仍是 STATS_GROUPS 的唯一真源
  //      （设置页的区块开关共用那一份）；组内顺序 = 注册表数组顺序。 ----
  // N13 纪律：这两个 memo 必须挂在**所有 early return 之前**——entries 从 0 变 N
  // （空库里写下第一条 / 删空库）时若挂在 return 之后，hook 数量随渲染变化，
  // React 直接抛「Rendered more hooks than during the previous render」。
  // 两者只依赖 sections / cards，与 entries 无关，上移无条件。
  const cards = useMemo(() => selectVisibleCards(sections), [sections])
  // 组可见性：按**注册后实际渲染的卡**判断，不按 group.keys 数开关——kpi 是 hero
  // （在 output 的 keys 里但不占组内位置），直接数开关会把「只开 kpi」误判成组
  // 非空，渲染出一个只有组标题的空章节。
  const groupVisible = useMemo(() => {
    const out: Partial<Record<StatsGroupKey, boolean>> = {}
    for (const g of STATS_GROUPS) out[g.key] = cards.some((c) => !c.hero && g.keys.some((k) => k === c.id))
    return out
  }, [cards])

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="momo-empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="7" y="26" width="6" height="15" rx="2" fill="currentColor" opacity="0.45" />
            <rect x="17" y="17" width="6" height="24" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="27" y="9" width="6" height="32" rx="2" fill="currentColor" />
            <path d="M6 40.5h36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
          </svg>
        }
        title={copy.statsPage.empty.title}
        sub={copy.statsPage.empty.sub(brandName)}
      />
    )
  }

  // 卡的渲染上下文：StatsPage 算好一切喂给 manifest 的 render，卡片自己不订 store
  const ctx: StatsCardContext = {
    stats,
    reviewCoverage,
    attachmentStats,
    entryCount: entries.length,
    drill,
    trendPoints,
    trendPeak,
    trendLast,
    peakHourCount,
    peakIndex,
    hasHours,
    monthDays,
    brand: brandName,
  }

  return (
    <div className="momo-stats-page">

      {/* 自定义范围编辑条（v0.5.4）：顶栏「自定义」翻开 / 当前就是 custom 时常驻 */}
      {(statsRangeEditing || statsRange === 'custom') && <RangeEditor />}

      {/* 规模层：hero 卡（章节层之外，当前只有核心指标行） */}
      {cards.map((c) =>
        c.hero ? <Fragment key={c.id}>{c.render(ctx)}</Fragment> : null,
      )}

      {/* 状态解读层：记录概览。页面家具而非数据卡——不占 StatsSections 的键
          （四组编译守卫要求每个键都归组，而概览横跨全部四组），理由见 OverviewStrip 注释 */}
      <OverviewStrip stats={stats} onWeek={weekDays.length > 0 ? () => drill.filterByDates(weekDays) : undefined} />

      {/* 章节层：四组语义域，顺序由 STATS_GROUPS 驱动（types.ts 是唯一真源）。
          组内一张卡都不亮时整组收起（含组标题），不留空章节（判定见 groupVisible）。 */}
      {STATS_GROUPS.map((group) => {
        if (!groupVisible[group.key]) return null
        const groupCards = cards.filter((c) => !c.hero && group.keys.some((k) => k === c.id))
        // dist 并排：相邻的 dist 卡包一层 .momo-row-dist（原口径：字数分布 + 回顾覆盖率）
        const body: JSX.Element[] = []
        let distRun: StatsCardManifest[] = []
        const flushDist = () => {
          if (distRun.length === 0) return
          body.push(
            <section className="momo-row momo-row-dist" key={`dist-${distRun[0].id}`}>
              {distRun.map((c) => (
                <Fragment key={c.id}>{c.render(ctx)}</Fragment>
              ))}
            </section>,
          )
          distRun = []
        }
        for (const c of groupCards) {
          if (c.layout === 'dist') distRun.push(c)
          else {
            flushDist()
            body.push(<Fragment key={c.id}>{c.render(ctx)}</Fragment>)
          }
        }
        flushDist()
        return (
          <section className="momo-stats-group" key={group.key}>
            <GroupHead title={copy.meta.statsGroup[group.key]} />
            {body}
          </section>
        )
      })}
    </div>
  )
}
