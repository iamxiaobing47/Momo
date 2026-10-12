import { Icon } from '../shared/icons'

// 多选勾选圈。
export function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span className={`momo-cbwrap ${checked ? 'momo-cbwrap-on' : ''}`}>
      {checked && <Icon name="check" size={10} strokeWidth={3.2} />}
    </span>
  )
}
