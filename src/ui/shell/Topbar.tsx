import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import type { MainMode } from '../store'
import type { ViewId } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { PanelToggleIcon, Icon } from '../shared/icons'
import { Segmented, Spacer } from '../kit'
import { Composer } from './Composer'
import { BatchTagPicker, type TagPickerMode } from '../tags/picker'
import { LocEditPop } from '../locations/picker'
import { NAV_ITEMS } from '../registry/sidebarSections'
import { TOPBAR_SLOTS } from '../registry/topbarSlots'
import { SelectModeControls } from './controls/SelectModeControls'
import { supportsSelectMode } from '../shared/selectableModes'

// 多选态支持哪些模式（列表 / 回顾 / 地点）：判定收在 selectableModes.ts，
// App 的「进多选落哪个模式」与这里的条件渲染共用同一份——两处各写一遍
// `mode === 'list' || mode === 'review'` 的话，加一个模式必然漏一边。

// 顶栏：侧边栏按钮 + 搜索 + 视图分段 + 排序 + 多选；任何模式都不显示标题 / 计数 chip。
// 四套模式控件在 controls/ 下（ListControls / ReviewControls / TrashControls /
// StatsControls），各自只订自己要的字段——App 因此不必为了「排序按钮要显示 ↑↓」
// 而订 sortMode，也不必为了「回顾分段」订 reviewMode
//（AGENTS.md §5：频繁变化的 selector 与不变的分组，各订各的）。
// 分发走 registry/topbarSlots.tsx 的 `TOPBAR_SLOTS[mode]`：这个模式顶栏右半挂哪套
// 控件是查表不是 if 链——加一套控件 = 注册表加一条，本文件不长大。
//（2026-10-01 晚：地点模式撤除，LocationControls 删除；星球与地点分组两档进了
//  ListControls 的视图分段。）
//
// ≤620px 那一档还有第二份 DOM：侧栏被 CSS 藏起来后，各模式的入口只剩顶栏这一处。
// 走 v0.8.5「两份 DOM + CSS 互斥」的老路——基础档 `.momo-topbar-modes` 是
// display:none，窄档容器查询把它压回来。进 / 出都给全四项：只给「进」会把用户
// 关在某个模式里。
//
// CAP-7 ①（2026-10-01 用户窄面板反馈）把这一档的下界又收了一格：≤560px 时
// 搜索框与这份功能分段一起收起，顶栏只留视图选择 / 排序 / 多选（95-responsive.css）。
// 代价要说清楚：**≤560px 面板里不再有面板内的模式入口**（侧栏那一档已被 CSS 收起，
// 命令面板也没有切模式的命令）——需要切模式就把面板拉宽过 560。

export interface TopbarProps {
  /** 当前模式（`MainMode` 的唯一真源在 store/types.ts，别在这里再抄一遍字面量） */
  mode: MainMode
  /** 侧栏是否展开（持久化偏好） */
  sidebar: boolean
  /** 多选模式进行中（store 的 selectMode，App 一跳送进来） */
  selectMode: boolean
  /** 搜索框的显示值（草稿机：显示不等，真正筛选有 100ms 防抖，见 App） */
  searchInput: string
  searchRef: React.RefObject<HTMLInputElement | null>
  onSearchInput: (value: string) => void
  /** 当前可见条目数（多选态的「全选」按钮据此禁用） */
  visibleCount: number
  onSelectAll: () => void
  onExitSelectMode: () => void
  onEnterSelectMode: () => void
  /** 切模式（侧栏菜单 / 本文件的窄档模式分段共用） */
  onMode: (mode: MainMode) => void
  /** 卡片操作行「加标签」的弹层；多选那一路的弹层挂在底部批量条里（见 BatchBar） */
  tagPicker: { paths: string[]; mode: TagPickerMode } | null
  onCloseTagPicker: () => void
  /** 单卡地点编辑弹层（F3，卡片操作行第 4 颗 mappin）：null = 关闭；x/y 已在
      按钮那侧换算成「相对 .momo-app」的偏移。与 tagPicker 同一个挂位 */
  locEditor: { path: string; x: number; y: number } | null
  onCloseLocEditor: () => void
  /** 悬停 / 聚焦视图分段的某一档（列表模式的切密度意图期）：预热可见条目正文；
   *  星球档再加一轮资产预装载，见 ListControls */
  onDensityIntent?: (view: ViewId) => void
}

