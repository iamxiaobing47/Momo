import { Fragment } from 'react'
import { copy } from '../../../momo/i18n'
import { canonicalLocName } from '../../../momo/locations'
import { PopRow } from '../../kit'
import type { LocRow } from './rows'

// 两个地点弹层（单卡编辑 / 批量「添加地点 · 移除地点」）共用的候选列表（F6 §编辑与批量：
// 「两处入口同一套列表组件」）。输入框、待处理 chips 与底栏留给各自的调用方——
// 两处的**行集合、行交互、空态措辞**必须逐字一致，否则用户会在两个入口间反复试错。
//
// 与批量标签弹层同形，三处差别只有：
// ① 行文字是该地点的**路径标签**（v0.9.30 起：`亚洲 · 中国 · 北京`；`name` 档
//    且查不到归属时就是地名本身）——地点没有 `#` 行内形态，但有大洲 / 国家前缀；
// ② 排序固定按组排序（条数降序），没有共现建议分组；
// ③ 右列读屏名给完整句式（裸数字 + 地名念出来没头没尾，见 PopRow 的 ariaLabel）。

export interface LocListProps {
  rows: readonly LocRow[]
  /** 当前模式：去模式的行勾选态 = 已在该条 Momo 上 */
  mode: 'add' | 'remove'
  /** 已进「待处理」队列的地点（单卡编辑弹层恒为空数组——它即时落盘，没有队列） */
  pending: readonly string[]
  /** 这批（或单卡这一篇）的条数：右列「+N」的分母。单卡编辑弹层不显示右列，传 0 */
  pickedCount: number
  /** 输入框里的原样文字（用于「新建 X」行与空态措辞） */
  query: string
  /** 品牌词（默认 Momo，用户可改名）：分组小标题「这批 X 身上有」用它 */
  brand: string
  onToggle: (location: string) => void
  /** 点「新建 X」行 / 在输入框回车：把输入串收进队列（单卡编辑弹层那里 = 立即写入） */
  onCommitTyped: () => void
  /** 输入串是否是库里的地点（已有时不显示新建行） */
  typedIsNew: boolean
  /** 右列计分列出不显示（单卡编辑弹层：这篇有没有这个地点，勾选圈已经说完了） */
  showStat?: boolean
  /** 输入侧的拒绝原因（超长 / 大洲名 / 到 8 个上限）：输入框下方的红字，null / 缺省不显示 */
  inputError?: string | null
  /** 已到每篇 / 队列的地点上限（LOCATIONS_MAX）：未入队列的行禁用，避免静默丢第 9 个 */
  atLimit?: boolean
}

export function LocList({
  rows,
  mode,
  pending,
  pickedCount,
  query,
  brand,
  onToggle,
  onCommitTyped,
  typedIsNew,
  showStat = true,
  inputError = null,
  atLimit = false,
}: LocListProps): React.JSX.Element {
  const l = copy.location
  const b = l.batch
  // BUG-110a：队列比较按**身份**——输入「New York」收进队列后行上是「纽约」，
  // 精确比较会漏掉勾选态（队列 ≤ 8 个，每次渲染摊一次即可）
  const pendingIds = new Set(pending.map((p) => canonicalLocName(p)))
  const isPending = (loc: string) => pendingIds.has(canonicalLocName(loc))

  /**
   * 右列（设计稿 location-view F4 的口径）：
   * - 去模式：−N = 会从几条上摘掉（候选全是这批真有的，每行都可操作）；
   * - 加模式待选行：+N = 点下去会新添到几条上（全命中 → 已含）；
   * - 加模式其余行：组条数——与分组流组头同一个数（纽约 8 / 上海 5），
   *   扫读时直接复用「这一组有多大」的肌肉记忆，而不是每个人为造一个分母。
   * - 名册行没有条数可言（库外城市），右列留空——显示 0 只会让人以为这是个
   *   空组而不是「还没用过的城市」。
   */
  const statOf = (r: LocRow): string | undefined => {
    if (!showStat || r.roster) return undefined
    if (mode === 'remove') return b.rowRemove(r.hit)
    if (pickedCount > 0 && r.hit === pickedCount) return b.rowHas
    if (isPending(r.location) && pickedCount > 0) return b.rowAdd(pickedCount - r.hit)
    return `${r.total}`
  }

  /** 读屏名给完整句式（右列是裸数字时，浏览器会把「亚洲 · 中国 · 北京 8」念成没头没尾的两段）；
   *  名册行没有右列数字，行文字本身就念得通，不给多余的名。
   *  BUG-176e：口径与 `statOf` 同源——加模式待处理行念「会新添到 N 条」、全命中行念
   *  「已在选中的这批里」，不再固定念组条数（那与右列可见数字不是同一个量）。 */
  const ariaOf = (r: LocRow): string | undefined => {
    if (!showStat || r.roster) return undefined
    if (mode === 'remove') return b.rowRemoveAria(r.label, r.hit)
    if (pickedCount > 0 && r.hit === pickedCount) return b.rowHasAria(r.label)
    if (isPending(r.location) && pickedCount > 0) return b.rowAddAria(r.label, pickedCount - r.hit)
    return l.groupAria(r.label, r.total)
  }

  return (
    <div className="momo-pop-list">
      {rows.length === 0 ? (
        <div className="momo-pop-empty">{query.trim() ? b.emptyNoMatch : b.emptyNoLocations}</div>
      ) : (
        rows.map((r, i) => (
          <Fragment key={r.location}>
            {/* 分组标签只在「没在搜索」时出现（与批量标签弹层同一口径） */}
            {query.trim() === '' && i === 0 ? (
              <div className="momo-pop-seclabel">{mode === 'remove' ? b.groupOwned(brand) : b.groupAll}</div>
            ) : null}
            {/* 名册段的开始处隔一个小标题：库里的地点在前，库外名册的城市在后 */}
            {r.roster && !(i > 0 && rows[i - 1].roster) ? (
              <div className="momo-pop-seclabel">{l.rosterSection}</div>
            ) : null}
            <PopRow
              label={r.label}
              on={isPending(r.location)}
              have={mode === 'add' && pickedCount > 0 && r.hit === pickedCount}
              disabled={
                (mode === 'add' && pickedCount > 0 && r.hit === pickedCount && !isPending(r.location)) ||
                (atLimit && !isPending(r.location))
              }
              stat={statOf(r)}
              ariaLabel={ariaOf(r)}
              onClick={() => onToggle(r.location)}
            />
          </Fragment>
        ))
      )}
      {typedIsNew && (
        <PopRow
          new
          on={isPending(query.trim())}
          label={(mode === 'remove' ? b : l.edit).createNew(query.trim())}
          onClick={onCommitTyped}
        />
      )}
      {inputError && <div className="momo-pop-note momo-pop-note-bad">{inputError}</div>}
    </div>
  )
}
