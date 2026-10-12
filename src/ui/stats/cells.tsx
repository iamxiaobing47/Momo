import { copy } from '../../momo/i18n'
import type { ReactNode } from 'react'
import { DRILL, drillProps } from './drill'
import { pct } from './format'

// 统计页的「一格」级零件：卡头 / 组标题 / 内容质量格 / 记录习惯格 / 里程碑行 /
// 概览格。都是纯展示组件（props 进、JSX 出），唯一例外是下钻回调由调用方给。

/**
 * 卡片头（v0.6.7 起只留标题 + 右侧胶囊）：用户裁决「这些提示语文全部都去掉」——
 * 原来每张卡标题下都挂一行口径小字（「全库 · 近 12 个月」「全部时间 · 按小时分布」…），
 * 一屏十四五行灰字，读卡先读一层释义。范围 / 口径信息并没有丢：顶栏的分段控件
 * 本身就显示当前范围，概览条与卡内数字也够自明。
 * v0.7.4 起 `pills` 可多枚：「全库」标记（M2，修 D3「顶栏范围不影响哪些卡不可见」）
 * 与峰值 / 高峰这类数据胶囊并排——pill 是数据标记不是释义，不违背 v0.6.7 的裁决。
 */
export function CardHead({ title, pills }: { title: string; pills?: readonly string[] }) {
  return (
    <div className="momo-card-head">
      <span className="momo-card-title">{title}</span>
      {pills?.map((p) => (
        <span key={p} className="momo-card-pill">
          {p}
        </span>
      ))}
    </div>
  )
}

/**
 * 组标题（v0.6.2，v0.6.7 删副标题）：四组语义域的章节头。组内一张卡都不显示时
 * 整组（含标题）收起，不留空章节。
 */
export function GroupHead({ title }: { title: string }) {
  return (
    <div className="momo-stats-group-head">
      <span className="momo-stats-group-title">{title}</span>
    </div>
  )
}

/** 内容质量的一格：标签在上、数值在下，格与格之间用竖线分隔（设计稿同款）。
 *  v0.7.0 起可下钻（`onDrill`）：无标签 → 筛选无标签，长记录占比 → 筛选 ≥ 200 字。
 *  平均 / 中位数是聚合值不是子集，没有对应筛选口径，刻意不可点。 */
export function QualityCell({
  label,
  num,
  unit,
  hint,
  onDrill,
}: {
  label: string
  num: string | number
  unit?: string
  hint?: string
  onDrill?: () => void
}) {
  return (
    <div
      className={`momo-quality-cell${onDrill ? ` ${DRILL}` : ''}`}
      {...drillProps(
        onDrill
          ? hint
            ? copy.statsPage.drill.labelHint(label, hint)
            : copy.statsPage.drill.label(label)
          : '',
        onDrill,
      )}
    >
      <span className="momo-quality-label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      <span className="momo-quality-value">
        <span className="momo-quality-num">{num}</span>
        {unit && <span className="momo-quality-unit">{unit}</span>}
      </span>
    </div>
  )
}

/** 记录习惯的一格：名称在左、数值在右（与里程碑行同一套排版）。
 *  v0.7.0 起可下钻（`onDrill`）：本月 / 最高产的一天 → 各打到对应的日期集上跳回
 *  全部笔记（本周新增与最近 30 天两格 v0.7.5 随 C2 移除——概览条与总笔记卡已有
 *  同源数字，一屏两现没有信息量）。连续记录与活跃日日均是聚合口径，不可点。
 *  v0.7.3 起 `unit` 可选：单日集中度这类本身就是比例值的格子不带单位。
 *  v0.7.5 起 `pill` 可选：名称后的小标记（导入日），复用卡头胶囊的样式。 */
export function HabitCell({
  name,
  num,
  unit,
  strong,
  onDrill,
  pill,
}: {
  name: string
  num: string | number
  unit?: string
  strong?: boolean
  onDrill?: () => void
  pill?: React.ReactNode
}) {
  return (
    <div
      className={`momo-habit-cell${onDrill ? ` ${DRILL}` : ''}`}
      {...drillProps(onDrill ? copy.statsPage.drill.label(name) : '', onDrill)}
    >
      <span className="momo-habit-name">
        {name}
        {pill}
      </span>
      <span className={`momo-habit-value${strong ? ' momo-habit-strong' : ''}`}>
        <span className="momo-habit-num">{num}</span>
        {unit && <span className="momo-habit-unit">{unit}</span>}
      </span>
    </div>
  )
}

/**
 * 里程碑：目标 + 还差多少 / 进度条 / 当前 + 百分比（设计稿三段式）
 * + 「接下来」梯子（v0.6.5）：当前目标之后的几个档位，纯文字小胶囊——
 * 让「再多写一点会到哪」看得见，而不是只盯着眼前这一档。
 */
