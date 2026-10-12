import type { MomoEntry } from '../types'

/**
 * 统计页的数据类型（v0.4.17 建页以来的全部产物形状）。
 * 与 `../types.ts`（prefs / 设置 / 条目的存储形状）分开：那边是**落盘契约**，
 * 这边是**纯派生投影**——文件是唯一事实源，这些接口一个字节都不写进 data.json
 * （ADR-003）。
 */

export interface TagRank {
  /** 身份键（点按下钻筛选用） */
  key: string
  /** 显示路径（首次出现的原样写法） */
  displayPath: string
  /** 含该标签（含子树，按条目去重）的 Momo 数——与侧栏树 chip 的数字同口径 */
  count: number
}

/** 冷掉的标签：在 TagRank 上补「距最后一次出现的 fizzled 天数」 */
export interface ColdTagRank extends TagRank {
  /** 距最后一次出现的整数天数（≥ STATS_COLD_DAYS） */
  days: number
}

export interface BestDay {
  day: string
  count: number
}

/** 最长笔记的一条（2026-10-01 起直接给条目）：统计页「最长笔记」卡**复用主页面上
 *  那张真卡片**渲染（见 ui/stats/cards/ContentCards.tsx 的 RecordsCard），只需要
 *  条目本身——标题 / 字数 / 正文都由卡片自己按同一套偏好算。在此之前这里投的是
 *  `{path, title, length, snippet}`（title = 首行原文、snippet = 前 100 字摘要），
 *  那四个字段只服务当年那张自拼的伪卡，随伪卡一起退场。 */
export type LongNote = MomoEntry

/**
 * 趋势粒度（v0.7.4）：跨度 < STATS_WEEK_TREND_DAYS 天按周、否则按月。
 * 固定月粒度对年轻库不友好——20 天的库画 12 根月柱只会得到 10 根空柱，
 * 粒度跟着数据跨度走（修报告 D2）。
 */
export type TrendGranularity = 'week' | 'month'

/**
 * 趋势的一个点（v0.7.4 起粒度自适应）：
 * - 月粒度：`key` = `YYYY-MM`；
 * - 周粒度：`key` = 该周**周一**的 `YYYY-MM-DD`（与「本周」口径同一天界）。
 */
export interface TrendPoint {
  key: string
  count: number
}

/** 标签生命周期（全库口径）：新开 / 冷掉 / 一次性 / 集中度 */
export interface TagLifecycle {
  /** 近 STATS_NEW_TAG_DAYS 天**首次出现**的标签（按条目数倒序，Top N） */
  newTags: TagRank[]
  /** ≥ STATS_COLD_DAYS 天没有新条目、且条目数 ≥ 2 的标签（按条目数倒序，Top N） */
  coldTags: ColdTagRank[]
  /** 只出现过 1 次的标签数（一次性标签） */
  singleUseCount: number
  /** 全库标签身份键总数（一次性占比的分母） */
  singleUseTotal: number
  /** Top 3 **顶层**标签的子树条目合计 ÷ 全部打标次数（0–1；顶层子树按条目去重、互不重叠） */
  top3Share: number
}

/** 一个地名与该地名的条数（排行 / 洲际覆盖 / 地点生命周期共用） */
export interface LocRank {
  /** 地名（读侧归一后的原样写法） */
  location: string
  /** 含该地名的 Momo 数（按条目去重：一条带 3 个地点只在各自地名下计 1） */
  count: number
}

/** 冷掉的地点：在 LocRank 上补「距最后一次出现的天数」 */
export interface ColdLocRank extends LocRank {
  /** 距最后一次出现的整数天数（≥ STATS_COLD_DAYS） */
  days: number
}

/**
 * 地点统计（v0.9.33 新维度）：与标签体系同形的**范围**口径投影——规模 / 分布 /
 * 排行 / 洲际覆盖，随统计页顶栏范围切换（数数卡的纪律，见 compute.ts）。
 * `locations` 读侧已归一（momo/locations.ts），这里只计数与归属折算。
 */
