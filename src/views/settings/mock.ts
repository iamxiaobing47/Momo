import { copy } from '../../momo/i18n'
import { dayKey } from '../../momo/dates'
import { monthDayOf, timeOf } from '../../ui/card/title'
import { iconSvg, h } from './dom'
import type { SettingsCtx } from './context'

// 设置页的**可视化预览**（v0.9.33 重做）。
//
// 沿革：2026-10-01 用户反馈「配置页面内容太多，但每一项都必要、无法删减；希望每个配置项
// 做成可视化的样子」→ 第一版给每张配置卡尾随一块预览（配置在上、预览在下）。2026-10-02
// 用户反馈「此前交给其他 AI 完成的效果不佳」——复盘后落成下面四条，本文件与各 Tab 的
// 分卡一起兑现：
//
// ① **一个 mock 讲一个区域**。第一版里「卡片行为」那张卡有 12 行、一块预览要同时说
//    元信息行 / 标题 / 只读 / 操作按钮四件事，而预览吊在 800px 之外——改第 3 行时
//    第 12 行下面的预览根本不在视野里。现在按卡片解剖面拆卡：信息行 / 标题 / 尺寸 /
//    操作各一张，每张卡（含预览）都压在一屏以内。
// ② **一个场景，只亮一块**（`dim` / `hl`）。卡片类预览共用同一张卡：当前区域垫一层
//    accent 浅底 + 描边（`.momo-set-mock-hl`），其余部分压到 30%（`.momo-set-mock-dim`）。
//    四张卡不再长得一模一样，「这块是改哪里的」一眼可辨——这比换四种画法更省也更准。
// ③ **预览跟着当前偏好实时重画**：预览不持有第二份状态，一律从 `service.data.prefs`
//    现读，挂在 ctx.onPrefChange 上（见 context.ts）。漏接线的表现正是用户报的「改了没动」。
// ④ **mock 与真面板共用同一套类与变量**：卡片 mock 直接用主面板那套
//    `.momo-card` / `--momo-ui-fs-body` / `--momo-ui-r-card`（App.tsx 把这三枚内联挂在
//    `.momo-app` 上，这里挂在预览卡自己身上），所以看到的正是面板上那张；只有地点
//    这种「整个区域」的缩略才自绘（自绘类一律 `momo-set-mock-*`，长相在
//    styles.src/80-settings.css）。「整块面板」「统计页」「回顾与活跃度」三块缩略
//    与「头像与名称」那一角已于 2026-10-09 删除，见下面。
//
// 语言卡 / 配色卡 / 字体卡三张的舞台里只放一条**斜纹空位**：它们本身就是视觉的（切了
// 整页就变 / 色卡自己穿着那套配色 / 格子里的样字就是拿那套字体画的），再画一遍是同一个
// 区域配两块预览。块头照旧出（它负责回答「为什么这块是空的」）——十二张卡一张不落都有
// 预览块，「卡头 → 行… → 一块预览」的节奏才连得上，用户不会在第三张卡上停下来想
// 「这张怎么没有预览」。落点见下面的 placeholderMock。

/** 预览块的一行块头：`预览 · 区域名` + 右侧一句说明 */
interface MockHead {
  /** 区域名（两个字最稳，块头一行放得下） */
  title: string
  /**
   * 这一块在讲什么（一句话）。写成函数的是**跟着偏好走**的那种说明（如「标题」那块：
   * 升格开着 / 关着要说两句不同的话）——它在每次 `paint()` 里现算。
   */
  note: string | (() => string)
}

/**
 * 预览块外壳：块头（`预览` 标 + 区域名 + 一句说明）+ 舞台。`build` 每次把整棵舞台重画一遍。
 *
 * 订阅制（ctx.onPrefChange）而不是「各控件 set 完顺手 paint」：设置页一半控件是
 * get/set 一对回调的形状，预览与控件分居两处，逐个接线必漏；漏一处的表现正是
 * 「改了没动」。预览只认「偏好变了」，不认是哪个控件改的。
 */
