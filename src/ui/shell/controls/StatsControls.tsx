import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import type { StatsRange } from '../../../momo/types/prefs'
import { Segmented } from '../../kit'

/**
 * 统计页顶栏右半：只剩范围分段。
 * 抽成组件是为了让顶栏的 JSX 保持线性——它只在 mode==='stats' 时渲染，
 * 尺寸与间距跟顶栏其它控件一致，但读的 store 字段只有统计页关心。
 * 本轮移除「导出笔记」「导出报告」两颗按钮（导出整块随后一并清掉：
 * caps.exportNotes 与统计页操作栏都不在了）。
 */
export function StatsControls(): React.JSX.Element {
  const { statsRange, setStatsRange, setStatsRangeEditing } = useUi(
    useShallow((s) => ({
      statsRange: s.statsRange,
      setStatsRange: s.setStatsRange,
      setStatsRangeEditing: s.setStatsRangeEditing,
    })),
  )
  return (
    <>
      <Segmented
        ariaLabel={copy.panel.statsToolbar.rangeAria}
        value={statsRange}
        onChange={(value) => {
          // 「自定义」只在还没选过区间时翻开编辑条；已经有区间就直接看结果
          // 顺序要紧：setStatsRange 内部会把 statsRangeEditing 置回 false，
          // 先置旗标会被它盖掉（编辑条永远翻不开），所以必须先换区间再翻旗标
          setStatsRange(value)
          if (value === 'custom' && statsRange !== 'custom') setStatsRangeEditing(true)
        }}
        items={(
          [
            ['all', copy.panel.statsToolbar.range.all],
            ['90d', copy.panel.statsToolbar.range.d90],
            ['ytd', copy.panel.statsToolbar.range.ytd],
            ['custom', copy.panel.statsToolbar.range.custom],
          ] as Array<[StatsRange, string]>
        ).map(([value, label]) => ({ value, label }))}
      />
    </>
  )
}
