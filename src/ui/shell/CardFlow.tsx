import type { Density, MomoEntry } from '../../momo/types'
import type { DateGroup } from '../../momo/dates'
import type { LocationGroup } from '../../momo/locations'
import type { LocViewMode, MainMode } from '../store'
import { Review } from '../review/Review'
import { StatsPage } from '../stats'
import { Trash } from '../trash/Trash'
import { LocationEmpty, LoadingEmpty, NoMatchEmpty, NoNotesEmpty } from './EmptyStates'
import { LocationFlow } from './LocationFlow'
import { ReadErrorBanner } from './ReadErrorBanner'
import { DENSITY_VIEWS, type DensityContext } from '../registry/densityViews'

// 主区内容（v0.5 起主区只剩筛选条与卡片流）。
// 模式分支与空态在这里；**密度分流查表**：三种密度（列表 / 网格 / 焦点）
// 的 JSX 在 registry/densityViews.tsx——「同一份筛选结果的另一种看法」
// 就是加一条 manifest，本文件不长大。
//
// 2026-10-01 晚起多一层：**地点视图**（`locView`，全部笔记专属）——`globe` =
// 星球 + 下方常规卡片流，`group` = 地点分组流。两者都是「同一份筛选结果的另一种
// 看法」，与密度同级，不再是独立的页面（地点页面已撤）。
//
// 多选态四个 prop（selectMode / selected / onToggleCheck / onTag）已于组件化 P5
// 从本文件撤下；v0.9.10 它们连 Context 也不再经过（CardScope 删除）——选择态在
// store 的 selection slice，消费者（Card / Review / FocusScroll）
// 自己按卡选布尔量订阅，CardFlow 与密度注册表都不是二传手。

export interface CardFlowProps {
  mode: MainMode
  density: Density
  loading: boolean
  entries: MomoEntry[]
  /** 当前可见列表（置顶优先的展示顺序，见 App 的 list 派生） */
  list: MomoEntry[]
  /** 置顶组（按置顶先后）与非置顶的其余（日期分组只对它做） */
  pinnedList: MomoEntry[]
  dateGroups: readonly DateGroup[]
  /** 地点分组（App 派生；只有「地点分组」那一档非空） */
  locGroups: readonly LocationGroup[]
  /** 地点视图档位（off / globe / group，全部笔记专属；App 从 store 订阅后传入） */
  locView: LocViewMode
  /** 星球档是否已有地点筛选（`filterLocations.length > 0`）：2026-10-01 用户裁定
   *  「进入星球只显示地球，点了地点才出笔记」——未筛时球下的列表整块不渲染 */
  locFilterActive: boolean
  /** 进多选（地点空态的 CTA 用：面板里给笔记建地点） */
  onEnterSelectMode: () => void
  /** 退出地点视图回常规卡片流（地点空态的次按钮） */
  onBackToAll: () => void
  onClearFilters: () => void
}