function mockBlock(ctx: SettingsCtx, head: MockHead, build: (stage: HTMLElement) => void): HTMLElement {
  const block = h('div', 'momo-set-block is-mock')
  const headEl = h('div', 'momo-set-mock-head')
  // 名字用 `-region` 而不是 `-name`：`-name` 一族会与侧栏品牌名（.momo-brand-name）
  // 撞车，同名会被 lint-css 的「重复定义」抓住（brandMock 2026-10-09 已删，规矩留着）。
  const noteEl = h('span', 'momo-set-mock-note')
  headEl.append(
    h('span', 'momo-set-mock-tag', copy.settingsPage.mock.label),
    h('span', 'momo-set-mock-region', head.title),
    noteEl,
  )
  const stage = h('div', 'momo-set-mock-stage')
  block.append(headEl, stage)
  const paint = (): void => {
    // 说明也归预览：它讲的就是「这一块现在长什么样」。第一版只重画 stage、块头留在
    // 建块时那一句，于是拨开关时标题行变了、说明还停在旧话上（自相矛盾）。
    noteEl.textContent = typeof head.note === 'function' ? head.note() : head.note
    stage.empty()
    build(stage)
  }
  ctx.onPrefChange(paint)
  paint()
  return block
}

/** mock 用的一样文本地时刻（本地 14:30，任何时区下显示一致；格式仍走卡片那套取法） */
const SAMPLE_AT = new Date(2026, 8, 19, 14, 30).toISOString()

/** 卡片元信息行的时间戳：与 Card.tsx 的 stamp 同一套口径（auto 按列表密度只带时刻） */
type MomoStamp = 'auto' | 'day' | 'full'

function stampText(stamp: MomoStamp): string {
  if (stamp === 'day') return `${monthDayOf(SAMPLE_AT)} ${timeOf(SAMPLE_AT)}`
  if (stamp === 'full') return `${dayKey(SAMPLE_AT)} ${timeOf(SAMPLE_AT)}`
  return timeOf(SAMPLE_AT)
}

/** ② 的一条规矩：不在当前区域里的东西压到 30%——同一张卡，只有一块是「亮」的 */
const DIM_CLASS = 'momo-set-mock-dim'
/** ② 的另一半：当前区域垫一层 accent 浅底 + 描边（样式在 80-settings.css） */
const HL_CLASS = 'momo-set-mock-hl'

function mark(el: HTMLElement, cls: string, on: boolean): HTMLElement {
  if (on) el.classList.add(cls)
  return el
}

/**
 * 预览卡里的一个「区域」：`key` 与 buildCardScene 的 focus 对齐。
 * 三件事一起定：这一块**要不要压暗**（不是当前区域）、**要不要垫亮**（就是当前区域）。
 */
type SceneRegion = 'meta' | 'title' | 'body' | 'actions'

/** 预览卡上的标签胶囊行：与 CardTags 同一套类（momo-card-tags / momo-card-tag） */
function mockTags(bottom: boolean, dim: boolean): HTMLElement {
  const row = h('div', `momo-card-tags${bottom ? ' momo-card-tags-bottom' : ''}`)
  for (const t of copy.settingsPage.mock.sample.tags) {
    row.append(h('button', 'momo-card-tag', `#${t}`))
  }
  return mark(row, DIM_CLASS, dim)
}

/**
 * 预览卡上的**地点标签**行：与 LocationPills 同一套类（momo-loc-pills / momo-loc-pill）+
 * mappin 图标。位置由 prefs.locPosition 决定，与 mockTags 各自独立——改「地点位置」时
 * 眼睛落在地点这一枚上，不会和 #标签 行混在一起。
 */
