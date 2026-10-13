// App 的**筛选订阅**与**列表派生**（R5 骨架拆分，原 App.tsx 的 filters 组 +
// entriesSorted → pinned/rest → list → dateGroups / locGroups 链 + hover 预热）。
//
// BUG-67 起：筛选读取面由 `useMatchedInputs()` 整份订阅 + `matchEntries` 纯函数消费，
// 依赖数组就是这份输入对象本身——不再手抄一份字段清单去对齐 matched() 的读取面
// （v0.7.6 / BUG-48/49 都是漏抄发作；漏字段现在编译不过）。
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { pinnedNotesSetOf, useUi } from '../store'
import type { Density, MomoEntry, SortMode, WarmRatio } from '../../momo/types'
import { warmRatioValue } from '../../momo/types'
import { groupByDate } from '../../momo/dates'
import { groupByLocation, locationTallies } from '../../momo/locations'
import { buildLocTree } from '../../momo/locations'
import { sortEntries } from '../../momo/core'
import { matchEntries } from '../store/matched'
import { useMatchedInputs } from './useMatchedInputs'
import { useTodayKey } from './useTodayKey'
import { bodyOf } from '../card'
import { warmBodies } from '../card/warmQueue'
import type { LocViewMode, MainMode, ReviewedFilter } from '../store'

/** 十个筛选状态（原 App.tsx 的 filters useShallow 组）：既进派生链依赖，
 *  也被统计页下钻的胶囊读取 */
export interface AppFilters {
  search: string
  filterDates: string[]
  filterTags: string[]
  /** 地点筛选（2026-10-01，多选并集）：层级树节点键，进 matched() 与派生链依赖 */
  filterLocations: string[]
  untaggedOnly: boolean
  // v0.7.0 统计页下钻维度
  filterHours: number[]
  filterWeekdays: number[]
  filterLength: { min: number; max: number } | null
  filterTagCount: { min: number; max: number } | null
  filterReviewed: ReviewedFilter | null
}

export function useAppFilters(): AppFilters {
  return useUi(
    useShallow((s) => ({
      search: s.search,
      filterDates: s.filterDates,
      filterTags: s.filterTags,
      filterLocations: s.filterLocations,
      untaggedOnly: s.untaggedOnly,
      filterHours: s.filterHours,
      filterWeekdays: s.filterWeekdays,
      filterLength: s.filterLength,
      filterTagCount: s.filterTagCount,
      filterReviewed: s.filterReviewed,
    })),
  )
}

export interface ListDerivationsInput {
  sortMode: SortMode
  entries: readonly MomoEntry[]
  pinnedNotes: readonly string[]
  mode: MainMode
  density: Density
  warmRatio: WarmRatio
}

export interface ListDerivations {
  entriesSorted: MomoEntry[]
  pinnedList: MomoEntry[]
  restList: MomoEntry[]
  list: MomoEntry[]
  dateGroups: ReturnType<typeof groupByDate>
  /** 地点分组（地点视图的「分组流」档；只有那一档才非空） */
  locGroups: ReturnType<typeof groupByLocation>
  /** 全库地点计数表：星球锚点源（球是**筛选输入面**，见下面的注释） */
  locAnchors: ReturnType<typeof locationTallies>
  /** 地点层级树：侧栏「全部地点」区块的数据源（全库，恒完整） */
  locTree: ReturnType<typeof buildLocTree>
  /** 地点视图档位（off / globe / group）：App 派生后分发给 CardFlow（它保持纯 props） */
  locView: LocViewMode
  warmVisibleBodies: () => void
}

