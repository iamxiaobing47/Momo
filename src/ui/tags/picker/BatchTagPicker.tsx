import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useUi } from '../../store'
import { canonicalTagPath, isValidTag, tagKey } from '../../../momo/tags'
import { tagNodeMapOf } from '../../../momo/tags'
import { copy } from '../../../momo/i18n'
import { PopDialog, PopRow } from '../../kit'
import { applyPreview } from './preview'
import { candidateRows, pickedEntries, type Row, type TagPickerMode } from './rows'

export type { Row, TagPickerMode } from './rows'

// 批量标签弹层（多选工具栏「加标签 / 去标签」＋ 卡片操作行「加标签」）。
// 同一个组件、两种模式（mode）：`add` 追加标签、`remove` 摘掉标签——两者的
// 候选来源、计数口径、按钮文案都不同，共用一套骨架与键盘交互。
//
// 交互（BUSINESS.md §6 / concept-momo-tags §批量添加 §批量移除）：
// - 挂在顶栏 / 底部批量条的 `.momo-batchtag-wrap` 定位锚下，点面板外由
//   `.momo-pop-mask` 兜住，Esc 关闭并清空「待处理」队列（不写文件）。
// - 候选与侧栏标签树同源（身份键唯一、显示取首次出现的原样写法）。
// - 输入即按身份键子串过滤（输入 `读书` 同时命中 `读书` 与 `读书/小说`），虚拟父节点斜体。
//
// 计数列（v0.9.0 重做，设计稿 docs/design/mockups/momo-dialog-v1.png card 03）：
// **一行只放「点下去会发生什么」的最短形式**——一列窄字扫读比一列句子快得多。
//   加模式：+N = 选中 Momo 里还没有这个标签的条数，全命中禁用并标「已含」；
//   去模式：-N = 选中 Momo 里带着这个标签的条数。
// 整体影响面看底栏摘要（「待添加 N 个 · 将改动 M 条」）。v0.9.0 起原生 title
// 黑底提示全量移除（用户裁决），口径长句不再进 hover。
// 判定仍然按**精确身份键**算（这条 Momo 的标签并集里是否真有这个标签），**不是**级联：
// 必须与 service.addTags 的跳过判定、service.removeTags 的改动判定逐字对齐，否则会出现
// 「UI 说已含、文件其实没写」这类静默不一致（级联命中只属于「筛选」——见 ADR-004 §1.3；
// 写文件是另一回事：只打 `读书/小说` 的 Momo，文件里**确实没有** `读书`，
// 所以加父标签算真实改动、摘父标签也不算命中它）。
//
// 两种模式的候选来源不同（v0.8.1）：
// - 加：全库标签树（可新建 `父/子`），按共现建议 + 子树条数排序（ADR-005 第 4 项）；
// - 去：**只列选中 Momo 身上真的有的标签**（并集，按命中条数倒序）。列全库标签毫无意义——
//   这批 Momo 没有的标签，移除它是空操作；真要点名的目标标签直接搜。
//
// 视觉（v0.9.0 Dialog 视觉系统）：四个浮层共用一套骨架（.momo-pop*），本组件只
// 覆盖候选来源与文案。建议项不再逐行挂 ✦，改成「常一起出现」分组（设计稿 card 01）。
// 骨架（遮罩 + .momo-pop-below + 脚）与候选行收敛在 src/ui/kit/ 的
// PopDialog / PopRow，本文件只留：键盘顺序导航（D-04，**作用域收在输入框上** ——
// 焦点在候选行 / 底栏按钮时归那颗控件自己，BUG-136h）、三段式内容
// （note / 输入框 / 待处理 chips / 新建行 / 候选列表）与底栏状态块。
//
// v0.9.26 密度一刀（用户反馈「dialog 都很大，空间利用率低」）：骨架整体收紧
// （头 44→36 / 底 54→44 / 行 32→28 / 列表上限 264→300，见 styles.src/30-pop.css），
// 文案同步减负——队列为空时底栏不再挂「选好要加的标签后添加」那句把按钮念一遍的
// 废话（空了就空着，置灰按钮自己会说话）；「无需改动」两句缩成一句判词。
//
// 应用后由调用方关闭弹层并保留选中集，方便接着摘或再加。
//
// 依赖约束：ui/ 不 import obsidian；写文件规则在 service，本层只算候选、只管交互。
//
// 排版与文案（2026-09-11 定稿 / 2026-09-22 扩到两种模式 / 2026-09-23 收敛进浮层骨架 /
//             2026-10-10 去掉头部标题，「已选 N 条」搬到底栏左列）：
// - 数字（`+9`、`已选 12 条`）用表格数字对齐，多行之间不跳动。
// - 文案：简洁、少修辞，略带一点文气；**动词与触发按钮一致**（批量条「加标签」→
//   主按钮「添加标签」，不再出现「应用」这类不指向具体动作的词）。能靠控件自明的
//   说明一律不写。
// - 衬线只属于还带标题的浮层（批量「设地点」的头部）；本弹层 2026-10-10 起没有标题，
//   面板里再没有第二个用衬线的地方（规则见 styles.src/30-pop/001-pop.css 的
//   `.momo-pop-title`）。
//
// 2026-10-10 用户裁决（与 BUG-157 同日同族）：弹层**不再显示头部标题**「添加标签 /
// 移除标签」——批量条上那颗按钮已经叫「加标签」、底栏主按钮也叫「添加标签」，头顶
// 再来一行是同一句话的第三遍。title / meta 都不传 → 头部整行不渲染
// （`.momo-pop-nohead` 补上内距）；「已选 N 条」从头右搬到底栏左列，与影响面摘要
// 组成 `.momo-pop-status` 两行小字（已选条数常驻、摘要只在有待处理队列时出现）。
// `copy.tags.batch.titleAdd` / `titleRemove` 两个键随头部一起从三语言字典删除
// （同 v0.9.26 删 `summaryPickAdd` / `summaryPickRemove` 的纪律）。
//
// 同日晚些时候（BUG-159）：弹层也不再传 `ariaLabel`。对话框的无障碍名
// 「批量添加标签」与上述两句是同一句话的第四遍，而部分 Electron / Chromium 环境会把
// aria-label 渲染成黑底原生气泡——用户报「最下面不要有黑底白字的提示文字」。
// `copy.tags.batch.ariaAdd` / `ariaRemove` 两个键随之从字典删除；弹层用途由输入框
// 提示文字（`pickAdd` / `pickRemove`）说清，读屏软件定位靠它。
//
// 拆分：候选行怎么算在 rows.ts（含命中表与两种模式的候选来源），
// 「点下去会改几条」在 preview.ts——本文件只剩交互与渲染。

