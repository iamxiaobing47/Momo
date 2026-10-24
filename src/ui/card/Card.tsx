import { memo, useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { dayOf, pinnedNotesSetOf, useUi } from '../store'
import type { MomoEntry } from '../../momo/types'
import { copy } from '../../momo/i18n'
import CardContextMenu from './CardContextMenu'
import { MarkdownBody } from './MarkdownBody'
import { CardTags } from './CardTags'
import { CardMeta } from './CardMeta'
import { LocationPills } from '../locations/locPills'
import { monthDayOf, firstLines, splitFirstLine, timeOf } from './title'

// Momo 卡片（migration-blocknote-to-native Phase 1.3）：只读轻渲染
// （MarkdownRenderer 能力注入），点击正文 → 在 Obsidian 原生编辑器里打开对应
// md 文件（编辑 / 保存 / 自动写盘全部交给 Obsidian，插件不再封装第二套编辑器）。
// 标签独立成行放卡片末尾（concept-momo-tags）。
//
// v0.5 版面（设计稿 §1 / §2），v0.7.3 起与随机回顾卡统一：
//   元信息行 = 时间 · 字数 + 标签胶囊 + 右侧操作（复制 / 加标签 / 删除）
//   → 标题行（**短首行才升为标题**，见 splitFirstLine）
//   → 正文（Markdown 轻渲染）
// v0.7.4：标签胶囊的挂点可配（prefs.tagPosition）——meta 行右侧（默认）或卡片底部一行。
// 多选态把右侧操作换成勾选圈，整卡可点（UI-9）。
//
// 拆分地图（本文件只剩完整卡 + 计划好的派生值）：
//   元信息行整块 → CardMeta.tsx（stamp / 字数在**这里**算好传进去，纯展示）
//   元信息行右侧那排操作 → CardActions.tsx（含 1400ms 复制态的 CopyButton.tsx）
//   正文的 Markdown 预处理在 markdown.ts、标题 / 时间取法在 title.ts、
//   正文渲染件在 MarkdownBody.tsx、标签胶囊行在 CardTags.tsx
//
// 另有两个**可选**入参，专供统计页「最长笔记」那张预览卡用（2026-10-01 用户反馈：
// 「统计页面里最长笔记的卡片和主页面正常渲染的卡片不一致，我希望是一致的，只是
// 额外要求是只渲染前三行」）：
//   `preview`      = 只读预览——不渲染操作行与右键菜单，点正文恒开 Obsidian
//   `previewLines` = 正文只露前 N 行（标题升格照常，字数仍算全篇）
// 之所以做成 Card 的入参而不是另写一张预览卡：预览卡要的就是「主页面上那一张」，
// 两条渲染路径各写一遍，任何一边改版面都会再次漂移（v0.7.6 那张 `.momo-record-card`
// 伪卡正是这么来的）。默认两个都不传 = 主页面原样，行为零变化。
//
// 第三档入参 `filtersLocked` 专供**回顾档**（2026-10-13 用户裁决「随机回顾画面的卡片，
// 也保持和主页面的卡片一样，只是标签不能做过滤了」）：回顾页整页改用这张 Card，
// 唯一差别是标签 / 地点胶囊只作展示——回顾批次是进档那一刻 `matched()` 的快照，
// 筛选区块本来就整块锁着（BUG-123b），pill 再能点就是点了没反应的动作。

export interface CardProps {
  entry: MomoEntry
  /** 只读预览（统计页最长笔记用）：无操作行、无右键菜单，点正文 = 在 Obsidian 打开 */
  preview?: boolean
  /** 正文只渲染前几行（统计页最长笔记用，默认不截断）。标题升格与全篇字数不受影响 */
  previewLines?: number
  /** 回顾档：标签 / 地点胶囊只作展示、不可点（其余版面与主页那张逐字同源） */
  filtersLocked?: boolean
}

export const Card = memo(function Card({
  entry,
  preview = false,
  previewLines = 0,
  filtersLocked = false,
}: CardProps) {
  // 多选态按**卡**选布尔量（v0.9.10）：zustand 对同值选择器直接 bail out，
  // 勾别的卡不会带这张重渲。（这里曾经经 CardScope Context 收四件套，context value
  // 每次勾选都换新 Set，几百张卡全重跑 render——那就是这轮修掉的性能回退。）
  const selectMode = useUi((s) => s.selectMode)
  const checked = useUi((s) => s.selected.has(entry.path))
  // 动作引用恒定，选它不触发重渲
  const toggleSelected = useUi((s) => s.toggleSelected)
  const caps = useUi((s) => s.caps)
  // D-09：把「设完就不变」的偏好合成**一个**订阅。旧写法每张卡订阅 6 个独立
  // selector（连同 caps / isPinned / toggleNotePin 共 9 个），几百张卡就是几千个
  // 订阅，每次 store 变更都要逐卡跑一遍 selector。用 useShallow 合并（本仓库在
  // App / FilterBar / Sidebar 的同一做法）：值没变不通知，任何一个变了也只通知
  // 一次——重渲次数与旧行为一致，订阅数从 9 降到 3。
  // （§5 说的 Context 下发同样只服务「订阅数」，分组订阅已经达到那个目的；
  //   偏好也因此**不进** Context——它们设完就不变，才值得合成一个订阅。）
  //
  // v0.9.22 又把右上角三枚操作按钮的显隐并进来：它们同样是「设完就不变」的
  // 偏好（设置页开关，改一次全列表重渲一次），按 D-09 就该进这个分组——单独
  // 开三个 selector 是把三年前的性能回退再犯一遍。
  const {
    mode,
    locView,
    titleFromFirstLine,
    titleMaxChars,
    readOnly,
    tagPosition,
    locPosition,
    cardStamp,
    showCharCount,
    showCardCopy,
    showCardTag,
    showCardDelete,
  } = useUi(
    useShallow((s) => ({
      mode: s.mode,
      locView: s.locView,
      titleFromFirstLine: s.titleFromFirstLine,
      titleMaxChars: s.titleMaxChars,
      readOnly: s.readOnly,
      tagPosition: s.tagPosition,
      locPosition: s.locPosition,
      cardStamp: s.cardStamp,
      showCharCount: s.showCharCount,
      showCardCopy: s.showCardCopy,
      showCardTag: s.showCardTag,
      showCardDelete: s.showCardDelete,
    })),
  )
  // 置顶（v0.8.3）：选择器只返回**本卡是否置顶**这个布尔值，所以置顶别的卡片
  // 不会带着它一起重渲；action 是 store 上的稳定引用，同样不触发重渲。
  // N14：查询走 Set（O(1)）而不是 pinnedNotes.includes 的线性扫；Set 由
  // store 的 pinnedNotesSetOf 按数组引用缓存，置顶表内容不变时复用同一个。
  const isPinned = useUi((s) => pinnedNotesSetOf(s.pinnedNotes).has(entry.path))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  /**
   * D-09：右键菜单改用 React 的 `onContextMenu` prop，不再每张卡
   * `addEventListener('contextmenu', …)`。React 的事件系统本身就在根上做一次
   * 委派——JSX prop 拿到的是那同一个监听，N 张卡从 N 个原生监听降到 0 个额外的。
   * 语义不变：preventDefault 同样作用在原生事件上，clientX/Y 原样可取。
   */
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (selectMode) return
      // 回收站模式不开右键菜单：菜单里只有「置顶」一颗，而置顶表按 entries 对账、
      // 回收站路径进不去也留不住（refresh 会剔掉），开了只会是一个点了没反应的动作
      if (mode === 'trash') return
      // 回顾档不开（BUG-250b）：菜单里只有「置顶」一颗，随机回顾是快照浏览，
      // 置顶入口留在主列表；且回顾页自带 ← → / 空格 / Esc 键盘流，菜单一开还会
      // 把焦点抢进第一项，直接打断翻张（键盘路径同门，见下方 onKeyDown）
      if (mode === 'review') return
      // 预览卡不开（统计页那三张）：预览是「看一眼然后去 Obsidian 读」，没有
      // 「在这里改它」的交互，见文件头 preview 的注释
      if (preview) return
      e.preventDefault()
      // 直接给视口坐标（clientX/Y）；菜单会被 CardContextMenu portal 到
      // .momo-app 根上再按自己的 offsetParent 现场换算——放在卡片里会被
      // .momo-main（relative，被侧栏宽度右移）/ 焦点滚动的 scale+blur 带偏。
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [selectMode, mode, preview],
  )

  /**
   * 「标题 + 正文」的切分与字数：**必须 memo**（内容不变时返回同一份对象）。
   *
   * Card 还订阅着 `readOnly` / `titleFromFirstLine` / `tagPosition` / `cardStamp`
   * （设置项，切换时全列表都会重渲一遍），而 `splitFirstLine` 每次返回的是
   * **新对象 + 新 body 字符串**，于是 MarkdownBody 的 `[caps, content, visible]`
   * effect 判定 content 变了 → 每张卡都 `empty()` + `keepIndent` +
   * `removeInlineTags` + 一整趟 Obsidian MarkdownRenderer（几百条库就是一次
   * 可见卡顿）。memo 之后 `split.body` 引用稳定，那趟重渲染只在正文真的变了
   * 时才发生。
   */
  // titleMaxChars（v0.9.12 起可配的字数上限）也要进依赖：改上限就得重新切一次
  const split = useMemo(
    () => (titleFromFirstLine ? splitFirstLine(entry.content, titleMaxChars) : null),
    [entry.content, titleFromFirstLine, titleMaxChars],
  )
  const time = timeOf(entry.createdAt)
  // 元信息行的时间戳（v0.9.1 可配日期粒度）：
  // auto（默认）= 旧行为——列表靠分组标题、焦点视图什么日期都不显；
  // day / full 无视视图一律带日期。
  // **地点分组档恒按「带月日」口径**：分组流的组头是地名不是日期，卡片再只显
  // 「01:34」就彻底看不出是哪天的了——不新增一档偏好。
  //（2026-10-01 晚：判据从 `mode === 'location'` 换成 `locView === 'group'`——
  //  地点不再是模式，分组流成了全部笔记的一档视图。）
  //（2026-10-12：网格档整体移除，原来那条「网格补月日」的分支随之删除——现在
  //  只有地点分组档走「带月日」。）
  // memo：locView / cardStamp 不变时别每次渲染都重新拼串（它们一变整列表重渲）
  // 算好的是**字符串**，交给纯展示的 CardMeta——元信息行只负责摆。
  const stamp = useMemo(() => {
    if (cardStamp === 'day' || locView === 'group') return `${monthDayOf(entry.createdAt)} ${time}`
    if (cardStamp === 'full') return `${dayOf(entry.createdAt)} ${time}`
    return time
  }, [entry.createdAt, cardStamp, locView, time])
  // 与 stats 侧的「长记录占比」同口径：计数用 trim() 后长度，不逐字符剥全部空白
  // （旧 replace(/\s/g,'') 与统计页字数永远对不上，见审计 #1）
  const charCount = useMemo(() => entry.content.trim().length, [entry.content])
  // 预览截断（统计页最长笔记用）：正文只取前 previewLines 行。**标题升格照常**
  // （切的是升格之后那段正文），字数仍按全篇算（charCount 上面那条不动）——
  // 预览卡要长得像主页面上那张，只有「露多少正文」这一处例外。
  // memo 的理由同 split：content 字符串每渲染都新建会让 MarkdownBody 的
  // [caps, content, visible, cacheKey] effect 判定「内容变了」而整篇重渲。
  const body = useMemo(() => {
    const source = split ? split.body : entry.content
    return previewLines > 0 ? firstLines(source, previewLines) : source
  }, [split, entry.content, previewLines])

  return (
    <div
      // `preview` 的类**拼在 momo-card 后面而不是占一个模板空位**：主页面那张卡
      // （preview 不传）的 class 串要与改动前逐字节一致——DOM 快照按 outerHTML
      // 逐字节比对，为一个用不上的空位重录整份基线不值得。
      className={`momo-card${preview ? ' momo-card-preview' : ''} ${selectMode ? 'momo-card-select' : ''} ${
        selectMode && checked ? 'momo-card-checked' : ''
      } ${readOnly && !selectMode ? 'momo-card-readonly' : ''}`}
      // 路径标记：视图锚点（跨密度切换的位置联动）按它认「这是哪张卡」。grid 密度
      // 没有窗口槽位可依附（瀑布流不窗口化）、无 IO 环境槽位也零包装直出，卡根带上
      // 它，各档密度 + 两条渲染路径才共用同一个定位标记。见 viewAnchor.ts
      data-path={entry.path}
      onContextMenu={onContextMenu}
      // BUG-82a：多选态整卡是勾选热区，但**也要走键盘**——旧实现只有 onClick，
      // 键盘用户进得了多选、勾不了卡。按勾选语义补 role=checkbox /
      // aria-checked / tabIndex + Enter/Space（预览卡不进多选：统计页那三张
      // 没有多选入口，角色补上去只会多一个假控件）。
      {...(preview
        ? {}
        : selectMode
          ? {
              role: 'checkbox' as const,
              'aria-checked': checked,
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                toggleSelected(entry.path)
              },
            }
          : {
              // BUG-128d：非多选态卡片也可聚焦，Shift+F10 / 菜单键打开右键菜单——
              // 否则置顶入口实际鼠标独占（浏览器不产生键盘 contextmenu）。
              // 菜单本身已补 role=menuitem + 焦点 + ↑↓（见 CardContextMenu）。
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  // 回顾档不开右键菜单（BUG-250b，判据同 onContextMenu）
                  if (mode === 'review') return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  setContextMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
                }
              },
            })}
      // 多选模式：整张卡片（含留白 / 元信息行 / 正文）都是勾选热区，
      // 不再要求点中正文文字。
      onClick={() => {
        if (!selectMode) return
        toggleSelected(entry.path)
      }}
    >
      <CardMeta
        path={entry.path}
        content={entry.content}
        isPinned={isPinned}
        isBackfilled={entry.backfilled}
        isScheduled={entry.scheduled}
        stamp={stamp}
        showCharCount={showCharCount}
        showCardCopy={showCardCopy}
        showCardTag={showCardTag}
        showCardDelete={showCardDelete}
        charCount={charCount}
        tagPosition={tagPosition}
        locPosition={locPosition}
        tags={entry.tags}
        // 回顾档：pill 只作展示（见 CardProps 的 filtersLocked）
        filtersLocked={filtersLocked}
        // 地点 pill 在回收站模式收起：点它会跳去地点模式，而回收站是「就地浏览 +
        // 就地筛选」的一页（与操作行在 trash 模式换成功下列两颗是同一条理由）
        locations={mode === 'trash' ? [] : entry.locations}
        mode={mode}
        readOnly={readOnly}
        preview={preview}
        caps={caps}
      />

      {split && <div className="momo-card-title">{split.title}</div>}
      {/* BUG-95：回收站里读盘失败的条目是**降级占位**（空正文 + readFailed），
          静默渲染成一张空白卡的话，用户分不清「真的空」还是「读不到」——
          这里给一行可见状态，刷新会重试（失败条目不进缓存）。 */}
      {entry.readFailed ? (
        <div className="momo-card-readfail">{copy.trash.readFailed}</div>
      ) : (
        <MarkdownBody
          content={body}
          className="momo-card-body markdown-rendered"
          cacheKey={entry}
          onClick={() => {
            // 多选模式：交给卡片根节点的 onClick 统一处理（冒泡），避免重复切换。
            // 只读浏览：点击不再打开，右上角「在 Obsidian 中打开」按钮负责这件事。
            // 预览卡是例外：它**没有**那颗按钮（无操作行），所以点正文恒开——
            // 否则只读偏好转开时预览卡会一个入口都不剩。
            if (selectMode) return
            if (readOnly && !preview) return
            caps?.openInEditor(entry.path)
          }}
          // BUG-176c：预览卡没有操作行，正文是唯一入口——补键盘等价物
          // （Enter / Space 打开；role=button + aria 与操作行那颗按钮同名）。
          {...(preview
            ? {
                tabIndex: 0,
                role: 'button',
                'aria-label': copy.card.openInEditor,
                onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  caps?.openInEditor(entry.path)
                },
              }
            : {})}
        />
      )}
      {/* 底部标签行：**只在 tagPosition === 'bottom' 时渲染**。这里原来无条件
          渲染、只靠 meta 行那边按 tagPosition 切换——于是选「卡片顶部」时两处
          同时出现（用户反馈 ⑨「主页面卡片顶部的确出现标签，但下面的标签也没
          消失」）。两个挂点是「二选一」而不是「叠着来」，所以两边都按同一个
          pref 裁；这一侧由 Card 裁（它本来就订着 tagPosition）。 */}
      {/* 底部地点标签行（2026-10-01 拆分出的 locPosition === 'bottom'）：与 meta 行
          那份二选一；回收站模式收起（点它会跳去地点筛选，而回收站是就地浏览） */}
      {/* 底部行包成一行：locPosition / tagPosition 都选「卡片底部」时，地点胶囊与
          #标签 必须并排在同一行（与 meta 行的排布一致）。原来它们是 .momo-card 下
          的两条兄弟行——.momo-loc-pills 是 inline-flex、.momo-card-tags 是块级 flex，
          同级放进去必然一上一下叠成两行（用户反馈：地点和标签分成了两排）。
          外包一层 flex 容器统一排；-bottom 修饰类只留作 DOM 标记（测试与截图场景
          靠它定位），间距由这一层统一给。 */}
      {(locPosition === 'bottom' || tagPosition === 'bottom') && (
        <div className="momo-card-foot">
          {locPosition === 'bottom' && (
            <LocationPills
              locations={mode === 'trash' ? [] : entry.locations}
              bottom
              selectMode={selectMode}
              locked={filtersLocked}
            />
          )}
          {tagPosition === 'bottom' && (
            <CardTags tags={entry.tags} bottom selectMode={selectMode} locked={filtersLocked} />
          )}
        </div>
      )}
      {contextMenu && (
        <CardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={entry.path}
          isPinned={isPinned}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  )
})
