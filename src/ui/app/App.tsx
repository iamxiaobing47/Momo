import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import { createSearchDraft, type SearchDraft } from '../../momo/core'
import { AppShell } from './AppShell'
import { AppLayout } from './AppLayout'
import { useAppearancePrefs, useSidebarChrome } from '../hooks/useChromePrefs'
import { useAppFilters, useListDerivations } from '../hooks/useListDerivations'
import { useAppSession } from '../hooks/useAppSession'
import { usePanelUpkeep } from '../hooks/usePanelUpkeep'
import { useFabHeightVar } from '../hooks/useFabHeightVar'
import { useViewAnchorSync } from '../hooks/useViewAnchorSync'
import { pickedLocEntries } from '../locations/picker/rows'
import { warmGlobeAssets } from '../globe/globePrewarm'
import type { ViewId } from '../../momo/types'

/**
 * 主应用（版面照 v0.5 设计稿 docs/design/mockups/danpan-v05-design.html）：
 * 侧栏 = 品牌（mark + Momo）+ 发布框 + 速览三格 + 活跃度 + 菜单 + 全部标签（行式树）+ 页脚；
 * 主区 = 顶栏（侧边栏按钮 + 搜索 + 视图分段 + 排序 + 多选；任何模式不显示标题 / 计数 chip）+ 筛选条 + 卡片流；
 * 多选 = 顶栏「多选」进入 + 卡片勾选圈 + 底部浮起的白卡批量条（替代旧版顶部横幅，
 *   选中数也在浮条上，顶栏左上不重复显示）；导出整块（含批量条的「导出已选」）已移除。
 *
 * R5 骨架拆分后本文件只是**组合根**，只留四类东西：
 *   1. 派生链与布局要用的 store 订阅（本文件 10 个 useUi 调用点；另 5 个——外观 /
 *      侧栏三件套 / 筛选——下沉到 hooks/useChromePrefs 与 hooks/useListDerivations，
 *      全树合计仍是 AGENTS.md §5 的 15 个，一个不许多）；
 *   2. 搜索草稿机（100ms 防抖，AGENTS.md §5）；
 *   3. 各 hook 的编排（顺序即原 effect 次序：草稿同步 → 会话复位 → 面板自愈 →
 *      fab 测高 → 派生 → 视图锚点）；
 *   4. AppShell（根节点）+ AppLayout（布局）的摆位。
 * 侧栏、顶栏、筛选条、卡片流、批量条各自的渲染细节在 `shell/` 里，各文件自己订
 * 自己要的 store 字段（AGENTS.md §5）。多选态（selectMode / selected / 批量标签弹层）
 * 也在 store 里（store/selection.ts），卡片按卡选布尔量订阅——那是 v0.9.10 修掉
 * 「勾一张卡重渲几百张」的那次迁移，App 不再持有任何选择态本地副本。
 */

