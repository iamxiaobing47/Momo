import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { TextButton } from '../kit'

/**
 * 读盘失败的常驻提示条（M3）。
 *
 * 为什么常驻而不是弹窗：读失败是**持续态**（这一轮没读成，接下来每一轮都可能
 * 继续失败），弹窗是给写失败那种一次性结果用的。反过来，写侧的 Notice 只在写
 * 的那一瞬弹一次，读侧没有对应物——此前「读盘失败」在界面上与「读到旧数据」
 * 完全同形，用户没有任何途径知道自己看到的不是最新的。
 *
 * 自订阅 store（不进 App.tsx）：App 的 15 个 useUi 名额已顶格，空态组件
 * `NoMatchEmpty` 早有 `useUi((s) => s.brandName)` 的先例。
 */
export function ReadErrorBanner() {
  const readError = useUi((s) => s.readError)
  if (!readError) return null
  return (
    <div className="momo-read-error" role="status">
      <span className="momo-read-error-text">{readError}</span>
      <TextButton onClick={() => void useUi.getState().refresh()}>{copy.common.retry}</TextButton>
    </div>
  )
}
