// 统计口径的阈值与分档定义（单一真源）：compute / coverage / 页面共用。
// 数字变了只改这里——一处改动，`computeStats`、统计页与设置面板同步生效。

/** 长记录阈值（正文 trim 后字符数） */
export const STATS_LONG_NOTE_CHARS = 200

/**
 * 「新开」的窗口：含今天往回 N-1 天。**标签与地点共用**（v0.9.33 地点生命周期
 * 上线时同一把尺子）——「30 天内第一次出现」对两个维度是同一个意思。
 */
export const STATS_NEW_TAG_DAYS = 30

/** 「冷掉」的门槛：距最后一次出现 ≥ N 天。标签与地点共用（同上） */
export const STATS_COLD_DAYS = 90

/** 生命周期里新开 / 冷掉 / 最近去过列表各取前多少名（标签与地点共用） */
export const STATS_LIFECYCLE_TOP = 5

/** 地点排行卡的 Top N（v0.9.33）： scope 口径，条数降序 + 地名次级排序 */
export const STATS_LOC_RANK_TOP = 10

/** 最长笔记卡的 Top N（BUG-126e：原 compute.ts 里的裸 `3` 起名的常量——
 *  设置页「最长笔记」desc 与内核生效范围共用这一把尺子） */
export const STATS_LONGEST_TOP = 3

/** 月度趋势最多回看多少个月 */
export const STATS_TREND_MONTHS = 12

/**
 * 趋势按周的跨度门槛（天，v0.7.4）：全库跨度小于它 → 周柱，否则 → 月柱。
 * 60 天以下按月只剩 2–3 根柱子（本月往往只过了几天），周粒度才读得出形状。
 */
export const STATS_WEEK_TREND_DAYS = 60

/**
 * 时段档名 / 星期名 / 字数档 / 标签数档：全部在 `copy.date` 与 `copy.meta`（单一真源）。
 * 此前这里各写一份，Stats.tsx / StatsHeatmap / dateGroups 里又各写一份（光星期名就四份、
 * 下标起点还不一样）——抽字典时一并收掉了。
 */

/** 字数分布的上界（含）：charBins 下标 i = CHAR_BIN_UPPER[i-1] < 字数 ≤ CHAR_BIN_UPPER[i] */
export const CHAR_BIN_UPPER = [50, 150, 300, 800] as const

/**
 * 标签数 / 地点数分档的**最高下标**（0 / 1 / 2 / 3+ 四档，末档含「及以上」）。
 * 桶数组长度 = 本常量 + 1；字典 `meta.tagCountBin` / `meta.locCountBin` 也必须是这个长度
 * （`copy-drift-guard` 有一条等长断言盯着）。L3：此前 `Math.min(3, …)` 与 `[0,0,0,0]`
 * 在 compute.ts 与 stats/locations.ts 各写一遍，加第五档时漏改任何一处，消费侧的 `?? ''`
 * 会把那一档安静地渲染成空标签——统计页出现一颗没有名字的分布条，且没有任何编译错误。
 */
export const STATS_COUNT_BUCKET_MAX = 3

/** 一天的毫秒数（T6）：整天数差只在 stats 里出现，别再手写裸 86400000——
 *  「冷掉几天」「连续记录」三处曾各写一遍，D4 收掉两处、这里收掉最后一处。 */
export const DAY_MS = 86_400_000
