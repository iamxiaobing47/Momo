// App 的**面板自愈与全局副作用**（R5 骨架拆分）。
// 字体偏好同步 / 多选集与 entries 对账两条 effect 的**顺序**与原实现一致，
// 拆文件不改运行次序。
import { useEffect } from 'react'
import { useUi } from '../store'
import type { MomoEntry } from '../../momo/types'
import { syncFontStyle } from '../shared/fontStyle'

export interface PanelUpkeepInput {
  uiFont: string
  cardFont: string
  entries: readonly MomoEntry[]
  loading: boolean
  setSelected: (paths: readonly string[]) => void
}

export function usePanelUpkeep(input: PanelUpkeepInput): void {
  const { uiFont, cardFont, entries, loading, setSelected } = input

  // 字体偏好（v0.9.16）：把「选了哪套」同步进 head 的 <style>（变量注入的机制见
  // fontStyle.ts）。挂在 App 里是因为面板是插件的常驻宿主——设置页改完字体回到
  // 面板，规则必须已经在那儿；确认弹窗与设置页也靠这份全局规则。
  // @font-face 本体在插件 onload 时注入（views/fontFaces.ts），不随偏好重写。
  useEffect(() => {
    syncFontStyle({ uiFont, cardFont })
  }, [uiFont, cardFont])

  // 多选集与当前条目对账（B06 修正）：外部删除 / 改名 / 软删入回收站后，entries
  // 换新数组但 selected 仍是旧路径集合——死路径会造成「批量操作打不存在的文件」。
  // 「还没读出来」只认 loading（首载 / 空库时 refresh 才翻 true，见 refresh.ts 的
  // BUG-54 注释）；读盘完成（loading=false）后 entries 仍为空 = 库真被清空，
  // 选中集整组清掉（BUG-70a：库外删文件 / 同步侧清空只走这条路径，BatchBar 计数
  // 同步归零）。
  useEffect(() => {
    if (loading) return
    const cur = useUi.getState().selected
    if (cur.size === 0) return
    if (entries.length === 0) {
      // 读盘完成却一条都没有：选中集全是死路径，整体清掉
      setSelected([])
      return
    }
    const alive = new Set(entries.map((e) => e.path))
    // 全是活路径就整段跳过：不新建 Set、不发一次 store 通知
    if ([...cur].every((p) => alive.has(p))) return
    setSelected([...cur].filter((p) => alive.has(p)))
  }, [entries, loading, setSelected])
}
