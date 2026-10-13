import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import { LOCATION_MAX_CHARS, LOCATIONS_MAX, canonicalLocName, locationInputIssue } from '../../../momo/locations'
import { charLength } from '../../../momo/core'
import type { MomoEntry } from '../../../momo/types'
import { PopDialog } from '../../kit'
import { candidateLocRows, isKnownLocation, type LocRow } from './rows'
import { LocList } from './LocList'

// 单卡地点编辑弹层（卡片操作行第 5 颗 mappin，F3）。与批量「设地点」**同一套候选列表**
// （LocList + rows.ts），差别在写入时机：
// - 这里**勾选即落盘**（点一行就写一次 frontmatter），所以底栏只有「完成」——
//   没有「应用」，也没有待处理队列（F6：行勾选 = 当前状态，勾选即时落盘）；
// - 批量那一路攒一个队列再一次写完（N 条文件串行写，期间用户还能改主意）。
//
// 为什么单卡也要即时写：地点是**内容**不是视图开关（ADR-003），勾一下就是
// 「这篇确实在这个地方」。给一个「应用」按钮只会多一次「我到底存了没有」的疑问。
//
// 落点是 free 变体：由调用方把按钮位置换算成「相对 .momo-app」的偏移，这里再按
// 面板尺寸夹回可视区（与 TagEditMenu 同一套算法）。**整颗弹层 portal 到
// `.momo-app` 根上再画**（与 CardContextMenu 同一路数）：free 变体的
// left/top 按 .momo-app 换算，包含块就必须是 .momo-app。渲染树里它挂在顶栏的
// `.momo-batchtag-wrap` 下，而那颗锚点是 position: relative——直接画在那里，
// 落点会整体偏移一个锚点位置（锚点在顶栏最右），窄面板里甚至被 `.momo-main` 的
// overflow:hidden 裁到面板外。portal 目标用 closest 现找，不新增容器节点。
//
// v0.9.26 密度一刀：底栏左侧那句「再点一次已勾选的地点即移除」缩成 11 字
// （信息没变：勾选即时落盘，再点一次是摘掉）。骨架收紧见 styles.src/30-pop.css。
//
// 2026-10-10 用户裁定「右上角不要显示笔记内容」：头部那一行（`PopDialog` 的
// `meta`）原样搬的是**这篇的首行正文**（24 字截断），本意是「让用户确认弹层挂在
// 正确的卡上」——可弹层就是从卡片操作行第 5 颗 mappin 上点开的，卡片本身就在
// 眼底，再抄一行正文到弹层头部只是同一件事的第二份表述（与设置页那一族「去掉
// 预览」同一条判据，见 docs/tasks/bug/done/bug-157）。现已整行去掉：本弹层不传
// title 也不传 meta，`PopDialog` 连头部一起不渲染（`.momo-pop-nohead`），与
// 2026-10-02 起五个 free 小浮层的口径一致。

/** 弹层估算高度：把落点夹回视口用（输入 32 + 列表上限 300 + 底 44，v0.9.26 骨架；
 *  2026-10-10 头部整行去掉后少 36） */
const POP_H = 376
const POP_W = 328