export function MilestoneRow({
  name,
  current,
  target,
  remaining,
  unit,
  upcoming,
}: {
  name: string
  current: number
  target: number
  remaining: number
  unit: string
  upcoming?: readonly number[]
}) {
  const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0
  const width = ratio > 0 ? Math.max(2, Math.round(ratio * 100)) : 0
  return (
    <div className="momo-ms">
      <div className="momo-ms-top">
        <span className="momo-ms-name">{name}</span>
        <span className="momo-ms-dist">{copy.statsPage.milestone.remaining({ remaining, unit })}</span>
      </div>
      <span className="momo-ms-track">
        <span className="momo-ms-fill" style={{ width: `${width}%` }} />
      </span>
      <div className="momo-ms-bottom">
        <span className="momo-ms-cur">
          {current} / {target} {unit}
        </span>
        <span className="momo-ms-pct">{pct(ratio)}</span>
      </div>
      {upcoming && upcoming.length > 0 && (
        <div className="momo-ms-next">
          <span className="momo-ms-next-label">{copy.statsPage.milestone.next}</span>
          {upcoming.map((t) => (
            <span key={t} className="momo-ms-next-item">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 概览条的一格（v0.6.2）：标签 + 数值 + 副行。比内容质量格更紧凑——五格并排
 * 也要塞得进中等宽度的面板，所以字号降一档（节奏对照写在副行里）。
 * `tone` 只染副行：up = 主色（在变好），down = danger 色（在退步），flat = 灰。
 * v0.7.0 起可下钻（`onDrill`）：本周节奏 / 高产时段 / 周末记录。
 * 连续记录是「正在进行的状态」而不是一个子集，不可点。
 */
export function OverviewCell({
  label,
  num,
  unit,
  sub,
  tone = 'plain',
  onDrill,
}: {
  label: string
  num: string | number
  unit?: string
  sub?: string
  tone?: 'plain' | 'up' | 'down' | 'flat'
  onDrill?: () => void
}) {
  return (
    <div
      className={`momo-ov-cell${onDrill ? ` ${DRILL}` : ''}`}
      {...drillProps(onDrill ? copy.statsPage.drill.label(label) : '', onDrill)}
    >
      <span className="momo-ov-label">{label}</span>
      <span className="momo-ov-value">
        <span className="momo-ov-num">{num}</span>
        {unit && <span className="momo-ov-unit">{unit}</span>}
      </span>
      {sub && <span className={`momo-ov-sub momo-ov-sub-${tone}`}>{sub}</span>}
    </div>
  )
}

/** 子分区标题（.momo-sub-sec）：卡内分段。`gap` = 与上一段之间额外留白 */
export function SubSection({ gap, children }: { gap?: boolean; children: ReactNode }) {
  return <div className={gap ? 'momo-sub-sec momo-sub-sec-gap' : 'momo-sub-sec'}>{children}</div>
}

/** 卡内脚注行：无数据说明 / 里程碑起点 */
export function StatsFoot({ children }: { children: ReactNode }) {
  return <div className="momo-stats-foot">{children}</div>
}

/**
 * 分布条一行：标签 + 轨道 + 数量。字数分布与标签数分布两张卡逐字同形
 * （P1 收敛到这，drillProps 由本组件代劳）。
 * `width` 是填充百分比，由调用方给——binWidth 的口径仍在 format.ts 一处定义。
 * `onDrill` 可选（v0.9.33 地点数分布起出现不可点的分布卡）：那是**聚合口径**
 * （每条几个地点不是某个地点子集），刻意不做下钻——与「平均 / 中位数不可点」
 * 同一条纪律。缺省时行上没有 DRILL class、也没有键盘触发。
 */
export function DistRow({
  label,
  count,
  width,
  drillLabel,
  onDrill,
}: {
  label: string
  count: number
  width: number
  drillLabel?: string
  onDrill?: () => void
}) {
  return (
    <div className={`momo-statbar-row${onDrill ? ` ${DRILL}` : ''}`} {...drillProps(drillLabel ?? '', onDrill)}>
      <span className="momo-statbar-label">{label}</span>
      <span className="momo-statbar-track">
        <span className="momo-statbar-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="momo-statbar-num">{count}</span>
    </div>
  )
}

/**
 * KPI 卡（规模层三张，P1 收敛）：head（名称 + 右侧 delta / 图标）+ value
 * （大数字 + 单位）+ 可选的曲线（children 位）+ foot（副行 / 活跃环）。
 * 三张的差异全走 props，壳与三段结构只此一份。
 */
export function KpiCard({
  name,
  headExtra,
  value,
  unit,
  foot,
  lead,
  children,
}: {
  name: string
  headExtra?: ReactNode
  value: string | number
  unit?: string
  foot?: ReactNode
  lead?: boolean
  children?: ReactNode
}) {
  return (
    <article className={`momo-stats-card momo-kpi-card${lead ? ' momo-kpi-lead' : ''}`}>
      <div className="momo-kpi-head">
        <span className="momo-kpi-name">{name}</span>
        {headExtra}
      </div>
      <div className="momo-kpi-value">
        <span className="momo-kpi-num">{value}</span>
        {unit && <span className="momo-kpi-unit">{unit}</span>}
      </div>
      {children}
      {foot}
    </article>
  )
}
