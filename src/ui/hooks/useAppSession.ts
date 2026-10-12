// App 的**多选会话**（R5 骨架拆分，原 App.tsx 的 enterSelectMode / exitSelectMode /
// deleteSelected / goMode + 两条会话态 effect）。动作全部是调 store——selectMode /
// selected / 两个地点弹层都住 store（selection.ts / location.ts），这里不持有任何
// 选择态本地副本（v0.9.10 那次迁移的结论）。
import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useUi } from '../store'
import type { MainMode, UiState } from '../store'
import { supportsSelectMode } from '../shared/selectableModes'
import { scrollAppToTop } from '../app/AppShell'

/**
 * 当前挂载的 App 实例数（BUG-131b）。会话态（selectMode / selected / 弹层）住插件级
 * 单例 store；多开面板时两棵 App 共用同一份，卸载一棵不能把另一棵的多选态一并清掉。
 * 模块级计数是「本实例是不是最后一个」的判据——归零才复位。
 */
let mountedApps = 0

/** 本 hook 用到的 store 动作（App 的 actions useShallow 组直接传进来，引用恒定） */
type SessionActions = Pick<
  UiState,
  'setMode' | 'setSelectMode' | 'setSelected' | 'closeTagPicker' | 'closeLocPicker' | 'closeLocEditor'
>

export interface AppSession {
  enterSelectMode: () => void
  exitSelectMode: () => void
  goMode: (m: MainMode) => void
  deleteSelected: () => Promise<void>
  deleting: boolean
}