export function LocEditPop({ path, x, y, onClose }: { path: string; x: number; y: number; onClose: () => void }) {
  const entries = useUi((s) => s.entries)
  const locLevel = useUi((s) => s.locLevel)
  const locRegions = useUi((s) => s.locRegions)
  /** 界面语言（2026-10-06）：候选行文字 = locGroupOf 的 label（本地化三级），
   *  memo 住它就得把语言列进依赖（locations.ts 的 locGroupOf 文件头） */
  const lang = useUi((s) => s.lang)
  /** 品牌词：LocList 的分组小标题要它（本弹层恒是加模式、用不到，但契约统一） */
  const brandName = useUi((s) => s.brandName)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const entry: MomoEntry | undefined = useMemo(() => entries.find((e) => e.path === path), [entries, path])
  const e = copy.location.edit

  // 候选 = 全库地点（加模式）。hit 在这里是「这一篇有没有」（0/1），勾选圈的
  // 三态由它决定；右列不显示（showStat=false），组条数用不上。
  // view（locLevel + locRegions）只决定行文字：与分组流同一个档位，用户在
  // 组头上看的前缀这里也看得见。
  const rows = useMemo((): LocRow[] => {
    // lang 只作「行文字换语言要重算」的信号（locGroupOf 的 label 走 displayLocName），
    // 显式读一次它才算真依赖（BUG-221 口径；见上面 lang 的注释）。
    void lang
    return entry ? candidateLocRows(entries, [entry], false, query, { level: locLevel, regions: locRegions }) : []
  }, [entries, entry, query, locLevel, locRegions, lang])

  const typed = query.trim()
  const typedValid = typed !== '' && charLength(typed) <= LOCATION_MAX_CHARS
  // BUG-52：与批量弹层共用同一道输入闸门（大洲名 / 超长 / 本篇已满 8 个），
  // 不让 service 端归一后静默早退变成「勾了没反应、也没解释」。
  const currentCount = entry?.locations.length ?? 0
  const inputIssue = typed !== '' ? locationInputIssue(typed, currentCount) : null
  // BUG-126d：上限数字从真源入参——`tooLong(LOCATION_MAX_CHARS)` /
  // `tooMany(LOCATIONS_MAX)`，写侧闸与此同一把尺子（locations.ts）。
  const inputError =
    inputIssue === 'continent'
      ? copy.location.continentName
      : inputIssue === 'tooLong'
        ? copy.location.tooLong(LOCATION_MAX_CHARS)
        : inputIssue === 'limit'
          ? copy.location.tooMany(LOCATIONS_MAX)
          : null
  const atLimit = currentCount >= LOCATIONS_MAX
  const typedIsNew = typedValid && inputIssue === null && !isKnownLocation(entries, typed)

  /** 勾选即写：这一篇已有这个地点 = 摘掉，否则 = 加上（比较按身份，BUG-110a） */
  const toggle = async (loc: string) => {
    const caps = useUi.getState().caps
    if (!caps || busy || !entry) return
    const id = canonicalLocName(loc)
    const has = entry.locations.some((l) => canonicalLocName(l) === id)
    // 到 8 个上限：不再加（行会被禁用 + 输入侧红字，这里只是兜底防漏）
    if (!has && currentCount >= LOCATIONS_MAX) return
    setBusy(true)
    try {
      if (has) await caps.removeLocations([path], [loc])
      else await caps.addLocations([path], [loc])
    } catch {
      // caps 已发 Notice：弹层留着，用户可再点一次重试
    } finally {
      setBusy(false)
    }
  }

  /**
   * 输入框回车：**恒为「加」**，不摘。
   *
   * 为什么不做成 toggle：输入框的承诺是「搜索或新建」（占位与空态都这么写），
   * 而「再点一次已勾选的地点即移除」是**行**的语义（点行 = 勾选开关，落盘即时）。
   * 让回车在「本篇已有的地名」上顺手摘掉一个地点，是一次没有任何提示的破坏性动作——
   * 用户想搜一下自己的地点，回车就把 frontmatter 改了。已在篇内 = 什么都不做
   * （那一行本来就是禁用的「已含」），输入框里的话留着让用户接着改。
   */
  const commitTyped = () => {
    if (!typedValid || inputIssue !== null || busy || !entry) return
    const id = canonicalLocName(typed)
    if (entry.locations.some((l) => canonicalLocName(l) === id)) return
    void toggle(typed)
    setQuery('')
  }

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  // portal 宿主（.momo-app 根）：首帧先留个不可见锚点拿 closest（同 CardContextMenu）。
  // host 进依赖：portal 落定后 menuRef 才指向真实 DOM，落点夹取要跟着重跑一次。
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setHost((anchorRef.current?.closest<HTMLElement>('.momo-app') as HTMLElement | null) ?? null)
  }, [])
  useLayoutEffect(() => {
    const panel = menuRef.current?.closest('.momo-app') as HTMLElement | null
    const w = panel?.clientWidth ?? window.innerWidth
    const h = panel?.clientHeight ?? window.innerHeight
    setPos({
      left: Math.max(8, Math.min(x, Math.max(8, w - POP_W - 8))),
      top: Math.max(8, Math.min(y, Math.max(8, h - POP_H - 8))),
    })
  }, [x, y, host])

  const dialog = (
    <PopDialog
      variant="free"
      ariaLabel={e.aria}
      style={{ left: pos.left, top: pos.top }}
      dialogRef={menuRef}
      onKeyDown={(ev) => {
        // BUG-176f：输入法组词中按 Esc 不许整颗关掉弹层（与 Enter 的 isComposing 闸同纪律）
        if (ev.key === 'Escape' && !ev.nativeEvent.isComposing) {
          ev.preventDefault()
          onClose()
        }
        // Enter 留在输入框自己的 onKeyDown 上：挂在弹层这一层会把候选行（<button>）
        // 的 Enter 抢走——行上的回车本该激活那一行，而不是把输入框里的词提交掉
      }}
      onMaskClick={onClose}
      footerActions={
        <div className="momo-pop-acts">
          <button className="momo-pop-btn momo-pop-btn-primary" onClick={onClose}>
            {e.done}
          </button>
        </div>
      }
    >
      <input
        autoFocus
        className="momo-input momo-pop-input"
        type="text"
        placeholder={e.pick}
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key !== 'Enter') return
          // 中文 / 日文输入法用回车确认候选词时也会走到这里（此时受控值还是拼音串，
          // compositionend 在后）——不拦就会把 "beijing" 当新地点写进 frontmatter
          if (ev.nativeEvent.isComposing) return
          ev.preventDefault()
          commitTyped()
        }}
      />

      <LocList
        rows={rows}
        mode="add"
        pending={entry?.locations ?? []}
        pickedCount={entry ? 1 : 0}
        query={query}
        brand={brandName}
        onToggle={(loc) => void toggle(loc)}
        onCommitTyped={commitTyped}
        typedIsNew={typedIsNew}
        showStat={false}
        atLimit={atLimit}
        inputError={inputError}
      />
    </PopDialog>
  )

  // host 未定（首帧）时先留个不可见锚点拿 closest；定了就 portal 到 app 根。
  if (!host) return <span ref={anchorRef} style={{ display: 'none' }} />
  return createPortal(dialog, host)
}
