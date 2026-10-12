import { isTagAncestor } from '../../momo/tags'
import { locFullKey, locNodeCovers } from '../../momo/locations'
import { DEFAULT_TAG_FILTER, type TagFilterState } from '../../momo/tags'
import type { MainMode } from './types'
import type { StoreActions } from './slice'
import type { UiState } from './types'

// 筛选与下钻动作（v0.7.0 起统计页点数字就能带着对应筛选跳回全部笔记）。
// 全部是「一个 set 改完」的形状：N06 之后不再有循环 toggle 的写法——
// 清 5 个标签 = 1 次 set，matched() 只重算一次。

export type FilterSlice = Pick<
  UiState,
  | 'setMode'
  | 'setSearch'
  | 'toggleFilterDate'
  | 'clearFilterDates'
  | 'clearFilters'
  | 'filterByTag'
  | 'filterByLocation'
  | 'filterUntagged'
  | 'filterByDates'
  | 'filterByHours'
  | 'filterByWeekdays'
  | 'filterByLength'
  | 'filterByTagCount'
  | 'filterByReviewed'
  | 'clearDrill'
  | 'setUntaggedOnly'
  | 'toggleTag'
  | 'toggleLocation'
  | 'setTagFilter'
  | 'clearTagFilter'
>

/**
 * D-03：下钻的「所见即所得」契约——**点下去看到的条数必须和格子上的数字对得上**。
 *
 * 统计页所有卡片都按**全库单维度**算（StatsPage 的 `computeStats(entries, …)`），
 * 而列表口径是 matched() = 各维筛选的交集。旧实现里只有 filterByTag /
 * filterUntagged 会清掉别的维度，v0.7.0 新增的六个下钻动作只 set 自己那一维：
 * 于是「侧栏先点了个标签 → 统计页点本周节奏」会得到「标签 ∩ 本周」的列表，
 * 卡片上写的却是全库的本周条数；search 在统计页不可见但仍在生效，同样踩中。
 *
 * 现在每个下钻动作都收敛为**单一筛选**：清掉其余全部维度（含 search），只留自己
 * 那一维。想叠加筛选，回列表后用筛选条自己加——那时用户自己知道交集口径。
 *
 * 视图档 `locView` 也回 `'off'`（BUG-123a）：它与筛选是两个正交状态，星球档在「没有地点
 * 筛选」时球下一张卡都不出（2026-10-01 裁定）——下钻清掉地点筛选却留着星球档，主区就只剩
 * 一颗地球、0 条笔记。下钻承诺的是「看到这些条目」，所以与 `mode: 'list'` 同口径回列表档。
 * FilterBar 的「清除全部筛选」（clearFilters）**不**跟着回：在星球档里清筛选就该回到「只有地球」。
 * `density` 不动（那是偏好不是状态）。
 */
function drillPatch(patch: Partial<UiState>): Partial<UiState> {
  return {
    mode: 'list',
    locView: 'off',
    search: '',
    filterTags: [],
    filterLocations: [],
    filterDates: [],
    untaggedOnly: false,
    filterHours: [],
    filterWeekdays: [],
    filterLength: null,
    filterTagCount: null,
    filterReviewed: null,
    // BUG-181a：下钻承诺「看到的就是数出来的那些」——统计侧所有计数都排除未来
    // （预写）条目，列表同集合（matched() 的 drillPastOnly 闸）。
    // BUG-181b：同时撤掉旧的星球焦点记忆——它不是「这次选中」的焦点，
    // 留着会让转向 effect 把球转去上一次点过的地点（消费方把非 null 当本次选中）。
    drillPastOnly: true,
    locGlobeFocus: null,
    ...patch,
  }
}

