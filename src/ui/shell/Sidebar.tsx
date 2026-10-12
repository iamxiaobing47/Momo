import { Fragment, memo, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { dayOf, useUi } from '../store'
import { tagKey } from '../../momo/tags'
import { tagTreeOf } from '../../momo/tags'
import type { LocTreeNode } from '../../momo/locations'
import { copy } from '../../momo/i18n'
import { Icon, PanelToggleIcon } from '../shared/icons'
import { Composer } from './Composer'
import type { MainMode } from '../store/types'
import {
  SIDEBAR_SLOTS,
  type SidebarSlotNav,
  type SidebarSlotSection,
  type SidebarSectionData,
} from '../registry/sidebarSections'

/**
 * 侧栏（版面照 v0.5 设计稿）：
 * 品牌（mark + Momo）+ 侧栏开关（v0.9.37 从顶栏搬来）+ 发布框 + 速览三格 + 活跃度 +
 * 菜单 + 全部地点（常驻）+ 全部标签（行式树）+ 页脚。
 *
 * 自管订阅：品牌名 / 图标、功能显隐、速览三格的两个派生数（标签键数、记录天数）、
 * 标签树——这些都是「侧栏自己的事」，从 App 传十五个 prop 进来不如自己订。
 *（AGENTS.md §5：各组件只订自己渲染要用的字段，App 因此只剩版面需要的几个。）
 * **地点树例外**（v0.9.31 ④）：它由 App 的派生链产出（buildLocTree，从**全库**
 * entries 建，见 useListDerivations），经 props 传进来——侧栏自己再建一份就会
 * 和别处的计数对不上。
 *
 * 菜单项与可开关区块已注册表驱动（组件热插拔样板）：R7 起合成**一张**
 * SIDEBAR_SLOTS 表（nav 项与 section 块按序混排），本文件只剩三件事：
 * 订 store、折算派生数、按 sections 过滤着单遍历渲染——增删区块改那一张表，
 * 不再动这里的 JSX。
 */
export const Sidebar = memo(function Sidebar({
  mode,
  onMode,
  locTree,
}: {
  mode: MainMode
  onMode: (mode: MainMode) => void
  /** 地点层级树（App 派生，v0.9.31 ④ 侧栏「全部地点」区块） */
  locTree: readonly LocTreeNode[]
}) {
  // 品牌区（v0.7.4）：左上角图标与名称可配；v0.9.37 起侧栏开关也住这一区，
  // 故一并订 sidebar（按钮两态）与 setPrefs（点它开合）。
  const { brandIcon, brandIconImage, brandName, sections, sidebar, setPrefs } = useUi(
    useShallow((s) => ({ brandIcon: s.brandIcon, brandIconImage: s.brandIconImage, brandName: s.brandName, sections: s.sections, sidebar: s.sidebar, setPrefs: s.setPrefs })),
  )
  const entries = useUi((s) => s.entries)
  const locked = mode === 'review'
  // 自定义图标（上传的图片）盖过预设形状：src 走 caps.resourceUrl（app:// 协议）。
  // 文件被挪走 / 删掉时 img 会触发 error——本地状态回退到预设形状，
  // 不悄悄改 pref（「移除自定义」是设置页里那颗按钮的事）。
  const caps = useUi((s) => s.caps)
  const [imgBroken, setImgBroken] = useState(false)
  useEffect(() => setImgBroken(false), [brandIconImage])
  const customSrc = brandIconImage !== '' && !imgBroken ? caps?.resourceUrl(brandIconImage) ?? '' : ''

  const tagTree = useMemo(() => tagTreeOf(entries), [entries])
  const { statTags, statDays } = useMemo(() => {
    const keys = new Set<string>()
    const days = new Set<string>()
    for (const e of entries) {
      for (const t of e.tags) keys.add(tagKey(t))
      // 日期键一律走 dayOf（= dayKey，本地日历日），与热力图 / 洞察同口径；
      // 这里曾经直接 `createdAt.slice(0, 10)`（UTC 日期），会和「连续记录」等对不上（工单 WO-1 的漏网）
      days.add(dayOf(e.createdAt))
    }
    return { statTags: keys.size, statDays: days.size }
  }, [entries])

  // 注册表的渲染入参：派生数在这里折算一次（同 entries 引用不重算），
  // 区块表只管渲染（AGENTS.md §4.2）。locTree 来自 props（App 派生，见文件头）。
  // entries 本体也传下去（标签树的逐条目筛选要它，BUG-110c）——依赖列 entries
  // 而非 entries.length：筛选认的是数组引用，同长度换一批条目也得重算。
  const sectionData = useMemo<SidebarSectionData>(
    () => ({ notes: entries.length, tags: statTags, days: statDays, tagTree, locTree, entries }),
    [entries, statTags, statDays, tagTree, locTree],
  )
  // R7：一张表按序过滤（门控在条目里：nav 的 section 开关 / section 的 id 开关；
  // 2026-10-01 晚起「全部地点」树常驻，模式门控 `modes` 随之删除）
  const slots = useMemo(
    () =>
      SIDEBAR_SLOTS.filter((s) => {
        if (s.kind === 'nav') return s.section === undefined || sections[s.section]
        return sections[s.id]
      }),
    [sections],
  )
  // 连续的 nav 条目收成一段（包 <nav className="momo-menu">），其余各自成段——
  // 分隔线与菜单是版面的固定结构，夹在速览 / 活跃度（菜单上）与「全部地点」树 /
  // 标签树（菜单下）之间。
  //
  // BUG-133e①：区块按 `afterNav` **真正归位**——菜单上方 = `section && !afterNav`，
  // 菜单下方 = `section && afterNav`，nav 项排在中间收成一段。旧实现只按 kind 分段、
  // 位置纯由数组序决定，`afterNav` 是个从不被读的死 prop（ui.md 却写 Sidebar 用
  // `.filter(!afterNav)`）——现按后面这个模型实现，文档与代码一致。同侧区块的先后
  // 仍由数组序给出。
  type SlotGroup = { nav: SidebarSlotNav[] } | { slot: SidebarSlotSection }
  const groups = useMemo<SlotGroup[]>(() => {
    const above = slots.filter((s): s is SidebarSlotSection => s.kind === 'section' && !s.afterNav)
    const navs = slots.filter((s): s is SidebarSlotNav => s.kind === 'nav')
    const below = slots.filter((s): s is SidebarSlotSection => s.kind === 'section' && s.afterNav === true)
    const out: SlotGroup[] = [
      ...above.map((slot) => ({ slot })),
      ...(navs.length > 0 ? [{ nav: navs }] : []),
      ...below.map((slot) => ({ slot })),
    ]
    return out
  }, [slots])
  return (
    <aside className="momo-sidebar">
      {/* 固定顶部（v0.9.2）：图标 + 品牌名 + 写点什么 —— 常驻入口，不随侧栏滚动。
          做法是把它搬出滚动容器，做 .momo-sidebar 的第一个子元素，
          下面 .momo-sidebar-inner 才是滚动区：这块上方根本不存在滚动区，
          内容无从冒到它头上（v0.9.1 用 sticky 放在滚动容器里，受包含块限制，
          顶内距那一带仍会露出下方内容，实测未达标）。 */}
      <div className="momo-sidebar-fixed">
        {/* 品牌行（v0.9.37）：品牌按钮 + 侧栏开关。开关原住顶栏最左（40×40），用户
            要求「把展开 / 折叠按钮移进侧栏，给顶栏腾空间」——搬到这行、缩到 34×34
            与品牌行同高（图标仍 render 20，用户两次点名要它大）。
            两份 DOM 互斥（与发布框同一套路）：展开时这份可见；收起时 .momo-sidebar
            归零 + visibility:hidden 把这份一起带走，顶栏那份（.momo-panel-toggle-top）
            翻上来——任何状态都开得回来，不会「有去无回」。 */}
        <div className="momo-brand-row">
          {/* 品牌区：30px 古铜 mark + 品牌名 —— 整块是一颗按钮，点击 = 回「全部笔记」
             （v0.5.2；复用 goMode：顺带退出多选 / 关弹层，与侧栏菜单项同一条路）。
             v0.7.4 起图标与名称都可配（prefs.brandIcon / brandName）；v0.9.3 起 brandIconImage 有值时 mark 里改显示上传的那张图（盖过形状）。 */}
          <button className="momo-brand" onClick={() => onMode('list')}>
            {/* is-custom：上传了自己的图就不垫 accent 方标（图自带颜色轮廓，
                垫块主色底等于加相框）——样式见 60-design.css 的 .is-custom */}
            <span className={customSrc !== '' ? 'momo-brand-mark is-custom' : 'momo-brand-mark'}>
              {customSrc !== '' ? (
                <img className="momo-brand-img" src={customSrc} alt="" onError={() => setImgBroken(true)} />
              ) : (
                <Icon name={brandIcon} size={17} strokeWidth={1.5} />
              )}
            </span>
            <span className="momo-brand-text">
              <span className="momo-brand-name">{brandName}</span>
            </span>
          </button>

          <button
            className="momo-icon-btn momo-panel-toggle momo-panel-toggle-side"
            aria-label={sidebar ? copy.panel.sidebar.collapse : copy.panel.sidebar.expand}
            aria-pressed={sidebar}
            onClick={() => setPrefs({ sidebar: !sidebar })}
          >
            <PanelToggleIcon size={20} />
          </button>
        </div>

        {/* 发布框：紧贴品牌下方（v0.5.1 起常驻侧栏，不再在主区） */}
        <Composer />
      </div>

      {/* 内层定宽（= 目标栏宽）：折叠动画压外层宽度时内层不被逐帧压缩重排，
          内容是被「抽屉口」徐徐裁走而不是被挤扁 —— 动效不发僵的关键（v0.5.2） */}
      <div className="momo-sidebar-inner">
        {/* 单遍历渲染（R7）：nav 连续段自带「分隔线 + <nav>」外壳，section 段各自渲染 */}
        {groups.map((g, i) =>
          'nav' in g ? (
            <Fragment key={`nav-${i}`}>
              <div className="momo-sidebar-rule" />

              <nav className="momo-menu">
                {g.nav.map((it) => (
                  <button
                    key={it.mode}
                    className={`momo-menu-item ${mode === it.mode ? 'momo-menu-on' : ''}`}
                    onClick={() => onMode(it.mode)}
                  >
                    <Icon name={it.icon} />
                    <span className="momo-menu-text">{it.label()}</span>
                  </button>
                ))}
              </nav>
            </Fragment>
          ) : locked && g.slot.filters ? (
            // BUG-123b：回顾批次是进档那一刻的快照，筛选变了不重抽——回顾档下改筛选的区块
            // 整块 inert（点不到、Tab 不进），压暗示意「此刻不可用」；说明条按用户裁定
            // （2026-10-07）不渲染，锁本身保留。
            <Fragment key={g.slot.id}>
              <div className="momo-sidebar-locked" inert aria-disabled="true">
                {g.slot.render(sectionData)}
              </div>
            </Fragment>
          ) : (
            <Fragment key={g.slot.id}>{g.slot.render(sectionData)}</Fragment>
          ),
        )}
      </div>
    </aside>
  )
})
