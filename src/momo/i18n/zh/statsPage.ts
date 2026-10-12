/**
 * 统计页（Stats.tsx / StatsHeatmap 之外的部分）。
 *
 * 卡片标题集中在 `cardTitle`：设置页的区块开关列表按 `STATS_GROUPS` 分组展示，
 * 名字必须与页面上的卡头一致——两处共用这一份，别各写各的。
 */
export const statsPage = {
  /** 下钻 tooltip：点统计数字带着筛选跳回全部笔记（v0.7.0） */
  drill: {
    /** 统一前缀（测试要按它断言「这页有哪些下钻入口」，别在测试里抄一遍） */
    prefix: '跳转到全部笔记 · 筛选：',
    label: (label: string): string => `跳转到全部笔记 · 筛选：${label}`,
    /** 带补充说明的一格：`跳转到全部笔记 · 筛选：长记录占比（≥ 200 字）` */
    labelHint: (label: string, hint: string): string => `跳转到全部笔记 · 筛选：${label}（${hint}）`,
    hours: (d: { hour: number; count: number }): string =>
      `跳转到全部笔记 · 筛选：${d.hour} 点（${d.count} 条）`,
    weekday: (d: { weekday: string; count: number }): string =>
      `跳转到全部笔记 · 筛选：${d.weekday}（${d.count} 条）`,
    /** 趋势柱 · 周粒度（v0.9.5 起趋势柱可下钻）：`跳转到全部笔记 · 筛选：2026-09-14 起当周（12 条）` */
    week: (d: { from: string; count: number }): string =>
      `跳转到全部笔记 · 筛选：${d.from} 起当周（${d.count} 条）`,
    /** 趋势柱 · 月粒度：`跳转到全部笔记 · 筛选：2026 年 9 月（12 条）` */
    month: (d: { axis: string; count: number }): string =>
      `跳转到全部笔记 · 筛选：${d.axis}（${d.count} 条）`,
    tag: (path: string): string => `跳转到全部笔记 · 筛选：#${path}`,
    /** 地点维度（v0.9.33；2026-10-01 晚起也跳全部笔记）：把该地点设成地点筛选
     *  （store 的 filterByLocation）——与标签那份同一句式，前缀不再有差别 */
    location: (label: string): string => `跳转到全部笔记 · 筛选地点：${label}`,
    tagCountBin: (label: string): string => `跳转到全部笔记 · 筛选：${label}标签`,
    /** 标签数分布 · 0 档专用：0 档的 label 是「无标签」，已自含名词，不能再过
     *  tagCountBin（会拼出「无标签标签」，BUG-13） */
    untagged: '跳转到全部笔记 · 筛选：无标签',
  },

  /** 全库为空时的空态 */
  empty: {
    title: '还没有统计数据',
    sub: (brand: string): string => `记下第一条${brand}后，这里会长出你的记录习惯`,
  },

  /** 概览条 */
  overview: {
    title: '记录概览',
    weekRhythm: '本周节奏',
    /** `↑ 上周 +3`（箭头由调用方给） */
    weekVsPrev: (d: { arrow: string; prev: number }): string => `${d.arrow} 上周 +${d.prev}`,
    streak: '连续记录',
    streakOngoing: '正在进行',
    /** `已断更 4 天` */
    streakBroken: (days: number): string => `已断更 ${days} 天`,
    streakToday: '今天还没写',
    activeRatio: '记录天数占比',
    activeRatioSub: (d: { days: number; windowDays: number }): string => `${d.days} / ${d.windowDays} 天`,
    peakHours: '高产时段',
    /** `12 条落在这里` */
    peakSub: (count: number): string => `${count} 条落在这里`,
    noRecords: '还没有记录',
    weekend: '周末记录',
    weekendNoSample: '周末或工作日缺样本',
    weekendMore: '周末更活跃',
    weekdayMore: '工作日更活跃',
    weekendSame: '工作日周末差不多',
  },

  /** 自定义范围编辑条 */
  range: {
    from: '开始日期',
    to: '结束日期',
    /** 两个日期输入框之间的连接词 */
    sep: '至',
    /** 快捷档：`近 30 天` */
    preset: (days: number): string => `近 ${days} 天`,
    apply: '应用',
  },

  /** 趋势卡 */
  trend: {
    /** 卡头 pill：`峰值 9 月 · 12 条` */
    peak: (d: { label: string; count: number }): string => `峰值 ${d.label} · ${d.count} 条`,
    /** 「记录时间」卡头 pill：`14 点 · 12 条`（不带「峰值」前缀） */
    peakHour: (d: { hour: number; count: number }): string => `${d.hour} 点 · ${d.count} 条`,
    /** 轴右端的「本周 / 本月」收尾 */
    lastWeek: (label: string): string => `${label} · 本周`,
    lastMonth: (label: string): string => `${label} · 本月`,
  },

  /** 核心指标行 */
  kpi: {
    total: '总笔记',
    /** `+12 30天` */
    last30: (count: number): string => `+${count} 30天`,
    /** `最长 2519 字` */
    maxLength: (chars: number): string => `最长 ${chars} 字`,
    tags: '标签',
    /** `平均每条 2.3 个标签` */
    avgTags: (avg: number): string => `平均每条 ${avg} 个标签`,
    activeDays: '记录天数',
    active30Label: '近 30 天活跃',
    /** `12 / 30 天` */
    active30Value: (active: number): string => `${active} / 30 天`,
  },

  /** 内容质量卡 */
  quality: {
    avg: '平均字数',
    median: '中位字数',
    longRatio: '长记录占比',
    /** `≥ 200 字` */
    longHint: (minChars: number): string => `≥ ${minChars} 字`,
    untagged: '无标签',
  },

  /** 里程碑 */
  milestone: {
    /** 条数里程碑：`第 1000 条笔记` */
    notes: (target: number): string => `第 ${target} 条笔记`,
    /** 连续记录里程碑：`连续记录 30 天` */
    streak: (target: number): string => `连续记录 ${target} 天`,
    /** `还差 12 条` */
    remaining: (d: { remaining: number; unit: string }): string => `还差 ${d.remaining} ${d.unit}`,
    next: '接下来',
    allDone: '所有里程碑档位都已达成',
    /** `从 06-14 开始` */
    since: (day: string): string => `从 ${day} 开始`,
  },

  /** 记录习惯卡 */
  habits: {
    currentStreak: '当前连续记录',
    bestStreak: '最长连续记录',
    monthNew: '本月新增',
    /** 单位位的「上月 N」 */
    monthPrev: (count: number): string => `上月 ${count}`,
    avgPerActiveDay: '活跃日日均',
    bestDay: '最高产的一天',
    /** 带日期：`最高产的一天 · 09-14` */
    bestDayOn: (md: string): string => `最高产的一天 · ${md}`,
    maxDayShare: '单日集中度',
  },

  /** 页面小节标题（`星期分布` / `附件趋势` 这类 sub-sec） */
  subSection: {
    weekdayDist: '星期分布',
    newTags: '新开标签 · 近 30 天首次出现',
    coldTags: '冷掉的标签 · 90 天以上没更新',
    attachmentTrend: '附件趋势',
    continentCoverage: '各大洲条数',
    newLocs: '新开的地点 · 近 30 天第一次去',
    coldLocs: '冷掉的地点 · 90 天以上没再去',
    recentLocs: '最近去过',
  },

  /** 卡片标题（设置页的区块开关列表共用同一份，两处必须一致） */
  cardTitle: {
    trend: '记录趋势',
    time: '记录时间',
    habits: '记录习惯',
    milestones: '里程碑进度',
    lifecycle: '标签生命周期',
    tagDist: '标签数分布',
    lengthDist: '字数分布',
    records: '最长笔记',
    review: '回顾',
    attachments: '附件统计',
    locScale: '足迹规模',
    locRank: '地点排行',
    locDist: '地点数分布',
    locLifecycle: '地点生命',
  },

  /** 标签生命周期卡 */
  tagLife: {
    noTags: '还没有标签',
    newNone: '这 30 天没有开新标签',
    coldNone: '近 90 天都有更新，没有冷掉的标签',
    /** `3 条 · 45 天没更新` */
    coldValue: (d: { count: number; days: number }): string => `${d.count} 条 · ${d.days} 天没更新`,
    singleUse: '一次性标签',
    /** `3 / 12（25%）` */
    singleUseValue: (d: { count: number; total: number; ratio: string }): string =>
      `${d.count} / ${d.total}（${d.ratio}）`,
    top3: 'Top 3 集中度',
  },

  /** 最长笔记卡 */
  records: {
    empty: '还没有数据',
  },

  /** 回顾卡 */
  review: {
    recent30: '近 30 天回顾',
    recent7: '近 7 天回顾',
    oldest: '最久未回顾',
    reviewed: '已回顾',
    unreviewed: '未回顾',
    coverage: '覆盖率',
  },

  /** 附件统计卡 */
  attachments: {
    total: '附件总数',
    totalBytes: '总体积',
    entriesWithImages: (brand: string): string => `带图 ${brand}`,
    imageRatio: '带图占比',
  },

  /** ⑤ 地点组（v0.9.33）：足迹规模 / 地点排行 / 地点数分布 / 地点生命 */
  loc: {
    /** 四张卡共用的空态脚注：范围内一个地点都没有 */
    empty: '还没有地点',
    /** 足迹规模卡的五行标量 */
    scale: {
      locCount: '地点总数',
      country: '国家',
      continent: '大洲',
      avgLocs: '平均每条地点',
      /** 无地点行：条数 + 占比都由调用方拼（`3 条 · 75%`） */
      noLoc: (d: { count: number; ratio: string }): string => `无地点（${d.count} 条 · ${d.ratio}）`,
    },
    /** 地点排行卡：行值 */
    rankValue: (count: number): string => `${count} 条`,
    /** 地点生命卡 */
    life: {
      newNone: '这 30 天没有去新地方',
      coldNone: '近 90 天都去过，没有冷掉的地点',
      recentNone: '还没有地点',
      /** `3 条 · 45 天没去` */
      coldValue: (d: { count: number; days: number }): string => `${d.count} 条 · ${d.days} 天没去`,
      singleVisit: '一次性地点',
      /** `2 / 8（25%）` */
      singleVisitValue: (d: { count: number; total: number; ratio: string }): string =>
        `${d.count} / ${d.total}（${d.ratio}）`,
      top3: 'Top 3 地点集中度',
    },
  },
}