export interface LocStats {
  /** 范围内去重后的地名数 */
  locCount: number
  /** 范围内去重后的国家数（经归属字典折算；查不到归属的地名不计入——不造「未知」占位） */
  countryCount: number
  /** 范围内去重后的大洲数（同上） */
  continentCount: number
  /** 范围内一条地点都没有的 Momo 数 */
  noLocCount: number
  /** 无地点占比（0–1） */
  noLocRatio: number
  /** 范围内平均每条地点数（一位小数） */
  avgLocsPerEntry: number
  /** Top N 地名（范围内，按条数降序、同数按地名排）：可下钻（回全部笔记 + 地点筛选） */
  topLocs: LocRank[]
  /** 各大洲的条目数（范围内，按条数降序、同数按洲名排）：按条目去重，查不到归属的地名不进这张表 */
  continentCoverage: LocRank[]
  /** 地点数分布（范围内）：下标 0–3 = 每条 0 / 1 / 2 / 3+ 个地点 */
  locCountBuckets: number[]
}

/**
 * 地点生命周期（**全库**口径，与 TagLifecycle 同纪律：首末次出现 / 绝对总量不受
 * range 影响）。新开 / 冷掉与标签共用同一批窗口常量（STATS_NEW_TAG_DAYS /
 * STATS_COLD_DAYS）——「30 天内第一次去」「90 天没再去」对两个维度是同一把尺子。
 */
export interface LocLifecycle {
  /** 近 STATS_NEW_TAG_DAYS 天**首次出现**的地点（按条数倒序，Top N） */
  newLocs: LocRank[]
  /** ≥ STATS_COLD_DAYS 天没有新条目、且条数 ≥ 2 的地点（按条数倒序，Top N） */
  coldLocs: ColdLocRank[]
  /** 最近去过的地方：按**最后一次出现**倒序（同数按条数、再按地名），Top N */
  recentLocs: LocRank[]
  /** 只出现过 1 次的地点数（一次性地点） */
  singleVisitCount: number
  /** 全库地名总数（一次性占比的分母） */
  singleVisitTotal: number
  /** Top 3 地名的条目合计 ÷ 全部地点打点次数（0–1） */
  top3Share: number
}

/**
 * 下一个里程碑：目标值 + 还差多少 + 后续档位梯子（v0.6.5 用户要求「多加一些里程碑」：
 * 档位表加密 + 卡片上同时看到接下来的几档，不然只有「下一个」看得见，加再多档位
 * 也要等到爬完才现身）。
 */
export interface Milestone {
  target: number
  remaining: number
  /** 当前目标之后的头 `STATS_MILESTONE_LOOKAHEAD` 个档位（升序）；已是最后一档时为空数组 */
  upcoming: number[]
}

/** 附件统计 */
export interface AttachmentStats {
  total: number
  totalBytes: number
  entriesWithImages: number
  monthlyTrend: { month: string; count: number; bytes: number }[]
}

/** 回顾覆盖率 */
export interface ReviewCoverage {
  total: number
  reviewed: number
  unreviewed: number
  ratio: number
  /** 近 7 天（含今天）回顾过的条数（v0.7.3） */
  recent7: number
  /** 近 30 天（含今天）回顾过的条数（v0.7.3） */
  recent30: number
  /**
   * 最久未回顾（天，v0.7.3）：未回顾 Momo 中最早一条距今天几天；全部已回顾时为 0。
   * 把「N 条未回顾」从一座山变成一根线——从最旧的那条开始啃。
   * 无效日期的未回顾条目不计（与按天维度同口径）。
   */
  oldestUnreviewedDays: number
}

/**
 * 记录习惯画像（v0.6.2，范围内）：从同一遍遍历**已经算出**的 24 小时 / 星期分布派生，
 * 回答「我是什么时候写的人」——统计页概览条与节奏组的解读层指标。
 * 每项比例都用**自己维度**的分母（星期分布合计 / 小时分布合计）：无效日期的条目
 * 不进按天维度（见 compute.ts 的口径注释），两个维度因此互不污染。
 */
