/**
 * 主面板（App / Card / Composer / 筛选胶囊 / 多选工具栏 / 统计页顶栏）。
 * 品牌词一律走 `brand` 入参：`prefs.brandName` 用户可改。
 */
import type { SortKey } from '../../types/prefs'

export const panel = {
  /** 发布框（Composer） */
  composer: {
    entry: (brand: string): string => `新建${brand}并在 Obsidian 编辑器中打开`,
    /** 按钮上的文字 */
    placeholder: '写点什么',
  },

  /** 置顶（Momo 右键菜单 / 管理标签弹层「置顶区」共用同一对词） */
  pin: '置顶',
  unpin: '取消置顶',

  /** 补记（筛选条入口：日期筛选只剩一天时那枚按钮；入参 = 本地日 YYYY-MM-DD） */
  backfill: {
    toDay: (day: string): string => `补记到 ${day}`,
  },

  /** 侧栏导航 */
  nav: {
    allNotes: '全部笔记',
    review: '随机回顾',
    stats: '统计',
    trash: '回收站',
  },

  /** 窄档（≤620px）顶栏那枚模式分段的容器读屏名——侧栏被藏起来后它取代整条菜单 */
  navAria: '切换视图',

  /** 侧栏速览三格 */
  quickStats: {
    notes: '笔记',
    tags: '标签',
    days: '天数',
  },

  /** 侧栏显隐 */
  sidebar: {
    collapse: '收起侧栏',
    expand: '展开侧栏',
    /** 拖宽手柄的无障碍名（role=separator，键盘 ← → ±24px）——BUG-128f */
    resizeAria: '拖拽调整侧栏宽度',
  },

  searchPlaceholder: '搜索笔记',

  /** 视图密度切换（分段控件） */
  density: {
    aria: '视图切换',
    list: '列表视图',
    focus: '焦点视图：纵向滚动，一张占焦点，上下卡片毛玻璃',
  },

  /** 排序（顶栏那颗排序按钮 + 它的两段式菜单；state 是 SortMode 四值枚举） */
  sort: {
    /** 弹层的无障碍名（弹层里另有「排序依据 / 排序方向」两个分组名） */
    menuAria: '排序方式',
    /** 两组的分组名（与侧栏「全部标签」的排序浮层同一套说法，别造第二个词） */
    groupKey: '排序依据',
    groupDir: '排序方向',
    asc: '由旧到新',
    desc: '由新到旧',
    key: {
      updated: '更新时间',
      created: '创建时间',
    } satisfies Record<SortKey, string>,
    /** 按钮的 title / aria：`排序：更新时间 · 由新到旧`（两个入参都已是本地化文案，
     *  顺序即「先依据、后方向」——与弹层里两组的先后一致） */
    button: (key: string, dir: string): string => `排序：${key} · ${dir}`,
  },

  /** 多选 */
  select: {
    enter: '多选',
    all: '全选',
    exit: '退出多选',
    cancelAria: '取消多选',
    /** 底部浮条：`已选 3 项` */
    count: (n: number): string => `已选 ${n} 项`,
  },

  /** 筛选条的胶囊 */
  chip: {
    untagged: '未归类',
    /** `时段 22 点` */
    hours: (label: string): string => `时段 ${label}`,
    /** `301–800 字标签`（字数/标签数胶囊后面的「标签」） */
    tagCount: (range: string): string => `${range}标签`,
    reviewed: '已回顾',
    unreviewed: '未回顾',
    reviewed7: '近 7 天回顾',
    reviewed30: '近 30 天回顾',
    /** 区间胶囊：`≤ 50 字` / `≥ 801 字` / `301–800 字` */
    range: {
      atMost: (max: number, unit: string): string => `≤ ${max} ${unit}`,
      atLeast: (min: number, unit: string): string => `≥ ${min} ${unit}`,
      between: (min: number, max: number, unit: string): string => `${min}–${max} ${unit}`,
    },
  },

  /** 空态 / 加载态 */
  empty: {
    loading: '加载中…',
    /** 全库为空 */
    title: '暂无内容',
    /** `点上方「写点什么…」记下第一条`（入参 = 发布框文案） */
    hint: (composerLabel: string): string => `点上方「${composerLabel}…」记下第一条`,
    /** 筛选把结果筛空了 */
    filtered: (brand: string): string => `没有符合筛选的${brand}`,
    clearFilters: '清除筛选',
  },

  /** Q12：焦点档可聚焦滚动容器（role=group + tabIndex=0，方向键翻卡）的可及名 */
  focusStageAria: '焦点视图，用方向键或 Home/End 翻卡',

  /** 底部多选批量条（「导出已选」随导出整块移除） */
  batch: {
    addTag: '加标签',
    removeTag: '去标签',
  },

  /** 统计页顶栏右侧（只剩范围分段；导出三件套已于本轮移除） */
  statsToolbar: {
    rangeAria: '统计范围',
    range: {
      all: '全部',
      d90: '近 90 天',
      ytd: '今年',
      custom: '自定义',
    },
  },
}
