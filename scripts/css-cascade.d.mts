// css-cascade.mjs 的类型面。与 css-model.d.mts 同理：.mjs 对 tsc 不可见，
// 这里手抄它对外暴露的三个函数，守卫测试按这份声明取数。
import type { CssRule } from './css-model.mjs'

/** 逗号组里的单个复合选择器已按 (tag, #id, .class, [attr], :pseudo) 切好 */
export type SelectorSegment = {
  tag?: string
  id?: string
  classes?: string[]
  attrs?: string[]
  pseudos?: string[]
}

/** 复合选择器 + 它与前一段之间的连接符（null = 后代） */
export type SelectorStep = {
  compound: SelectorSegment
  combinator: string | null
}

/**
 * 比对两份 CSS 的赢家表。元素集由两份规则表的并集建一次，两边共用。
 * opts.extra：额外合成元素类组合；opts.required：只保留类集包含这些类的元素；
 * opts.hostCss：宿主样式（两份表各自前缀同一份宿主规则）；
 * opts.tags：{ button: ['momo-btn', …] } 真实 DOM 里「类 × 标签」的共现。
 */
export function diffWinners(
  oldRules: CssRule[],
  newRules: CssRule[],
  opts?: {
    extra?: Array<{ tag?: string; classes?: string[] }>
    required?: string[] | null
    hostCss?: string
    tags?: Record<string, string[]>
  },
): unknown[]

export { parseCss } from './css-model.mjs'

/** 选择器解析（带缓存），返回逗号组的分段矩阵（每个分支 = 有序的复合选择器步） */
export function parseSelector(selector: string): SelectorStep[][]
