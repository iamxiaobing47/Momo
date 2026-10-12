import { copy } from '../../momo/i18n'

// 侧栏标签树的过滤输入框（自 TagTree.tsx 拆出）：受控值由 TagTree 持有，
// 过滤本身走 momo/tagFilter 的 filterTagNodes（纯逻辑，不进这里）。
// placeholder 从字典读（tags.filterPlaceholder），别在组件里写字面量。

export interface TagFilterInputProps {
  /** 当前过滤词 */
  value: string
  /** 输入回调（TagTree → setTagFilter） */
  onChange: (value: string) => void
}

export function TagFilterInput({ value, onChange }: TagFilterInputProps): React.JSX.Element {
  return (
    <input
      className="momo-tagfilter momo-input"
      type="text"
      placeholder={copy.tags.filterPlaceholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
