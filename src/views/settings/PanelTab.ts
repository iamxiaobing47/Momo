import {
  VIEW_IDS,
  SIDEBAR_WIDTH,
  clampSidebarWidth,
  isDensity,
  sanitizeDensityViews,
  type Density,
  type DensityViewPref,
  type ViewId,
} from '../../momo/types'
import { copy } from '../../momo/i18n'
import { useUi } from '../../ui/store'
import { h, triangleSvg } from './dom'
import { PREFS_DEFAULTS, SIDEBAR_TOGGLE_KEYS } from './sections'
import type { SettingsCtx } from './context'

// ③ 面板与侧栏：v0.9.33 起两张卡，各管一块区域——
//   面板与侧栏（内部侧栏停靠侧 / 宽度 / 侧栏功能开关网格）
//   视图（每档一个开关 + 一对上下箭头）
// 「面板停靠侧」一行已移除：面板落在 Obsidian 哪一侧由用户拖动决定，
//  main.ts 的 savePanelSide 自动记住落点，设置页不再提供手动开关。
// 2026-10-09：两张卡各去掉一块预览——「面板与侧栏」卡的「整块面板」缩略
// （panelMock）与「视图」卡的「顶栏那一排」缩略（viewBarMock），都按用户
// 要求「去掉预览」整块删除。理由见 mock.ts 顶部的「预览缩略：已删除」。
// 同日「面板与侧栏」卡的卡头说明也按用户要求「去掉这个文字」整句移除：它
// 一句话点了本页两张卡各管什么，而行名与行说明就在页里摆着（判据同「不配
// 预览」）。desc 传空串，card() 对空 desc 不建 <p>。

