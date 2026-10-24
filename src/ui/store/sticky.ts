import type { MomoEntry } from '../../momo/types'
import { matchEntries, type MatchedInputs } from './matched'

// 筛选的「粘住」契约（BUG-251）：
//
// 筛了 `#读书` 之后在卡片上把这条的 `#读书` 去掉，它**不能当场从视图里消失**——
// 那样每改一次卡就少一张，用户连「我刚改的那条去哪了」都找不到。所以视图里的
// 条目集合 = **本轮命中** ∪ **上一轮还在这份视图里、并且仍然存在的条目**。
// 粘住的是**路径**，不是旧对象：卡片显示的是本轮 `entries` 里的新内容（去掉的
// 标签当场就没了），只是「去留」这一件不跟着变。
//
// 粘住只在**筛选条件没变**的前提下成立：用户改条件（换标签 / 改搜索 / 清筛选 /
// 下钻…）就是要看新的结果集，这时粘住集合作废，按新条件重算。跨零点同理——
// 「近 7 天 / 近 30 天」窗口会在那一刻换一套（BUG-131c 的同一个钟），旧的一次性
// 快照不该继续压着新窗口。
//
// `reviewSeen` 是**数据**不是条件：勾掉 / 标一次回顾就改写了它，可用户改的是
// 「这条笔记的属性」，性质与摘标签相同（筛「未回顾」时标成已回顾的那条也要留在
// 眼前）。所以它是本模块的入参，但不参与「条件有没有变」的判定。
//
// 删除 / 改名不走粘住：路径在 `entries` 里没了就是没了（删除是**离开视图**的
// 用户动作，与「属性不再命中」不是一回事）。

/** 一轮筛选之后再留什么：条件快照 + 视图里全部路径（命中 + 粘住）。 */
export interface FilterHold {
  /** 这一轮按哪份筛选条件算的（比当前条件不同 = 快照作废） */
  inputs: MatchedInputs
  /** 「今天」的本地日键（跨零点作废，理由见文件头） */
  todayKey: string
  /** 这一轮视图里的全部路径（含本轮命中的与更早粘住的） */
  paths: ReadonlySet<string>
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function sameRange(
  a: { min: number; max: number } | null,
  b: { min: number; max: number } | null,
): boolean {
  if (a === null || b === null) return a === b
  return a.min === b.min && a.max === b.max
}

/**
 * 两份筛选输入**条件是否相同**（`reviewSeen` 除外的全部字段）。
 *
 * store 的数组字段换内容才换引用，所以 `sameList` 的逐项比较在稳态几乎立刻返回
 * （`a === b`）——写逐项比较是为了不把「调用方复用了数组却改了内容」当成没变。
 */
export function sameFilterCriteria(a: MatchedInputs, b: MatchedInputs): boolean {
  if (a === b) return true
  return (
    a.tagMatchMode === b.tagMatchMode &&
    a.search === b.search &&
    a.untaggedOnly === b.untaggedOnly &&
    a.drillPastOnly === b.drillPastOnly &&
    a.filterReviewed === b.filterReviewed &&
    a.locRegions === b.locRegions &&
    sameList(a.filterTags, b.filterTags) &&
    sameList(a.filterLocations, b.filterLocations) &&
    sameList(a.filterDates, b.filterDates) &&
    sameList(a.filterHours, b.filterHours) &&
    sameList(a.filterWeekdays, b.filterWeekdays) &&
    sameRange(a.filterLength, b.filterLength) &&
    sameRange(a.filterTagCount, b.filterTagCount)
  )
}

/**
 * 筛选 + 粘住：返回这一轮视图里该出现的条目（顺序照 `entries`，排序由调用方做）
 * 与下一轮的快照。
 *
 * `previous` 为 null = 首次计算；条件变了 / 跨零点同样按「不粘」处理。
 */
export function matchEntriesHolding(
  inputs: MatchedInputs,
  entries: readonly MomoEntry[],
  todayKey: string,
  previous: FilterHold | null,
): { entries: MomoEntry[]; hold: FilterHold } {
  const matched = matchEntries(inputs, entries)
  const paths = new Set<string>()
  for (const e of matched) paths.add(e.path)
  const keep =
    previous !== null && previous.todayKey === todayKey && sameFilterCriteria(previous.inputs, inputs)
  if (!keep) {
    return { entries: matched, hold: { inputs, todayKey, paths } }
  }
  // 上一轮在视图里、这一轮仍然存在的路径继续留在视图里。`present` 只用来
  // 淘汰删除 / 改名的路径——卡片内容本身取自 `entries`，不拿旧对象。
  const present = new Set(entries.map((e) => e.path))
  for (const p of previous.paths) if (present.has(p)) paths.add(p)
  // 没有多出来的粘住项（绝大多数轮次）就直接交回 matchEntries 的结果，
  // 省掉一次全量 filter。
  if (paths.size === matched.length) {
    return { entries: matched, hold: { inputs, todayKey, paths } }
  }
  return { entries: entries.filter((e) => paths.has(e.path)), hold: { inputs, todayKey, paths } }
}