export interface HabitProfile {
  /** 周末记录占比（0–1）：周六 + 周日 ÷ 有有效日期的条目数；无有效日期条目时为 0 */
  weekendRatio: number
  /** 高峰小时（0–23）；并列取**更早**的小时（一天从凌晨开始读）。全 0 时为 null */
  peakHour: number | null
  /**
   * 周末日均 ÷ 工作日日均（> 1 = 周末更活跃，保留两位小数）。
   * 任一侧为 0 时返回 null——没有可比基数时不给方向性结论。
   */
  weekendVsWeekday: number | null
}

export interface MomoStats {
  total: number
  /** 去重后的标签身份键数（范围内） */
  tagCount: number
  /** 有记录的天数（范围内） */
  activeDays: number
  /**
   * 当前统计窗口的日历天数（双闭；无窗口 = 0，v0.7.3）——`activeDayRatio` 的分母。
   * 'all' = 库内最早有记录的一天 → 今天；90d / ytd / custom 各按自己的窗口，
   * **但起点早于首条记录时收敛到首条记录**（v0.7.5：年轻库在 ytd 下不灌水分母）。
   */
  windowDays: number
  /**
   * 记录天数占比（范围内，v0.7.3）：有记录的天数 ÷ 窗口日历天数（0–1）。
   * 「这一个月里，有多少天有我」——温和的存在感指标：不惩罚中断、只累计出现，
   * 对冲「当前连续记录」断零时的惩罚性读数。无窗口时为 0。
   */
  activeDayRatio: number
  /** 当前连续记录（今天没写从昨天起算；范围内） */
  streak: number
  /** 历史最长连续记录天数（范围内） */
  bestStreak: number
  /** 本周（周一起）新增 */
  weekCount: number
  /** 本月新增 */
  monthCount: number
  /** 最近 30 天（含今天）新增 */
  last30Count: number
  /** 最高产的一天（并列取最早的那天） */
  bestDay: BestDay | null
  /**
   * 单日集中度（范围内，v0.7.3）：最高产那一天的条数 ÷ 总条数（0–1）。
   * 回答「这个库是不是被一次性导入 / 单日爆发主导」——占比高时，高峰时段、
   * 星期峰值、月度峰值这些「习惯」指标都被那一天绑架，读数前先看它。
   * 分子只可能有有效日期的条目、分母含无效日期条目，取值因此偏保守。
   */
  maxDayShare: number
  /** 活跃日均：条数 / 有记录天数（一位小数） */
  avgPerActiveDay: number
  /** 平均字数（正文 trim 后的字符数） */
  avgLength: number
  /**
   * 最长一条的字数（正文 trim 后的字符数，v0.5 补）——核心指标「平均长度」的副行用它，
   * 与 `avgLength` 同口径、同一次遍历里一起算，不会互相矛盾。
   */
  maxLength: number
  /** 无标签 Momo 数 */
  untaggedCount: number
  /** 无标签占比（0–1） */
  untaggedRatio: number
  /**
   * 地点统计（v0.9.33，**范围**口径）：规模 / 分布 / 排行 / 洲际覆盖。
   * 与标签体系三层同形——tags 的规模是 tagCount / avgTagsPerEntry，分布是
   * tagCountBuckets，生命是 lifecycle；地点维度照此各就各位。
   */
  loc: LocStats
  /** 地点生命周期（**全库**口径，与 lifecycle 并列的全史概念） */
  locLifecycle: LocLifecycle

