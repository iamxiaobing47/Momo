// App 的**布局壳**（R5 骨架拆分）：侧栏 / 拖拽把手 / 主区（顶栏 + 细分隔线 +
// 筛选条 + 卡片流 + 底部批量条）的摆位。纯展示组件——不订阅 store，一切数据与
// 回调经 props 进来；侧栏、顶栏、筛选条、卡片流、批量条各自的渲染细节与订阅仍在
// `shell/` 各文件里（AGENTS.md §5：各文件自己订自己要的字段）。
//
// JSX 结构与原 App.tsx 逐字一致（含 children 顺序与条件）：DOM 快照按 outerHTML
// 逐字节比对，结构漂移立刻红。
import { useEffect, useState, type RefObject } from 'react'
import type { Density, MomoEntry, ViewId } from '../../momo/types'
import { groupByDate } from '../../momo/dates'
import { buildLocTree } from '../../momo/locations'
import { groupByLocation, type LocCount } from '../../momo/locations'
import type { LocViewMode, MainMode, UiState } from '../store'
import { Sidebar } from '../shell/Sidebar'
import { ResizeHandle } from '../shell/ResizeHandle'
import { Topbar } from '../shell/Topbar'
import { FilterBar } from '../shell/FilterBar'
import { ReviewFilters } from '../review/ReviewFilters'
import { CardFlow } from '../shell/CardFlow'
import { GlobeView } from '../globe/GlobeView'
import { BatchBar } from '../shell/BatchBar'
import { supportsSelectMode } from '../shared/selectableModes'
import type { SidebarChrome } from '../hooks/useChromePrefs'

export interface AppLayoutProps {
  mode: MainMode
  density: Density
  loading: boolean
  entries: MomoEntry[]
  list: MomoEntry[]
  pinnedList: MomoEntry[]
  dateGroups: ReturnType<typeof groupByDate>
  locGroups: ReturnType<typeof groupByLocation>
  /** 全库地点计数表：星球锚点源（见 useListDerivations 的 locAnchors） */
  locAnchors: readonly LocCount[]
  locTree: ReturnType<typeof buildLocTree>
  /** 地点视图档位（全部笔记的一档：off / globe / group） */
  locView: LocViewMode
  /** 星球档是否已有地点筛选（= store.filterLocations 非空，见 CardFlowProps） */
  locFilterActive: boolean
  chrome: SidebarChrome
  selectMode: boolean
  selectedCount: number
  deleting: boolean
  searchInput: string
  searchRef: RefObject<HTMLInputElement | null>
  visibleCount: number
  tagPicker: UiState['tagPicker']
  locEditor: UiState['locEditor']
  locPicker: UiState['locPicker']
  /** 选中的 Momo 里有没有地点可摘（批量条「移除地点」的置灰判据，见 BatchBarProps） */
  locRemovable: boolean
  appRef: RefObject<HTMLDivElement | null>
  fabRef: RefObject<HTMLDivElement | null>
  onMode: (m: MainMode) => void
  onSearchInput: (v: string) => void
  onSelectAll: () => void
  onEnterSelectMode: () => void
  onExitSelectMode: () => void
  onCloseTagPicker: () => void
  onCloseLocEditor: () => void
  /** 悬停 / 聚焦视图分段的某一档（切密度意图期）：预热正文，星球档再加资产预装载 */
  onDensityIntent: (view: ViewId) => void
  onBackToAll: () => void
  onClearFilters: () => void
  onDeleteSelected: () => void
  onToggleTagPicker: UiState['toggleTagPicker']
  onToggleLocPicker: UiState['toggleLocPicker']
  onCloseLocPicker: () => void
  onCommitWidth: (width: number) => void
}