function mockLocPills(bottom: boolean, dim: boolean): HTMLElement {
  const row = h('div', `momo-loc-pills${bottom ? ' momo-loc-pills-bottom' : ''}`)
  const pill = h('span', 'momo-loc-pill')
  pill.append(iconSvg('mappin', 12), h('span', '', copy.settingsPage.mock.sample.geo.place))
  row.append(pill)
  return mark(row, DIM_CLASS, dim)
}

/** 场景参数：一句话说清「画哪张卡、亮哪一块」 */
interface SceneOpts {
  /** 亮哪一块（其余压暗）。缺省 = 整张都亮（尺寸 / 间距那张靠两张卡自己说话） */
  focus?: SceneRegion
  /**
   * 标题行出不出——口径与真卡（Card.tsx 的 `split`）严格一致：
   *   · `'ifOn'` —— 只在偏好里「短首行作为标题」开着时出（信息行 / 操作两块用它
   *     当背景板，开关关着就不该凭空多一行）；
   *   · `'force'` —— 只有「卡片标题」那块用。开着 = 这一行单独成行且是这张卡的焦点；
   *     关着 = **与真卡一致地不画标题元素**，首行并进正文第一行。早先关着时也照样
   *     画那一行、只压暗，为的是「拖字号滑杆屏幕上不动不像坏了」——可它呈现的并不
   *     是用户盘上那张卡（真卡关着时首行就是正文），块头那句「这一行现在并进下面的
   *     正文」也就说了不做。预览的第一性原理是忠实：字号滑杆在关着时没有效果，
   *     那就是真的，块头说明会把这件事讲清。
   */
  title?: 'ifOn' | 'force'
  /** 出不出操作按钮 */
  actions?: boolean
  /** 正文用长样本还是短样本（尺寸那张第二张卡用短样本） */
  body?: 'long' | 'short'
}

/**
 * 一张按当前偏好渲染的 Momo 卡（卡片类预览共用）：
 * 视觉微调三档 = `.momo-app` 上那三枚内联 var（App.tsx 同款），卡片间距 = gap class
 * （80-settings.css 的 `.momo-ui-gap-*` 是全局规则，挂在预览流上照样兑换）。
 */
