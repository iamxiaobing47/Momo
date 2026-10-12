import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import { Icon } from '../../shared/icons'
import type { IconName } from '../../shared/icons'
import { Segmented, type SegmentedItem } from '../../kit'
import { TextButton } from '../../kit'
import { DENSITY_VIEWS } from '../../registry/densityViews'
import type { Density, ViewId } from '../../../momo/types'
import { SortControl } from './SortControl'

// 列表模式的顶栏控件：搜索 + 视图分段 + 排序 + 进入多选。
// 从 shell/Topbar.tsx 拆出（Topbar 只按 mode 分发，自身不再订阅这些字段）。
//
// 排序那一格 v0.9.19 起是独立组件 SortControl（一颗图标按钮 + 两段式弹层）：
// 原来是「排序依据」文字分段 + 方向文字按钮并排，合计 238px，是本排最占宽的一块。

/**
 * 密度档 → 顶栏图标（形状来自注册表的 manifest）。
 * 查不到就抛，与 CardFlow 找不到视图时同一口径：**不静默回退**——回退会把
 * 「加了密度档却漏登记 manifest」这件事藏进界面里（图标悄悄变成列表那一枚）。
 * 注册表的 `_MissingDensity` 守卫本该在编译期拦下这种情况，这是运行时的第二道。
 */
function iconOfDensity(id: Density): IconName {
  const view = DENSITY_VIEWS.find((x) => x.id === id)
  if (!view) throw new Error(`density view not registered: ${id}`)
  return view.icon
}

/**
 * 视图 id → 顶栏那颗按钮的图标。
 *
 * 2026-10-09 起地点两档（星球 / 地点分组）与密度档一样收进了 `densityViews`，
 * 图标也一起在这里查：密度档照旧查注册表 manifest，地点两档**刻意不在注册表里**
 * ——它们是 `locView` 的两种呈现，`registry/densityViews` 那层是「卡片流怎么画」，
 * 星球与分组流不走那条路（见 CardFlow）。所以这两枚直接给，与 2026-10-09 之前
 * 写死追加的那两颗逐字相同。
 */
function iconOfView(id: ViewId): IconName {
  if (id === 'globe') return 'globe'
  if (id === 'group') return 'mappin'
  return iconOfDensity(id)
}

/** 视图 id → 顶栏那颗按钮的无障碍名（各域原有的那颗，逐字不变） */
function ariaOfView(id: ViewId): string {
  if (id === 'globe') return copy.location.globe.toggleAria
  if (id === 'group') return copy.location.groupViewAria
  return copy.panel.density[id]
}

/**
 * 视图分段：顶栏那排视图图标按钮，**按用户配置渲染**（v0.9.17）。
 *
 * 显示哪几档、按什么顺序，全部读 `prefs.densityViews`（设置页「视图」卡里开关 +
 * 上移 / 下移）。2026-10-09 起这是**五档**：三档密度 + 星球 / 地点分组。此前地点
 * 两档是下面写死 `push` 的两颗，于是设置页只列得出三档——顶栏五颗、卡里三行，
 * 用户报「目前有五个视图，这里只显示了三个视图」。收进同一个数组后，五档同一套
 * 开关 + 排序，这里也不再自己 append 那两颗。
 *
 * 图标：密度档由 `DENSITY_VIEWS` 提供，所以加一档密度依然只需改注册表，不必回来
 * 动这里；地点两档不在注册表里，见 `iconOfView`。
 *
 * `filter(v => v.on)` 的空结果由上游兜住：sanitizeDensityViews 保证至少一档密度
 * 开着（全关整体回默认），store 初值与启动回灌都过它。这里不叠防御性回退——
 * 那只会把「上游漏了收口」这个真问题藏起来。
 *
 * 与密度不同的只有一点：**地点两档开着时 value = 'globe' / 'group'**，密度全部
 * 熄灭，点任何一档密度 = 离开地点视图（分段是「当前是什么视图」的显示器，不该
 * 人走了图标还亮着）。
 *
 * **它们和密度档一样是幂等的 select，不是 toggle**（BUG-139，2026-10-09 用户裁定
 * 「多次点击视图选择，保持原地不动」）：点当前那颗 = 原地不动，双击 / 连点 /
 * 停顿后再点都停在原处。离开地点视图只剩两条路：点任何一档密度、或 0 地点时空态
 * 里那颗「先浏览全部笔记」。
 *
 * 这里曾是 toggle（开着再点一次 = 收回）。BUG-135 先给它垫了一层双击闸（`Segmented`
 * 同一颗在一个双击窗口内只派发一次 onChange），治不了本：Windows 的双击判定只有
 * ±4px / 500ms，鼠标挪几像素、或两下间隔稍长，第二下的 `click.detail` 就是 1，闸
 * 不生效，照旧「开着又关」被弹回上一视图——而用户要的是「多次点击」这个尺度上一律
 * 原地不动，**任何时间窗都满足不了**，只有幂等能。改成 select 后这两颗与同排密度
 * 档逐字同语义，BUG-135 原话里「同一个手势落在不同颗上结局相反」也一起消失。
 * `Segmented` 里那道闸仍然要留着——另外三个消费者（回顾模式 / 排序菜单 / 发布框
 * 入口）的 onChange 不是幂等的，见 BUG-136。
 *
 * **窄档瘦身（2026-10-01 用户窄面板反馈 · CAP-7 ①）**：这一档**分段留着**，反倒把
 * 搜索框与窄档功能分段收掉（95-responsive.css 的 560 块）。前一版是反过来——整段
 * `display: none`、搜索改可收缩，用户明确否决了那个取舍。分段是「按什么视图看」
 * 的常驻入口，窄面板里最该留的就是它：搜索收走之后，分段 + 排序 + 「多选」
 * 三项在 480 档的面板也摆得下一行。挂**标记类**
 * `.momo-density-seg` 仍然是必要的（CSS 侧要按档读它，与 `.momo-topbar-modes` /
 * `.momo-composer-top` 同一套路），只是语义从「收起我」变成「我是窄档保留项」。
 * 回顾 / 统计那两套 tablist 不是密度分段，不挂这个类。
 */
