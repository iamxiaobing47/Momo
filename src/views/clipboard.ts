/**
 * 剪贴板写入的**唯一出口**（views 层）。
 *
 * 三个写入点共用它：面板里 CopyButton 的点击、面板的 Ctrl/Cmd+C 兜底
 * （views.tsx）、以及 PDF / HTML Reader / 阅读视图选区右键菜单的「复制」
 * （selectionCapture.ts）。最后一个决定了它为什么**不**住在 caps 里：
 * 右键菜单可能在面板还没挂载时就被打开（caps 只挂在面板视图上），所以实现要能
 * 独立直调；`MomoCaps.writeClipboard` 只是同一个函数的转发。全仓不再有第二处
 * `navigator.clipboard.writeText`。
 *
 * 契约（BUG-235，同 `src/ui/store/types.ts` 的 `MomoCaps.writeClipboard`）：
 * - 只在用户手势里写：永不读剪贴板；
 * - 失败以 rejected Promise 上抛，由调用方决定弹错 / 静默（原生复制兜底）；
 *   本模块自己不吞——吞在底层会让上层分不清「写了」与「没写」。
 *
 * 「未取到方法」按失败算（B12：旧写法 `Promise.resolve(undefined)` 是假成功）：
 * 老 Electron / 非安全上下文里 `navigator.clipboard` 不存在，这时 reject，
 * CopyButton 显示失败态、Ctrl+C 兜底静默吞掉让原生复制兜底。
 */
export function writeClipboardText(text: string): Promise<void> {
  const write = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  if (!write) return Promise.reject(new Error('clipboard unavailable'))
  return write(text)
}