export function App() {
  // 外壳两组「设完就不变」的偏好（订阅在 hooks 里，这里只取用）
  const appearance = useAppearancePrefs()
  const chrome = useSidebarChrome()
  const entries = useUi((s) => s.entries)
  const loading = useUi((s) => s.loading)
  const mode = useUi((s) => s.mode)
  const density = useUi((s) => s.density)
  // 排序模式（排序键 × 方向）走偏好（data.json）
  const sortMode = useUi((s) => s.sortMode)
  // 界面语言（持久化偏好）：只拿来当根节点 key——语言在设置页切换时，整棵
  // 子树重挂、全部 copy 经 Proxy 重新按新语言读取（memo 化的卡片也因此不漏）。
  const lang = useUi((s) => s.lang)
  /**
   * 置顶笔记（v0.8.3，视图偏好）：这是**Momo 置顶**，与侧栏那套「置顶标签」
   * （`pinned`，标签身份键）是两件互不相干的事，字段也不共用。
   */
  const pinnedNotes = useUi((s) => s.pinnedNotes)
  // 九个筛选状态：喂派生链的依赖（hooks/useListDerivations）与深夜门禁
  const filters = useAppFilters()
  /**
   * P06：App 的 store selector 收敛（AGENTS.md §5「App 侧 useUi 控制在 15 个以内」）。
   * 做法是按「读什么分一组」合并成 useShallow 浅对象订阅：zustand 的 useShallow 会对
   * 新返回值做逐字段浅比较，没变就还回上一份对象，所以无关字段的 store 更新不会让
   * 这个订阅重新渲染。分组只改订阅粒度，不改任何读取口径——下面的解构仍是同名局部变量。
   *
   * 下面这几个变化最频繁（每敲一个字、每切一次模式、每一批回顾进度），仍然各自独立
   * 订阅：别和上面几乎不变的偏好字段搅进同一组，否则频繁字段会拖着整组一起重算。
   */
  // 动作与筛选回调：store 里函数引用恒定，分组不引入变化。matched() 是筛选入口，跟动作归一起。
  // 多选会话态（v0.9.10 起进 store）的动作也在这里：进出多选、全选、批量标签弹层。
  const actions = useUi(
    useShallow((s) => ({
      setSearch: s.setSearch,
      setMode: s.setMode,
      setPrefs: s.setPrefs,
      toggleFilterDate: s.toggleFilterDate,
      clearFilters: s.clearFilters,
      toggleTag: s.toggleTag,
      setUntaggedOnly: s.setUntaggedOnly,
      clearDrill: s.clearDrill,
      setSelectMode: s.setSelectMode,
      selectAll: s.selectAll,
      toggleTagPicker: s.toggleTagPicker,
      closeTagPicker: s.closeTagPicker,
      setSelected: s.setSelected,
      // 地点（F3/F4）：单卡编辑弹层 + 批量「设地点」弹层（store 的 location slice）；
      // setLocView = 退出星球 / 分组档回常规卡片流（地点空态的次按钮走它）
      toggleLocPicker: s.toggleLocPicker,
      closeLocPicker: s.closeLocPicker,
      closeLocEditor: s.closeLocEditor,
      setLocView: s.setLocView,
    })),
  )
  // 多选会话态的**状态**（不是动作）：selectMode 决定根节点 class / 批量条 / 顶栏控件，
  // selected.size 是批量条上的计数，tagPicker 是弹层。挑一个勾选就会变的量单独成组，
  // 与上面几乎不变的筛选字段分开——否则频繁字段会拖着整组一起重算。
  // 两个地点弹层（locEditor / locPicker）跟着同一组：它们开合同样是会话态，
  // 且勾选操作不会碰它们（弹层开着时勾选别的卡不影响已开的弹层）。
  // `selected`（整份 Set）也在这里：批量条「移除地点」的置灰判据要按**身份**问
  // 「选中的这批里有没有地点」，只数得出一条数（size）答不了这个问题。
  const selectState = useUi(
    useShallow((s) => ({
      selectMode: s.selectMode,
      selectedCount: s.selected.size,
      selected: s.selected,
      tagPicker: s.tagPicker,
      locEditor: s.locEditor,
      locPicker: s.locPicker,
    })),
  )
  // 回顾会话字段：reviewBatch / reviewMode / 回调（App 内不读 reviewIndex，见 N01）
  const reviewPrefs = useUi(
    useShallow((s) => ({
      reviewMode: s.reviewMode,
      reviewBatch: s.reviewBatch,
      setReviewMode: s.setReviewMode,
      newReviewBatch: s.newReviewBatch,
    })),
  )
  // 星球视图（F7；2026-10-01 起是「全部笔记」的一档视图）住进 useListDerivations
  // （与 locGroups / locAnchors 同一条「App 派生 / 分发」的故事，也省一个 useUi
  // 调用点——AGENTS.md §5 的 15 个是顶格的），这里原样传给 CardFlow：它保持
  // 纯 props，不自己摸 store。

  const { setSearch, setPrefs, selectAll, setLocView } = actions
  const { selectMode, selectedCount, selected, tagPicker, locEditor, locPicker } = selectState
  const { reviewBatch } = reviewPrefs

  // 星球档「只显示地球、点了地点才出笔记」的判据（2026-10-01 用户裁定）：
  // 从已订阅的 filters 里取地点筛选有无，不另起一个 useUi 调用点（§5 的 15 个是顶格）。
  const locFilterActive = filters.filterLocations.length > 0

  /** 批量条「移除地点」的置灰判据：选中的这批里**一条地点都没有**时，摘谁都是空操作。
   *  原先是弹层头部「移除」分段那一侧置灰（F6「有选中地点时」）——分段随两颗入口
   *  按钮撤掉后，这条判据挪到按钮自己身上。投影复用弹层的 pickedLocEntries，
   *  别在这里写第二份「path → entry」。 */
  const locRemovable = useMemo(
    () => pickedLocEntries(entries, selected).some((e) => e.locations.length > 0),
    [entries, selected],
  )

  // P05：搜索输入 100ms 防抖（AGENTS.md §5）。打字手感走草稿机（显示不等），
  // 真正昂贵的 matched() + sort + dateGroups 只在停顿 100ms 后跑一次。
  // store.search 仍被 clearFilters / Heatmap pickDay / 统计页下钻等外部改写：
  // 那些路径一律走 store，草稿机以 store 为准（清掉未提交的草稿）。
  const searchDraftRef = useRef<SearchDraft | null>(null)
  if (searchDraftRef.current === null) searchDraftRef.current = createSearchDraft(filters.search, (v) => setSearch(v))
  const [searchInput, setSearchInput] = useState(searchDraftRef.current.input)
  useEffect(() => {
    searchDraftRef.current?.sync(filters.search)
    setSearchInput(searchDraftRef.current?.input ?? '')
  }, [filters.search, setSearch])
  // 卸载：撤销排着的那一轮提交。timer 挂在 window 上，组件拆了照样 fire 进 store 单例
  // （useUi 是插件级），被放弃的搜索词会在下次打开时复现（BUG-106 ②）。单开 effect 是因为
  // 上面那个的 cleanup 在每次 filters.search 变化时也会跑，在那儿 cancel 会误杀回声时刻的在途输入。
  useEffect(() => {
    return () => searchDraftRef.current?.dispose()
  }, [])

  const appRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  /** 底部批量条的本体（测量高度写进 `--momo-fab-h`，见 useFabHeightVar） */
  const fabRef = useRef<HTMLDivElement>(null)

  // ---- hook 编排：调用顺序即原 App.tsx 的 effect 次序（拆文件不改运行次序）----
  // ① 多选会话：进出多选 / 切模式 / 批量删除 + 卸载复位 + 离开回收站收弹层
  const session = useAppSession(mode, appRef, actions)
  // ② 面板自愈：字体偏好同步 + 多选集与 entries 对账
  usePanelUpkeep({
    uiFont: appearance.uiFont,
    cardFont: appearance.cardFont,
    entries,
    loading,
    setSelected: actions.setSelected,
  })
  // ③ 批量条实测高度 → --momo-fab-h
  useFabHeightVar(appRef, fabRef, selectMode, mode, lang)
  // ④ 派生链：matched → 排序 → 置顶 → list → 日期 / 地点分组 + hover 预热
  //  （locView 也在这条链上：全部笔记的地点视图档位，见 useListDerivations）
  const { list, pinnedList, dateGroups, locGroups, locAnchors, locTree, locView, warmVisibleBodies } = useListDerivations({
    sortMode,
    entries,
    pinnedNotes,
    mode,
    density,
    warmRatio: appearance.warmRatio,
  })
  // ⑤ 视图联动：滚动锚点跟踪（passive）+ 切密度归位（layout）
  useViewAnchorSync(appRef, lang, density)

  /** 全选 / Ctrl+A 都作用在**当前可见的列表**：列表模式 = 筛选 + 排序后的结果；
   *  回顾模式 = 当前这一批（UI-9：回顾里也可多选）。与用户看到的一致。
   *  （反选只在计划里，见 docs/requirements/roadmap.md §4。） */
  const visibleEntries = mode === 'review' ? reviewBatch : list

  const onSearchInput = (v: string): void => {
    searchDraftRef.current?.type(v)
    setSearchInput(v)
  }

  // 稳定引用（useCallback）：ResizeHandle 的拖拽 effect 依赖它——每渲染换新引用会把
  // 「松手才提交」变成「拖拽中 App 一重渲就提交」（BUG-11 的另一半防御）
  const commitSidebarWidth = useCallback((width: number) => setPrefs({ sidebarWidth: width }), [setPrefs])

  // 视图分段的**意图期**（悬停 / 键盘聚焦某一档，早于点击）两笔预热：
  //   ① 正文渲染缓存——治「切过去内容逐个蹦出来」，比例走 prefs.warmRatio；
  //   ② 星球档专属：贴图六面 + globe3d.js 预装载——治「首次进星球黑卡一拍」
  //      （GlobeStage 挂载时才并行装载、第一帧要等两边；两个装载器模块级缓存，
  //      重复调用返回同一个 Promise，预热幂等，见 globePrewarm 文件头）。
  // 带上档位是这次接线的一部分：Segmented 的 onIntent 从「容器级悬停」改成
  // 「每颗按钮的悬停 / 聚焦 + 档位」，键盘路径由此补上（原来 focus 不进意图）。
  const onDensityIntent = useCallback(
    (view: ViewId): void => {
      warmVisibleBodies()
      if (view === 'globe') warmGlobeAssets()
    },
    [warmVisibleBodies],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // 事件源是文本输入框 / 可编辑区时不劫持：弹层（批量加标签 / 设地点）的
    // autoFocus 输入框不 stopPropagation，Ctrl+A 在里面本意是「全选这段文字」，
    // 落到这里会被换成「全选整库可见卡片」（BUG-10）。用 tagName 判断（跨 realm
    // 的 instanceof 在测试环境不可靠）。
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }
    // 多选模式下 Ctrl+A = 全选当前可见列表（非多选模式不劫持原生全选）
    if (selectMode && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      selectAll(visibleEntries.map((entry) => entry.path))
    }
  }

  return (
    <AppShell
      lang={lang}
      appearance={appearance}
      chrome={chrome}
      mode={mode}
      selectMode={selectMode}
      rootRef={appRef}
      onKeyDown={onKeyDown}
    >
      <AppLayout
        mode={mode}
        density={density}
        loading={loading}
        entries={entries}
        list={list}
        pinnedList={pinnedList}
        dateGroups={dateGroups}
        locGroups={locGroups}
        locAnchors={locAnchors}
        locTree={locTree}
        locView={locView}
        locFilterActive={locFilterActive}
        chrome={chrome}
        selectMode={selectMode}
        selectedCount={selectedCount}
        deleting={session.deleting}
        searchInput={searchInput}
        searchRef={searchRef}
        visibleCount={visibleEntries.length}
        tagPicker={tagPicker}
        locEditor={locEditor}
        locPicker={locPicker}
        locRemovable={locRemovable}
        appRef={appRef}
        fabRef={fabRef}
        onMode={session.goMode}
        onSearchInput={onSearchInput}
        onSelectAll={() => selectAll(visibleEntries.map((entry) => entry.path))}
        onEnterSelectMode={session.enterSelectMode}
        onExitSelectMode={session.exitSelectMode}
        onCloseTagPicker={actions.closeTagPicker}
        onCloseLocEditor={actions.closeLocEditor}
        onDensityIntent={onDensityIntent}
        onBackToAll={() => setLocView('off')}
        onClearFilters={actions.clearFilters}
        onDeleteSelected={() => void session.deleteSelected()}
        onToggleTagPicker={actions.toggleTagPicker}
        onToggleLocPicker={actions.toggleLocPicker}
        onCloseLocPicker={actions.closeLocPicker}
        onCommitWidth={commitSidebarWidth}
      />
    </AppShell>
  )
}
