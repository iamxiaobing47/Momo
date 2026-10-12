import { useMemo } from 'react'
import { copy } from '../../momo/i18n'
import { useUi } from '../store'
import { DRILL, drillProps } from './drill'
import type { TrendBarPoint } from './types'

// 统计页的图表（全部零依赖：曲线是内联 SVG、柱状是纯 div——延续「不引图表库」的口径）。
// 组件只认**已经算好的数字**，不从 store 读统计：数据一律由 StatsPage 传进来，
// 图表模块因此可以单独看、单独改。
//
// 颜色一律走 --dp-* 令牌（BUG-134d）：这里曾经把 hero 曲线的面积填充写死成
// `#94a89a`，于是换肤时线与端点跟着主题变、底衬永远是那一团冷灰绿。守卫见
// `scripts/hex-color-guard.test.mts`（src/ui 里出现 6 位十六进制字面色即红）。

/**
 * 累计走势曲线（核心指标 · 总笔记）：把最近 30 天的每日条数做前缀和——单调上升的曲线，
 * 终点与「+N 30天」角标同源，永远对得上。
 * 内联 SVG + preserveAspectRatio="none"（配 vector-effect 保住线宽），零依赖；
 * 端点用 HTML 绝对定位画，避免非等比缩放把圆点拉成椭圆。
 */
function Sparkline({ values }: { values: readonly number[] }) {
  const w = 300
  const h = 48
  const { line, area, endY } = useMemo(() => {
    const acc: number[] = []
    let sum = 0
    for (const v of values) {
      sum += v
      acc.push(sum)
    }
    const max = Math.max(1, sum)
    const n = Math.max(2, acc.length)
    // 曲线顶部留 6px、底部留 2px：端点圆点不贴边、也不被裁
    const y = (v: number) => Math.round((h - 2 - (v / max) * (h - 8)) * 100) / 100
    const x = (i: number) => Math.round((i / (n - 1)) * w * 100) / 100
    let d = ''
    acc.forEach((v, i) => {
      d += `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`
    })
    const endY = acc.length > 0 ? y(acc[acc.length - 1] ?? 0) : h - 2
    return { line: d, area: `${d}L${w},${h}L0,${h}Z`, endY }
  }, [values])

  const endTopPct = (endY / h) * 100

  return (
    <div className="momo-spark">
      <svg className="momo-spark-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="momo-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dp-accent-2)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--dp-accent-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#momo-spark-fill)" />
        <path d={line} className="momo-spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="momo-spark-dot" style={{ top: `${endTopPct}%` }} />
    </div>
  )
}

