/**
 * 在途合并器（N17）：把「同一件事被并发叫了多次」压成一次执行。
 *
 * 场景：listEntries 的扫描 + 读盘没有在途去重时，两个面板并发首次加载会把
 * 同一批 pending 文件读两遍（@几千条时就是双倍 cachedRead + 双倍解析）。
 * store.refresh 自己只在 UI 层合并并发，服务层的 getAll 仍要各自跑。
 *
 * 语义（刻意收紧，免得引入可见性延迟）：
 * - **只合并在途窗口**：有在途任务就返回它，本轮 settle 后槽位立即清空。
 * - **不缓存已完成的结果**：完成了再来一次就重新跑。缓存结果会让「改动迟迟
 *   不出现」，而条目引用守卫本来就归 store.refresh 管，这里不需要重复一份。
 * - 所有并发调用方拿到**同一个 Promise / 同一份结果**；任务失败时槽位同样清空，
 *   下一次调用能真正重跑（失败不会被记住）。
 */
export interface InflightGate<T> {
  /** 有在途任务就挂上去；否则用 fn 开一轮，结束后清空槽位 */
  run(fn: () => Promise<T>): Promise<T>
}

export function createInflightGate<T>(): InflightGate<T> {
  let inflight: Promise<T> | null = null
  return {
    run(fn) {
      if (inflight) return inflight
      const task = fn()
      inflight = task
      // settle 即清槽：后来者是「新一轮」，与这轮结果无关。
      // 只清自己那一轮（万一将来有多槽位实现，别误伤别人的）。
      void task.then(
        () => {
          if (inflight === task) inflight = null
        },
        () => {
          if (inflight === task) inflight = null
        },
      )
      return task
    },
  }
}