function buildCardScene(ctx: SettingsCtx, o: SceneOpts): HTMLElement {
  const p = ctx.service.data.prefs
  const s = copy.settingsPage.mock.sample
  const focus = o.focus
  const off = (region: SceneRegion): boolean => focus !== undefined && focus !== region

  const card = h('div', `momo-card${p.readOnly ? ' momo-card-readonly' : ''}`)
  card.style.setProperty('--momo-ui-r-card', `${p.cardRadius}px`)
  card.style.setProperty('--momo-ui-fs-body', `${p.cardFontSize}px`)
  card.style.setProperty('--momo-ui-fs-title', `${p.cardTitleSize}px`)

  const meta = h('div', 'momo-card-meta')
  const stamp = h('span', 'momo-card-stamp', stampText(p.cardStamp))
  meta.append(mark(stamp, DIM_CLASS, off('meta')))
  if (p.showCharCount) {
    meta.append(mark(h('span', 'momo-card-dot'), DIM_CLASS, off('meta')))
    meta.append(
      mark(h('span', 'momo-card-stamp', `${s.body.trim().length} ${copy.common.unit.char}`), DIM_CLASS, off('meta')),
    )
  }
  // 与 CardMeta 同一条把标签推到右侧的占位（Spacer = .momo-flex1）
  meta.append(h('span', 'momo-flex1'))
  // 地点标签与 #标签 各按各的位置偏好（CardMeta 里地点在标签之前，这里同序）
  if (p.locPosition === 'meta') meta.append(mockLocPills(false, off('meta')))
  if (p.tagPosition === 'meta') meta.append(mockTags(false, off('meta')))
  // 操作行容器先占位（与 CardActions 同一个类），按钮由 paintActions 按门控填。
  // 它是「操作」那块区域：不在焦点里压暗、在焦点里垫亮——与 info / title 同一套语言
  // （它是 meta 行里的 flex 项，所以亮的是这一小撮按钮，不是整条 meta 行）。
  const actions = h('div', 'momo-card-actions')
  if (o.actions) {
    meta.append(mark(mark(actions, DIM_CLASS, off('actions')), HL_CLASS, focus === 'actions'))
  }
  mark(meta, HL_CLASS, focus === 'meta')
  card.append(meta)

  // 「卡片标题」卡：开关关着 = 首行还没升格（真卡把它并进正文）。开出这个语义后
  // 标题行就不画了，改由正文第一行顶上，见下面正文那段。
  const notPromoted = o.title === 'force' && !p.titleFromFirstLine
  if (!notPromoted && (o.title === 'force' || (o.title === 'ifOn' && p.titleFromFirstLine))) {
    const titleEl = h('div', 'momo-card-title', s.title)
    // 亮块只有一处：焦点不在标题行时，这一行**必须**压暗。原先写成
    // 「notPromoted 才压暗」，于是焦点在信息行 / 操作行 / 正文时（标题是背景板、
    // 只是碰巧升格开着）标题停在满墨——同一张卡上两处都是亮的，正是这套语言要
    // 消灭的东西。视觉验收（shots 的 settings-look）抓到，DOM 测试看不见。
    // 现在 notPromoted 时这一行根本不画（并进正文），压暗只剩「开着但不是焦点」
    // 这一种情形。
    const isFocus = focus === 'title'
    card.append(mark(mark(titleEl, DIM_CLASS, !isFocus), HL_CLASS, isFocus))
  }

  // 正文：标题卡开关关着时首行并进正文第一行（Card.tsx 关着时 body = 整篇 content，
  // 首行就在其中）。同时压暗也不该落在正文上——这一版没有标题行可亮，整张卡回
  // 常态，否则关着时整块预览都是灰的，比原先那行假标题更难读。
  const text = o.body === 'short' ? copy.settingsPage.mock.sample.bodyShort : s.body
  const bodyEl = h('div', 'momo-card-body')
  if (notPromoted) bodyEl.append(document.createTextNode(s.title), h('br'))
  bodyEl.append(text)
  card.append(mark(bodyEl, DIM_CLASS, off('body') && !notPromoted))

  // 底部地点标签行 / 底部标签行与各自 meta 行那份是**二选一**（Card.tsx 的裁剪）：
  // 地点在标签之前，与 meta 行的顺序一致。它们属于「信息行」这块区域——拨到卡片底部
  // 时，亮的是**底部这一行**而不是 meta 行（同一个 focus，垫同一层 accent 底）：
  // 「标签排哪一行」改的就是它们排在哪一行。
  // 两行包进 .momo-card-foot（Card.tsx 同款）：两者都拨到底部时必须**并排一行**，
  // 不能一上一下叠成两排（用户反馈过的分排问题）。
  if (p.locPosition === 'bottom' || p.tagPosition === 'bottom') {
    const foot = h('div', 'momo-card-foot')
    if (p.locPosition === 'bottom') foot.append(mockLocPills(true, off('meta')))
    if (p.tagPosition === 'bottom') foot.append(mockTags(true, off('meta')))
    card.append(mark(foot, HL_CLASS, focus === 'meta'))
  }
  return card
}

/** 操作行的按钮：与 registry/cardActions.tsx 的门控同为准（pencil 只读态 / copy / tag / mappin / trash） */
function paintActions(host: HTMLElement, ctx: SettingsCtx): void {
  const p = ctx.service.data.prefs
  if (p.readOnly) host.append(actIcon('pencil'))
  if (p.showCardCopy) host.append(actIcon('copy'))
  if (p.showCardTag) host.append(actIcon('tag'))
  // 设地点那颗常驻（地点是内容，没有开关——见注册表第 ③ 种门控）
  host.append(actIcon('mappin'))
  if (p.showCardDelete) host.append(actIcon('trash', true))
}