export function AppLayout(props: AppLayoutProps) {
  const {
    mode,
    density,
    loading,
    entries,
    list,
    pinnedList,
    dateGroups,
    locGroups,
    locAnchors,
    locTree,
    locView,
    locFilterActive,
    chrome,
    selectMode,
    selectedCount,
    deleting,
    searchInput,
    searchRef,
    visibleCount,
    tagPicker,
    locEditor,
    locPicker,
    locRemovable,
    appRef,
    fabRef,
    onMode,
    onSearchInput,
    onSelectAll,
    onEnterSelectMode,
    onExitSelectMode,
    onCloseTagPicker,
    onCloseLocEditor,
    onDensityIntent,
    onBackToAll,
    onClearFilters,
    onDeleteSelected,
    onToggleTagPicker,
    onToggleLocPicker,
    onCloseLocPicker,
    onCommitWidth,
  } = props
  // 星球视图常驻（B 方案）：第一次进入星球档后挂载一次，之后切走只隐藏、不卸载——
  // 卸载会销毁 WebGL 上下文与纹理，再进入就要整套重建、球要等一拍才出来。
  const globeActive = mode === 'list' && locView === 'globe' && entries.some((e) => e.locations.length > 0)
  const [globeMounted, setGlobeMounted] = useState(false)
  useEffect(() => {
    if (globeActive) setGlobeMounted(true)
  }, [globeActive])
  return (
    <>
      {/* trashCount 已于本轮删除（死 prop：Sidebar 从不读它，回收站计数在
          Topbar 的 TrashControls 自己订 trash） */}
      <Sidebar mode={mode} onMode={onMode} locTree={locTree} />
      <ResizeHandle
        sidebarSide={chrome.sidebarSide}
        sidebarWidth={chrome.sidebarWidth}
        appRef={appRef}
        onCommit={onCommitWidth}
      />

      <div className="momo-main">
        <Topbar
          mode={mode}
          sidebar={chrome.sidebar}
          selectMode={selectMode}
          searchInput={searchInput}
          searchRef={searchRef}
          onSearchInput={onSearchInput}
          visibleCount={visibleCount}
          onSelectAll={onSelectAll}
          onExitSelectMode={onExitSelectMode}
          onEnterSelectMode={onEnterSelectMode}
          onMode={onMode}
          tagPicker={tagPicker}
          onCloseTagPicker={onCloseTagPicker}
          locEditor={locEditor}
          onCloseLocEditor={onCloseLocEditor}
          onDensityIntent={onDensityIntent}
        />

        <div className="momo-topbar-rule" />

        {/* 筛选条：只出现在列表与回收站模式（v0.5 起筛选胶囊从顶栏移下来，顶栏留给
            搜索 / 视图 / 排序 / 多选）。v0.9.26 起回收站行按正常卡片渲染、消费同一套
            筛选（消费路径见 trash/Trash.tsx 的 matchEntries），所以胶囊条也跟过去——否则筛上了却看不见、点不掉。 */}
        {(mode === 'list' || mode === 'trash') && <FilterBar />}

        {/* 回顾档的筛选回显（只读；BUG-123b 的可见面）：与上面的筛选条**同一个挂位**、
            同一排左对齐——筛选条件在哪个模式都长在同一个地方，用户不必重新找。它挂在
            内容区之外，因此滚动画面的同时始终钉在顶上，也不挤占 `.momo-review` 那棵
            居中列（卡片该在哪儿还在哪儿）。没有生效中的筛选时它自己渲染 null。 */}
        {mode === 'review' && <ReviewFilters />}

        {/* 发布框已移入侧栏品牌下方（v0.5.1）：主区只剩筛选条与卡片流 */}
        <div className="momo-content">
          {(globeActive || globeMounted) && (
            <GlobeView anchors={locAnchors} active={globeActive} />
          )}
          <CardFlow
            mode={mode}
            density={density}
            loading={loading}
            entries={entries}
            list={list}
            pinnedList={pinnedList}
            dateGroups={dateGroups}
            locGroups={locGroups}
            locView={locView}
            locFilterActive={locFilterActive}
            onEnterSelectMode={onEnterSelectMode}
            onBackToAll={onBackToAll}
            onClearFilters={onClearFilters}
          />
        </div>

        {selectMode && supportsSelectMode(mode) && (
          <BatchBar
            selectedCount={selectedCount}
            deleting={deleting}
            tagPicker={tagPicker}
            onToggleTagPicker={onToggleTagPicker}
            onCloseTagPicker={onCloseTagPicker}
            locPicker={locPicker}
            onToggleLocPicker={onToggleLocPicker}
            onCloseLocPicker={onCloseLocPicker}
            locRemovable={locRemovable}
            onDeleteSelected={onDeleteSelected}
            onCancel={onExitSelectMode}
            fabRef={fabRef}
          />
        )}
      </div>
    </>
  )
}
