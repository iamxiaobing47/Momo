import type { MomoEntry, StatsRange } from '../types'
import type { LocRegion } from '../locations'
import { compareTimeKey, dayWindowStart, localDay, monthWindowStart, parseDay, startOfToday, startOfWeek } from '../dates'
// insights 的日期键由 facts 预折叠一次，直接喂 insightsFromDays（另收 entries 自己
// 折算的那条入口已于 2026-10-11 删除，统计页不需要付那笔 new Date）。
import { insightsFromDays } from './insights'
import { flattenTagTree } from '../tags'
import { tagTreeOf } from '../tags'
import type {
  BestDay,
  ColdTagRank,
  MomoStats,
  HabitProfile,
  LongNote,
  TagRank,
  TrendGranularity,
  TrendPoint,
} from './types'
import { CHAR_BIN_UPPER, DAY_MS, STATS_COLD_DAYS, STATS_COUNT_BUCKET_MAX, STATS_LIFECYCLE_TOP, STATS_LONGEST_TOP, STATS_NEW_TAG_DAYS, STATS_TREND_MONTHS, STATS_WEEK_TREND_DAYS } from './constants'
import { dayDiff, factsOf, normalizeCustom, shiftDay, statsWindow, type EntryFact } from './window'
import { notesMilestoneOf, streakMilestoneOf } from './milestones'
import { windowScalars } from './scalars'
import { locLifecycleOf, locStatsOf } from './locations'

/**
 * 统计主函数（ADR-005 本地确定性统计同口径）：只读 Momo 投影派生数字，不联网、不写文件；
 * `now` 可注入，便于测试。日期口径与热力图 / 洞察一致：`dayKey`（本地日历日，工单 WO-1）。
 *
 * 时间范围（v0.4.17，用户裁决「全部维度都要」；v0.5.4 增自定义区间）：
 * - `range` 只作用于**数数**的卡片：累计 / 记录习惯（含本周 / 上月对照、近 30 天活跃率、
 *   星期与时段分布）——「近 90 天的我是什么样」。
 * - 月度趋势 / 标签 lifecycle / 里程碑是**全史**概念（首末次出现、绝对总量），
 *   永远按全部历史算，不受 range 影响；UI 卡片标题会注明「全库」。
 * - `custom` = 用户自选的双闭区间 [from, to]（`YYYY-MM-DD` 本地日期键）；
 *   与 90d / ytd 同一套筛选口径，只是起止不由今天反推。
 *
 * 一句话结构（拆模块后各段的去处）：facts / 窗口折叠在 `window.ts`，数数标量在
 * `scalars.ts`，里程碑在 `milestones.ts`，地点维度在 `locations/locations.ts`——本文件只留
 * **那一遍主循环与全库维度的组装**。
 *
 * 地点维度（v0.9.33）：规模 / 分布 / 排行 / 洲际覆盖随 range（数数卡），生命周期
 * （新开 / 冷掉 / 最近去过）是全史概念，与标签 lifecycle 同纪律。`locRegions`
 * （用户手填的大洲 / 国家，压过内置字典）由调用方从 prefs 递给来——不递就按内置
 * 字典折算，与分组流同一个优先级。
 */