/** 一枚操作按钮的图标（span 而非 button：预览不接真动作，设置页里不留点了没反应的钮） */
function actIcon(name: 'pencil' | 'copy' | 'tag' | 'mappin' | 'trash', danger = false): HTMLElement {
  const el = h('span', `momo-card-act${danger ? ' momo-card-act-danger' : ''}`)
  el.append(iconSvg(name, 14))
  return el
}

/** 一张卡 + 操作按钮的完整场景（操作行那块用） */
function cardWithActions(ctx: SettingsCtx, o: SceneOpts): HTMLElement {
  const card = buildCardScene(ctx, o)
  const host = card.querySelector<HTMLElement>('.momo-card-actions')
  if (host) paintActions(host, ctx)
  if (ctx.service.data.prefs.readOnly) {
    card.append(h('div', 'momo-set-mock-readonly-tip', copy.settingsPage.mock.readOnlyTip))
  }
  return card
}

// ======================= 占位类：语言 / 配色 / 字体 =======================
// 这三张卡的控件**本身就是预览**（语言一切整页换、色卡自己穿着那套配色、字体格子里的样字
// 就是拿那套字体画的），再画一张是同一区域配两块预览。但预览块照样出——十二张卡一张不落
// 才有节奏。舞台里放一条 52px 的斜纹空位，块头那句说明负责回答「为什么是空的」。
// 与设计稿同一处理：区域名写 `—`（没有区域可言），舞台 is-wide（空位铺满一行）。

// ======================= 占位预览：已删除 =======================
// 语言 / 配色 / 字体三张卡的「为什么这块是空的」占位预览（块头说明 + 一条斜纹
// 空位）已于 2026-10-04 按用户要求整块移除，连带 placeholderMock helper、字典
// mock.lang / mock.scheme / mock.font 与 CSS .momo-set-mock-slot。
// 理由是它不渲染任何东西：三张卡本身就是视觉的（切了整页就变 / 色卡自己穿着那套
// 配色 / 格子里的样字就是拿那套字体画的），那一块只在重复这句话。

// ======================= 正文预热预览：已删除 =======================
// 「正文预热」卡那块预览（正文切一刀：前一段已画好、后一段还没画 + 一根 accent 发丝
// 切点线 + 一行「当前：某档」读数）已于 2026-10-06 按用户要求「正文预热，不需要显示
// preview」整块移除，连带 warmMock、字典 mock.warm、SceneOpts.warm 与
// CSS .momo-set-mock-warm{,-cut,-rest,-cap}。
// 理由与下面 ①②③ 同族：那一块画的是**悬停那一下**的渲染节奏（划过去才出现、点下去就
// 没了），设页上留不住它；四档 seg 的档位名（关闭 / 1/4 / 1/2 / 全部）已经把「预热多少」
// 说清了，再画一遍是把同一句话配第二块预览——正是「一个区域一块预览」要消灭的重复。
// 全库没有第二处需要按 warmRatio 分色正文的地方，见 ui.md §6「hover 预热」。

// ======================= 卡片类：信息行 / 标题 / 尺寸 / 操作 =======================
// 四块共用同一张卡（buildCardScene），差别只在「亮哪一块」——所以四张卡不再长得一样。

/** 界面外观 · 卡片信息行：时间 / 字数 / #标签 / 地点各自排在哪一行 */
export function metaMock(ctx: SettingsCtx): HTMLElement {
  const m = copy.settingsPage.mock.meta
  return mockBlock(ctx, m, (stage) => {
    stage.append(buildCardScene(ctx, { focus: 'meta', title: 'ifOn' }))
  })
}