export function useAppSession(
  mode: MainMode,
  appRef: RefObject<HTMLDivElement | null>,
  actions: SessionActions,
): AppSession {
  const { setMode, setSelectMode, setSelected, closeTagPicker, closeLocPicker, closeLocEditor } = actions

  /** 进多选：**留在当前模式**（列表 / 回顾 / 地点都支持多选，见 selectableModes.ts），
   *  选中集从空开始。落在不支持多选的模式（统计 / 回收站）才回 list。
   *  两件事都只是调 store 动作。引用稳定：别每渲染换一个新函数下去。 */
  const enterSelectMode = useCallback(() => {
    if (!supportsSelectMode(mode)) setMode('list')
    setSelectMode(true)
  }, [mode, setMode, setSelectMode])

  /** 出多选：退出即清空选中集（action 内已含），顺带收起批量标签弹层与批量地点弹层 */
  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    closeTagPicker()
    closeLocPicker()
  }, [setSelectMode, closeTagPicker, closeLocPicker])

  /**
   * 多选会话态的**卸载复位**（v0.9.10）：selectMode / selected / tagPicker 现在住
   * store，而 store 是插件级单例、活得比面板久。旧实现它们是 App 的 useState，
   * 「重新挂载自然复位」——这里补一条等价语义，否则关掉面板再打开会接着上次的
   * 多选态 / 选中集 / 弹层（面板都已不存在，选中集没有意义）。
   * setSelectMode(false) 内含清空选中集，另补 closeTagPicker / 两个地点弹层。
   * 地点弹层（F3/F4）同样是会话态：locEditor 还带着「相对 .momo-app」的落点，
   * 下次打开面板时那颗 .momo-app 都是新的，留着必错位。
   */
  useEffect(() => {
    mountedApps += 1
    return () => {
      mountedApps -= 1
      // BUG-131b：只有**最后一个**面板卸载才复位会话态。旧实现在每棵 App 卸载时
      // 无条件 setSelectMode(false) + 收弹层——多开面板时关掉 B 会把 A 的多选 /
      // 勾选 / 弹层全部清掉（同一份插件级 store）。
      if (mountedApps > 0) return
      setSelectMode(false)
      closeTagPicker()
      closeLocPicker()
      closeLocEditor()
    }
  }, [setSelectMode, closeTagPicker, closeLocPicker, closeLocEditor])

  // 离开支持多选的视图（回收站）时收起弹层（选中集本身保留，与既有行为一致）；
  // 列表与回顾都支持多选（UI-9），弹层在两者之间切换时保留。
  // 两个地点弹层一并收：单卡编辑弹层挂在顶栏锚点上，回收站的顶栏那套控件
  // 不认它；批量地点弹层跟着批量条走，回收站没有批量条。
  useEffect(() => {
    if (mode === 'trash') {
      closeTagPicker()
      closeLocPicker()
      closeLocEditor()
    }
  }, [mode, closeTagPicker, closeLocPicker, closeLocEditor])

  /** 批量删除进行中：防重复提交（再点一次会对已删路径空转并误报失败） */
  const [deleting, setDeleting] = useState(false)

  const deleteSelected = async (): Promise<void> => {
    const state = useUi.getState()
    if (!state.caps || state.selected.size === 0 || deleting) return
    // 路径在 await 之前取快照：软删会刷新 entries，选中集会跟着对账变
    const paths = [...state.selected]
    setDeleting(true)
    try {
      // 一次批量软删收尾：串行 rename、登记一次性落盘、只做一次全量刷新
      // （旧实现逐条 caps.trash，每条都全量刷新 + 重渲整列表，批量时把面板卡死）。
      await state.caps.trashMany(paths)
      exitSelectMode()
    } catch {
      // 单个失败即停；错误详情（含已删条数）已由 caps 层 Notice。**不退出多选**：
      // 等刷新落定后把已删的死路径剔出选中集，剩余的保持选中、可直接重试
      // （旧实现失败也清空选中集，用户得对着残缺的列表重新挑一遍）。
      await useUi.getState().refresh()
      const alive = new Set(useUi.getState().entries.map((e) => e.path))
      setSelected([...useUi.getState().selected].filter((p) => alive.has(p)))
    } finally {
      setDeleting(false)
    }
  }

  /** 切模式：**引用必须稳定**（useCallback，BUG-64）——App 因搜索框本地 state 每击键
   *  重渲，onMode 每逢新引用就击穿 memo(Sidebar)，整个侧栏（含无 memo 的 LocTreeSection）
   *  白渲。依赖照实写：切换目标变不了它，同文件 enterSelectMode / exitSelectMode 同款。
   *
   *  BUG-136b：**不把「点亮的模式项再点一次」当回家**。旧实现是
   *  `mode === m && m !== 'list' ? 'list' : m`——一个藏在切模式动作里的 toggle。
   *  后果：侧栏菜单与顶栏分段都把亮着的那颗标成「你在这里」（`aria-pressed="true"`），
   *  按下去却导航走了；顶栏窄档分段（≤620px 面板里**唯一**的模式入口）上双击 =
   *  刚进的模式立刻退出。「回家」本来就有两个显式入口（品牌区按钮、侧栏「全部笔记」
   *  菜单项，传的都是 'list'），不需要这个隐式 toggle。现在选中项再点一次 = 原地不动，
   *  与「分段是当前模式的显示器」这一条对齐（见 ListControls 头注）。 */
  const goMode = useCallback(
    (m: MainMode): void => {
      // 切走模式即退出多选并清空选中集（setSelectMode(false) 内含清空），弹层一并收起。
      // 批量地点弹层也要收（BUG-03）：它住 store、活得比面板久，不收的话下一轮多选
      // 会把它连着**旧选中集快照**直接弹开，应用会把地点写到本轮没勾选的笔记上。
      setSelectMode(false)
      closeTagPicker()
      closeLocPicker()
      setMode(m)
      // v0.9.4「回全部笔记 = 完整回家」：落地模式是「全部笔记」时，把侧栏与主区的
      // 滚动位置一并送回最上（用户原话：「点击左上角的图标和名字……左侧边栏，
      // 焦点回到最上边，全部笔记主页面的焦点也回到最上边」，确认「焦点」= 滚动位置）。
      // 两个入口共用本函数，行为因此一致：品牌区按钮 + 侧栏「全部笔记」菜单项。
      // 随机回顾 / 统计 / 回收站不是「回家」，滚动位置保持原样。
      if (m === 'list') scrollAppToTop(appRef.current)
    },
    [setMode, setSelectMode, closeTagPicker, closeLocPicker, appRef],
  )

  return { enterSelectMode, exitSelectMode, goMode, deleteSelected, deleting }
}
