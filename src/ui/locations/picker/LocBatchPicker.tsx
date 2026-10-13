import { useMemo, useState } from 'react'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import { LOCATION_MAX_CHARS, LOCATIONS_MAX, canonicalLocName, locationInputIssue } from '../../../momo/locations'
import { charLength } from '../../../momo/core'
import { PopDialog } from '../../kit'
import {
  candidateLocRows,
  isKnownLocation,
  pickedLocEntries,
  type LocPickerMode,
  type LocRow,
} from './rows'
import { LocList } from './LocList'
import { applyLocPreview } from './preview'

// 批量「添加地点 / 移除地点」弹层（多选 -> 底部批量条第 5 / 6 颗 mappin）。
// 与 BatchTagPicker 同构：pending chips + 候选行 + 右列统计 + 底栏状态块 + 取消 / 应用。
// 差别只有三处：候选是地点（无层级）、行序固定按组排序、落点在批量条里**向上开**
// （`.momo-fab .momo-pop` 已把 below 翻上去，与批量标签弹层共用同一条规则）。
//
// 一颗按钮一种模式（与「加标签 / 去标签」同一本账）：批量条上「添加地点」进 add、
// 「移除地点」进 remove，弹层打开即固定在该模式，换模式关掉重开另一颗。store 的
// mode 由入口按钮给定，父层按 key 重挂本组件，输入与队列随之清空。
// - add：候选 = 全库地点，可新建；+N = 选中 Momo 里还没有这个地点的条数；
// - remove：候选 = **只列选中 Momo 身上真有的**地点；−N = 会从几条上摘掉。
// 写盘判定与 caps.addLocations / removeLocations 逐字对齐：按**身份**算
// （canonicalLocName，BUG-110a：纽约 / New York 是同一处，两种写法都算「著有」）。
//
// 2026-10-10 起与批量标签弹层同本账：弹层**没有头部标题**（批量条那颗按钮已经叫
// 「添加地点 / 移除地点」，头顶再来一行是同一句话的第二遍），「已选 N 条」从头右
// 搬到底栏左列，与影响面摘要组成 `.momo-pop-status` 两行小字。
//
// v0.9.26 密度一刀（用户反馈「dialog 都很大，空间利用率低」）：队列 chip 摘掉
// 每颗一枚的 mappin（弹层里不再逐行重复同一个信息）；队列为空时底栏不再挂
// 「选好要加的地点后添加」那句废话。骨架收紧见 styles.src/30-pop.css。