/** 界面外观 · 卡片标题：短首行升格与两档字号 */
export function titleMock(ctx: SettingsCtx): HTMLElement {
  const m = copy.settingsPage.mock.title
  // 块头那句说明跟着开关走：开着说「这一行就是升格后的样子」，关着说清「它现在并进
  // 正文」。**现算**（不是建块时算一次）：拨开关就换话，否则说明与它下面画的东西会
  // 互相打架。卡片本身也按同一个开关分叉——关着时首行真的并进正文第一行（与真卡
  // 同口径，见 buildCardScene 的 notPromoted），开着时才单独成行并垫亮。
  return mockBlock(
    ctx,
    { title: m.title, note: () => (ctx.service.data.prefs.titleFromFirstLine ? m.on : m.off) },
    (stage) => {
      stage.append(buildCardScene(ctx, { focus: 'title', title: 'force' }))
    },
  )
}

/** 界面外观 · 卡片尺寸：正文字号 / 圆角 / 间距——两张卡并排（间距只有两张看得出来） */
export function sizeMock(ctx: SettingsCtx): HTMLElement {
  const m = copy.settingsPage.mock.size
  return mockBlock(ctx, m, (stage) => {
    const flow = h('div', `momo-flow momo-ui-gap-${ctx.service.data.prefs.cardGap}`)
    flow.append(
      buildCardScene(ctx, { body: 'long' }),
      buildCardScene(ctx, { body: 'short' }),
    )
    stage.append(flow)
  })
}

/** 界面外观 · 卡片操作：只读态与右上角三枚按钮的显隐 */
export function actionsMock(ctx: SettingsCtx): HTMLElement {
  const m = copy.settingsPage.mock.actions
  return mockBlock(ctx, m, (stage) => {
    stage.append(cardWithActions(ctx, { focus: 'actions', title: 'ifOn', actions: true }))
  })
}

// ======================= 头像与名称预览：已删除 =======================
// 「头像与名称」卡那块「侧栏左上角那一角」的预览（mark 跟着图标格子走、名称跟着输入框
// 走）已于 2026-10-09 按用户要求「去掉预览」整块移除，连带 brandMock、字典 mock.brand
// 与 CSS .momo-set-mock-{brand,mark,mark-img,name}。
// 理由与「整块面板」「统计页」「回顾与活跃度」三块同族：卡里两行（左上角图标 / 左上角
// 名称）指的就是侧栏左上角那一角本身——它时时刻刻都在用户眼前，设置页里再画一枚小
// mark + 一个名字只是同一件事的第二份表述。
// 行为零变化：图标格子与名称输入框一行未动，照旧落盘。

// ======================= 整块区域：顶栏 / 地点 =======================

// ======================= 面板缩略预览：已删除 =======================
// 「面板与侧栏」卡那块「整块面板」缩略（侧栏停靠侧 / 宽度 / 侧栏功能开关 → 一块
// 面板 thumb：速览数字、热力图、菜单、地点树、标签树、顶栏那一排压暗、两条卡片色条）
// 已于 2026-10-09 按用户要求「去掉整块面板的预览」整块移除，连带 panelMock、
// MOCK_APP_WIDTH、字典 mock.panel 与 CSS .momo-set-mock-{app,side,sidebar-brand,
// quick,side-heat,menu,side-tree,tree-row,main,topbar,cards,cardbar}。
// 理由与 ①②③ 同族：三行偏好（停靠侧 / 宽度 / 七个开关）说的就是主面板那条真
// 侧栏本身，它时时刻刻都在用户眼前；设置页里再画一张缩略只是同一件事的第二份表述，
// 而要画全就得把速览 / 热力图 / 菜单 / 两棵树都画成色条——粒度越画越粗，既不像真的，
// 也答不出「这一行改了哪儿」。顶栏那一排归「视图」卡，那块预览（viewBarMock）同日
// 也删了，见下一节。