export function BatchTagPicker({
  selected,
  mode,
  onClose,
}: {
  selected: readonly string[]
  mode: TagPickerMode
  onClose: () => void
}) {
  const entries = useUi((s) => s.entries)
  const brandName = useUi((s) => s.brandName)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)

  const isRemove = mode === 'remove'

  // 选中的 Momo（按 path 反查索引投影；选中的 path 一定在 entries 里，这里只是防御）
  const picked = useMemo(() => pickedEntries(entries, selected), [entries, selected])

  const rows = useMemo((): Row[] => candidateRows(entries, picked, isRemove, query), [entries, picked, isRemove, query])

  /** 有建议项时才分组（空选 / 无共现时不白占一个分组标签）；过滤中不分组——搜出来的
   *  结果再分「建议 / 全部」只会让用户在找一行时多读一句话。 */
  const hasSuggestion = !isRemove && query.trim() === '' && rows.some((r) => r.score > 0)
  // 建议分组的条数 = rows 的前缀长度（rows 按 score 降序，见 rows.ts:95）。
  // D-04 起只用于「全部标签」标题该插在第几行前面；行本身一次 map 走完 rows，
  // 保证 renderRow 拿到的永远是**全局**下标。
  const suggestedCount = hasSuggestion ? rows.filter((r) => r.score > 0).length : 0

  const typedRaw = query.trim().replace(/^#+/, '')
  const typed = canonicalTagPath(typedRaw)
  // 去模式不新建标签：摘一个库里没有的标签是空操作，输入框只当搜索用
  const typedValid = isValidTag(typed)
  const tree = useMemo(() => tagNodeMapOf(entries), [entries])
  const typedIsNew = !isRemove && typedValid && !tree.has(tagKey(typed))

  const isPending = (tag: string) => pending.some((p) => tagKey(p) === tagKey(tag))
  const toggle = (tag: string) => {
    setPending((prev) =>
      prev.some((p) => tagKey(p) === tagKey(tag))
        ? prev.filter((p) => tagKey(p) !== tagKey(tag))
        : [...prev, tag],
    )
  }

  // 应用预览：算清「这次点下去会改动几条、有几条是空操作」（判定口径见 preview.ts）
  const { willWrite, nothingToDo } = useMemo(() => applyPreview(picked, pending, isRemove), [picked, pending, isRemove])

  const b = copy.tags.batch
  // 底栏摘要只在「有话说」时出现（v0.9.26）：队列为空时原来挂一句
  // 「选好要加的标签后添加」——那句只是把按钮上的字又说一遍，还让底栏常年
  // 挂着一段话。空了就空着，按钮自己会说话（置灰态 + 动词）。
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

  /** 右列文案：只说「点下去会变多少」——+N / −N / 已含。
   *  v0.9.0 起口径长句不再进行内 title（原生黑底提示全量移除），
   *  aggregate 信息看底栏摘要「待添加 N 个 · 将改动 M 条」即可。 */
  const rowStat = (hit: number): string => {
    if (isRemove) return `−${hit}`
    if (picked.length === 0) return ''
    return hit === picked.length ? b.rowHas : `+${picked.length - hit}`
  }

  /** 回车：把输入串（含新建）放进「待处理」队列 */
  const commitTyped = () => {
    if (!typedValid) return
    if (!isPending(typed)) toggle(typed)
    setQuery('')
    setCursor(0)
  }

  const apply = async () => {
    const caps = useUi.getState().caps
    if (!caps || busy || pending.length === 0 || picked.length === 0 || nothingToDo) return
    setBusy(true)
    try {
      const paths = picked.map((e) => e.path)
      if (isRemove) await caps.removeTags(paths, pending)
      else await caps.addTags(paths, pending)
      setPending([])
      onClose()
    } catch {
      // caps 已发 Notice：保留弹层与队列，用户可直接重试
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // BUG-176f：输入法组词中按 Esc（本意是撤掉这次组词）不许整颗关掉弹层——
    // 与 Enter 的 isComposing 闸同一纪律（BUG-75 / 121 族）。
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onClose()
      return
    }
    // 焦点不在文字输入框上（落在候选行 / 待处理 chip 的 ✕ / 底栏按钮上）时，键盘归
    // **那颗控件自己**——这一层挂在 `.momo-pop` 上，是它们的祖先。不判 target 就会
    // 把它们的回车抢走：底栏「取消 / 添加标签」的激活被 preventDefault 掉，改去
    // toggle **光标行**（光标只由 onMouseEnter 与方向键推进，与焦点根本不是一回事，
    // Tab 到第 5 行按回车动的是指针最后悬停的那一行）——BUG-136h。
    // Escape 不受影响（上面那条先走）；输入框是 autoFocus 的，「打字 → 方向键 → 回车」
    // 这条主路径照样完整。
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) return
    if (e.key === 'Enter') {
      // 中文 / 日文输入法用回车确认候选词时也会走到这里（受控值此刻还是拼音串）：
      // 不拦就会把 "beijing" 当新标签排进队列（与地点弹层同一处守卫）
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        void apply()
        return
      }
      // BUG-149：添加模式回车 = 把输入串排进队列（含新建）；去标签模式输入框只当
      // 搜索用，回车只作用于**候选行的光标行**（与添加模式的「无输入选光标行」对称），
      // 绝不把自由输入串排进待摘队列——那会造出一枚点不出来的 chip，输入框也不清空。
      if (typedRaw && !isRemove) {
        commitTyped()
      } else {
        const row = rows[cursor]
        // BUG-133b：光标行被禁用时（加模式下这批一条都不写 → allHave && !on），回车不许
        // 绕过禁用态把它塞进待处理队列——鼠标那侧同一行是 `disabled={allHave && !on}`。
        if (row) {
          const allHave = !isRemove && picked.length > 0 && row.hit === picked.length
          if (!(allHave && !isPending(row.path))) toggle(row.path)
        }
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, Math.max(0, rows.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    // 输入框为空时退格 = 删掉队列末尾那颗 chip
    if (e.key === 'Backspace' && query === '' && pending.length > 0) {
      e.preventDefault()
      setPending((prev) => prev.slice(0, -1))
    }
  }

  /**
   * BUG-109c：光标行滚出列表可视区时，把列表滚到刚好看得见它（方向键连按
   * 的路径上光标会一路越出 max-height:300 的窗口，用户看不见自己在选什么）。
   * 不用 scrollIntoView：jsdom 没有它（回归测不了），且它会连带滚动弹层之外的
   * 祖先容器，落点不可控。`.momo-pop-list` 不是行的 offsetParent（CSS 没给
   * position），所以按 getBoundingClientRect 差换算回滚动坐标，只写列表自己
   * 的 scrollTop；行已可见时两侧判定都不成立，天然空操作。
   * 鼠标悬停也会改 cursor——悬停行必然可见，同样空转，不会和滚动抢方向盘。
   */
  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelectorAll('.momo-pop-row')[cursor]
    if (!list || row === undefined) return
    const listRect = list.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const top = rowRect.top - listRect.top + list.scrollTop
    const bottom = rowRect.bottom - listRect.top + list.scrollTop
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [cursor])

  /** 一行：check 圈 + #路径 + 右列。三态由 on / allHave 决定（markup 在 kit/PopRow） */
  const renderRow = (r: Row, i: number) => {
    const on = isPending(r.path)
    // 加模式：全都会跳过（写了也是空操作）的行禁用并标「已含」。
    // 去模式不禁用：只要 hit > 0，摘掉它都是真实改动（候选里本来也没有 hit = 0 的）。
    const allHave = !isRemove && picked.length > 0 && r.hit === picked.length
    return (
      <PopRow
        key={r.key}
        on={on}
        have={allHave}
        cursor={i === cursor}
        disabled={allHave && !on}
        virtual={r.virtual}
        label={`#${r.path}`}
        stat={rowStat(r.hit)}
        onMouseEnter={() => setCursor(i)}
        onClick={() => toggle(r.path)}
      />
    )
  }

  /** 分组标签（常一起出现 / 全部标签 / 这批 Momo 身上有） */
  const sectionLabel = (text: string) => <div className="momo-pop-seclabel">{text}</div>

  return (
    <PopDialog
      variant="below"
      // 2026-10-10 起不传 ariaLabel（BUG-159）：那个名字「批量添加标签 / 批量移除标签」
      // 与唤起弹层的批量条按钮、底栏主按钮、（已去掉的）头顶标题是同一句话的第四遍，
      // 而部分 Electron / Chromium 环境会把 aria-label 渲染成黑底原生气泡（用户报
      // 「最下面不要有黑底白字的提示文字」）。弹层的用途由输入框提示文字说清，读屏
      // 软件定位靠它。
      onKeyDown={onKeyDown}
      onMaskClick={onClose}
      footerLeft={
        // 2026-10-10 起「已选 N 条」住在底栏左列（头部标题整行去掉，见文件头）。
        // 两行小字：已选条数常驻，影响面摘要只在有待处理队列时出现——328 的弹层里
        // 底栏两颗按钮要占 ~145px，一行排不下这两句（真 Chromium 实测：count ≈48 +
        // sum ≈130 > 可用 ≈146，挤一行会折成三行），而它们本来就是两条信息
        // （选区语境 / 队列影响）。
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
            {busy
              ? isRemove
                ? b.applyingRemove
                : b.applyingAdd
              : isRemove
                ? b.applyRemove
                : b.applyAdd}
          </button>
        </div>
      }
    >
      {isRemove && (
        // 去模式唯一的反直觉点：按标签本身匹配，不连带子标签（与侧栏右键「删除标签」同口径）。
        // 这句不靠控件自明，所以写出来；加模式没有对应的坑，就不写。
        <div className="momo-pop-note">{b.noteRemove}</div>
      )}

      <input
        autoFocus
        className="momo-input momo-pop-input"
        type="text"
        placeholder={isRemove ? b.pickRemove(brandName) : b.pickAdd}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setCursor(0)
        }}
      />

      {pending.length > 0 && (
        <div className="momo-pop-pending">
          <span className="momo-pop-qlabel">{isRemove ? b.pendingRemove : b.pendingAdd}</span>
          {pending.map((t) => (
            <span key={t} className="momo-pop-chip">
              <span className="momo-tag-label">#{t}</span>
              <button
                className="momo-pop-chip-x"
                aria-label={copy.tags.batch.chipRemove(t)}
                onClick={() => toggle(t)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {typedRaw !== '' && !typedValid && !isRemove && (
        <div className="momo-pop-note momo-pop-note-bad">{copy.errors.invalidTag(typedRaw)}</div>
      )}

      {typedIsNew && (
        <PopRow
          new
          on={isPending(typed)}
          label={b.createNew(typed)}
          onClick={commitTyped}
        />
      )}

      <div className="momo-pop-list" ref={listRef}>
        {rows.length === 0 ? (
          <div className="momo-pop-empty">
            {isRemove
              ? query.trim()
                ? b.emptyNoMatch
                : b.emptyNoneOwned(brandName)
              : query.trim()
                ? b.emptyNoMatch
                : b.emptyNoTags}
          </div>
        ) : (
          <>
            {/* 分组标签只在「没在搜索」时出现：搜结果再分建议/全部只会多读一句话。
                建议分组只属于加模式；去模式的候选本来就是「这批 Momo 身上有」。
                D-04：分组只是**插标题**，行本身仍然一次 map 走完 rows——分组后
                各自 map 会让 renderRow 拿到组内下标，而高亮（i === cursor）、
                onMouseEnter（setCursor(i)）与键盘回车（rows[cursor]）用的是同一套
                下标，组内 ≠ 全局时会同时高亮两行、回车选中的是另一行。 */}
            {!hasSuggestion && query.trim() === '' && sectionLabel(isRemove ? b.groupOwned(brandName) : b.groupAll)}
            {rows.map((r, i) => (
              <Fragment key={r.key}>
                {hasSuggestion && i === 0 ? sectionLabel(b.groupCooccur) : null}
                {hasSuggestion && i === suggestedCount ? sectionLabel(b.groupAll) : null}
                {renderRow(r, i)}
              </Fragment>
            ))}
          </>
        )}
      </div>
    </PopDialog>
  )
}