export function useListDerivations(input: ListDerivationsInput): ListDerivations {
  const { sortMode, entries, pinnedNotes, mode, density, warmRatio } = input
  // 地点视图档位（2026-10-01）与层级视角（v0.9.30）：前者决定「常规卡片流 / 星球 /
  // 地点分组流」，后者决定分组流与 pill 写多长、星球锚点按哪一级并键。三个都是
  // 持久化 / 会话态偏好，变化频率与 entries 同级，进依赖数组——漏一个的症状是
  // 「切了档位、分组流不换」。
  // **一个 useUi 调用拿齐**：AGENTS.md §5 的 15 个调用点预算顶格
  // （App 12 + hooks 2 + 本文件 1），新起一个订阅就会红。
  const { locLevel, locRegions, locView, filterLocations, lang } = useUi(
    useShallow((s) => ({
      locLevel: s.locLevel,
      locRegions: s.locRegions,
      locView: s.locView,
      filterLocations: s.filterLocations,
      // 界面语言（2026-10-06）：locGroupOf / buildLocTree 的**组名 / 节点名**都带
      // 语言（displayLocName），所以凡是 memo 住它们结果的地方都得把它列进依赖
      // （locations.ts 的 locGroupOf 文件头写着这条）。AppShell 有 key={lang} 整树
      // 重挂兜底，但那是「整个面板重来一次」的兜底——依赖补全之后，将来哪层不再
      // 重挂（或某个 memo 被提到重挂边界之外）也不会停在旧语言。
      lang: s.lang,
    })),
  )
  // BUG-67：筛选输入整份订阅（useMatchedInputs），整份进下面的 useMemo 依赖。
  // 不再手抄 12 个筛选字段——读取面住在 matched.ts 的 MatchedInputs 里，
  // pickMatchedInputs 漏字段编译不过；BUG-48/49 那类漏依赖从此不可表达。
  const matchedInputs = useMatchedInputs()

  // BUG-131c：把「今天」接进派生链依赖。`matchEntries` 里的 recentWindows 在函数层
  // 会按本地日键重算，但调用方是 useMemo——整夜开着的面板跨零点时三个依赖都没变，
  // memo 命中旧结果，「近 7 天回顾」名单停在昨天。接 `useTodayKey` 让零点成为一次
  // 真实的依赖变化（与统计页 BUG-111c 同一个钟）。
  const todayKey = useTodayKey()

  // 排序（键 × 方向）与比较器在 momo/core/sort.ts：定宽 ISO 串走 compareTimeKey，
  // 别用 localeCompare——后者每次比较都要起 Intl 排序器，@10k 每次筛选白付几毫秒
  const entriesSorted = useMemo(() => {
    // todayKey 只是「跨零点要重算」的信号：`matchEntries` 在函数层按调用时刻折算
    // recent7/30 窗口，body 里不直接读它，规则会判「多余依赖」。显式读一次它才算
    // **真依赖**（BUG-221 同一口径：依赖表里写下的，body 里要看得见）。
    void todayKey
    return sortEntries(matchEntries(matchedInputs, entries), sortMode)
  }, [matchedInputs, sortMode, entries, todayKey])

  /**
   * 置顶分组（v0.8.3）：把当前筛选命中里被置顶的条目抽出来，**按置顶先后**排列
   * （`pinnedNotes` 的数组顺序 = 先置顶的排在前面），与标签置顶同一口径。
   *
   * 只在命中集里找：换筛选之后置顶组只显示这一轮命中的那几条，不会把无关的置顶项
   * 一直顶在最上面（点了 `#读书` 却看见别的标签的置顶内容，那才叫怪）。
   */
  const { pinnedList, restList } = useMemo(() => {
    const byPath = new Map(entriesSorted.map((e) => [e.path, e]))
    const pinned: MomoEntry[] = []
    for (const path of pinnedNotes) {
      const entry = byPath.get(path)
      if (entry) pinned.push(entry)
    }
    // N14：与卡片同一套派生——按 pinnedNotes 数组引用缓存，置顶表不变时复用同一个 Set。
    const pinnedSet = pinnedNotesSetOf(pinnedNotes)
    return { pinnedList: pinned, restList: entriesSorted.filter((e) => !pinnedSet.has(e.path)) }
  }, [entriesSorted, pinnedNotes])

  /**
   * 展示顺序 = 置顶优先。网格 / 焦点这两种平铺密度没有分组可依附，就靠这个
   * 顺序把置顶项排到最前；置顶项内部按置顶先后，其余保持原排序。全选等下游
   * 也读 `list`，所以它们看到的就是屏幕上这个顺序。
   */
  const list = useMemo(
    () => (pinnedList.length > 0 ? [...pinnedList, ...restList] : entriesSorted),
    [pinnedList, restList, entriesSorted],
  )

  // 列表密度下按日期分组（自然日）。
  // 只在需要时算（工单 WO-3）。分组**只对非置顶项**（restList）做：置顶项由上面
  // 那个「置顶」组渲染，若仍留在日期组里同一条会出现两遍。
  //
  // BUG-144：**星球档也要算**。球下方那张「常规列表」与分组档的组体同一条口径——
  // 恒按单列列表渲染，而 list 档的渲染器 renderGroups 读的就是 dateGroups。此前它只看
  // density：网格档（2026-10-12 已移除）下进星球档、点一个地点，球下方**一张卡都不出**
  // （dateGroups 恒空，pinnedList 也空）。
  // 分组档不受影响：它的组体走 EntryFlow，喂的是组自己的 entries，不碰 dateGroups。
  const needsDateGroups = mode === 'list' && (density === 'list' || locView === 'globe')
  // BUG-131a：组头文字（`2026-10-07 · 周三`）是 `groupByDate` 按**当前语言**算出的字符串，
  // 烘进 memo 结果。语言切换只重挂 AppShell 的 `<div key={lang}>`，本 hook 在它之上、
  // restList 引用不变 → memo 不失效，组头停在旧语言。补 `lang` 依赖（与同文件 locGroups /
  // locTree 对齐——BUG-49 是同一病灶上一次发作）。
  const dateGroups = useMemo(() => {
    // lang 只作「组头文案换语言要重算」的信号（`groupByDate` 按当前语言烘字符串），
    // body 里不直接读它 → 显式读一次，规则才认它是真依赖（BUG-221 口径）。
    void lang
    return needsDateGroups ? groupByDate(restList) : []
  }, [needsDateGroups, restList, lang])

  /**
   * 地点分组（地点视图的「分组流」档，2026-10-01）：同一份 `list`（全部筛选 +
   * 排序 + 置顶优先）喂给 `groupByLocation`——`list` 里已经按 `filterLocations`
   * 过了条目（那是 matched() 的活），这里再过一次 `within`：**哪些地点进组**。
   * 两件事分开做——
   *   ① 条目去留走 matched() 里的 `entryAtLocNode`（任一路径命中就算）；
   *   ② 哪些地点**进组**走 `within`（筛选集合）：筛「北京」之后 night 的「上海」
   *      不再撑起一个上海组——筛了一个地区却看见别的地区的组头，那是错的。
   *
   * v0.9.30 起分组带**层级视角**（locLevel + locRegions）：档位决定「按大洲 /
   * 按国家 / 按地点」并组与组头写多长，手填的大洲 / 国家压过内置字典。
   *
   * 与 dateGroups 同一本账：只在需要时算（只有分组流那一档要）。纯函数在
   * momo/locations/locations.ts（不进 stats/）。
   */
  const locGroups = useMemo(() => {
    // 同 dateGroups：lang 是「组名换语言要重算」的信号（`groupByLocation` 的组名走
    // displayLocName），显式读一次它才算真依赖。
    void lang
    return mode === 'list' && locView === 'group'
      ? groupByLocation(list, { level: locLevel, regions: locRegions, within: filterLocations })
      : []
  }, [mode, list, locView, locLevel, locRegions, filterLocations, lang])

  /**
   * 星球锚点源（F7）：**全库**地点计数表（`entries`，不是筛完的 `list`）。
   *
   * 球是**筛选输入面**不是筛选结果：筛了北京之后，球上别的地点还得在原位——
   * 否则「筛了北京就再也没法点上海」。这条裁决 2026-10-01 之前只护着地点筛选
   * （锚点源用未过 locFilter 的那份分组），地点降级成筛选维度之后，同样一条
   * 理由把它推到全库：搜索 / 标签 / 日期筛过之后球也不该少点。
   * 只在这一档需要时算（`locationTallies` 是 O(n×L) 的一次扫描）。
   */
  const locAnchors = useMemo(
    () => (mode === 'list' && locView === 'globe' ? locationTallies(entries) : []),
    [mode, locView, entries],
  )

  /**
   * 地点层级树（v0.9.31「选中即过滤」，2026-10-01 起常驻侧栏）：大洲 → 国家 →
   * 城市三级，喂侧栏「全部地点」区块。**从全库 `entries` 建，不过任何筛选**——
   * 两个理由：① 它是**筛选输入面**，树越筛越窄就没法换地区（老裁决，见
   * GlobeView 的球）；② 它是「**全部**地点」，语义就是全库地点清单，计数 =
   * 全库有多少条笔记带了它。恒完整三级，不随 locLevel 变形（档位只管分组流与
   * pill，树管从哪儿筛）。
   */
  const locTree = useMemo(() => {
    // 同 locGroups：lang 只作「节点名换语言要重建」的信号（buildLocTree 的节点名走
    // displayLocName），显式读一次它才算真依赖。
    void lang
    return buildLocTree(entries, locRegions)
  }, [entries, locRegions, lang])

  /**
   * 密度切换意图期预热：hover 视图分段时把可见列表前 `warmRatio` 比例的正文提前
   * 烘进 MarkdownBody 的渲染缓存（治「切密度后内容逐个蹦出来」，见该文件的
   * bodyCache 注释）。比例的口径与换算在 `momo/types/prefs.ts` 的 WarmRatio
   * （v0.9.14 起用户可配，默认一半 = v0.9.13 写死的行为）；off = 不预热。
   * 内容口径必须与卡片用的同一个（bodyOf），各算一遍一旦漂移就永远命不中。
   *
   * 调度交给 `warmBodies`：分片 + 批间让帧 + 代次作废（划过又划走 / 换了筛选就停）。
   * 这里只负责「算哪些条目、正文串是什么」，不碰并发与时序。
   */
  const warmVisibleBodies = useCallback(() => {
    if (warmRatio === 'off') return
    const s = useUi.getState()
    const count = Math.ceil(list.length * warmRatioValue(warmRatio))
    warmBodies(
      s.caps,
      list.slice(0, count).map((entry) => ({
        key: entry,
        content: bodyOf(entry.content, s.titleFromFirstLine, s.titleMaxChars),
      })),
    )
  }, [list, warmRatio])

  return { entriesSorted, pinnedList, restList, list, dateGroups, locGroups, locAnchors, locTree, locView, warmVisibleBodies }
}