export function DensitySegmented({ onIntent }: { onIntent?: (view: ViewId) => void }) {
  const { density, densityViews, setPrefs, locView, setLocView } = useUi(
    useShallow((s) => ({
      density: s.density,
      densityViews: s.densityViews,
      setPrefs: s.setPrefs,
      locView: s.locView,
      setLocView: s.setLocView,
    })),
  )

  const items: SegmentedItem<ViewId>[] = densityViews
    .filter((v) => v.on)
    .map((v) => ({
      value: v.id,
      label: <Icon name={iconOfView(v.id)} size={15} />,
      aria: ariaOfView(v.id),
    }))
  return (
    <Segmented
      ariaLabel={copy.panel.density.aria}
      variant="icon"
      value={locView !== 'off' ? locView : density}
      onChange={(v) => {
        // 地点两档是**幂等 select**（BUG-139）：点当前那颗原地不动。用户原话
        // 「多次点击视图选择，保持原地不动」——BUG-135 只垫了双击闸（判据是系统
        // 双击窗口，±4px / 500ms），鼠标挪一点或点得慢，第二下 detail = 1 就漏，
        // 照旧被弹回上一视图；只有「点哪档就是哪档」能覆盖连点 / 慢双击。
        if (v === 'globe' || v === 'group') {
          setLocView(v)
          return
        }
        // 选任何一档密度 = 离开地点视图（分段是「当前是什么视图」的显示器，
        // 人回常规卡片流了不该还把星球 / 分组图标亮着）
        if (locView !== 'off') setLocView('off')
        setPrefs({ density: v })
      }}
      onIntent={onIntent}
      className="momo-density-seg"
      items={items}
    />
  )
}

export interface ListControlsProps {
  searchInput: string
  searchRef: React.RefObject<HTMLInputElement | null>
  onSearchInput: (value: string) => void
  onEnterSelectMode: () => void
  /** 悬停 / 聚焦视图分段的某一档（切密度的意图期）：预热可见条目正文，切过去即缓存命中 */
  onDensityIntent?: (view: ViewId) => void
}

/** 列表模式的控件：搜索 + 分段 + 排序 + 进入多选 */
export function ListControls({
  searchInput,
  searchRef,
  onSearchInput,
  onEnterSelectMode,
  onDensityIntent,
}: ListControlsProps): React.JSX.Element {
  return (
    <>
      <div className="momo-search-wrap">
        <Icon name="search" size={15} />
        <input
          ref={searchRef}
          className="momo-search momo-input"
          type="text"
          placeholder={copy.panel.searchPlaceholder}
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
        />
      </div>
      <DensitySegmented onIntent={onDensityIntent} />
      <SortControl />
      <TextButton icon={<Icon name="select" size={14} />} onClick={onEnterSelectMode}>
        {copy.panel.select.enter}
      </TextButton>
    </>
  )
}
