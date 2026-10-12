/**
 * 与**枚举/类型绑定**的展示元数据（配色名、图标名、统计分组名……）。
 *
 * 为什么这些不按界面域分：它们的键是**领域枚举**（`ColorScheme` / `BrandIcon` /
 * `StatsGroupKey`），用 `Record<枚举, …>` 声明后，
 * 「枚举加了成员却忘了写文案」会在编译期被抓到——这正是原来那些表里内联中文时的好处，
 * 抽字典不能把它丢掉。
 *
 * `import type` 指回 domain：**只取类型、运行时被擦除**，不构成 i18n ↔ types 的运行时循环
 * （types.ts 需要 copy 才能填这些表，两边只能靠 type-only 引用解开）。
 */
import type { BrandIcon, BundledFontId, ColorScheme, StatsGroupKey, TagSortKey } from '../../types'
import type { TagAttachmentFilter, TagTimeFilter } from '../../tags'
import { CHAR_BIN_UPPER } from '../../stats/constants'

/**
 * 字数分布的档位标签：**数字全部由 CHAR_BIN_UPPER 派生**（BUG-105b）。
 * 手抄过一次「末档写 800 以上」——边界是「上界含」，末档其实是 ≥ 801，
 * 于是 800 同时出现在两档标签里、下钻筛的却是 ≥ 801，屏幕上两个数字打架。
 * 数字从常量来，「抄错数」在物理上不可能发生；改动只发生在 constants.ts。
 */
const charBin: string[] = [
  ...CHAR_BIN_UPPER.map((upper, i) =>
    i === 0 ? `≤ ${upper} 字` : `${CHAR_BIN_UPPER[i - 1] + 1}–${upper} 字`,
  ),
  `${CHAR_BIN_UPPER[CHAR_BIN_UPPER.length - 1] + 1} 字以上`,
]

export const meta = {
  /** 统计页五个语义域的组标题（顺序由 types.ts 的 STATS_GROUPS 决定） */
  statsGroup: {
    output: '我的产出',
    rhythm: '记录节奏',
    tagSystem: '标签体系',
    locations: '地点',
    content: '内容与回顾',
  } satisfies Record<StatsGroupKey, string>,

  /** 配色方案：全名（方案卡主文字）+ 一句话说明（卡内次文字）。
   *  v0.9.3 起不再有窄位名 short：选择器从四段分段控件换成方案卡，格子够宽，
   *  为截断服务的短名随之退场。
   *  v0.9.12 改名两处（用户反馈「颜色和名字不符」）：名字一律点明**底色家族 +
   *  签名色**，让色卡预览条上看到的三段在名字里就有——stone 的古铜签名色
   *  (#7c6647) 一直比墨 (仅主按钮) 更抢眼，旧名「石白墨黑（默认）」漏了它；
   *  「（默认）」不写进名字（同 brandIcon 的约定）。stone 已于 2026-10-09 删除，
   *  这条命名规矩留给后来的几套。
   *  v0.9.9 起六套、v0.9.10 起十套，2026-10-04 收编为四套（2026-10-07 加过
   *  qingmang「青芒」与 clam-white「蛤白」成六套，10-09 删 qingmang 与 stone 回到四套，
   *  同日加 stepfun「StepFun」成五套）：
   *  desc 一律点明**底色家族 + 签名色**——色卡的差异不只在签名色，底色也拉开了。
   *  **键序 = 展示顺序**（COLOR_SCHEMES）：2026-10-11 用户裁定「默认是雾蓝，它
   *  排在第一个」——与 brandIcon 的 leaf 同款，排第一即是默认。
   *  2026-10-12 用户裁定 id 改用方案名本身的英文（`notion`→`mist-blue` …，映射见
   *  types/prefs.ts 的改名注）——名字文案一个没改，只换键。 */
  colorScheme: {
    'mist-blue': {
      name: '雾蓝',
      desc: '纯白底 + 灰细线 + 雾蓝色强调。',
    },
    'moss-green': {
      name: '苔绿',
      desc: '近白底 + 纯白卡片 + 鲜绿主题。',
    },
    'clam-white': {
      name: '蛤白',
      desc: '暖蛤白纸面 + 石青交互 + 朱砂活跃度，取自敦煌矿物颜料。',
    },
    stepfun: {
      name: 'StepFun',
      desc: '晴空青纸面 + 电光阶跃蓝 + 薄荷青→青→蓝→紫的活跃度渐变，主行动用像素紫。',
    },
    'ink-night': {
      name: '墨夜',
      desc: '深炭底 + 浅字 + 琥珀主题（暗色）。',
    },
  } satisfies Record<ColorScheme, { name: string; desc: string }>,

  /** 左上角品牌图标名（形状由 icons.tsx 的 PATHS 决定；设置页是一格一枚的形状选择器，
   *  名字一律短——「默认」不写进名字里，leaf 排第一即是默认） */
  brandIcon: {
    leaf: '叶子',
    stack: '三层堆叠',
    flame: '火苗',
    pencil: '铅笔',
    tag: '标签',
    clock: '时钟',
    shuffle: '洗牌',
    chart: '柱状图',
  } satisfies Record<BrandIcon, string>,

  /** 内置开源字体的名字（v0.9.16，设置页字体格子的主文字；id = types/prefs.ts
   *  BUNDLED_FONTS 的键，Record 全键覆盖，漏一个编译不过）。字体名是专有名词：
   *  中文环境用通称「霞鹜文楷 / 思源黑体 / 思源宋体」，JetBrains Mono 本就是
   *  拉丁名不另译。 */
  fontName: {
    wenkai: '霞鹜文楷',
    notosans: '思源黑体',
    notoserif: '思源宋体',
    jetbrains: 'JetBrains Mono',
  } satisfies Record<BundledFontId, string>,

  /** 字数分布的五个档（下标与 stats.ts 的 charBins 一一对应）；数字由上方 charBin 派生 */
  charBin,

  /** 每条 Momo 标签数的四档（与 tagCountBuckets 下标一一对应） */
  tagCountBin: ['无标签', '1 个', '2 个', '3 个及以上'],

  /** 每条 Momo 地点数的四档（v0.9.33，与 locCountBuckets 下标一一对应）；
   *  0 档自含「无地点」，与 tagCountBin[0] 同款句式 */
  locCountBin: ['无地点', '1 个', '2 个', '3 个及以上'],

  /** 侧栏标签区的排序键名（v0.9.18）。排序浮层按 TAG_SORT_KEYS 的顺序渲染 */
  tagSort: {
    count: '数量',
    attachments: '附件数',
    name: '名称',
  } satisfies Record<TagSortKey, string>,

  /** 侧栏标签区 · 最近使用组（v0.9.18）。窗口说的是「标签下最新一篇笔记落在几天内」，
   *  chip 带上「内」字——光写「7 天」会被读成「7 天前那一天」。 */
  tagTimeFilter: {
    all: '全部',
    '7d': '7 天内',
    '30d': '30 天内',
    '90d': '90 天内',
    older: '更早',
  } satisfies Record<TagTimeFilter, string>,

  /** 侧栏标签区 · 附件组（v0.9.18） */
  tagAttachmentFilter: {
    all: '全部',
    with: '有配图',
    without: '纯文字',
  } satisfies Record<TagAttachmentFilter, string>,

}
