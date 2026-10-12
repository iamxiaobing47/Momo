import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import { pickMatchedInputs, type MatchedInputs } from '../store/matched'

// BUG-67：筛选输入面的**唯一订阅点**。派生消费方（列表派生链 / 回收站）订阅整份
// `MatchedInputs`，再整份进 useMemo 依赖——不再手抄一份依赖数组去对齐 matched() 的
// 读取面（BUG-48/49 就是漏抄发作的）。新增筛选维度时，`pickMatchedInputs` 少给字段
// 编译不过；消费方拿到的是同一份清单，漏依赖这条静默 bug 从此不可表达。
//
// 订阅粒度：useShallow 逐字段浅比较，只有真读的那几个字段换引用才会让消费方重算。
export function useMatchedInputs(): MatchedInputs {
  return useUi(useShallow(pickMatchedInputs))
}