  // ---- v0.4.17 扩展维度 ----
  /**
   * v0.7.5 起不再暴露 `range`（当前统计范围）：调用方本来就持有自己传进去的 range
   * （store 的 statsRange / 测试的入参），回显一遍没有消费者——同 longCount 处理。
   */
  /** 上周（完整 7 天）新增——本周的对照基线 */
  weekPrevCount: number
  /** 上个月新增——本月的对照基线 */
  monthPrevCount: number
  /** 最近 30 天里有记录的天数（0–30；活跃率 = 它 / 30） */
  last30ActiveDays: number
  /** 星期分布（范围内）：下标 0 = 周一 … 6 = 周日 */
  weekdayCounts: number[]
  /** 时段分布（范围内）：凌晨 0–5 / 上午 6–11 / 下午 12–17 / 晚上 18–23，各一档 */
  hourBuckets: number[]
  /**
   * 按小时分布（范围内）：下标 0–23 = 本地 0 点–23 点（v0.4.18）。
   * `hourBuckets` 就是它的 4 档合并——两处不各算一遍，避免口径漂移。
   */
  hourlyCounts: number[]
  /**
   * 最近 30 天每天的条数（范围内，v0.4.18）：下标 0 = 29 天前 … 29 = 今天。
   * 合计恒等于 `last30Count`（同一窗口、同一过滤），核心指标的「累计走势」曲线
   * 就是它的前缀和——曲线终点与「+N 30天」角标永远对得上。
   */
  daily30: number[]
  /** 字数分布（范围内，v0.5.3 新维度）：按正文字符数分五档（CHAR_BIN_UPPER），
   *  与「行数分布」互补：行数看「分成几段」，字数看「写了多少」。
   *  （行数分布 `lineBuckets` 与 `LINE_BUCKET_LABELS` 已于 v0.7.2 删除：口径算了出来
   *  却没有任何消费者——页面不展示、报告不输出、测试不断言。） */
  charBins: number[]
  /** 最长笔记 Top 3（范围内，v0.5.3 新维度）：按 trim 后字数降序的**条目本身**，
   *  统计页直接拿它们渲染主页面上那张卡片（只加「正文前三行 / 只读」两条限制） */
  longestNotes: LongNote[]
  /** 标签数分布（范围内，v0.5.3 新维度）：下标 0–3 = 每条 0 / 1 / 2 / 3+ 个标签（按身份键去重后） */
  tagCountBuckets: number[]
  /** 最早有记录的那一天（范围内；无有效日期时为 null）——里程碑行「从 X 开始」用它 */
  firstDay: string | null
  /**
   * 趋势粒度（**全库**，v0.7.4）：跨度 < STATS_WEEK_TREND_DAYS 天 = 'week'，否则 'month'。
   * 跨度 = 库内最早有记录的一天 → 今天（双闭天数）。
   */
  trendGranularity: TrendGranularity
  /**
   * 趋势点序列（**全库**，v0.7.4 起粒度自适应，替代原 monthlyTrend）：
   * 周粒度从最早记录所在的周滚到本周（缺失周补 0，最多 ~10 个周桶——跨度 < 60 天天然有界）；
   * 月粒度从最早有记录的月起（最多 STATS_TREND_MONTHS 个月）到本月（缺失月补 0）。
   */
  trend: TrendPoint[]
  /** 中位字数（偶数条取中间两条均值四舍五入）——比平均字数更抗长文拉偏 */
  medianLength: number
  /**
   * 长记录占比（0–1）。
   * v0.7.5 起不再暴露 `longCount`（条数）：页面只显示占比——年度目标卡（唯一想按
   * 「长记录」计数的消费方）已随本轮移除，参照 lineBuckets 的先例，算了没人要的
   * 字段不许留在接口上。
   */
  longRatio: number
  /** 平均每条标签数（按条目去重后，一位小数） */
  avgTagsPerEntry: number
  /** 标签生命周期（**全库**） */
  lifecycle: TagLifecycle
  /** 条数里程碑（**全库**绝对条数）；越过最后一档后为 null */
  notesMilestone: Milestone | null
  /** 连续记录里程碑（按当前连续天数）；到达最后一档后为 null */
  streakMilestone: Milestone | null
  /**
   * 当前断更（范围内）：距最近一次记录几天（今天有记录 = 0）。
   * v0.6.5 起只保留这一个数——「记录间隔」分析卡（平均间隔 / 最长断更 / 间隔分布）
   * 已移除， streak = 0 时概览条的「已断更 N 天」仍由它供数。
   */
  currentGapDays: number
  /** 记录习惯画像（范围内，v0.6.2）：周末 / 深夜占比、高峰小时、周末 vs 工作日 */
  profile: HabitProfile
}

/** 统计页范围取值（prefs.statsRange 的类型，这里再导出省得调用方反向 import types） */
export type { StatsRange } from '../types'