export function createFilterSlice({ set, get }: StoreActions): FilterSlice {
  /**
   * 下钻动作的统一 set：drillPatch 会清掉其余维度（含 `filterLocations`），而地点
   * 分组流的滚动 effect **只认 locJumpSeq**——清了地点筛选却不递增，序号不动，
   * 「清除筛选 = 回流顶」的契约就漏了这条路径（BUG-71a：侧栏树 / 胶囊 ✕ 之外，
   * 统计页下钻同样会把视口留在旧筛选组的滚动深度）。drillPatch 一律递增；
   * filterByLocation 也走它——它换来的是「跳到那一组」，与 toggleLocation 同义。
   */
  const drillSet = (patch: Partial<UiState>): void => {
    set((s) => ({ ...drillPatch(patch), locJumpSeq: s.locJumpSeq + 1 }))
  }
  return {
    setMode(mode: MainMode) {
      // 进回顾即重抽一批；游标归零（重抽 = 新的一轮）。**只在真的换档时抽**
      // （BUG-136b）：模式菜单 / 顶栏分段的选中项再点一次仍是 setMode(同值)，
      // 旧实现会在这里再抽一批——点亮的档上双击 = 两批被抽、20 条 reviewSeen 落盘。
      const prev = get().mode
      set({ mode, drillPastOnly: false })
      if (mode === 'review' && prev !== 'review') get().newReviewBatch()
    },

    setSearch(search) {
      set({ search })
    },

    toggleFilterDate(day) {
      const { filterDates } = get()
      const next = filterDates.includes(day) ? filterDates.filter((d) => d !== day) : [...filterDates, day]
      // 加了具体日期就退出「无标签」模式：两者交集必为空，没有并存的意义
      // BUG-181a：手动加减筛选 = 离开下钻会话，撤掉「今天及以前」闸
      set(next.length ? { filterDates: next, untaggedOnly: false, drillPastOnly: false } : { filterDates: next, drillPastOnly: false })
    },

    clearFilterDates() {
      set({ filterDates: [], drillPastOnly: false })
    },

    /**
     * N06：一次 set 清掉全部筛选。旧实现在 App.tsx 里循环 `toggleTag(t)`：
     * 清 5 个标签 = 5 次 set，每次都触发一次 matched() + sort + dateGroups 重算。
     * 语义与旧实现逐字段对齐：
     * - 标签：`toggleTag` 逐个移除的净效果就是 `filterTags: []`（移除分支不碰 untaggedOnly）；
     * - 模式：**不切**。v0.9.26 起回收站页自己也消费标签筛选（按卡片渲染 + 过滤），
     *   「带着筛选跳回列表」（UI-10）的理由不复存在——在回收站清筛选就留在回收站。
     */
    clearFilters() {
      set((s) => ({
        search: '',
        filterTags: [],
        filterLocations: [],
        filterDates: [],
        untaggedOnly: false,
        filterHours: [],
        filterWeekdays: [],
        filterLength: null,
        filterTagCount: null,
        filterReviewed: null,
        // BUG-181a：手动清筛选 = 离开下钻会话，撤掉「今天及以前」闸（预写条目回来）
        drillPastOnly: false,
        // BUG-181b：清筛选同时撤掉旧的星球焦点记忆（它不是任何「本次选中」的焦点）
        locGlobeFocus: null,
        // 清掉地点筛选也要递增跳转序号：分组流的滚动 effect 只认它，「清除筛选 = 回流顶」
        // 才走得到（BUG-71a；侧栏树 / 胶囊 ✕ 之外这条 FilterBar 清除路径原先漏了）。
        locJumpSeq: s.locJumpSeq + 1,
      }))
    },

    /** 统计页下钻（v0.4.7）：单标签筛选并回到列表；其余维度与搜索一并清掉（D-03） */
    filterByTag(key) {
      drillSet({ filterTags: [key] })
    },

    /**
     * 统计页下钻（v0.9.33 地点维度；2026-10-01 改落回全部笔记）：把该地点设成
     * **唯一**的地点筛选并回列表。节点键按 locFullKey 折算：洲名（足迹规模的洲际
     * 覆盖行）自身就是顶级节点；地名走完整的 洲\0国\0名 路径——与侧栏树 / 分组流 /
     * pill 同一把尺子，用户手填的 prefs.locRegions 在这儿一样压过内置字典。
     *
     * 与 toggleLocation 的分工：这里是**整组替换**（点一个统计数字就该看到那一组，
     * 与 filterByTag 同一条），不是逐项加减；其余维度由 drillPatch 一次清干净。
     */
    filterByLocation(loc) {
      const { locRegions } = get()
      drillSet({ filterLocations: [locFullKey(loc, locRegions)] })
    },

    /** 统计页下钻（v0.4.17）：只看无标签 Momo 并回到列表；其余维度与搜索一并清掉（D-03） */
    filterUntagged() {
      drillSet({ untaggedOnly: true })
    },

    /** v0.7.0：整组日期下钻（统计页「本周 / 本月 / 最近 30 天 / 最高产的一天」） */
    filterByDates(days) {
      drillSet({ filterDates: days })
    },

    filterByHours(hours) {
      drillSet({ filterHours: hours })
    },

    filterByWeekdays(days) {
      drillSet({ filterWeekdays: days })
    },

    filterByLength(min, max) {
      drillSet({ filterLength: { min, max } })
    },

    filterByTagCount(min, max) {
      drillSet({ filterTagCount: { min, max } })
    },

    filterByReviewed(which) {
      drillSet({ filterReviewed: which })
    },

    clearDrill(dim) {
      // BUG-181a：撤掉某一维度也是手动动作，连「今天及以前」闸一起撤
      if (dim === 'hours') set({ filterHours: [], drillPastOnly: false })
      else if (dim === 'weekdays') set({ filterWeekdays: [], drillPastOnly: false })
      else if (dim === 'length') set({ filterLength: null, drillPastOnly: false })
      else if (dim === 'tagCount') set({ filterTagCount: null, drillPastOnly: false })
      else set({ filterReviewed: null, drillPastOnly: false })
    },

    setUntaggedOnly(value) {
      set({ untaggedOnly: value, drillPastOnly: false })
    },

    /**
     * 侧栏标签区的两组筛选（v0.9.18）。与上面那些「笔记筛选」动作**各管一层**，别混：
     * 这里改的只影响「侧栏显示哪些标签行」，主区列表要等用户点了标签行才变。
     * 组内单选互斥、跨组取交集的口径都在 momo/tags/tagFilter.ts 的管道里，这里只负责存。
     * 会话内 transient，不落盘（同 v0.7.0 的下钻维度）。
     */
    setTagFilter(patch: Partial<TagFilterState>) {
      set({ tagFilter: { ...get().tagFilter, ...patch } })
    },

    /**
     * 一次 set 清空两组（筛选浮层的「清除全部」与筛选空态的按钮）。
     * **不碰名称输入框**——那个词就写在输入框里，用户看得见、自己会清，
     * 替他一并清掉反而像输入框自己失忆了。
     */
    clearTagFilter() {
      set({ tagFilter: { ...DEFAULT_TAG_FILTER } })
    },

    /**
     * 标签筛选的开关（侧栏标签树 / 置顶 chip / 卡片标签 pill / 键盘 Enter）。
     * **v0.9.26 起回收站页不再因此跳回列表**：回收站行按正常卡片渲染后，标签
     * 筛选由 Trash.tsx 的 matchEntries 链路原样消费（UI-10 的旧理由「只有 chip 高亮、主区
     * 纹丝不动，像点了没反应」已不成立）。回收站里点标签 = 在回收站里筛。
     */
    toggleTag(key) {
      const cur = get().filterTags
      // 取消：直接移除。BUG-181a：手动动作 = 撤掉「今天及以前」闸
      if (cur.includes(key)) {
        set({ filterTags: cur.filter((k) => k !== key), drillPastOnly: false })
        return
      }
      // 新增：移除已选集合中它的**所有祖先与所有后代**（ADR-004 「规范化为最深选择」），
      // 保证已选集合中永不出现祖先-后代关系。
      // 选中任何标签 = 退出「无标签」模式（交集必为空）。
      set({
        filterTags: [...cur.filter((k) => !isTagAncestor(k, key) && !isTagAncestor(key, k)), key],
        untaggedOnly: false,
        drillPastOnly: false,
      })
    },

    /**
     * 地点筛选的开关（侧栏「全部地点」树 / 卡片交叉引用 pill / 星球光点共用）。
     *
     * 与 `toggleTag` 逐条同构，只换了一把尺子：
     * - 取消：集合里已有这个节点 → 直接移除；
     * - 新增：先剔掉它的**所有祖先与所有后代**（节点键是 `\u0000` 连接的路径前缀段，
     *   祖先 / 后代判定走 `locNodeCovers` 的分段真前缀，不是字符串前缀——
     *   「亚」不是「亚洲\u0000中国」的前缀段），再加入自己。集合里因此永不出现
     *   祖先-后代关系，「筛中国再筛北京」得到的是 {北京} 而不是 {中国, 北京}——
     *   与 ADR-004 的语义一致：用户最后一次点的那一级就是他要的粒度。
     *
     * `locJumpSeq` 无条件 +1：地点分组流的滚动 effect 认序号不认集合值（同值重筛
     * 也要再滚一次）；`focus` 只有星球自己的入口传（粗档下同一组有多枚锚点，
     * 光凭组键只挑得到条数最多的那枚）——别的入口传 null，星球按节点键自己挑。
     */
    toggleLocation(key, focus = null) {
      const cur = get().filterLocations
      const next = cur.includes(key)
        ? cur.filter((k) => k !== key)
        : [...cur.filter((k) => !locNodeCovers(k, key) && !locNodeCovers(key, k)), key]
      set((s) => ({
        filterLocations: next,
        locJumpSeq: s.locJumpSeq + 1,
        locGlobeFocus: next.includes(key) ? (focus ?? null) : null,
        // BUG-181a：手动增删地点也是离开下钻会话，撤掉「今天及以前」闸
        drillPastOnly: false,
      }))
    },
  }
}
