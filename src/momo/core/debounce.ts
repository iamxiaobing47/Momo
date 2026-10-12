/**
 * 可撤销、可立即落定的防抖。Obsidian 的 `debounce` 只有「排队」一种操作，用在这里不够：
 * - `cancel()`：本地校验没过 / 恢复默认 / 页面重建时要连同「上一轮还排着的队」一起撤销。
 *   否则会出现「提示已忽略本次修改」和「那个值其实已经写盘了」同时成立的撕裂状态
 *   （B06：输入后 600ms 内点卡片级「恢复默认」被旧 timer 静默覆盖）；
 * - `flush()`：失焦 / 切分页立刻落定。sanitize 后的真实值（截掉的那几个字、非法输入要不要
 *   还原）只有真的写过一轮才知道，等到失焦才结算，打字过程中不会被改写内容。
 *
 * 纯逻辑（不引 obsidian）：定时器走 `window`，与 service.ts 的 `delay` 同一约定。
 */
export interface DeferredRun<T> {
  /** 排一次（同键连发时只有最后一次会被执行） */
  push(value: T): void
  /** 撤销排着的那一轮（已执行的撤不回来） */
  cancel(): void
  /** 立刻执行排着的那一轮；没排队则什么也不做 */
  flush(): void
}

export function deferredRun<T>(ms: number, run: (value: T) => void): DeferredRun<T> {
  let timer: number | null = null
  let queued = false
  // payload 只用 `queued` 这一个标志判「有没有排队」——不用 `payload === null`：
  // T 本身可以是 null（或含 null 的载荷），拿它当哨兵会把 push(null) 静默吞掉，
  // 定时器到点不执行、flush() 也无事可做，提交永久丢失。
  let payload: T | null = null
  const settle = (): void => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    queued = false
    payload = null
  }
  return {
    push(value) {
      payload = value
      queued = true
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const next = payload as T
        const shouldRun = queued
        timer = null
        queued = false
        payload = null
        if (shouldRun) run(next)
      }, ms)
    },
    cancel: settle,
    flush() {
      if (!queued) return
      const next = payload as T
      settle()
      run(next)
    },
  }
}