// ======================= 顶栏视图一排预览：已删除 =======================
// 「视图」卡尾随那块「顶栏那一排」缩略（按 densityViews 过滤后的可见档画一排
// chip：图标 + 名字，关掉的档不出现，顺序跟着设置页上的上下箭头走）已于
// 2026-10-09 按用户要求「去掉预览」整块移除，连带 viewBarMock、densityIcon、
// densityName、字典 mock.viewbar 与 CSS .momo-set-mock-{viewbar,viewbar-gap,
// view,view-text}。
// 理由与「整块面板」「回顾与活跃度」「统计页」三块同族：卡里五行说的就是顶栏
// 那五个按钮本身（开着就出现、摆第几位就第几位出现，顶栏时时刻刻在用户眼前），
// 设置页里再画一排小 chip 只是同一件事的第二份表述——而且它画的还只是图标 +
// 名字，答不出「关掉这一档顶栏少什么」。
// 行为零变化：五行的开关与上下箭头一行未动，照旧落盘；densityViews 的语义
// （数组顺序即顶栏顺序）也不变。

// ======================= 回顾与活跃度预览：已删除 =======================
// 「回顾与活跃度」卡那块预览（一批抽多少条画几张卡、最多 12 张加一颗「还有 N 条」
// 收尾；热力图窗口铺几个月就画几列格子）已于 2026-10-09 按用户要求「配置页面 -
// 回顾与活跃度，去掉回顾与活跃度的预览」整块移除，连带 reviewMock、heatLevel、
// 字典 mock.review 与 CSS .momo-set-mock-{review,sub,batch,batch-card,batch-more,
// heat,heat-month,heat-month-label,heat-cols,heat-col,heat-cell}。
// 理由与「整块面板」「统计页」两块同族：它讲的两行指的就是回顾页与侧栏热力图本身
// ——进回顾档那一刻用户就看见这一批有多厚，侧栏热力图时时刻刻铺在眼前，设置页里
// 再画一份只是同一件事的第二份表述。热力格子那组规则（.momo-set-mock-heat-cell）
// 随本次删除退役：面板缩略（2026-10-09 上午）与回顾预览两任消费者都已不在。
// 行为零变化：每批条数与热力图月数两行一行未动，照旧落盘。

// ======================= 统计页缩略预览：已删除 =======================
// 「统计页」卡那块按 STATS_GROUPS 分组的区块缩略（每个 chip 一张小卡，关掉的留一个
// 虚线空位）已于 2026-10-09 按用户要求「配置页面 - 统计页，去掉统计页的预览」整块
// 移除，连带 statsMock、字典 mock.stats 与 CSS .momo-set-mock-{stats,stat-group,
// stat-group-title,stat-cards,stat-card,stat-card-name}。
// 理由与「整块面板」那块同族：它讲的十一个 chip 指的就是统计页上那十一个区块本身
// （开着就出现、关掉就消失，真页时时刻刻在用户眼前），设置页里再画一排小卡只是同
// 一件事的第二份表述——而且画出来的还只是**一排名字**，既答不出「这张卡长什么样」，
// 也答不出「关掉它统计页少什么」。分组数那句说明归卡头 desc（BUG-105a 起从
// STATS_GROUPS.length 派生），不受影响。
// 行为零变化：区块显隐的 chip 与「恢复默认」一行未动，照旧落盘。

// ======================= 地点缩略预览：已删除 =======================
// 「地点」卡那块分组档位 + 侧栏地点树的缩略（组头写到哪一级、树里画不画展开钮）已于
// 2026-10-11 按用户要求「去掉地点分组与树的预览面板」整块移除，连带 locMock、字典
// mock.loc 与 CSS .momo-set-mock-loc*（group / tree / node / twisty / label）。
// 理由与「整块面板」「统计页」两块同族：它讲的两行指的就是侧栏地点树与地点分组流
// 本身——用户切回去看一眼就知道，缩略图只是同一件事的第二份表述，而且画出来的树是
// 假的（真树里每一行都能点、都管筛选）。
// 行为零变化：locLevel / locTreeExpand 两档偏好照旧落盘、照旧被消费（grouping 流与
// LocTreeRows 都读它们）；同批按用户要求从设置页去掉的只有「地点分组与显示」那一行。

