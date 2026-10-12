import { copy } from '../../../momo/i18n'
import { Spacer, TextButton } from '../../kit'

// 多选态的顶栏控件（list / review 模式共用）：全选 + 退出多选。
// 选中数与退出入口都在底部浮条（.momo-fab），顶栏只留右侧动作，
// 左上不再重复一份「已选 N 项 / 共 N 条」（2026-09-19 用户裁决）。
// 从 shell/Topbar.tsx 拆出；无 store 订阅，全部走 props。

export interface SelectModeControlsProps {
  /** 当前可见条目数（0 时「全选」禁用） */
  visibleCount: number
  onSelectAll: () => void
  onExitSelectMode: () => void
}

/** 多选态顶栏：全选 + 退出（仅 mode === 'list' | 'review' 且 selectMode 时渲染） */
export function SelectModeControls({
  visibleCount,
  onSelectAll,
  onExitSelectMode,
}: SelectModeControlsProps): React.JSX.Element {
  return (
    <>
      <Spacer />
      <TextButton disabled={visibleCount === 0} onClick={onSelectAll}>
        {copy.panel.select.all}
      </TextButton>
      <TextButton onClick={onExitSelectMode}>{copy.panel.select.exit}</TextButton>
    </>
  )
}