/** 30 天活跃环：内联 SVG 的 stroke-dasharray 画弧，中心叠天数 */
function ActiveRing({ days, total }: { days: number; total: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const ratio = total > 0 ? Math.max(0, Math.min(1, days / total)) : 0
  return (
    <span className="momo-ring">
      <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
        <circle className="momo-ring-track" cx="26" cy="26" r={r} />
        <circle
          className="momo-ring-fill"
          cx="26"
          cy="26"
          r={r}
          strokeDasharray={`${c * ratio} ${c}`}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className="momo-ring-num">
        {days}
        <em>/{total}</em>
      </span>
    </span>
  )
}

/** 趋势柱（v0.7.4 起月 / 周粒度通用，替代原 MonthBars）：峰值深一档；
 *  没有新增的周期在基线上留 4px 短柱（设计稿同款）。
 *  组件只认展示化后的点（label / drillLabel / days / count）——粒度语义在 StatsPage 里翻译完。
 *  v0.9.5 起每根柱可点：带着「这一周 / 这一个月」的日期组跳回全部笔记——与同一张
 *  卡右侧的小时柱 / 星期柱同一套下钻口径（HourBars / WeekdayBars）。
 *  `peak={false}` / `zeroHeight` 给附件月度趋势用（全普通 / 零两档、零值柱 6%——
 *  与 P1 前那张卡手抄版的口径逐字一致：4px 是趋势卡的绝对高度，附件卡是百分比）。 */
export function TrendBars({
  points,
  onDrill,
  peak = true,
  zeroHeight = '4px',
}: {
  points: readonly Pick<TrendBarPoint, 'key' | 'count' | 'drillLabel' | 'days'>[]
  /** 下钻回调：入参 = 该柱覆盖的日期键；不传 = 纯展示 */
  onDrill?: (days: string[]) => void
  /** 峰值柱是否深一档（默认是；附件趋势关掉） */
  peak?: boolean
  /** 零值柱高度（趋势卡 4px 绝对高度；附件卡回退到 6%） */
  zeroHeight?: string
}) {
  const max = Math.max(1, ...points.map((p) => p.count))
  const top = Math.max(0, ...points.map((p) => p.count))
  return (
    <div className="momo-mbars">
      {points.map((p) => {
        const isPeak = p.count > 0 && p.count === top
        const height = p.count > 0 ? `${Math.max(6, Math.round((p.count / max) * 100))}%` : zeroHeight
        const tone = p.count === 0 ? 'zero' : peak && isPeak ? 'peak' : 'normal'
        return (
          <div
            key={p.key}
            className={`momo-mbar-col ${onDrill ? DRILL : ''}`}
            {...drillProps(p.drillLabel, onDrill ? () => onDrill(p.days) : undefined)}
          >
            <span className="momo-mbar-num">{p.count > 0 ? p.count : ''}</span>
            <span className="momo-mbar-track">
              <span className={`momo-mbar-fill momo-mbar-${tone}`} style={{ height }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 按小时分布：24 根细柱，按当日峰值分三档深浅（设计稿的三档口径）。
 *  v0.7.0 起每根柱可点：带着「这个小时」跳回全部笔记。 */
function HourBars({ counts }: { counts: readonly number[] }) {
  const max = Math.max(1, ...counts)
  const filterByHours = useUi((s) => s.filterByHours)
  return (
    <div className="momo-hbars">
      {counts.map((count, hour) => {
        const r = count / max
        const tone = count === 0 ? 'zero' : r >= 0.66 ? 'high' : r >= 0.25 ? 'mid' : 'low'
        const drill = () => filterByHours([hour])
        return (
          <div
            key={hour}
            className={`momo-hbar-col ${DRILL}`}
            {...drillProps(copy.statsPage.drill.hours({ hour, count }), drill)}
          >
            <span
              className={`momo-hbar-fill momo-hbar-${tone}`}
              style={{ height: count > 0 ? `${Math.max(6, Math.round(r * 100))}%` : '2px' }}
            />
          </div>
        )
      })}
    </div>
  )
}

/** 星期分布：7 根柱 + 单字标签。v0.7.0 起每根柱可点：带着「这个星期」跳回全部笔记 */
function WeekdayBars({ counts }: { counts: readonly number[] }) {
  const max = Math.max(1, ...counts)
  const filterByWeekdays = useUi((s) => s.filterByWeekdays)
  return (
    <div className="momo-wbars">
      {counts.map((count, i) => {
        const drill = () => filterByWeekdays([i])
        return (
          <div
            key={i}
            className={`momo-wbar-col ${DRILL}`}
            {...drillProps(
              copy.statsPage.drill.weekday({ weekday: copy.date.weekdayMonFirst[i] ?? '', count }),
              drill,
            )}
          >
            <span className="momo-wbar-num">{count > 0 ? count : ''}</span>
            <span className="momo-wbar-track">
              <span
                className="momo-wbar-fill"
                style={{ height: count > 0 ? `${Math.max(6, Math.round((count / max) * 100))}%` : '3px' }}
              />
            </span>
            <span className="momo-wbar-label">{copy.date.weekdayCharMonFirst[i] ?? ''}</span>
          </div>
        )
      })}
    </div>
  )
}

// TrendBars 在声明处导出（P1 起附件卡也复用，见上方 peak 参数）；
// 其余图表走这张收尾导出表。
export { ActiveRing, HourBars, Sparkline, WeekdayBars }
