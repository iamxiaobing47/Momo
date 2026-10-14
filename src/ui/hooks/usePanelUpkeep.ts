// App 的**面板自愈与全局副作用**（R5 骨架拆分）。
// 字体偏好同步 / 多选集与 entries 对账两条 effect 的**顺序**与原实现一致，
// 拆文件不改运行次序。
import { useEffect } from 'react'
import { useUi } from '../store'
import type { FontPackId, MomoEntry } from '../../momo/types'
import { syncFontStyle, registerFontFaces } from '../shared/fontStyle'
import { fontPackByFamily } from '../../momo/fonts/pack'

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
  // v1.0.0 起字体本体由 Obsidian 提供（角色格引用宿主 --font-* 变量），
  // 插件侧只剩这份变量 <style>，不再有静态 @font-face。
  useEffect(() => {
    syncFontStyle({ uiFont, cardFont })
  }, [uiFont, cardFont])

  // 下载的开源字体（2026-10-13）：偏好引用了某套字体包时，把它的字节注册成
  // FontFace。**为什么必须懒注册**：字体包是按需下载的可选资产，插件启动时
  // 不该把几十 MB 的 ttf 读进内存；而没注册的家族名在 font-family 栈里静默
  // 回落，表现是「下载了却没生效」——所以在偏好真用到它的那一刻补注册。
  // 只读两个槽位当前值命中的包（多数用户一套都没下，直接跳过）。
  useEffect(() => {
    const caps = useUi.getState().caps
    if (!caps) return
    const packs = new Set<FontPackId>()
    for (const value of [uiFont, cardFont]) {
      const pack = fontPackByFamily(value)
      if (pack) packs.add(pack.id)
    }
    if (packs.size === 0) return
    void (async () => {
      for (const id of packs) {
        try {
          // 逐套读字节 + 注册；缺件（读盘抛错）时这套照旧没注册，字体栈自己回落
          const faces = await caps.fontPackFontFaces?.(id)
          if (faces) await registerFontFaces(faces)
        } catch {
          // 缺件 / 读盘失败：面板照常显示，只是这一套字回到默认那套
        }
      }
    })()
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
