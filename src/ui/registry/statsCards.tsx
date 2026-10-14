import type { JSX } from 'react'
import type { AttachmentStats, MomoStats, ReviewCoverage } from '../../momo/stats'
import type { StatsSectionKey, StatsSections } from '../../momo/types'
import type { StatsDrill, TrendBarPoint } from '../stats/types'
import {
  AttachmentsCard,
  HabitsRow,
  HeatmapCard,
  KpiRow,
  LengthDistCard,
  LifecycleCard,
  LocDistCard,
  LocLifecycleCard,
  LocRankCard,
  LocScaleCard,
  QualityCard,
  RecordsCard,
  ReviewCoverageCard,
  TagDistCard,
  TrendRow,
} from '../stats/cards'

// 统计卡注册表：一张卡的全部定义收敛到这一条 manifest——开关键（prefs）→ 组件
// （cards/ 域文件）→ 渲染 props 一次看完。此前这五处散定义（prefs 键 / STATS_GROUPS
// 的 keys / settingsPage 文案 / StatsPage 的开关变量与 JSX / barrel 导出）现在只剩
// 「键 + 文案」留在原处（那是 data.json 与设置页的真源，动不得），组件与 props 归这里。
//
// 组归属不在本表重复：STATS_GROUPS（momo/types/prefs.ts）仍是唯一真源（设置页的
// 区块开关共用那一份）。**组内顺序 = 本数组顺序**——content 组的 reviewCoverage
// 排在 lengthDist 之后进并排 row（见 layout 字段），与 STATS_GROUPS.keys 的设置页
// 顺序有意不同：那个顺序是设置页列表顺序，这个是页面渲染顺序。

/** 一张卡渲染时能看到的一切：StatsPage 算好后喂进来，卡片自己不订 store */
export interface StatsCardContext {
  stats: MomoStats
  reviewCoverage: ReviewCoverage
  attachmentStats: AttachmentStats
  /** 全库条目数（附件占比的分母；注意不是范围口径的 stats.total） */
  entryCount: number
  drill: StatsDrill
  trendPoints: readonly TrendBarPoint[]
  trendPeak: TrendBarPoint | undefined
  trendLast: TrendBarPoint | undefined
  peakHourCount: number
  peakIndex: number
  hasHours: boolean
  /** 「本月新增」下钻的日期组（与格子上的数字同窗口） */
  monthDays: string[]
  /** 品牌词（prefs.brandName，默认 Momo）：带品牌的卡名（如「带图 Momo」）现取现用 */
  brand: string
}

export interface StatsCardManifest {
  /** prefs 的 statsSections 开关键——data.json 里的键，改名即破坏用户已存设置 */
  id: StatsSectionKey
  /** 规模位：章节层之外的 hero（当前只有 kpi）。缺省 = 章节层卡片，归属组由 STATS_GROUPS 决定 */
  hero?: boolean
  /** 组内布局：'dist' = 与同组**相邻**的 dist 卡并排进 .momo-row-dist（内容组两张紧凑卡） */
  layout?: 'dist'
  render: (ctx: StatsCardContext) => JSX.Element
}

/**
 * 新增一张统计卡要动的地方（SOP，共四步，设置 UI 自动生成）：
 *   ① 本表加一条（id = prefs 键，hero / layout 按落点定）；
 *   ② `momo/types/prefs.ts` 的 StatsSections 加键 + DEFAULT_STATS_SECTIONS 加默认值；
 *   ③ STATS_GROUPS 归组（`_AssertNever` 与 prefs.test 双重看守，漏了编译不过 / 测试红）；
 *   ④ `i18n/zh/settingsPage.ts` 的 Record<StatsSectionKey,…> 加 name/desc（漏了编译不过）。
 * 组件本身放 stats/cards/ 对应语义域的文件，本表只登记。
 *
 * 守卫为什么是 `_AssertNever` 而不是仓库旧写法 `const _x: T = undefined as never`：
 * never 可赋给任何类型，后者恒成立、根本不会报错（实测删三条密度档都 compile 过）。
 * 数组必须 `as const`，否则 id 被 widening 成 StatsSectionKey 全集，Exclude 退化成 never。
 */