export function CardFlow(props: CardFlowProps) {
  const { mode, density, loading, entries, list, pinnedList, dateGroups } = props
  if (mode === 'review')
    return (
      <>
        <ReadErrorBanner />
        <Review />
      </>
    )
  if (mode === 'stats') {
    // BUG-78b：统计页也要过 loading / 读盘失败门禁。旧实现 stats 分支排在
    // 门禁之前——读盘失败 / 首载未完时切到统计页，看到的是「你还没有任何
    // 记录」的误导空态；列表 / 回收站模式在同场景下是 ReadErrorBanner。
    // 常态（无失败）ReadErrorBanner 渲染 null，统计页 DOM 与改动前逐字一致。
    if (loading && entries.length === 0) {
      return (
        <>
          <ReadErrorBanner />
          <LoadingEmpty />
        </>
      )
    }
    return (
      <>
        <ReadErrorBanner />
        <StatsPage />
      </>
    )
  }
  if (mode === 'trash')
    return (
      <>
        <ReadErrorBanner />
        <Trash />
      </>
    )
  // 读盘失败提示（M3）：排在空态判断**之前**——首屏就没读出东西时，失败比
  // 「还在加载」更该被看见（两者可能同时成立，失败信息是更有用的那一条）。
  if (loading && entries.length === 0)
    return (
      <>
        <ReadErrorBanner />
        <LoadingEmpty />
      </>
    )
  if (entries.length === 0)
    return (
      <>
        <ReadErrorBanner />
        <NoNotesEmpty />
      </>
    )

  /**
   * 常规卡片流（按密度查表）：DENSITY_VIEWS 每个 id 一份视图，找不到就抛——
   * registry/densityViews.tsx 的 never 守卫保证 DENSITIES 每个成员都登记过，走到这里
   * 说明有人加了密度忘了注册；静默回退到某一档会把 bug 藏到用户眼里。星球视图的
   * 「球下方」与分组档的组体也复用这一份（同一份筛选结果的另一种看法）。
   * 地点两档视图**不复用它**——各视图独立，地点视图不看密度档（BUG-144 / 焦点档同理，
   * 见下面星球档的调用处）。
   */
  const plainBody = (forDensity: Density = density): React.JSX.Element => {
    const view = DENSITY_VIEWS.find((v) => v.id === forDensity)
    if (!view) throw new Error(`[momo] density view not registered: ${forDensity}`)
    const ctx: DensityContext = { list, pinnedList, dateGroups }
    return view.render(ctx)
  }

  // 地点视图（2026-10-01，全部笔记的一档）：两种结局按「库里有地点吗 → 筛出来了吗」分。
  // 顺序要紧：先问「全库有没有地点」，再问「筛出来了吗」——没有地点那支被整批移除后，
  // 全库零地点时 locGroups 也是空的，反着问会把 F5a 的空态抢成「清除筛选」。
  // 「全库零地点」看的是 **entries**（未筛选全集）而不是 list：搜完只剩没地点的
  // 笔记时，该给的是「清除筛选」，不是入门空态。
  if (mode === 'list' && props.locView !== 'off') {
    if (!entries.some((e) => e.locations.length > 0)) {
      return <LocationEmpty onEnterSelectMode={props.onEnterSelectMode} onBackToAll={props.onBackToAll} />
    }
    if (props.locView === 'globe') {
      // 球**恒在**（它是筛选输入面）：筛得一条不剩时球下方给「清除筛选」，
      // 而不是整屏空态——否则用户在球上点出来的筛选，把球自己挤没了。
      //
      // 2026-10-01 用户裁定：**未筛地点时球下什么都不出**（「进入页面时只显示地球，
      // 不要显示笔记；只要在地球上点击地点后，才显示对应的笔记」）。判据用
      // `locFilterActive`（有无地点筛选），不是 `list.length`——搜索 / 标签筛空时
      // 也仍然「先点地点才出笔记」，那正是这一档的语义。侧栏「全部地点」树选节点
      // 同样算「在地球上点击地点」，走的是同一个 filterLocations。
      //
      // 球与球下方那份列表是**同级两个块**（fragment，不是一个包一个）：列宽 /
      // 居中的规则挂在 `.momo-content > …` 上（60-design.css），套进 `.momo-globe`
      // 壳里就都够不着了。两块之间的缝由 CSS
      // 的 `.momo-globe + …` 那几条补。
      //
      // 球下方这张列表**恒是单列窗口化列表**，不看密度档：地点视图与密度视图各自
      // 独立（BUG-144：当时的网格档铺成参差多列且不窗口化；焦点档同理，一屏一卡不属于地点视图）。
      return (
        <>
          <ReadErrorBanner />
          {props.locFilterActive &&
            (list.length === 0 ? (
              <NoMatchEmpty onClearFilters={props.onClearFilters} />
            ) : (
              plainBody('list')
            ))}
        </>
      )
    }
    if (props.locGroups.length === 0)
      return (
        <>
          <ReadErrorBanner />
          <NoMatchEmpty onClearFilters={props.onClearFilters} />
        </>
      )
    return (
      <>
        <ReadErrorBanner />
        <LocationFlow groups={props.locGroups} />
      </>
    )
  }

  if (list.length === 0)
    return (
      <>
        <ReadErrorBanner />
        <NoMatchEmpty onClearFilters={props.onClearFilters} />
      </>
    )
  return (
    <>
      <ReadErrorBanner />
      {plainBody()}
    </>
  )
}
