import { createContext, useContext, type ReactNode } from 'react'

// 地点组的上下文（F6 §pill 的「当前组不显示自己的 pill」）。
//
// 为什么需要它：多地点笔记的卡片上有交叉引用 pill——「这篇还在别的组里」。
// 但卡片正待在自己那一组里时，把本组也做成一颗 pill 是冗余（用户已经在这儿了），
// 所以 LocationFlow 按组包一层 provider，CardMeta 里的 pill 组件据此把「本组」
// 从列表里剔掉。
//
// 值是**组键**（路径键，`亚洲\u0000中国\u0000北京`）而不是地名：v0.9.30 起
// 分组可能按大洲 / 国家并组（locLevel），同国的两个地名会是同一组——pill 要
// 剔的是「本组」，按组键比才准。 pill 自己手里的地点也要先过 locGroupOf 换成
// 组键才比得上（见 locPills.tsx）。
//
// 只在分组流内非 null：列表 / 回顾 / 统计等模式没有「当前组」，provider
// 不存在（默认值 null）→ pill 显示全部其它地点。
// 刻意不做成 store 字段：store 管会话态，而「这张卡渲染时属于哪一组」是
// **渲染位置**信息——放进 store 会让滚动时每张卡都跟着 store 抖动。

const LocGroupContext = createContext<string | null>(null)

export function LocGroupProvider({
  group,
  children,
}: {
  /** 本组的路径键（分组流内恒非空——没有「未标地点」虚拟组） */
  group: string | null
  children: ReactNode
}): React.JSX.Element {
  return <LocGroupContext.Provider value={group}>{children}</LocGroupContext.Provider>
}

/** 当前所在地点组的路径键；分组流外 = null */
export function useLocGroup(): string | null {
  return useContext(LocGroupContext)
}