export const STATS_CARDS = [
  { id: 'kpi', hero: true, render: (c: StatsCardContext) => <KpiRow stats={c.stats} /> },
  { id: 'quality', render: (c: StatsCardContext) => <QualityCard stats={c.stats} drill={c.drill} /> },
  { id: 'heatmap', render: () => <HeatmapCard /> },
  {
    id: 'trend',
    render: (c: StatsCardContext) => (
      <TrendRow
        stats={c.stats}
        trendPoints={c.trendPoints}
        trendPeak={c.trendPeak}
        trendLast={c.trendLast}
        peakHourCount={c.peakHourCount}
        peakIndex={c.peakIndex}
        hasHours={c.hasHours}
        drill={c.drill}
      />
    ),
  },
  { id: 'habits', render: (c: StatsCardContext) => <HabitsRow stats={c.stats} monthDays={c.monthDays} drill={c.drill} /> },
  { id: 'tags', render: (c: StatsCardContext) => <LifecycleCard stats={c.stats} drill={c.drill} /> },
  { id: 'tagDist', render: (c: StatsCardContext) => <TagDistCard stats={c.stats} drill={c.drill} /> },
  // ⑤ 地点（v0.9.33 新组）：规模 / 排行 / 分布 / 生命，口径纪律同标签体系
  { id: 'locScale', render: (c: StatsCardContext) => <LocScaleCard stats={c.stats} drill={c.drill} /> },
  { id: 'locRank', render: (c: StatsCardContext) => <LocRankCard stats={c.stats} drill={c.drill} /> },
  { id: 'locDist', render: (c: StatsCardContext) => <LocDistCard stats={c.stats} /> },
  { id: 'locLifecycle', render: (c: StatsCardContext) => <LocLifecycleCard stats={c.stats} drill={c.drill} /> },
  { id: 'lengthDist', layout: 'dist', render: (c: StatsCardContext) => <LengthDistCard stats={c.stats} drill={c.drill} /> },
  {
    id: 'reviewCoverage',
    layout: 'dist',
    render: (c: StatsCardContext) => <ReviewCoverageCard reviewCoverage={c.reviewCoverage} drill={c.drill} />,
  },
  { id: 'records', render: (c: StatsCardContext) => <RecordsCard stats={c.stats} /> },
  {
    id: 'attachments',
    render: (c: StatsCardContext) => (
      <AttachmentsCard entryCount={c.entryCount} attachmentStats={c.attachmentStats} brand={c.brand} />
    ),
  },
] as const satisfies readonly StatsCardManifest[]

/** 编译期守卫：StatsSections 每个键都必须有注册卡（新键忘登记 → 编译不过）。
 *  `export` 只为消掉「defined but never used」（本仓 eslint 按 `^_` 忽略未用变量，
 *  评审平台跑的那份配置没有这条忽略）：导出即「被使用」，漏登记照旧编译不过。
 *  守卫本身一字未动。 */
type _AssertNever<T extends never> = T
type _CardIds = (typeof STATS_CARDS)[number]['id']
export type _AllKeysHaveCards = _AssertNever<Exclude<StatsSectionKey, _CardIds>>

/**
 * 按开关过滤可见卡。调用计数供 perf-guard 用（「toggle 无关开关不重算注册表」，
 * 见 scripts/registry-guard.test.mts）；`as const` 表的 filter 返回新数组，
 * 调用方必须 useMemo 化，否则每渲染一个新引用。
 */
let selectVisibleCalls = 0
export function selectVisibleCards(sections: StatsSections): readonly StatsCardManifest[] {
  selectVisibleCalls += 1
  return STATS_CARDS.filter((c) => sections[c.id])
}

/** 当前进程内 selectVisibleCards 的累计调用次数（守卫用） */
export const visibleCardCalls = (): number => selectVisibleCalls

/** 计数清零（守卫用例之间调用） */
export const resetVisibleCardCalls = (): void => {
  selectVisibleCalls = 0
}
