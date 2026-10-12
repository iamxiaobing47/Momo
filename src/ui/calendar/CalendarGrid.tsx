import { memo, type RefObject } from 'react'
import { copy } from '../../momo/i18n'
import { levelClass, type HeatCell } from '../../momo/dates'
import { HeatTip, heatTipText, useHeatTip, type HeatTipApi } from '../kit'
import { moveDayGridFocus } from './dayGridNav'

// 活跃度日历的格子区（自 StatsHeatmap.tsx 拆出）：星期行 + 月份标签 + 周列矩阵。
// 单格边长（cellPx）由调用方用 kit/useCellSize 实测容器宽后传进来——dows / months /
// grid 三处必须同源铺同一个数，否则月份标签会和格子错列。格子太窄时「月份隔月显示」
// 的降密也由调用方算好（labelByCol 里没有的列渲染空串）。
// 未来格（key > today，本地口径，跨零点跟着翻页）与选中态（filterDates）在此渲染。
// 格子悬浮出「日期 · 条数」提示（kit/HeatCellTip，与侧栏热力图共用一套）。

export interface CalendarGridProps {
  /** 量宽容器：useCellSize 挂在 momo-cal-main 上实测格子区可用宽（星期列在它外面） */
  containerRef: RefObject<HTMLDivElement | null>
  /** 单格边长（px：实测夹取 6–15） */
  cellPx: number
  /** 周列数（与 weeks.length 同源，月份标签按列铺） */
  cols: number
  /** 列下标 → 月份标签（降密后不显示的列查不到，渲染空串占位） */
  labelByCol: ReadonlyMap<number, string>
  /** 周列矩阵（buildWeeks 产物：alignToSunday 的自然年口径） */
  weeks: HeatCell[][]
  /** 今天的日期键：晚于它的格子是未来格 */
  today: string
  /** 已选日期集（热力图筛选，命中即高亮） */
  filterDates: readonly string[]
  /** 点一格（StatsHeatmap.pickDay：toggleFilterDate + 跳列表） */
  onPickDay: (day: string) => void
}

export function CalendarGrid({
  containerRef,
  cellPx,
  cols,
  labelByCol,
  weeks,
  today,
  filterDates,
  onPickDay,
}: CalendarGridProps): React.JSX.Element {
  const tip = useHeatTip()
  return (
    <div className="momo-cal-body">
      {/* BUG-125a：星期列与格子区必须同一套纵向排法——格子在 .momo-cal-main 里排在月份行
          + 行距之下，星期列旧实现从 body 顶开始排，整列偏上一行（「日」与月份同行、末行无
          标签）。这里给星期列垫一个月份行占位（CSS 与 .momo-cal-month 共用同一条规则：同字号同行高），行距由两边共用的
          CSS 变量给，不手抄 px。 */}
      <div className="momo-cal-dows">
        <span className="momo-cal-dows-pad" aria-hidden="true">
          {'\u00a0'}
        </span>
        <div className="momo-cal-dows-col">
          {copy.date.weekdayCharSunFirst.map((d, i) => (
            // BUG-184b：key 别用渲染内容——en 的星期字是 ['S','M','T','W','T','F','S']，
            // 两个 'T'/'S' 撞 key，React 报重复 key 并走未定义的 reconciliation。
            <span key={i} className="momo-cal-dow" style={{ height: cellPx }}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="momo-cal-main" ref={containerRef}>
        <div className="momo-cal-months">
          {Array.from({ length: cols }, (_, i) => (
            <span key={i} className="momo-cal-month" style={{ width: cellPx }}>
              {labelByCol.get(i) ?? ''}
            </span>
          ))}
        </div>
        <CalendarCells
          weeks={weeks}
          cellPx={cellPx}
          today={today}
          filterDates={filterDates}
          onPickDay={onPickDay}
          show={tip.show}
          hide={tip.hide}
        />
      </div>
      <HeatTip tip={tip.tip} />
    </div>
  )
}

interface CalendarCellsProps {
  weeks: HeatCell[][]
  cellPx: number
  today: string
  filterDates: readonly string[]
  onPickDay: (day: string) => void
  show: HeatTipApi['show']
  hide: HeatTipApi['hide']
}

/**
 * 格子矩阵（BUG-61）：hover 提示的 state 由外层 CalendarGrid 持有，这里抽成 memo 的
 * 子组件——tip 状态一变只重渲外层与 HeatTip portal，371 个格子的元素树与内联
 * onClick / onMouseOver / onMouseOut 闭包不再逐格重建（show / hide 是稳定引用，
 * 其余 props 在 hover 期间不变，memo 因此挡得住）。
 */
const CalendarCells = memo(function CalendarCells({
  weeks,
  cellPx,
  today,
  filterDates,
  onPickDay,
  show,
  hide,
}: CalendarCellsProps): React.JSX.Element {
  return (
    <div className="momo-cal-grid">
      {weeks.map((week, wi) => (
        <div key={wi} className="momo-cal-week" style={{ width: cellPx }}>
          {week.map((cell, ci) => {
            // 未来格（key > today）**不可点**：它不是「那天没记录」，是「那天还没到」。
            // 旧实现对所有格子无差别绑 onClick，于是点未来格会写进一个未来日期并跳
            // 列表——列表必然是空的，用户看到的正是「点了没反应」，而鼠标又是默认
            // 箭头（.momo-cal-future 自带 cursor: default，见 40-stats.css），
            // 视觉与行为两头都说不通。空位格（!cell.date）同样不绑。
            if (!cell.date) {
              return <div key={ci} className="momo-heat-cell momo-heat-empty" style={{ width: cellPx, height: cellPx }} />
            }
            const future = cell.key > today
            return (
              <div
                key={ci}
                // BUG-125b：色阶与「未来」正交——未来格照样按条数上色（预写条目不凭空消失），
                // 只保留「不可点 / 不进 Tab 序列」；0 条的未来格由 CSS 透明底
                className={`momo-heat-cell ${future ? 'momo-cal-future ' : ''}${levelClass(cell.count)} ${
                  filterDates.includes(cell.key) ? 'momo-heat-selected' : ''
                }`}
                style={{ width: cellPx, height: cellPx }}
                {...(future
                  ? {}
                  : {
                      // BUG-109d：与侧栏热力图（BUG-82b）同一口径——「一日类格子必须可
                      // 键盘抵达」。日历此前是裸 div + onClick（全站最后一处键盘空心
                      // 区）。不改 <button>（会重置默认样式、带崩 dom-snapshot 基线），
                      // div + ARIA 一样可达。方向键走共享的 dayGridNav（与热力图同
                      // 一份语义：←→ 一周、↑↓ 一天），Enter/Space 等价于点一下。
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': heatTipText(cell.key, cell.count),
                      'aria-pressed': filterDates.includes(cell.key),
                      onClick: () => onPickDay(cell.key),
                      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (moveDayGridFocus(e.currentTarget, e.key)) {
                          e.preventDefault()
                          return
                        }
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        onPickDay(cell.key)
                      },
                      onMouseOver: (e: React.MouseEvent<HTMLDivElement>) => show(cell.key, cell.count, e.currentTarget),
                      onMouseOut: hide,
                    })}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
})
