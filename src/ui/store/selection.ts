import type { StoreActions } from './slice'
import type { UiState } from './types'

// 多选会话态（2026-09-26 性能回退修复）：选择态从 App 的 useState + 卡片作用域
// Context（CardScope，组件化 P5）整体迁进 store。
//
// 为什么必须进 store：Context 的 value 每次勾选都是**新 Set**，于是每一次勾选都让
// 所有 `useCardScope()` 消费者（几百张卡片 + Review + FocusScroll）一起重跑 render，
// `React.memo` 拦不住——那正是本轮要修的性能回退。改成按卡选布尔量之后
// （`useUi((s) => s.selected.has(entry.path))`），zustand 对**同值**选择器直接
// bail out：勾一张卡只有那一张重渲，其余卡片连 reconcile 都不进。
// 选择态本就在仓库全部 UI 态的家里（store），App 的 useState 是异类，这次一并收回。
//
// 会话态（transient）：**不落盘**——不进 MomoData / prefsFromDisk / sanitize，
// 与 reviewBatch / reviewIndex / statsRangeEditing 同一类，关面板即丢。
// 「选中集与 entries 对账（剔死路径）」仍在 App（它才知道 entries 与 loading），
// 对账走 setSelected，语义与旧实现逐条一致。

/** 多选会话态 + 批量标签弹层的动作（字段初值在 store/index.ts，见那边的注释） */
export type SelectionSlice = Pick<
  UiState,
  | 'setSelectMode'
  | 'toggleSelected'
  | 'setSelected'
  | 'clearSelected'
  | 'selectAll'
  | 'openTagPicker'
  | 'toggleTagPicker'
  | 'closeTagPicker'
>

export function createSelectionSlice({ set, get }: StoreActions): SelectionSlice {
  return {
    /**
     * 进 / 出多选。进与出都从**空集**开始——与旧 App 的 enter/exit 行为一致
     * （进多选不会带着上次的勾选，退出也不会留一截选中集给下一轮）。
     */
    setSelectMode(on) {
      set({ selectMode: on, selected: new Set<string>() })
    },

    /** 勾选 / 取消勾选某一条（整份新 Set：UI 态不需要结构共享） */
    toggleSelected(path) {
      const next = new Set(get().selected)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      set({ selected: next })
    },

    /**
     * 整组替换选中集。App 的「与 entries 对账」用它剔死路径（B06 修正）：
     * 外部删除 / 改名 / 软删入回收站后 entries 换了新数组，死路径会造成
     * 「批量操作打不存在的文件」。
     */
    setSelected(paths) {
      set({ selected: new Set(paths) })
    },

    clearSelected() {
      set({ selected: new Set<string>() })
    },

    /**
     * 全选（Ctrl/Cmd+A 与顶栏「全选」按钮共用）。入参是**当前可见列表**的路径，
     * 由调用方按模式给（列表 = 筛选 + 排序 + 置顶后的结果；回顾 = 当前这一批，
     * UI-9：回顾里也可多选）——与用户屏幕上看到的一致。
     */
    selectAll(paths) {
      set({ selected: new Set(paths) })
    },

    /**
     * 卡片操作行「加标签」（单条；多选那一路挂 toggleTagPicker）。
     * `at` 由调用方在按钮的 click 里量好（相对 `.momo-app`）：单卡弹层开在那颗
     * 按钮旁边而不是顶栏锚点下——卡片在列表里的位置才是用户此刻的注意力所在
     * （见 UiState.tagPicker 的注释）。批量那一路不给 at，走旧的 below 锚点。
     */
    openTagPicker(paths, mode, at) {
      set({ tagPicker: at ? { paths: [...paths], mode, at } : { paths: [...paths], mode } })
    },

    /**
     * 批量条「加标签 / 去标签」：同一颗再点一次 = 收起（省一次「取消」）。
     * 换按钮时换成新模式并按**当时的**选中集重绑，队列随之清空
     * （弹层按 mode 重挂；路径在这里现取，不用调用方传）。
     */
    toggleTagPicker(mode) {
      const cur = get().tagPicker
      set({ tagPicker: cur && cur.mode === mode ? null : { paths: [...get().selected], mode } })
    },

    /** 关弹层：顶栏 / 批量条的 ✕、App 的 mode==='trash' 收弹层都走这里 */
    closeTagPicker() {
      set({ tagPicker: null })
    },
  }
}
