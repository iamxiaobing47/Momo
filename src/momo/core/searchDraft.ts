/**
 * 搜索框草稿 + 防抖提交（AGENTS.md §5：搜索输入加 100ms debounce）。
 *
 * 为什么不在 onChange 里直接 `setSearch`：`search` 进 `matched()` + sort 这条链，
 * 每次击键都对全库跑一遍。中文选字平均 3–5 次击键，一次完整输入就是 3–5 趟，
 * 千条库实测一次 ~30ms，连续敲字时能堆到 90–150ms 的可见卡顿。
 *
 * 但**输入框本身**不能也等 100ms 再显示：受控输入被延迟就是「打字粘手、IME 候选
 * 乱跳」。所以显示与提交分开：`input` 立即更新，`pending` 只决定什么时候把值
 * 交给 store。空 / 外部清除这类轻量反馈由 `sync` 保证不丢。
 *
 * 纯逻辑（不引 obsidian）：定时器复用 `debounce.ts` 的 `deferredRun`（window 约定）。
 */
import { deferredRun } from './debounce'

/** §5 规定的搜索防抖间隔（ms）。中文选字连发的 3–5 次击键都落在这一窗内 */
export const SEARCH_DEBOUNCE_MS = 100

export interface SearchDraft {
  /** 输入框即时显示值：不过防抖，与打字手感一致 */
  readonly input: string
  /** 已排定、尚未提交的值；null = 没有待提交 */
  readonly pending: string | null
  /** 用户输入：立刻更新显示值，把提交推迟 SEARCH_DEBOUNCE_MS */
  type(value: string): void
  /** store.search 被外部改写（清除筛选、下钻）：以 store 为准，丢弃未提交草稿 */
  sync(storeValue: string): void
  /** 卸载：撤销排着的那一轮提交（timer 挂在 window 上，组件拆了它照样 fire） */
  dispose(): void
}

/**
 * 造一个草稿机。`commit` 由调用方提供（Typical：store 的 `setSearch`）。
 * `initialValue` 取当前 store.search——切换视图/重开面板时输入框与生效的搜索词一致。
 */
export function createSearchDraft(
  initialValue: string,
  commit: (value: string) => void,
  ms: number = SEARCH_DEBOUNCE_MS,
): SearchDraft {
  let input = initialValue
  let pending: string | null = null
  // 我们最后知道 store 持有的值：自己 commit 出去的，或 sync 吸收进来的外部值。
  // sync 靠它识别**回声**——commit 落地 → store 变 → App 的 effect 回灌，这次回灌
  // 若当成外部改写处理，会把 commit 之后、effect 之前新敲的字符一起清掉，
  // 那个原本要给新值的 timer 也被 cancel 且不再回来（BUG-106 ①：丢字符 + 列表停旧词）。
  let lastSeen = initialValue
  const scheduled = deferredRun<string>(ms, (value) => {
    pending = null
    lastSeen = value
    commit(value)
  })
  return {
    get input(): string {
      return input
    },
    get pending(): string | null {
      return pending
    },
    type(value: string): void {
      input = value
      pending = value
      // 连发时只有最后一次会执行：push 每次都会清掉上一个 timer
      scheduled.push(value)
    },
    sync(storeValue: string): void {
      // 回声（值就是自己刚写出去的）：整条跳过——不 cancel 在途输入、不回写输入框
      if (storeValue === lastSeen) return
      scheduled.cancel()
      pending = null
      input = storeValue
      lastSeen = storeValue
    },
    dispose(): void {
      scheduled.cancel()
      pending = null
    },
  }
}