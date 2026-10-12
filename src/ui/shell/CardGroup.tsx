import type { MomoEntry } from '../../momo/types'
import { Card } from '../card'
import { WindowSlot } from '../window/WindowSlot'

// 分组骨架（列表密度）：日期组与置顶组只有标题不同，抽成真组件
// （原来是 CardFlow.tsx 里的 renderGroup() 内联函数），免得同一段 JSX 抄两遍
// （置顶组 + 列表的日期组）。
// DOM 逐字不变：section.momo-group(-pinned) > 分组头 + 一段 momo-flow 平铺卡片。
//
// 多选态四个 prop（selectMode / selected / onToggleCheck / onTag）于组件化 P5 撤下，
// 复查轮又更进一步：选择态已搬进 store（`store/selection.ts`），Card 自己用
// `useUi((s) => s.selected.has(path))` 按卡选布尔量——本组件不再当二传手，
// 勾一张卡只有那一张重渲（context value 带 Set 会让全树消费者重渲，已弃用）。

export interface CardGroupProps {
  /** 分组标题（日期组 = `YYYY-MM-DD · 周X`；置顶组 = 图钉 + 「置顶」） */
  label: React.ReactNode
  items: MomoEntry[]
  /** 置顶组：常驻最上、不参与日期分组，加 momo-group-pinned */
  pinned?: boolean
}

/**
 * 一段窗口化的卡片流（列表密度的一份）。
 *
 * 抽出来是为了让分组骨架与「卡片流长什么样」分开：列表的日期组与置顶组共用
 * 这一份平铺，复制一份就会两张皮（窗口化策略改一边忘一边）。
 */
export function EntryFlow({ items }: { items: MomoEntry[] }): React.JSX.Element {
  return (
    <div className="momo-flow">
      {items.map((e, i) => (
        <WindowSlot key={e.path} path={e.path} index={i}>
          <Card entry={e} />
        </WindowSlot>
      ))}
    </div>
  )
}

export function CardGroup({ label, items, pinned = false }: CardGroupProps): React.JSX.Element {
  return (
    <section className={`momo-group${pinned ? ' momo-group-pinned' : ''}`}>
      <div className="momo-group-head">
        <span className="momo-group-title">{label}</span>
        <span className="momo-group-rule" />
      </div>
      <EntryFlow items={items} />
    </section>
  )
}