export function computeStats(
  entries: readonly MomoEntry[],
  now: Date = new Date(),
  range: StatsRange = 'all',
  custom?: { from: string | null; to: string | null } | null,
  locRegions?: Readonly<Record<string, LocRegion>> | null,
): MomoStats {
  const today = startOfToday(now)
  const todayStr = localDay(today)
  const last30Start = dayWindowStart(today, 29)
  const newTagStart = dayWindowStart(today, STATS_NEW_TAG_DAYS - 1)
  const coldBefore = dayWindowStart(today, STATS_COLD_DAYS)

  // 一次性预折叠（P04）：窗口 / 数数 / 主循环 / 全库日期表 / 标签 lifecycle / insights
  // 六趟共用同一份 per-entry 派生，`createdAt` 与标签只折算一次。
  const facts = factsOf(entries)

  // 范围过滤：'all' 不复制数组；其余按窗口 [from, to] 筛选（YYYY-MM-DD 字典序即时间序）。
  // 自定义区间盘面脏值（缺端 / 倒挂已由 sanitize 交换，这里只会剩缺端）→ 退化为全部。
  // 过滤结果存**下标**（不另建 facts 副本）：主循环要同时读 entry（标题 / 路径）与 fact。
  const win = statsWindow(facts, now, range, normalizeCustom(custom))
  const scopedIdx: number[] = []
  // 'all' 也要排除未来日期的条目：与 allDayCounts（全库日期表）/ daily30Index 同一个
  // 口径，都是「时钟偏移造出来的『明天』不该进统计」。旧实现只给非 all 分支加窗口
  // 上界，未来条目于是进了 total / activeDays / bestDay / 时段图 / 星期分布，却
  // 被 trend 与 allDayCounts 排除——activeDayRatio = activeDays / windowDays 会 > 1
  // （分母收敛到 [最早, 今天]），bestDay 还可能报一个未来的日期。
  const isFuture = (i: number): boolean => {
    const day = facts[i].dayOrNull
    return day !== null && day > todayStr
  }
  if (range === 'all' || !win) {
    for (let i = 0; i < facts.length; i++) {
      if (isFuture(i)) continue
      scopedIdx.push(i)
    }
  } else {
    for (let i = 0; i < facts.length; i++) {
      const day = facts[i].dayOrNull
      if (day !== null && day >= win.from && day <= win.to && !isFuture(i)) scopedIdx.push(i)
    }
  }
  const scopedFacts: EntryFact[] = scopedIdx.map((i) => facts[i])

  // 条数里程碑与「累计」同口径（BUG-96）：数**今天及以前**的全库条数——预写
  // （未来日期）条目不算，无效日期照数（与 total 同款：它们是真实条目，只是
  // 没日期）。`base.total` 只在 range='all' 时等于它，而里程碑不受 range 影响
  // （见既有范围测试），必须独立数一遍。
  let allNonFutureTotal = 0
  for (let i = 0; i < facts.length; i++) {
    if (!isFuture(i)) allNonFutureTotal++
  }

  // 「数数」指标的口径真值（见 scalars.ts 的 windowScalars 注释）
  const base = windowScalars(scopedFacts)
  // 地点维度（范围口径）：独立一趟（与 windowScalars 同款的多趟结构——都是
  // O(scoped) 的线性遍，主循环照旧只管自己那几组分布）。locations 读侧已归一，
  // 归属折算按地名缓存，不再每条现查字典。
  const loc = locStatsOf(entries, scopedIdx, base.total, locRegions)
  // 连续记录 / 本周 / 本月：与侧栏洞察同一套纯逻辑（一处定义）。
  // 传**范围过滤后**的集合：streak / 本周 / 本月都是**范围内**口径——streak 是
  // 「范围内连续」（今年 / 近 90 天的年界会截断它）。旧注释断言「本周 / 本月窗口
  // 永远落在范围内部」对 ytd 跨年首周不成立（元旦所在周的周一起于上年 12 月，
  // 那几天被 ytd 滤掉），因此定口径为 **ytd = 本年内**：下钻日期组同样钳到 1/1
  // （见 window.ts 的 statsDrillDays），上周 / 上月对照基线也只数本年内条目，
  // 年初首周为 0 是口径本身而非缺数。90d 的 89 天窗口必含上周 / 上月，不受影响。
  // P04：insights 的日期键直接复用 facts 里已折算好的 dayOrNull（不再各自 new Date
  // 一遍）。只喂 dayOrNull（safeDay 口径）：insightsFromDays 的字典序比较要求定宽
  // YYYY-MM-DD，而 createdAt 无效时另一种口径（dayKey 的回退值）是「前 10 位原样
  // 截断」（可能是 'not-a-date' 这类非日期串）。主循环用 dayOrNull 把这类条目排除，
  // insights 却收——同一份 scope 两个口径。无效日期的条目只进分母（分母含无效日期
  // 条目是既有口径）。BUG-171：EntryFact 上另一把尺的 `day` 字段已删，免得下一个
  // 人按字段名 / 按旧注释伸手拿到错的那把。
  const insights = insightsFromDays(
    scopedFacts.map((f) => f.dayOrNull).filter((d): d is string => d !== null),
    now,
  )

  // 本周 / 上周 / 上月的比较窗口（本地日历日 00:00）
  const weekStart = startOfWeek(now)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(weekStart.getDate() - 7)
  const weekStartDay = localDay(weekStart)
  const prevWeekStartDay = localDay(prevWeekStart)
  const prevMonthPrefix = localDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)).slice(0, 7)

  const dayCounts = new Map<string, number>()
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]
  const hourlyCounts = new Array<number>(24).fill(0)
  const daily30 = new Array<number>(30).fill(0)
  const charBins = new Array<number>(CHAR_BIN_UPPER.length + 1).fill(0)
  const tagCountBuckets = new Array<number>(STATS_COUNT_BUCKET_MAX + 1).fill(0)
  // 最长笔记 Top N（N = STATS_LONGEST_TOP）：条目与它们的字数**平行**维护（字数不重复 trim 第二遍）
  const longest: LongNote[] = []
  const longestLens: number[] = []
  let maxLength = 0
  let last30Count = 0
  let tagIncidences = 0
  let weekPrevCount = 0
  let monthPrevCount = 0

  // 30 天窗口的日期键 → 下标（0 = 29 天前 … 29 = 今天）：预算一次、循环内只查表。
  // 不用「时间戳相除取整」：23:59 的条目会 round 到 30 越界（合计 ≠ last30Count），
  // DST 附近的 23/25 小时天也要靠取整兜——查表两者都绕开。
  const daily30Index = new Map<string, number>()
  for (let i = 0; i < 30; i++) daily30Index.set(shiftDay(last30Start, i), i)

  for (const i of scopedIdx) {
    const e = entries[i]
    const f = facts[i]
    const len = f.len
    if (len > maxLength) maxLength = len

    // 字数分档（v0.5.3 新维度）：下标 = 字数 ≤ CHAR_BIN_UPPER[i] 的第一档，
    // 边界**从 constants.ts 推导**。此前这里手抄 50/150/300/800，而 UI 下钻的闭区间
    // （ContentCards 的 CHAR_BIN_UPPER[i-1]+1 .. CHAR_BIN_UPPER[i]）与档名都按常量算——
    // 两处脱钩，数字一改就静默漂移（CHAR_BIN_UPPER 被 import 进来却只活在注释里）。
    let cb: number = CHAR_BIN_UPPER.length
    for (let k = 0; k < CHAR_BIN_UPPER.length; k++) {
      if (len <= CHAR_BIN_UPPER[k]) {
        cb = k
        break
      }
    }
    charBins[cb] += 1

    // 最长笔记 Top N（§4.3 capped 线性维护，N = STATS_LONGEST_TOP；BUG-126e 起
    // 从裸 3 起名的常量）：只在**可能进前 N** 时才收这一条——
    // 收的就是条目本身（统计页拿它渲染主页面上那张卡片，见 RecordsCard），
    // 不再在这里求标题 / 摘要：那两样只服务 v0.7.6 那张自拼的伪卡，伪卡已退场。
    // 维护用**插入排序**（§4.3：Top-K 不每次 push 都 sort）：长度直接用 facts 里
    // 折算好的 f.len，不在比较函数里再 trim() 一遍全文。等长时跳过上面的门槛
    // （稳定序下后来的本就在同等长度项之后），与旧「push 完 sort」输出一致。
    if (len > 0 && (longest.length < STATS_LONGEST_TOP || len > longestLens[STATS_LONGEST_TOP - 1])) {
      let at = longest.length
      while (at > 0 && longestLens[at - 1] < len) at--
      longest.splice(at, 0, e)
      longestLens.splice(at, 0, len)
      if (longest.length > STATS_LONGEST_TOP) {
        longest.length = STATS_LONGEST_TOP
        longestLens.length = STATS_LONGEST_TOP
      }
    }

    // 时间戳折算**一次、三用**（小时 / 日期 / 星期）：`createdAt` 存的是 UTC ISO，
    // 直接截串拿到的是 UTC 小时——UTC+8 用户 22 点写的 Momo 会落进 14 点那一根，
    // 「记录时间」图与概览画像（高峰时段 / 深夜占比）整体平移，背离本地口径
    // （v0.6.2 修复，与 dayKey 的本地折算同源）。分配量不升反降：旧实现这里
    // 是 dayKey + parseDay 两个 Date，现在整个循环每条目只造一个。
    // BUG-132c：日期维度的闸门与其余维度同一把尺（dayOrNull），不再用 `if (ts)`。
    // 脏日期（'2026-09-18T25:00:00' / '... bogus'）日期部分合法、整串不可解析：
    // 旧实现 ts=null 把它们从 dayCounts / 30 天 / 前后周月挡在外面，而 streak /
    // activeDays / 趋势走 dayOrNull 收下 → 同一页两张卡互相打架。时段（小时）与
    // 星期图在 ts=null 时按「有日期无时刻」处理：落进日期桶，不进 24 小时与星期分布。
    const day = f.dayOrNull
    if (day) {
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
      // 30 天窗口（含今天往回 29 天）内的条目才进 daily30；查表命中即计数，
      // 未来日期的条目两边都不进——「+N 30天」与曲线终点永远同源。
      const wi = daily30Index.get(day)
      if (wi !== undefined) {
        last30Count++
        daily30[wi] = (daily30[wi] ?? 0) + 1
      }
      if (day.startsWith(prevMonthPrefix)) monthPrevCount++
      // 上周窗口按日期键比较（ts=null 的条目也有日期，只是没有时刻）
      if (day >= prevWeekStartDay && day < weekStartDay) weekPrevCount++
      const ts = f.ts
      if (ts) {
        const hour = ts.getHours()
        hourlyCounts[hour] = (hourlyCounts[hour] ?? 0) + 1
        weekdayCounts[(ts.getDay() + 6) % 7]++
      }
    }

    // 条目级去重（一条 Momo 同时有 读书 与 读书/小说 时，各计一次、按身份键去重）
    // P04：去重后的身份键由 facts 一趟算好（f.tags），不再这里现建 Set。
    tagIncidences += f.tags.length
    // 标签数分档（v0.5.3 新维度）：0 / 1 / 2 / 3+（按身份键去重后）
    const tb = Math.min(STATS_COUNT_BUCKET_MAX, f.tags.length)
    tagCountBuckets[tb] = (tagCountBuckets[tb] ?? 0) + 1
  }

  // 最长 Top N 已在上面循环内 capped 维护（P02），此处不再全量 sort + splice

  // 时段 4 档 = 上面 24 档的合并（口径与 v0.4.17 完全一致：Math.min(3, floor(hour / 6))）。
  // 只算一次、一处定义：24 小时图与 4 档图不会给出互相矛盾的数字。
  const hourBuckets = [0, 0, 0, 0]
  for (let h = 0; h < 24; h++) {
    const b = Math.min(3, Math.floor(h / 6))
    hourBuckets[b] = (hourBuckets[b] ?? 0) + (hourlyCounts[h] ?? 0)
  }

  // 习惯画像（v0.6.2）：纯派生，不再历 entries——分子分母都来自上面同一遍遍历。
  const datedTotal = weekdayCounts.reduce((s, n) => s + n, 0)
  const weekendCount = (weekdayCounts[5] ?? 0) + (weekdayCounts[6] ?? 0)
  const weekdayCount = (weekdayCounts[0] ?? 0) + (weekdayCounts[1] ?? 0) + (weekdayCounts[2] ?? 0) + (weekdayCounts[3] ?? 0) + (weekdayCounts[4] ?? 0)
  let peakHour: number | null = null
  for (let h = 0; h < 24; h++) {
    // 严格大于：并列时先遇到的小时（更早）胜出
    if ((hourlyCounts[h] ?? 0) > 0 && (peakHour === null || (hourlyCounts[h] ?? 0) > (hourlyCounts[peakHour] ?? 0))) {
      peakHour = h
    }
  }
  const profile: HabitProfile = {
    weekendRatio: datedTotal > 0 ? weekendCount / datedTotal : 0,
    peakHour,
    weekendVsWeekday:
      weekendCount > 0 && weekdayCount > 0
        ? Math.round((weekendCount / 2 / (weekdayCount / 5)) * 100) / 100
        : null,
  }

  // 历史最长连续：按天升序走一遍，断档即重置
  let bestStreak = 0
  let run = 0
  let prev: Date | null = null
  const sortedDays = [...dayCounts.keys()].sort()
  for (const day of sortedDays) {
    const d = parseDay(day)
    const consecutive = prev !== null && Math.round((d.getTime() - prev.getTime()) / DAY_MS) === 1
    run = consecutive ? run + 1 : 1
    if (run > bestStreak) bestStreak = run
    prev = d
  }

  // 当前断更（v0.6.5 起只保留这一个数）：距窗口内最近一次记录几天。
  // 「记录间隔」分析卡（平均间隔 / 最长断更 / 间隔分布）已移除——streak、
  // 热力图疏密、bestStreak 已经覆盖「规律还是随机」，五档分布是第四遍讲同一件事；
  // 但「多久没写了」是概览条「已断更 N 天」的供数，得留着。
  // 计量锚点 = 窗口结束日（取「今天」与 `win.to` 的近者）：默认 / 90d / ytd 的窗口
  // 都止于今天，行为不变；**历史自定义区间**（止点在过去的某天）不再把库外的「今天」
  // 算进断更——看 6 月的区间却报「已断更 N 个月」是误导（审计 #3）。
  const gapAnchor = win ? (win.to < todayStr ? win.to : todayStr) : todayStr
  const currentGapDays =
    sortedDays.length > 0 ? Math.max(0, dayDiff(gapAnchor, sortedDays[sortedDays.length - 1])) : 0

  // 最近 30 天活跃率：有记录的天数（不含今天也能数出来，分子分母都 deterministic）。
  // 与 daily30 同一张窗口表——「30 天活跃 21 天」与曲线里的非零天数永远对得上。
  let last30ActiveDays = 0
  for (const day of dayCounts.keys()) {
    if (daily30Index.has(day)) last30ActiveDays++
  }

  // 最高产的一天：并列取最早（习惯网格用；Top 3 口径 v0.6.3 已裁——
  // 与热力图疏密、习惯网格的单项展示重复，见 concept-momo-stats）
  let bestDay: BestDay | null = null
  for (const [day, count] of dayCounts) {
    if (!bestDay || count > bestDay.count || (count === bestDay.count && day < bestDay.day)) {
      bestDay = { day, count }
    }
  }

  // 单日集中度（v0.7.3）：最高单日条数 ÷ 总条数。与 bestDay 同一次遍历的产物，
  // 不另历一遍——占比高（一次性导入 / 单日爆发）时，概览条与习惯卡的「习惯」
  // 读数都要先打折扣看，这个数就是那张折扣券。
  const maxDayShare = bestDay && base.total > 0 ? bestDay.count / base.total : 0

  // 标签树只建一次（全库 lifecycle + 顶层集中度共用）。scoped 那棵原是给「标签排行」
  // 用的，卡（v0.6.8）与年度回忆卡片（v0.7.1）先后移除后没有消费者了——
  // computeStats 因此从两次 buildTagTree 降到一次。
  // P03：走 tags/derived.ts 的单槽引用缓存（App.tsx 的 tagTreeOf 同一条），同一 entries
  // 引用连续调 computeStats 不再重建；store 保证「内容一致不换引用、变化必换新数组」，
  // 所以缓存命中即数据一致。
  const fullTagTree = tagTreeOf(entries)

  // ---- 全库维度（不受 range 影响）----

  // 全库按日计数一遍：周 / 月两种趋势粒度都从它派生（一张表两种视图，不各历 entries）。
  // 未来日期不计（v0.7.5 review 修复）：与 daily30 同口径——时钟偏移造出来的「明天」
  // 不该把本周 / 本月桶充气，也不该当「最早记录日」把跨度判成月粒度。
  const allDayCounts = new Map<string, number>()
  let earliestDayAll: string | null = null
  for (const f of facts) {
    const day = f.dayOrNull
    if (!day || day > todayStr) continue
    allDayCounts.set(day, (allDayCounts.get(day) ?? 0) + 1)
    if (!earliestDayAll || day < earliestDayAll) earliestDayAll = day
  }

  // 记录天数占比的分母（v0.7.5 review 修复）：窗口日历天，但**收敛到库内实际跨度**——
  // 窗口起点早于首条记录时（90d / ytd 撞上年轻库），只算「本来可能有记录的天数」。
  // 否则 22 天的库在 ytd 下会是 9/264 = 3.4%：分子没变、分母灌水，占比失真到没有意义。
  // 'all' 的起点本就是首条记录日（statsWindow 收敛过），老库的 90d / ytd 不受影响。
  // 止点复用 gapAnchor（= min(win.to, 今天)，BUG-72）：自定义区间止点设到未来时
  // （如「本月」选到月末），分子被 isFuture 排除、分母必须同口径，否则占比被摊薄。
  // BUG-203：win=null（custom 缺端 → 数数退化「今天及以前的全部」）时起点与 'all'
  // 收敛一致 = 首条记录日；旧实现整个三元落 0，占比恒 0，与同页「活跃天数>0」矛盾。
  const windowDays =
    earliestDayAll
      ? Math.max(
          0,
          dayDiff(
            gapAnchor,
            win ? (earliestDayAll > win.from ? earliestDayAll : win.from) : earliestDayAll,
          ) + 1,
        )
      : 0

  // 趋势（v0.7.4 粒度自适应）：跨度 < STATS_WEEK_TREND_DAYS 天按周（键 = 该周周一），
  // 否则按月（键 = YYYY-MM）——20 天的库画 12 根月柱只会得到 10 根空柱，
  // 粒度跟着数据跨度走。缺失周期补 0。
  // 不设周数的回看上限：跨度 < 60 天时最多 ~10 个周桶，天然有界；
  // 月粒度的上限仍由 STATS_TREND_MONTHS 把着。
  const spanDays = earliestDayAll ? dayDiff(todayStr, earliestDayAll) + 1 : 0
  const trendGranularity: TrendGranularity =
    spanDays > 0 && spanDays < STATS_WEEK_TREND_DAYS ? 'week' : 'month'
  const trend: TrendPoint[] = []
  if (trendGranularity === 'week' && earliestDayAll) {
    // 从最早记录所在的周一滚到本周一（本地口径，与「本周」同一天界）
    const cursor = localDay(startOfWeek(parseDay(earliestDayAll)))
    const thisMonday = localDay(startOfWeek(today))
    // N15：循环上界「本周一」是常量。旧写法把它写在条件里，每周一步都重新
    // parseDay(thisMonday) 一次（§4.2 的「常量入参在循环内反复解析」模式）——
    // 循环最多十来圈，绝对耗时小到量不出来，但这类写法的正确读法是「它会被误改」：
    // 提出来一次解析、之后只比 Date，循环体也再没有隐藏的字符串到日期的换算。
    const thisMondayDate = parseDay(thisMonday)
    for (const d = parseDay(cursor); d <= thisMondayDate; d.setDate(d.getDate() + 7)) {
      const monday = localDay(d)
      // BUG-113a：一周七天从这一周的 Date 上走（它本就是 monday 的 0 点），不再
      // 逐圈 `shiftDay(monday, i)`——同一形状（循环不变量在圈内反复解析），每个
      // 星期白付 7 次字符串 → Date。每日仍付一次 localDay 格式化（Map 的键），
      // 但每个星期只新增一个 Date（walk 副本），旧写法是七个。
      const walk = new Date(d)
      let count = 0
      for (let i = 0; i < 7; i++) {
        count += allDayCounts.get(localDay(walk)) ?? 0
        walk.setDate(walk.getDate() + 1)
      }
      trend.push({ key: monday, count })
    }
  } else {
    // 月粒度：先把按日计数按 `YYYY-MM` 汇总一次（O(天数)），再逐月取——
    // 不对每个月重历一遍日表（12 × N 的嵌套在千条级的库上白烧 CPU）。
    const allMonthCounts = new Map<string, number>()
    for (const [day, n] of allDayCounts) {
      const month = day.slice(0, 7)
      allMonthCounts.set(month, (allMonthCounts.get(month) ?? 0) + n)
    }
    const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    let trendStart = monthWindowStart(today, STATS_TREND_MONTHS)
    const earliestMonth = earliestDayAll?.slice(0, 7)
    if (earliestMonth) {
      const earliestStart = parseDay(`${earliestMonth}-01`)
      if (earliestStart > trendStart) trendStart = earliestStart
    }
    for (const m = new Date(trendStart); m <= curMonthStart; m.setMonth(m.getMonth() + 1)) {
      const month = localDay(m).slice(0, 7)
      trend.push({ key: month, count: allMonthCounts.get(month) ?? 0 })
    }
  }

  // 标签 lifecycle（全库）：首末次出现 + 一次性 + 顶层集中度。
  // 每键条目数这里用**直属**计数（区别于排行的子树口径）：冷掉 / 新开是「这个标签本身」的事。
  // 全库打标次数：top3Share 的分母（标签 lifecycle 整段都是全库口径，不能用 scoped 的 tagIncidences ——
  // 非 all 范围下分子（全库树 Top 3）÷ 分母（范围内打标）口径打架，集中度数字整体失真）。
  let fullTagIncidences = 0
  const firstSeen = new Map<string, string>()
  const lastSeen = new Map<string, string>()
  const displayOf = new Map<string, string>()
  const lifeCounts = new Map<string, number>()
  for (const f of facts) {
    const day = f.dayOrNull
    // BUG-96：「全库」= 不限范围（range）× 今天及以前——预写（未来日期）条目整段
    // 跳过，与 isFuture / allDayCounts / scopedIdx 同一把尺子。修前只判 `!day`：
    // 预写的新标签会冒进「新开」、预写复用会把真实末现推后到未来并把标签挤出
    // 「冷掉」、未来打标还撑大一次性分母与集中度分母（同一页两套条目集）。
    // 无效日期（dayOrNull = null）维持既有口径：无法归日、不进首末次出现，
    // 但照进打标次数与每键计数——与「累计」/「标签数」同集合。
    if (day !== null && day > todayStr) continue
    fullTagIncidences += f.tags.length
    for (const t of f.tags) {
      const k = t.key
      if (!displayOf.has(k)) displayOf.set(k, t.raw)
      lifeCounts.set(k, (lifeCounts.get(k) ?? 0) + 1)
      if (!day) continue
      const first = firstSeen.get(k)
      if (!first || day < first) firstSeen.set(k, day)
      const last = lastSeen.get(k)
      if (!last || day > last) lastSeen.set(k, day)
    }
  }
  // 显示写法与侧栏树同源：全库标签树里「最早出现的原样写法」
  const fullNodes = flattenTagTree(fullTagTree)
  const toRank = (key: string, count: number): TagRank => ({
    key,
    displayPath: fullNodes.get(key)?.displayPath ?? displayOf.get(key) ?? key,
    count,
  })
  // 新开 / 冷掉先数全量，再取 Top N 展示——列表本身是截断的，排序前必须拿全量
  const newTagAll = [...firstSeen].filter(([, day]) => day >= newTagStart)
  // 冷掉的门槛是「距最后一次出现 ≥ STATS_COLD_DAYS 天」（constants.ts 的口径）：
  // 含今天往回退 STATS_COLD_DAYS 天 = T−90 是**满 90 天**的第一天，所以用 <=。
  // 旧实现写 <（= 要求 T−91 才命中），恰好在整 90 天上的标签永远进不了冷掉列表，
  // 与旁边新标签的 >= 边界也不对称。
  const coldTagAll = [...lastSeen].filter(
    ([key, day]) => (lifeCounts.get(key) ?? 0) >= 2 && day <= coldBefore,
  )
  const newTags: TagRank[] = newTagAll
    .map(([key, day]) => ({ key, day, count: lifeCounts.get(key) ?? 0 }))
    .sort((a, b) => b.count - a.count || compareTimeKey(a.day, b.day))
    .slice(0, STATS_LIFECYCLE_TOP)
    .map(({ key, count }) => toRank(key, count))
  // N15 同款：todayStr 是循环外常量，parseDay 不许进 map——冷标签有多少个就白建
  // 多少个 Date（§3.2）。computeStats 每个 vault 事件（150ms 防抖 refresh）都跑一遍。
  const todayMs = parseDay(todayStr).getTime()
  // 地点生命周期（全库）：与标签 coldTags 共用 todayMs / todayStr / coldBefore /
  // newTagStart 同一批阈值——窗口定义只在 compute.ts 一处，两个维度不会各算一份。
  const locLifecycle = locLifecycleOf(entries, facts, { newTagStart, coldBefore, todayMs, todayStr })
  // 截断前不算 days（BUG-59）：排序键只有 count / day，days 挪到 slice 之后，
  // 只对最终展示的 Top N 付 parseDay——老库冷标签成百上千时不必全量建 Date。
  const coldTags: ColdTagRank[] = coldTagAll
    .map(([key, day]) => ({ key, day, count: lifeCounts.get(key) ?? 0 }))
    .sort((a, b) => b.count - a.count || compareTimeKey(a.day, b.day))
    .slice(0, STATS_LIFECYCLE_TOP)
    .map(({ key, day, count }) => ({
      ...toRank(key, count),
      days: Math.round((todayMs - parseDay(day).getTime()) / DAY_MS),
    }))
  let singleUseCount = 0
  for (const count of lifeCounts.values()) {
    if (count === 1) singleUseCount++
  }
  // Top 3 顶层标签的子树合计 ÷ 全部打标次数：顶层子树按条目去重、互不重叠，
  // 分子不会超过分母（嵌套标签若按任意节点取 Top 3 会父子双计，故只取根节点）。
  // 分母用**全库**打标次数（fullTagIncidences）：本段 lifecycle 都是全库口径，分子
  // 也按全库树取——非 all 范围下不能用 scoped 的 tagIncidences，否则口径错配。
  // BUG-96：份额按「今天及以前」重算——树含未来条目，直接取 totalCount 会把预写
  // 打标折进分子，而分母已按同一把尺子排除（同页两个数字必须吃同一批条目）。
  // 名单仍取全库树前三（树是引用缓存的共享产物，不为集中度这一个数字另建排名；
  // P03：roots 已由 finalize 排好——totalCount 倒序 → name，slice 取副本，勿就地 sort）。
  const top3Roots = fullTagTree.slice(0, 3)
  // `key + '/'` 前缀在循环外拼好（§3.2 同款：常量入参不进循环）；命中口径与树
  // totalCount 同——前缀（含自身）命中生效、一条目对一个根只计一次（some 天然去重）。
  const top3Prefixes = top3Roots.map((root) => root.key + '/')
  let top3SubtreeTotal = 0
  for (let i = 0; i < facts.length; i++) {
    if (isFuture(i)) continue
    const tags = facts[i].tags
    for (let r = 0; r < top3Roots.length; r++) {
      if (tags.some((t) => t.key === top3Roots[r].key || t.key.startsWith(top3Prefixes[r]))) {
        top3SubtreeTotal++
      }
    }
  }
  const top3Share = fullTagIncidences > 0 ? Math.min(1, top3SubtreeTotal / fullTagIncidences) : 0

  return {
    total: base.total,
    tagCount: base.tagCount,
    activeDays: base.activeDays,
    windowDays,
    activeDayRatio: windowDays > 0 ? base.activeDays / windowDays : 0,
    streak: insights.streak,
    bestStreak,
    weekCount: insights.weekCount,
    monthCount: insights.monthCount,
    last30Count,
    bestDay,
    maxDayShare,
    avgPerActiveDay: base.activeDays ? Math.round((base.total / base.activeDays) * 10) / 10 : 0,
    avgLength: base.avgLength,
    maxLength,
    untaggedCount: base.untaggedCount,
    untaggedRatio: base.total ? base.untaggedCount / base.total : 0,
    loc,
    locLifecycle,
    weekPrevCount,
    monthPrevCount,
    last30ActiveDays,
    weekdayCounts,
    hourBuckets,
    hourlyCounts,
    daily30,
    charBins,
    longestNotes: longest,
    tagCountBuckets,
    firstDay: sortedDays[0] ?? null,
    trendGranularity,
    trend,
    medianLength: base.medianLength,
    longRatio: base.total ? base.longCount / base.total : 0,
    avgTagsPerEntry: base.total ? Math.round((tagIncidences / base.total) * 10) / 10 : 0,
    lifecycle: {
      newTags,
      coldTags,
      singleUseCount,
      singleUseTotal: lifeCounts.size,
      top3Share,
    },
    notesMilestone: notesMilestoneOf(allNonFutureTotal),
    streakMilestone: streakMilestoneOf(insights.streak),
    currentGapDays,
    profile,
  }
}