export function buildPanelTab(ctx: SettingsCtx): void {
  const pn = copy.settingsPage.panel
  const c = ctx.card('momo-set-panel', 'momo-set-panel-card', pn.title, '', {
    // 恢复 = 侧栏回左侧 + 默认宽度 + 六个功能开关全开。
    // ⚠️ 这里**不碰面板停靠侧**：这张卡管的是 prefs.sidebarSide
    // （面板内那条功能侧栏停靠哪边，AppShell 只给它加个类），而停靠侧
    // settings.panelSide 由用户拖动记忆、设置页没有它的行（v0.9.9 已移除）。
    // 旧实现顺手调了 moveViewTo(PREFS_DEFAULTS.sidebarSide)：把整块面板搬到左侧
    // 并写盘 panelSide='left'——与卡片级「恢复默认」的 moveViewTo('right') 互相
    // 矛盾，两次「恢复默认」把面板送去相反的两侧（卡片级默认值在 PREFS_DEFAULTS，
    // DEFAULT_SETTINGS 是盘上目录那把，两个默认值本来就不是一回事）。
    //
    // v0.9.32：节奏视图内部两档（轴时间 / 间隔标注）随该视图的移除整卡删除；
    // v0.9.33：顶栏视图那一排也分家（它说的是一块独立区域）——两级拆分同一条线：
    // 一张卡 + 一块预览 + 一颗只收自己那几行的恢复默认。
    onReset: () => {
      ctx.setPref({
        sidebarSide: PREFS_DEFAULTS.sidebarSide,
        sidebarWidth: PREFS_DEFAULTS.sidebarWidth,
        sections: { ...PREFS_DEFAULTS.sections },
      })
      ctx.rerender()
    },
  })

  ctx.row(c, pn.sidebarSide.name, pn.sidebarSide.desc).append(
    ctx.field.segmented(
      [
        { value: 'left' as const, label: pn.sidebarSide.left },
        { value: 'right' as const, label: pn.sidebarSide.right },
      ],
      () => ctx.service.data.prefs.sidebarSide,
      (v) => ctx.setPref({ sidebarSide: v === 'right' ? 'right' : 'left' }),
    ),
  )

  ctx.row(
    c,
    pn.sidebarWidth.name,
    pn.sidebarWidthDesc(SIDEBAR_WIDTH.default),
  ).append(
      ctx.field.buildSlider(
        SIDEBAR_WIDTH.min,
        SIDEBAR_WIDTH.max,
        1,
        () => ctx.service.data.prefs.sidebarWidth,
        (v) => ctx.setPrefLive({ sidebarWidth: clampSidebarWidth(v) }),
        // BUG-126f：单位从 `copy.settingsPage.look.sliderUnit.px` 读（与 LookTab 的
        // buildSliderRow 同一把尺子），不在这里手写「px」再开一个真源。
        (v) => `${v} ${copy.settingsPage.look.sliderUnit.px}`,
      ),
    )

  // 侧栏功能：2 列开关网格（开关卡 r10 / surface-2 / 1px line-soft）
  const block = h('div', 'momo-set-block is-tiles')
  const blockHead = h('div', 'momo-set-block-head')
  blockHead.append(
    h('span', 'momo-set-block-title', pn.sidebarBlock.title),
    h('span', 'momo-set-block-note', pn.sidebarBlock.note),
  )
  const grid = h('div', 'momo-set-grid')
  for (const key of SIDEBAR_TOGGLE_KEYS) {
    const item = pn.sidebarToggle[key]
    const cell = h('div', 'momo-set-tile')
    const info = h('div', 'momo-set-info')
    // 2026-10-11 起侧栏功能开关不带行说明（用户要求「去掉这些文字」）：字典里
    // sidebarToggle 的条目只剩 name，这里也不再建 .momo-set-desc（判法同 row() 对
    // 空 desc 不建元素）。
    info.append(h('div', 'momo-set-tile-name', item.name))
    cell.append(
      info,
      // patch 从 **service 现读**的 sections 展开，不是 display() 时的 prefs 快照：
      // 快照会让同一轮设置里连点两个开关时，前一次改动被整块回写覆盖（v0.7.6 修复）
      ctx.field.buildSwitch(
        () => ctx.service.data.prefs.sections[key],
        (v) =>
          ctx.setPref({
            sections: { ...ctx.service.data.prefs.sections, [key]: v },
          }),
      ),
    )
    grid.append(cell)
  }
  block.append(blockHead, grid)
  c.append(block)

  // 刻意**不配**预览（2026-10-09 用户要求「去掉整块面板的预览」）：这一块原先画的是
  // 整块面板的缩略（侧栏停哪边、多宽、侧栏里出现哪些区块，顶栏那一排压暗）。删的理由
  // 与 2026-10-04 的语言 / 配色 / 字体、2026-10-06 的正文预热同一条判据——**只在重复
  // 别处的话的块，不配预览**：三行偏好（停靠侧 / 宽度 / 七个开关）说的就是侧栏本身，
  // 主面板那条真侧栏时时刻刻都在用户眼前，设置页里再画一张缩略只是同一件事的第二份
  // 表述；而它要画全就得把速览数字、热力图、菜单、两棵树都画成色条，粒度越画越粗，
  // 既不像真的也答不出「这一行改了哪儿」。
  // 顶栏那一排归下面那张「视图」卡；那块预览（viewBarMock）也在同日按用户要求删了。

  // ================== 视图（v0.9.33 起单独一张卡）==================
  // 顶栏那排视图按钮（列表 / 网格 / 焦点）曾是**写死的五项**：位置挪不
  // 动、也藏不掉。v0.9.17 补上用户要的两件事——每档一个开关、一对上移 / 下移；顺序与
  // 显隐一起落在 prefs.densityViews（数组顺序即顶栏顺序）。v0.9.33 起它**自己一张卡**：
  // 「顶栏那一排」与「面板里那条侧栏」是两块区域。
  // 2026-10-09：星球 / 地点分组两档从 ListControls 里**写死追加**收进 densityViews
  // （用户报「目前有五个视图，这里只显示了三个视图」），于是这张卡从三行变五行，
  // 五档同一套开关 + 排序。地点两档的降级只到「能不能关 / 摆第几」这一层：它们
  // 不是密度，`sanitizeDensityViews` 的收口因此是「至少一档**密度**开着」。
  const vc = pn.viewsCard
  const cViews = ctx.card('momo-set-panel', 'momo-set-panel-views', vc.title, vc.desc, {
    // 每档 ×（一对箭头 + 一个开关），手动拨回去是十几下——恢复 = 全部档位全开、顺序回默认
    onReset: () => {
      ctx.setPref({ densityViews: PREFS_DEFAULTS.densityViews.map((v) => ({ ...v })) })
      ctx.rerender()
    },
  })
  const vblock = h('div', 'momo-set-block is-views')
  const vlist = h('div', 'momo-set-views')

  /** 现读盘上的视图配置。**不取 display() 时的 prefs 快照**：同屏连点两个开关时，
   *  快照会让后一次改动整份回写、吃掉前一次（v0.7.6 修过的同一个坑，见上面的开关网格）。 */
  const viewsNow = (): DensityViewPref[] => ctx.service.data.prefs.densityViews

  /**
   * 落盘新的顺序 / 显隐，并在**关掉当前正在看的那一档**时把密度一起回退到
   * 「还开着的第一档密度」。
   *
   * 不回退的后果：顶栏分段里已经没有这一档的按钮，卡片流却仍在按它渲染——
   * 「现在看的是哪一档」在界面上无迹可寻，两个状态打架。回退与写入合成**一次**
   * setPref，落盘只有一次（sanitizeDensityViews 保证至少一档密度开着，回退目标必存在）。
   *
   * 地点两档同理：正停在星球 / 地点分组档，而那一档被关掉 → 把 `locView` 拨回
   * `'off'`。`locView` 是**会话态不是 pref**（store/location.ts），`setPref` 到不了
   * 它，所以这里直接调 store——与 settings.ts 的 `useUi.setState` 同一手法。
   */
  const applyViews = (next: DensityViewPref[]): void => {
    const clean = sanitizeDensityViews(next)
    const cur = ctx.service.data.prefs.density
    const stillOn = clean.some((v) => v.id === cur && v.on)
    // 回退目标**只在前几档密度里找**：地点两档不是密度，`visible[0]` 可能是星球——
    // 那会把 density 写成 'globe'（不是 Density 的合法值）。`filter(isDensity)`
    // 把 ViewId[] 收成 Density[]，类型上就说得出「这里只有密度」。
    const onDensities = clean.filter((v) => v.on).map((v) => v.id).filter(isDensity)
    const density: Density = stillOn ? cur : (onDensities[0] ?? 'list')
    ctx.setPref({ densityViews: clean, density })
    const loc = useUi.getState().locView
    if (loc !== 'off' && !clean.some((v) => v.id === loc && v.on)) useUi.getState().setLocView('off')
  }

  interface ViewRow {
    el: HTMLElement
    up: HTMLButtonElement
    down: HTMLButtonElement
    sw: HTMLButtonElement
  }
  const viewRows = new Map<ViewId, ViewRow>()

  /** 按盘上的顺序重排 DOM，并刷新两类禁用（首行的 ↑ / 末行的 ↓ / 只剩一档密度时的开关）。
   *  数据是唯一真源，DOM 跟着它走——`append` 一个已在容器里的节点就是移动它，
   *  监听器与开关状态都跟着节点走，不必重建任何东西。 */
  const paintViews = (): void => {
    const list = viewsNow()
    for (const v of list) {
      const row = viewRows.get(v.id)
      if (row) vlist.append(row.el)
    }
    const onDensities = list.filter((v) => v.on && isDensity(v.id)).length
    const hasVisibleBefore = (i: number): boolean => list.slice(0, i).some((v) => v.on)
    const hasVisibleAfter = (i: number): boolean => list.slice(i + 1).some((v) => v.on)
    for (const [id, row] of viewRows) {
      const i = list.findIndex((v) => v.id === id)
      row.up.disabled = i < 0 || !hasVisibleBefore(i)
      row.down.disabled = i < 0 || !hasVisibleAfter(i)
      // 只剩一档密度开着时禁掉它的开关：三档密度全关 = 顶栏只剩星球 / 分组两颗，
      // 点进去就再也回不到常规卡片流（离开地点视图只能点一档密度）。sanitize 里也有
      // 同一道收口，但那里是**整份回默认**——用户会看见自己刚关掉的那一档连带着别的
      // 档一起全回来了，比直接禁用这颗开关更难理解。地点两档没有这一禁：收口在密度
      // 那边，它们全关也至少还剩一档密度（与 ↑↓ 的判据无关，那两颗只看 on 的总数）。
      const onlyOne = isDensity(id) && list[i]?.on === true && onDensities === 1
      row.sw.disabled = onlyOne
      row.sw.title = onlyOne ? vc.lastOne : ''
    }
  }

  /** 换位：与**这个方向上最近的那一档开着**的视图对调（越界时不动）。
   *
   *  为什么不是「与紧邻那一格对调」：禁用判据（paintViews 的 hasVisibleBefore /
   *  hasVisibleAfter，也就是上面 ↑↓ 那两颗按钮的 disabled）问的是「这个方向上还有没有
   *  **开着**的档」。动作与判据必须同一把尺，否则关掉的档夹在中间时按钮可点、
   *  点下去与隐藏档对调 → 顶栏（只渲染 on 的那些）可见顺序一个像素都不动
   *  ——「按了、落盘了、界面没反应」（BUG-136e，BUG-80c 那条「拒与隐藏档对调」
   *  在 midnight 档整档移除时跟着丢了）。 */
  const moveView = (id: ViewId, dir: -1 | 1): void => {
    const list = [...viewsNow()]
    const i = list.findIndex((v) => v.id === id)
    if (i < 0) return
    let j = i + dir
    while (j >= 0 && j < list.length && list[j]?.on !== true) j += dir
    if (j < 0 || j >= list.length) return
    const tmp = list[i] as DensityViewPref
    list[i] = list[j] as DensityViewPref
    list[j] = tmp
    applyViews(list)
    paintViews()
  }

  // 行按 VIEW_IDS 的顺序建一次（建成什么样与用户顺序无关，顺序由 paintViews 排）。
  for (const id of VIEW_IDS) {
    const item = pn.viewToggle[id]
    const row = h('div', 'momo-set-tile is-view')
    const info = h('div', 'momo-set-info')
    // 2026-10-11 起视图五档也不带行说明（用户要求「去掉这些文字」）：字典里
    // viewToggle 的条目只剩 name，这里只建名称（同侧栏功能开关那一批）。
    info.append(h('div', 'momo-set-tile-name', item.name))

    const group = h('div', 'momo-set-viewmove-group')
    const up = h('button', 'momo-set-viewmove')
    up.type = 'button'
    up.setAttribute('aria-label', pn.viewMove.up(item.name))
    // 实心三角（2026-10-06）：线稿 chevron 在墨夜底上只剩两道细丝，用户要求
    // 「换一个更明显的图标」。形状的理由见 dom.ts 的 triangleSvg 注释。
    up.append(triangleSvg('up'))
    up.addEventListener('click', () => moveView(id, -1))
    const down = h('button', 'momo-set-viewmove')
    down.type = 'button'
    down.setAttribute('aria-label', pn.viewMove.down(item.name))
    down.append(triangleSvg('down'))
    down.addEventListener('click', () => moveView(id, 1))
    group.append(up, down)

    const sw = ctx.field.buildSwitch(
      () => viewsNow().find((v) => v.id === id)?.on ?? true,
      (on) => {
        applyViews(viewsNow().map((v) => (v.id === id ? { ...v, on } : v)))
        paintViews()
      },
    )
    row.append(info, group, sw)
    viewRows.set(id, { el: row, up, down, sw })
  }

  vblock.append(vlist)
  cViews.append(vblock)
  paintViews()
}
