import { Icon } from '../shared/icons'

// 置顶小图钉：常显的状态指示。类名由调用方给（卡片 meta 行的前缀），
// 图标与尺寸这一份统一。
export function PinMark({ className }: { className: string }) {
  return (
    <span className={className}>
      <Icon name="pin" size={11} strokeWidth={2.2} />
    </span>
  )
}
