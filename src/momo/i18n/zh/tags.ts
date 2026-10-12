/**
 * 标签相关：侧栏标签树（TagTree）、管理标签弹层（TagEditMenu）、批量加/去标签弹层（BatchTagPicker）。
 * 三处共用「全部标签 / 没有匹配的标签 / 置顶」这些词，集中一份免得措辞漂移。
 */
export const tags = {
  // ---- 侧栏标签树 ----
  collapseChildren: '收起子标签',
  expandChildren: '展开子标签',
  pinnedArea: '置顶',
  pinHint: '右键下面的标签可置顶',
  all: '全部标签',
  filterPlaceholder: '过滤标签...',

  // ---- 侧栏标签区的排序与筛选（v0.9.18）----
  /** 「全部标签 N」右侧的排序按钮；按钮文字是**当前键名**（见 copy.meta.tagSort） */
  sortAria: '标签排序',
  /** 漏斗按钮的无障碍名 */
  filterAria: '筛选标签',
  /** 两组的组名（各自的选项名在 copy.meta.tagTimeFilter / tagAttachmentFilter） */
  filterGroupTime: '最近使用',
  filterGroupAttachment: '附件',
  /** 筛选浮层底部：一次清空两组（不碰上面的名称输入框） */
  filterClear: '清除全部',
  /** 筛选把标签列表清空时的空态（置顶区不受影响，仍在上面） */
  filterEmpty: '没有符合条件的标签',
  /** 上面那个空态里的按钮 */
  filterEmptyClear: '清除筛选',
  /** 排序按钮的无障碍名 / title：`按数量排序`（按钮上只显示键名，这句留给读屏与 hover） */
  sortButton: (name: string): string => `按${name}排序`,
  /** 摘要条上那枚条件 chip 的无障碍名：`移除筛选：7 天` */
  filterChipRemove: (name: string): string => `移除筛选：${name}`,

  // ---- 多选标签的组合方式（2026-10-12，并集 / 交集）----
  /** 过滤框右侧那颗按钮的无障碍名。与工具行漏斗的 `filterAria`（筛选标签）分清：
      那一个定「侧栏显示哪些标签行」，这一个定「主区怎么组合已选中的标签」——两件事
      在侧栏上下相邻，名字必须分得开，否则用户以为点重了。 */
  matchAria: '标签组合方式',
  /** 浮层组名（无标题弹层里它就是标题，BUG-160） */
  matchGroup: '多个标签怎么组合',
  /** 组名下一行口径说明（同 filterHintTime 的规矩：两组都被人问过「这是啥意思」，
      一句话说清；准话在 matched.ts 的标签分支） */
  matchHint: '同时选中几个标签时，主区显示哪些笔记',
  /** 两行选项各带一句口径（选项名在 `copy.meta.tagMatch`，枚举绑定防漏） */
  matchUnionHint: '含任一选中标签即显示',
  matchIntersectionHint: '必须同时含全部选中标签',

  // ---- 管理标签弹层（右键标签 chip 唤起）----
  manageAria: '标签管理',
  renamePlaceholder: '改名为…（支持 父/子）',
  /** 改名预览：`把 #读书（含子标签）改为 #阅读` */
  previewRename: (from: string, to: string): string => `把 #${from}（含子标签）改为 #${to}`,
  mergeSection: '合并到已有标签',
  noMatch: '没有匹配的标签',
  /** 候选项右侧的「共 N」 */
  total: (count: number): string => `共 ${count}`,
  // 2026-10-10 起没有 deleteTitle（BUG-160：所有 dialog 左上角都不放标题）——确认框标题与主动作按钮重复
  deleteMessage: (tag: string, brand: string): string =>
    `会从所有 ${brand} 里移除 #${tag}（只删这个标签本身，不动它的子标签）。`,
  deleteConfirm: '删除标签',
  /** 写入中的按钮文案（改名 / 删除共用） */
  writing: '写入中…',
  rename: '改名',

  // ---- 批量加 / 去标签弹层 ----
  batch: {
    /** 底栏左列：`已选 3 条`（2026-10-10 头部标题去掉后，它从头右搬到底左） */
    selected: (count: number): string => `已选 ${count} 条`,
    /** 去模式唯一的反直觉点，得写出来 */
    noteRemove: '只摘标签本身，不动子标签',
    pickRemove: (brand: string): string => `搜索这批 ${brand} 身上的标签…`,
    pickAdd: '搜索或新建标签…',
    pendingRemove: '待移除',
    pendingAdd: '待添加',
    /** Q11：批量标签弹层待处理队列 chip 的 ✕（读屏要点名删哪一枚） */
    chipRemove: (t: string): string => `移除标签 #${t}`,
    groupCooccur: '常一起出现',
    groupAll: '全部标签',
    groupOwned: (brand: string): string => `这批 ${brand} 身上有`,
    emptyNoMatch: '没有匹配的标签',
    emptyNoneOwned: (brand: string): string => `选中的 ${brand} 还没有标签`,
    emptyNoTags: '还没有标签，输入后回车新建',
    createNew: (tag: string): string => `新建 #${tag}`,
    summaryNoneOwned: '所选标签都没有，无需改动',
    summaryAllHave: '都已含，无需改动',
    /** 底栏摘要：`待添加 3 个 · 将改动 5 条` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending} 个 · 将改动 ${d.willWrite} 条`,
    /** 加模式下「这条已经全含」的行标记 */
    rowHas: '已含',
    applyingRemove: '移除中…',
    applyingAdd: '添加中…',
    applyRemove: '移除标签',
    applyAdd: '添加标签',
  },

  // ---- 写盘的汇总提示（caps 层 Notice；ui/ 不 import obsidian）----
  // 全量成功不弹（结果当场可见）；有跳过 / 失败、与「已选 N 条」对不上时才弹。
  notice: {
    /** 批量加标签有跳过 / 失败时：`改动 3 条 · 跳过 2 条 · 失败 1 条`（0 项不出现） */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `已添加标签：改动 ${d.updated} 条${d.skipped > 0 ? `，跳过 ${d.skipped} 条` : ''}${
        d.failed > 0 ? `，失败 ${d.failed} 条` : ''
      }`,
    /** 批量移除标签有跳过 / 失败时：与 addDone 一套措辞，「本就没有」的跳过数也得说清 */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `已移除标签：改动 ${d.updated} 条${d.skipped > 0 ? `，跳过 ${d.skipped} 条` : ''}${
        d.failed > 0 ? `，失败 ${d.failed} 条` : ''
      }`,
    /** 改名/合并有失败时：`已把 #读书（含子标签）改为 #阅读（3 条）` */
    renamed: (d: { from: string; to: string; updated: number; failed: number }): string =>
      `已把 #${d.from}（含子标签）改为 #${d.to}（${d.updated} 条）${
        d.failed > 0 ? `，失败 ${d.failed} 条` : ''
      }`,
    /** 删除标签有失败时（只删精确匹配那一个，与 deleteMessage 同口径） */
    deleted: (d: { tag: string; updated: number; failed: number }): string =>
      `已从 ${d.updated} 条中移除 #${d.tag}${d.failed > 0 ? `，失败 ${d.failed} 条` : ''}`,
  },
}
