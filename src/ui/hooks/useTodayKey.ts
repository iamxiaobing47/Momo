import { useEffect, useState } from 'react'
import { localDay } from '../../momo/dates'

/**
 * 当日键（本地 `YYYY-MM-DD`）——**会跨零点翻页**的那一个（D-12）。
 *
 * 统计页 / 两张热力图过去都把「现在」写死在 memo 求值时刻：
 * `computeStats(entries, new Date(), …)` 的依赖是 `[entries, statsRange, …]`，
 * `weekDays / monthDays` 的依赖是 `[]`，热力图的窗口终点取自挂载时的 `new Date()`。
 * 面板常开（插件面板就是干这个的）跨过周一零点 / 月末 / 年初时：
 * 「本周节奏」格下钻打到的还是上一周的日期集，热力图窗口终点与「未来」格判定
 * 停在旧的今天，「已断更 N 天」也原地不动。
 *
 * 这里给这些 memo 一个会自己翻转的依赖：到次日 00:00 后 1 秒自动重算一次，
 * 之后每天翻页。代价是一个 setTimeout（插件本来就有 150ms 防抖等一串定时器）。
 */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => localDay(new Date()))
  useEffect(() => {
    let timer: number | null = null
    const schedule = () => {
      const now = new Date()
      // 下一个本地零点 +1s（+1s 是防「定时器早醒 1ms 撞到同一天」的边缘）
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = window.setTimeout(() => {
        setToday(localDay(new Date()))
        schedule()
      }, nextMidnight.getTime() - now.getTime())
    }
    schedule()
    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])
  return today
}
