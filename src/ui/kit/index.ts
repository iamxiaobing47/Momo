// UI 原语层（kit）：跨面板（shell / card / stats）共享的展示零件。
// 规则：纯展示——参数全走 props，自身不订阅 store；文案由调用方从 copy 传进来
// （AGENTS.md §3.4：界面文案唯一入口是 momo/i18n）。stats 域特有的格子
// （DistRow / SubSection / StatsFoot / KpiCard）在 stats/cells.tsx，不进这里。

export { Segmented, type SegmentedItem } from './Segmented'
export { TextButton, type TextButtonProps } from './TextButton'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { Spacer } from './Spacer'
export { CheckCircle } from './CheckCircle'
export { PinMark } from './PinMark'
export { useCellSize } from './useCellSize'
export { HeatLegend } from './HeatLegend'
export { useHeatTip, HeatTip, heatTipText, type HeatTipApi, type HeatTipState } from './HeatCellTip'
export { PopDialog, type PopDialogProps } from './PopDialog'
export { PopRow, type PopRowProps } from './PopRow'
export {
  useFreePopPlacement,
  type FreePopOptions,
  type FreePopPlacement,
  type FreePopSize,
} from './useFreePopPlacement'