export function LocBatchPicker({
  selected,
  mode,
  onClose,
}: {
  selected: readonly string[]
  mode: LocPickerMode
  onClose: () => void
}) {
  const entries = useUi((s) => s.entries)
  const locLevel = useUi((s) => s.locLevel)
  const locRegions = useUi((s) => s.locRegions)
  /** 界面语言（2026-10-06）：候选行文字 = locGroupOf 的 label（本地化三级），
   *  memo 住它就得把语言列进依赖（locations.ts 的 locGroupOf 文件头） */
  const lang = useUi((s) => s.lang)
  /** 品牌词（默认 Momo，用户可改名）：移除模式那几句提示里的「这批 Momo」走它 */
  const brandName = useUi((s) => s.brandName)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const isRemove = mode === 'remove'
  const b = copy.location.batch

  // 选中的 Momo（按 path 反查索引投影；选中的 path 一定在 entries 里，这里只是防御）
  const picked = useMemo(() => pickedLocEntries(entries, selected), [entries, selected])

  // 行文字走当前层级视角（与分组流 / 单卡弹层同一个档位）；勾选与写入仍是地名
  const rows = useMemo((): LocRow[] => {
    // lang 只作「行文字换语言要重算」的信号（locGroupOf 的 label 走 displayLocName），
    // 显式读一次它才算真依赖（BUG-221 口径；见上面 lang 的注释）。
    void lang
    return candidateLocRows(entries, picked, isRemove, query, { level: locLevel, regions: locRegions })
  }, [entries, picked, isRemove, query, locLevel, locRegions, lang])

  const typed = query.trim()
  // 去模式不新建地点：摘一个库里没有的地点是空操作，输入框只当搜索用
  const typedValid = typed !== '' && charLength(typed) <= LOCATION_MAX_CHARS
  // BUG-52：输入侧镜像写侧的归一闸门——大洲名 / 超 20 字 / 队列已满 8 个都当场拦下，
  // 不再让「预告改 N 条 · 实际改 0 条 · 零反馈」发生（去模式只搜索，不新建，不拦）。
  const inputIssue = !isRemove && typed !== '' ? locationInputIssue(typed, pending.length) : null
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
  const atLimit = pending.length >= LOCATIONS_MAX
  const typedIsNew =
    !isRemove && typedValid && inputIssue === null && !isKnownLocation(entries, typed)

  /** 底栏摘要的「将改动几条」：纯函数预算（口径与 service 写入逐字对齐，见 preview.ts）。
   *  数的是**条**不是**个**——10 条 Momo 各加同两个地点，将改动 10 条（不是 2 个）。 */
  const { willWrite, nothingToDo } = useMemo(
    () => applyLocPreview(picked, pending, isRemove),
    [picked, pending, isRemove],
  )
  const summary =
    pending.length === 0
      ? ''
      : nothingToDo
        ? isRemove
          ? b.summaryNoneOwned
          : b.summaryAllHave
        : b.summaryCount({
            action: isRemove ? b.pendingRemove : b.pendingAdd,
            pending: pending.length,
            willWrite,
          })

  // 队列的进出都按**身份**（BUG-110a）：行上是「纽约」、输入框打「New York」时
  // 是同一个开关，不会出现两颗都勾着的重复 chip
  const toggle = (loc: string) => {
    setPending((prev) => {
      const id = canonicalLocName(loc)
      const at = prev.findIndex((p) => canonicalLocName(p) === id)
      if (at >= 0) return prev.filter((_, i) => i !== at)
      // 到 8 个上限：不再加（行会被禁用 + 输入侧红字，这里只是兜底防漏）
      if (prev.length >= LOCATIONS_MAX) return prev
      return [...prev, loc]
    })
  }

  const commitTyped = () => {
    if (!typedValid || inputIssue !== null) return
    const id = canonicalLocName(typed)
    if (!pending.some((p) => canonicalLocName(p) === id)) toggle(typed)
    setQuery('')
  }

  const apply = async () => {
    const caps = useUi.getState().caps
    if (!caps || busy || pending.length === 0 || picked.length === 0 || nothingToDo) return
    setBusy(true)
    try {
      const paths = picked.map((e) => e.path)
      if (isRemove) await caps.removeLocations(paths, pending)
      else await caps.addLocations(paths, pending)
      setPending([])
      onClose()
    } catch {
      // caps 已发 Notice：保留弹层与队列，用户可直接重试
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // BUG-176f：输入法组词中按 Esc 不许整颗关掉弹层（与 Enter 的 isComposing 闸同纪律）
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onClose()
      return
    }
    // Ctrl / Cmd + Enter = 应用：在哪颗控件上按都算（键盘快捷键的惯例），
    // 所以这一条留在弹层这一层；**裸 Enter 不在这儿处理**——它属于输入框
    // （提交草稿）或候选行（激活那一行）。挂在这一层会把行的 Enter 抢走。
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void apply()
    }
  }

  /** 输入框的裸回车：收草稿进队列。输入法确认候选词的回车要放过去（见单卡弹层的同款守卫） */
  const onInputKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey) return
    if (ev.nativeEvent.isComposing) return
    if (typed === '') return
    ev.preventDefault()
    commitTyped()
  }

  return (
    <PopDialog
      variant="below"
      onKeyDown={onKeyDown}
      onMaskClick={onClose}
      footerLeft={
        // 2026-10-10 起与批量标签弹层同本账：弹层没有头部标题，「已选 N 条」住在
        // 底栏左列。两行小字——已选条数常驻，影响面摘要只在有待处理队列时出现
        // （一行排不下这两句，且它们本来就是两条信息：选区语境 / 队列影响）。
        <div className="momo-pop-status">
          <span className="momo-pop-count">{b.selected(picked.length)}</span>
          {summary !== '' && <span className="momo-pop-sum">{summary}</span>}
        </div>
      }
      footerActions={
        <div className="momo-pop-acts">
          <button className="momo-pop-btn" onClick={onClose}>
            {copy.common.cancel}
          </button>
          <button
            className="momo-pop-btn momo-pop-btn-primary"
            disabled={busy || pending.length === 0 || picked.length === 0 || nothingToDo}
            onClick={() => void apply()}
          >
            {busy ? (isRemove ? b.applyingRemove : b.applyingAdd) : isRemove ? b.applyRemove : b.applyAdd}
          </button>
        </div>
      }
    >
      {isRemove && <div className="momo-pop-note">{b.noteRemove(brandName)}</div>}

      <input
        autoFocus
        className="momo-input momo-pop-input"
        type="text"
        placeholder={isRemove ? b.pickRemove(brandName) : b.pickAdd}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
      />

      {pending.length > 0 && (
        <div className="momo-pop-pending">
          <span className="momo-pop-qlabel">{isRemove ? b.pendingRemove : b.pendingAdd}</span>
          {pending.map((loc) => (
            <span key={loc} className="momo-pop-chip momo-loc-chip">
              {/* v0.9.26 起 chip 里不再带 mappin：队列里的 chip 每颗挂一枚地图钉
                  = 每行多一枚图标、多 5px 间距——而「这是地点不是标签」这件事由
                  chip 自身的形状（r-3 方角 vs 全胶囊）与没有 # 前缀说完了。
                  chip 里不放组条数：那个数归右列与组头 */}
              <span className="momo-loc-label">{loc}</span>
              <button
                className="momo-pop-chip-x"
                aria-label={copy.location.batch.chipRemove(loc)}
                onClick={() => toggle(loc)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <LocList
        rows={rows}
        mode={mode}
        pending={pending}
        pickedCount={picked.length}
        query={query}
        brand={brandName}
        onToggle={toggle}
        onCommitTyped={commitTyped}
        typedIsNew={typedIsNew}
        atLimit={atLimit && !isRemove}
        inputError={inputError}
      />
    </PopDialog>
  )
}