export function Topbar({
  mode,
  sidebar,
  selectMode,
  searchInput,
  searchRef,
  onSearchInput,
  visibleCount,
  onSelectAll,
  onExitSelectMode,
  onEnterSelectMode,
  onMode,
  tagPicker,
  onCloseTagPicker,
  locEditor,
  onCloseLocEditor,
  onDensityIntent,
}: TopbarProps) {
  const { setPrefs } = useUi(useShallow((s) => ({ setPrefs: s.setPrefs })))
  // 这个模式的控件组查表（registry/topbarSlots.tsx）。props 统一按那几组里的
  // 超集 TopbarControlProps 给：另外几组签名不收参数，React 多给的这几个字段被忽略，
  // DOM 与交互同改动前逐字一致。
  const ModeControls = TOPBAR_SLOTS[mode]
  return (
    <div className="momo-topbar">
      {/* 发布框（v0.8.5，顶栏那一份）：≤620px 时侧栏被 CSS 强制藏起来，挂在它最上方的
          发布框也跟着没了 —— 那一档面板里就再没有「新建 Momo」的入口。所以同一颗按钮
          在这里再渲染一份，宽面板下 display:none（侧栏里那份才是常态），
          窄档才翻上来并 flex:1 1 100% 占满顶栏首行 —— 面板再窄也留得住入口。
          两份互斥，任何宽度下都只看得见一颗（见 styles.css / 工单 v0.8.5）。 */}
      <Composer variant="top" />

      {/* 侧栏显隐（v0.9.37：按钮已搬进侧栏品牌行，这一份是**收起态的副本**）。
          展开时它 display:none（顶栏最左那 40px 让给主区，见 010-sidebar-switch.css），
          只有侧栏收起后才翻上来——那时 .momo-sidebar 归零 + visibility:hidden，
          侧栏那份够不着，全靠这一份把侧栏开回来。两份 DOM 互斥（与发布框同一套路）。
          幽灵按钮 + 面板框 + **一支**箭头（v0.8.4 重做）：两态只让箭头原地掉头，
          框不动 —— 状态一眼可辨；描边与尺寸跟顶栏其它图标同一套（24 格 / 1.6）。
          这颗的放大史记在 icons.tsx 的 PanelToggleIcon 第 ④⑤ 条：2026-09-28 先把
          几何撑满到 19×18（render 仍是 16），2026-09-30 用户仍说「实在是太小了」——
          几何没有余量，本轮动 render 本身（**16 → 20**）与盒子（**34×34 → 40×40**；≤720 档那一行内容高正好 40px）。同排 sort / globe 仍是 34 家族，这一份**刻意大一号**（收起态独自占顶栏，不用跟侧栏品牌行比）。 */}
      <button
        className="momo-icon-btn momo-panel-toggle momo-panel-toggle-top"
        aria-label={sidebar ? copy.panel.sidebar.collapse : copy.panel.sidebar.expand}
        aria-pressed={sidebar}
        onClick={() => setPrefs({ sidebar: !sidebar })}
      >
        <PanelToggleIcon size={20} />
      </button>

      {/* 窄档模式分段（≤620px 专属，宽面板下 CSS 藏起）：侧栏在这一档被强制收起，
          模式入口只余顶栏这一处。图标版 NAV_ITEMS，进 / 出都给全（见文件头）。 */}
      <div className="momo-topbar-modes">
        <Segmented
          ariaLabel={copy.panel.navAria}
          variant="icon"
          value={mode}
          onChange={(m) => onMode(m)}
          items={NAV_ITEMS.map((n) => ({ value: n.mode, label: <Icon name={n.icon} size={15} />, aria: n.label() }))}
        />
      </div>

      {selectMode && supportsSelectMode(mode) ? (
        <SelectModeControls
          visibleCount={visibleCount}
          onSelectAll={onSelectAll}
          onExitSelectMode={onExitSelectMode}
        />
      ) : (
        <>
          <Spacer />

          <ModeControls
            searchInput={searchInput}
            searchRef={searchRef}
            onSearchInput={onSearchInput}
            onEnterSelectMode={onEnterSelectMode}
            onDensityIntent={onDensityIntent}
          />

          {/* 卡片操作行「加标签」的弹层锚点；多选那一路的弹层挂在底部批量条里 */}
          <div className="momo-batchtag-wrap">
            {!selectMode && tagPicker && (
              <BatchTagPicker
                key={tagPicker.mode}
                selected={tagPicker.paths}
                mode={tagPicker.mode}
                onClose={onCloseTagPicker}
              />
            )}
            {/* 单卡地点编辑弹层（F3）：渲染树里同一个挂位，DOM 上 portal 到
                .momo-app 根（free 变体的落点按 app 换算，不能被这颗 relative
                锚点接偏，见 LocEditPop 文件头）。key 挂 path——从 A 卡的 mappin
                直接点到 B 卡的 mappin 时按卡重挂（输入与位置都刷新），不至于
                带着上一篇的搜索词。 */}
            {!selectMode && locEditor && (
              <LocEditPop
                key={locEditor.path}
                path={locEditor.path}
                x={locEditor.x}
                y={locEditor.y}
                onClose={onCloseLocEditor}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
