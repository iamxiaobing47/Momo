import type { Milestone } from './types'

// 里程碑档位表与「下一个」的求法（纯函数）。
// v0.6.5 用户要求「多加一些里程碑」后两边的表都加密过：档位本身没有消费者依赖
// 它们的**顺序**之外的东西，改档位只动这里。

/** 里程碑卡片上「接下来」显示几个后续档位 */
const STATS_MILESTONE_LOOKAHEAD = 3

/** 下一个里程碑：第一个大于当前值的档位；全部达成后 null。`upcoming` = 它之后的几档 */
function nextMilestone(value: number, levels: readonly number[]): Milestone | null {
  const future = levels.filter((t) => t > value)
  if (future.length === 0) return null
  return {
    target: future[0],
    remaining: future[0] - value,
    upcoming: future.slice(1, 1 + STATS_MILESTONE_LOOKAHEAD),
  }
}

/**
 * 条数里程碑档位（**全库**绝对条数）。v0.6.5 扩充：原 7 档（100→10000）在个人库
 * 里很快就见顶，中段每翻一倍才有一档、好久没有「够得着的小目标」；加密到 17 档，
 * 300 / 750 / 1500 / 3000 / 7500 / 15000 / 30000 / 50000 都是新的落脚点。
 */
const NOTE_MILESTONES = [
  100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 100000,
]

/**
 * 连续记录里程碑档位（按当前连续天数）。v0.6.5 扩充：原 7 档（7→365）在 30 天之后
 * 直接跳到 50 / 100，中间空档太大；补 21 / 45 / 60 / 90 / 120 / 270，并在一年以上
 * 续 500 / 730（两年）/ 1000 天。
 */
const STREAK_MILESTONES = [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, 500, 730, 1000]

/** 条数里程碑（**全库**绝对条数）；越过最后一档后为 null */
export function notesMilestoneOf(total: number): Milestone | null {
  return nextMilestone(total, NOTE_MILESTONES)
}

/** 连续记录里程碑（按当前连续天数）；到达最后一档后为 null */
export function streakMilestoneOf(streak: number): Milestone | null {
  return nextMilestone(streak, STREAK_MILESTONES)
}
