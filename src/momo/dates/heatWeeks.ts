import { copy } from '../i18n'
import { localDay } from './dateGroups'

// 热力图共用的纯逻辑（侧栏滚动窗 + 统计页自然年曾各写一遍，P1 收敛）：
// ① 把日期区间按 7 天一列铺成周列矩阵；② 当日条数 → 色阶类名
// （0 / ≤2 / ≤5 / ≤9 / >9）；③ 侧栏的月份标签挑选（`pickMonthLabels`）。
// 放在 momo/：纯函数、不 import obsidian，与 dateGroups 同层可单测。
//
// ③ 目前只有侧栏在用：统计页日历（StatsHeatmap）仍走自己的「同列折叠 + 按 idx
// 奇偶降密」，那套是为 53 列 × 15px 上限的全年格子调的，与侧栏 20px 封顶的滚动窗
// 不是同一个几何。要统一得先各留快照比对两个月，不在这轮 bug 修复里顺手动。

/** 一格：date = null 表示空格（首列对齐补位 / 年度窗口的界外格） */
export interface HeatCell {
  key: string
  count: number
  date: Date | null
}

export interface HeatWeeks {
  weeks: HeatCell[][]
  /** 走过的每个月在「该月首日所在列」记一个标签 */
  monthLabels: Array<{ label: string; col: number }>
}

/**
 * 周列矩阵。两处调用方的列首口径**本来就不同**，用 `alignToSunday` 区分——
 * 这不是没统一干净，是两份原始行为的差异，刻意保留：
 * - `true`（统计页自然年）：start 回溯到所在周的周日，start 之前的格子是空格；
 *   月份标签从回溯后的周日开始记（原实现同样如此，界外那个月也会出现在 col 0）。
 * - `false`（侧栏滚动窗）：首列不回溯，start 是星期几就补几个空格，
 *   走过的每一天都是实格。
 */
export function buildWeeks(
  start: Date,
  end: Date,
  byDay: ReadonlyMap<string, number>,
  opts?: { alignToSunday?: boolean },
): HeatWeeks {
  const align = opts?.alignToSunday === true
  const weeks: HeatCell[][] = []
  const monthLabels: Array<{ label: string; col: number }> = []
  let current: HeatCell[] = []

  const walkFrom = new Date(start)
  if (align) walkFrom.setDate(walkFrom.getDate() - walkFrom.getDay())
  else {
    // 首列按 start 是星期几补空位（行 = 星期日开头）
    for (let i = 0; i < start.getDay(); i++) current.push({ key: '', count: 0, date: null })
  }

  let lastMonth = -1
  for (const d = new Date(walkFrom); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth()
      monthLabels.push({ label: copy.date.month(lastMonth + 1), col: weeks.length })
    }
    const inRange = !align || d >= start
    const key = localDay(d)
    current.push(inRange ? { key, count: byDay.get(key) ?? 0, date: new Date(d) } : { key: '', count: 0, date: null })
    if (current.length === 7) {
      weeks.push(current)
      current = []
    }
  }
  if (current.length) weeks.push(current)
  return { weeks, monthLabels }
}

/**
 * 一个月份标签在最坏情况下有多宽：「12月」= 2 位数字 + 一个「月」字，
 * `--momo-fs-1`（11px）下约 24px，再留 4px 呼吸。相邻标签的中心距小于它就会相叠
 * （2026-09-28 那次「『8月』『9月』两盒相邻、文字溢出相叠」正是这个事故）。
 */
const MONTH_LABEL_MIN_PX = 28

/**
 * 从 `buildWeeks` 走过的月份里挑出**真正显示**的那些：`col → label`。
 *
 * 两步，两步都必不可少：
 *
 * ① **同列折叠（后写胜）**：窗口起点落在上个月尾巴时，col 0 会连着记下
 * 「界外月」与「当月」两条（如 6/30 起窗 → 6 月、7 月同在 col 0）。只露一两格的
 * 旧月让位给当月——与统计页日历 BUG-24 同一口径（那条修在 StatsHeatmap 里）。
 * 2026-10-01 起侧栏窗口起点锁定自然月 1 号（见 dateGroups 的 monthWindowStart），
 * 这种堆叠对侧栏已不可能发生；这步保留作防御（上游哪天改回日期口径就它还管事），
 * 直接喂 labels 的单测也仍在钉它。
 *
 * ② **从右往左按最小间距贪心**：与上一个留下的标签相距不足 `minPx / colPx` 列就
 * 跳过。从右边起保证「当月」永远有标签；放不下时先丢最旧的月——读者要看的是
 * 最近发生了什么，不是窗口的起点是哪天。
 *
 * 为什么不再是「按 idx 奇偶隔月显示」：标签落在**该月 1 号所在列**，相邻月界隔
 * 4–5 列，3 个月窗口下间距 60px+，全显本来就不相叠。一律隔月反而把 7 月跳掉、
 * 留下只覆盖 6/30 一天的「6月」——用户报障「设置最近 3 个月，标签却是 6 月和 8 月」
 * （2026-09-30）。列宽按实测 colPx 折算成列数：宽列距（月数少）全显，
 * 窄列距（12 个月铺 53 列）自动降密，不溢出也不空窗。
 */
export function pickMonthLabels(
  labels: ReadonlyArray<{ label: string; col: number }>,
  colPx: number,
  minPx: number = MONTH_LABEL_MIN_PX,
): Map<number, string> {
  const collapsed: Array<{ label: string; col: number }> = []
  const indexByCol = new Map<number, number>()
  for (const m of labels) {
    const at = indexByCol.get(m.col)
    if (at === undefined) {
      indexByCol.set(m.col, collapsed.length)
      collapsed.push(m)
    } else {
      collapsed[at] = m // 后写胜：同列的界外月让给后面的当月
    }
  }
  const minCols = Math.max(1, Math.ceil(minPx / Math.max(colPx, 1)))
  const picked = new Map<number, string>()
  let lastCol = Number.POSITIVE_INFINITY
  for (let i = collapsed.length - 1; i >= 0; i--) {
    const m = collapsed[i]
    if (lastCol - m.col < minCols) continue
    picked.set(m.col, m.label)
    lastCol = m.col
  }
  return picked
}

/** 与两份原实现同一套色阶门槛：0 / ≤2 / ≤5 / ≤9 / >9 条 */
export function levelClass(count: number): string {
  if (count <= 0) return 'momo-heat-l0'
  if (count <= 2) return 'momo-heat-l1'
  if (count <= 5) return 'momo-heat-l2'
  if (count <= 9) return 'momo-heat-l3'
  return 'momo-heat-l4'
}
