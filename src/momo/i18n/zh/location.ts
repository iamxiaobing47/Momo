import type { LocContinent, LocTreeLevel } from '../../locations'

/** 大洲显示名（键 = 规范名，见 locRegions.CONTINENT_LIST）。七块少写一块编译不过。
 *  中文这一列就是规范名本身——中文是这套归属数据的**存储形**。 */
const CONTINENT: Record<LocContinent, string> = {
  亚洲: '亚洲',
  欧洲: '欧洲',
  非洲: '非洲',
  北美洲: '北美洲',
  南美洲: '南美洲',
  大洋洲: '大洋洲',
  南极洲: '南极洲',
}

/**
 * 地点（location，F1 一期；2026-10-01 晚「地点页面」撤除后，地点成了全部笔记的
 * 一个筛选维度 + 两档视图）：侧栏「全部地点」层级树（筛选入口）、地点分组流
 * （视图档）、交叉引用 pill、单卡编辑弹层、批量「添加地点 / 移除地点」弹层、
 * 空态、星球视图。
 * 与 tags 域同级——两处概念平行（都在 frontmatter），文案不互相串门。
 */
export const location = {
  // ---- 分组流（无地点的条目整条不进分组档：不单列虚拟组，也不显示）----
  /** 组头读屏名：`北京，12 条` */
  groupAria: (loc: string, count: number): string => `${loc}，${count} 条`,
  /** 组名 / 地点路径的连接符（v0.9.30 大洲 · 国家 · 地名）：
   *  `亚洲 · 中国 · 北京`。三级的**名字**本身走 `locDisplay.displayLocName`
   *  （2026-10-06 起随界面语言），这里只管分隔它们的那一格。 */
  pathSep: ' · ',
  /** 大洲显示名（键 = `CONTINENT_LIST` 的规范名；国家的三语名从别名表反查，
   *  见 locDisplay.ts，不在这里抄第二份） */
  continent: CONTINENT,

  // ---- 侧栏「全部地点」（v0.9.31 ④，从顶栏跳转钮 + 浮层搬来；2026-10-01 晚起常驻）----
  /** 区块标题 = 全部地点的清单；点一个节点即加一个筛选条件，再点它取消 */
  all: '全部地点',
  /** 层级树节点读屏名（v0.9.31）：`中国，12 条` */
  nodeAria: (label: string, count: number): string => `${label}，${count} 条`,
  /** 展开 / 收起子级的 twisty 读屏名 */
  treeExpand: '展开子级',
  treeCollapse: '收起子级',
  /** 标题行右端那颗漏斗（2026-10-01）：按层级查看这棵树；2026-10-10 起可多选 */
  treeFilterAria: '按层级查看地点',
  /** 浮层里那一组的组名 */
  treeFilterGroup: '层级',
  /** 四档展示名（与 LocTreeLevel 枚举绑定：加了成员忘了写名字 → 编译不过） */
  treeLevel: {
    all: '全部',
    continent: '大洲',
    country: '国家',
    place: '地点',
  } satisfies Record<LocTreeLevel, string>,
  /** 勾选的级下一个节点都没有（如全库只有「外婆家」这类顶级地名时只勾了「国家」） */
  treeLevelEmpty: '勾选的级还没有地点',

  // ---- 交叉引用 pill（多地点）----
  pillAria: (loc: string): string => `按地点筛选：${loc}`,

  // ---- 地点名册（内置世界城市名册，搜索时的建议段）----
  /** 搜索下有库外名册命中时，隔开「库里的地点」与「名册里的城市」的小标题 */
  rosterSection: '城市名册',

  // ---- 空态（全库 0 地点）----
  emptyTitle: '还没有地点',
  emptySub: '给笔记标上地点，就能按地点筛选',
  emptyCta: '去给笔记加地点',
  emptyBack: '先浏览全部笔记',
  /** 空态底部那段 frontmatter 示例（手写是第二条路：面板里建一个、文件里写一行） */
  emptyFmHint: '也可以直接在笔记的 frontmatter 里写：',
  emptyFmKey: 'locations',
  emptyFmItem: '北京',

  // ---- 单卡编辑弹层（卡片操作行第 5 颗 mappin）----
  edit: {
    aria: '编辑地点',
    pick: '搜索或新建地点…',
    /** 勾选即时落盘，所以底部只有「完成」——没有「应用」 */
    done: '完成',
    createNew: (loc: string): string => `新建 ${loc}`,
  },

  // ---- 批量「设地点」（多选 → fab 第 5 / 6 颗：添加地点 / 移除地点）----
  batch: {
    /** fab 上两颗按钮的短字（窄条放得下；2026-10-12 起可访问名就是它自己——
     *  BUG-212：曾有的 ariaAdd / ariaRemove 与它只差一个语境已知的「批量」，
     *  在批量条里属重复，黑底气泡正是那两个键漏的，已删） */
    fabAdd: '添加地点',
    fabRemove: '移除地点',
    /** 底栏左列：`已选 3 条`（2026-10-10 头部标题去掉后，它从头右搬到底左） */
    selected: (count: number): string => `已选 ${count} 条`,
    /** 移除模式唯一的反直觉点，得写出来：候选不列全库，只列这批 Momo 身上真有的 */
    noteRemove: (brand: string): string => `只列这批 ${brand} 真有的地点`,
    pickAdd: '搜索或新建地点…',
    pickRemove: (brand: string): string => `搜索这批 ${brand} 身上的地点…`,
    pendingAdd: '待添加',
    pendingRemove: '待移除',
    /** Q11：批量地点弹层待处理队列 chip 的 ✕ */
    chipRemove: (l: string): string => `移除地点 ${l}`,
    groupAll: '全部地点',
    groupOwned: (brand: string): string => `这批 ${brand} 身上有`,
    emptyNoMatch: '没有匹配的地点',
    emptyNoLocations: '还没有地点，输入后回车新建',
    createNew: (loc: string): string => `新建 ${loc}`,
    summaryNoneOwned: '所选地点都没有，无需改动',
    summaryAllHave: '都已含，无需改动',
    /** 底栏摘要：`待添加 3 个 · 将改动 5 条` */
    summaryCount: (d: { action: string; pending: number; willWrite: number }): string =>
      `${d.action} ${d.pending} 个 · 将改动 ${d.willWrite} 条`,
    /** 右列：会新添到几条上 / 会从几条上摘掉 */
    rowAdd: (n: number): string => `+${n}`,
    rowRemove: (n: number): string => `−${n}`,
    rowHas: '已含',
    /** 行内读屏名（BUG-176e：右列是 `+N / 已含 / −N` 这类裸数字，aria-label 必须
     *  按同一口径讲完整——旧实现固定念组条数，与右列可见数字对不上） */
    rowAddAria: (loc: string, n: number): string => `${loc}，会新添到 ${n} 条`,
    rowHasAria: (loc: string): string => `${loc}，已在选中的这批里`,
    rowRemoveAria: (loc: string, n: number): string => `${loc}，会从 ${n} 条上摘掉`,
    applyingAdd: '添加中…',
    applyingRemove: '移除中…',
    applyAdd: '添加地点',
    applyRemove: '移除地点',
  },

  // ---- 输入校验（面板内即时提示，不进 Notice）----
  /** 超过字数上限时输入框下方的红字。BUG-126d：数字从真源入参（调用点传
   *  LOCATION_MAX_CHARS），不许在字典里手写 20 —— 上限一改，这里自动跟。 */
  tooLong: (max: number): string => `地点最长 ${max} 字`,
  /** 大洲名（CONTINENT_NAMES 成员）不能当地点：写它会把分组第一级当地点（BUG-52） */
  continentName: '大洲名不能作为地点',
  /** 每篇 / 队列到上限后再加会被写侧截断，输入侧提前拦（BUG-52）。
   *  BUG-126d：上限从真源入参（调用点传 LOCATIONS_MAX），同上不许手写 8。 */
  tooMany: (max: number): string => `一篇最多 ${max} 个地点`,

  // ---- 写盘的汇总提示（caps 层 Notice）----
  // 全量成功不弹（结果当场可见）；有跳过 / 失败、与「已选 N 条」对不上时才弹。
  notice: {
    /** 批量加地点有跳过 / 失败时：`改动 3 条 · 跳过 2 条 · 失败 1 条`（0 项不出现） */
    addDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `已添加地点：改动 ${d.updated} 条${d.skipped > 0 ? `，跳过 ${d.skipped} 条` : ''}${
        d.failed > 0 ? `，失败 ${d.failed} 条` : ''
      }`,
    /** 批量移除地点有跳过 / 失败时：与 addDone 一套措辞 */
    removeDone: (d: { updated: number; skipped: number; failed: number }): string =>
      `已移除地点：改动 ${d.updated} 条${d.skipped > 0 ? `，跳过 ${d.skipped} 条` : ''}${
        d.failed > 0 ? `，失败 ${d.failed} 条` : ''
      }`,
  },

  // ---- 星球视图与地点分组流（2026-10-01 晚起是「全部笔记」的两档视图）----
  globe: {
    /** 视图分段里那两颗（2026-10-01 从独立按钮搬进来，晚些时候随地点页面撤除
     *  成了全部笔记的视图档）：aria 名；开着还是关着由 aria-pressed 说 */
    toggleAria: '星球视图',
    /** 舞台的读屏名（canvas 对读屏不可见，一句旁白代替；锚点在球上直接点） */
    stageAria: (n: number): string => `星球，${n} 个地点锚点；点锚点筛选下方的卡片`,
    stageEmpty: '星球，暂无可显示的锚点',
    /** BUG-81a：笔记写了地点、但一个坐标都解析不到时的球下提示。
     *  「一条地点都没有」走 LocationEmpty 的入门空态，这里是另一种空——
     *  地点在、坐标缺（手填地名不在字典，也没填经纬度），黑球零光点零解释
     *  像功能性故障。只指路，不给按钮（设置入口在 ui/ 够不着 Obsidian）。 */
    noCoordsHint: '笔记写了地点，但它们还没有坐标——在 设置 → 地点 里补上经纬度，光点才会上球。',
    /** BUG-122b：地球贴图解码失败（插件目录里的贴图缺失或损坏），手上一颗球都没有时的持续态说明 */
    // v1.0.0：贴图缺失多半就是没装「星球资源包」（商店 / BRAT 只下发三件套）——
    // 说明条自带下载钮，用户在这**一页**就能补上，不必再去设置里找。
    textureFailed: '地球贴图没能加载，球面暂时画不出来——光点照常可点。下载「星球资源包」即可补回贴图文件（约 7MB，插件唯一的联网动作）。',
    packDownload: '下载星球资源包',
    packDownloading: (done: number, total: number): string => `正在下载 ${done}/${total}…`,
    packFailed: (n: number): string => `下载失败（${n} 件）——检查网络后重试`,
    packFailedMissing: '这一版还没有发布资源包（Release）——可去 GitHub 下完整包，或等作者发版',
    packFailedCorrupt: (n: number): string => `下载内容校验不过（${n} 件）——可能被代理 / 镜像改写，重试或走完整包`,
  },
  /** 「地点分组」那一档的 aria 名（分组流：按地点连成一条流往下滚） */
  groupViewAria: '按地点分组',
}
