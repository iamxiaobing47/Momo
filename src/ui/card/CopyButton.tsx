import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'
import { useUi } from '../store'

// 卡片操作行的「复制」按钮：从 Card.tsx 拆出（拆卡片组件：CopyButton / CardActions /
// CardMeta）。自带 1400ms 成功态与失败态，调用方只给要复制的正文——定时器的设立 /
// 清理全部收在本组件内，Card 不再持有 copied / copyFailed 两个 state。
//
// BUG-235：剪贴板写入收敛到**唯一一个 caps 能力**（`caps.writeClipboard`，
// views 侧实现 + 契约写在 store/types.ts 的 MomoCaps.writeClipboard）。本组件不再
// 直接摸 `navigator.clipboard`——全仓写入点只剩它和 views.tsx 的 Ctrl+C 兜底两处，
// 都走那一个能力；读剪贴板从来不存在（attachmentPaste 读的是用户粘贴事件）。

export interface CopyButtonProps {
  /** 要写入剪贴板的正文（Card 传 entry.content） */
  content: string
}

export const CopyButton = memo(function CopyButton({ content }: CopyButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  // B12：复制失败态——旧写法 Promise.resolve(undefined) 是假成功
  const [copyFailed, setCopyFailed] = useState(false)
  // BUG-235：写入走唯一一个 caps 能力（契约见 MomoCaps.writeClipboard）；面板还没
  // 装配好（caps 为 null）时点它 = 写不出去，按失败态处理（与拿不到 clipboard
  // 方法同口径，B12）
  const caps = useUi((s) => s.caps)

  // D-11：「已复制 / 复制失败」的 1400ms 提示定时器要在卸载时撤掉。旧写法定时器
  // id 直接丢：卡片在提示消失前被筛掉/卸载（改搜索词、切密度、vault 刷新导致
  // 列表变化）时，回调仍会对已卸载组件 setState。同一时刻只有一个提示，
  // 共用一个槽：设新的先清旧的。
  const copyTimerRef = useRef<number | null>(null)
  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = null
  }, [])
  useEffect(() => clearCopyTimer, [clearCopyTimer])

  // 局部函数刻意**不叫 copy**：那个名字已经属于 i18n 的文案树（本组件里到处要读它）。
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const fail = () => {
        setCopied(false)
        setCopyFailed(true)
        clearCopyTimer()
        copyTimerRef.current = window.setTimeout(() => setCopyFailed(false), 1400)
      }
      // B12：拿不到写入能力就算失败；旧写法 Promise.resolve(undefined) 是假成功。
      // caps.writeClipboard 只在用户手势里写（这里是点击），失败静默由本组件按
      // B12 / BUG-155 的既有语义显示失败态——不弹 Notice、不重试。
      if (!caps) {
        fail()
        return
      }
      caps.writeClipboard(content).then(
        () => {
          setCopied(true)
          // BUG-155：成功分支要显式复位失败态。否则「一次失败 → 1400ms 内再点一次
          // 且成功」会停在失败样式（clearCopyTimer 只清定时器，不清 copyFailed）。
          setCopyFailed(false)
          clearCopyTimer()
          copyTimerRef.current = window.setTimeout(() => setCopied(false), 1400)
        },
        fail,
      )
    },
    [content, clearCopyTimer, caps],
  )

  return (
    <button
      className={`momo-card-act${copyFailed ? ' momo-card-act-fail' : ''}`}
      // BUG-205：成功态也要换可访问名——1400ms 的 check 图标是纯视觉，读屏两次听到
      // 同一个名字分不清成败；与失败态换名同机制，1400ms 后由定时器复位回常态名。
      aria-label={copyFailed ? copy.card.copyFailed : copied ? copy.card.copied : copy.card.copyBody}
      onClick={onClick}
    >
      {copied ? (
        <Icon name="check" size={14} strokeWidth={2} />
      ) : copyFailed ? (
        <Icon name="close" size={14} strokeWidth={2} />
      ) : (
        <Icon name="copy" size={14} />
      )}
    </button>
  )
})
