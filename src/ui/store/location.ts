import type { StoreActions } from './slice'
import type { UiState } from './types'
import type { LocTreeLevel } from '../../momo/locations'
import { DEFAULT_LOC_TREE_LEVELS, normalizeLocTreeLevels } from '../../momo/locations'

// 地点视图与会话态的 slice（2026-10-01：地点筛选动作 `toggleLocation` 已随
// 「地点降级成筛选维度」搬去 filters.ts，与 toggleTag 并排——它改的是卡片流
// 显示哪些条目，与标签筛选同一层；本文件只剩**视图档位**、侧栏树的层级过滤与两个弹层）：
//
// 两个字段的分工（别合并）：
// - `locView` = 「看常规卡片流 / 星球 / 地点分组流」（会话态，跨模式保留）；
// - `locJumpSeq` = 「筛了几次」（在 filters.ts 的 toggleLocation 里 +1），地点
//   分组流的滚动 effect 只认序号——读的是意图，不是值。
// 全部 transient：**不落盘**——data.json 一个字段都不加（locations 是内容、在
// frontmatter；这些只是「此刻看哪儿」的 UI 状态，关面板即丢）。

/**
 * 地点视图 / 弹层的**动作**（字段初值在 store/index.ts，与 selection.ts 同一分工：
 * 那个 slice 也只 Pick 动作，`selectMode` / `selected` / `tagPicker` 的初值在
 * index.ts——「谁提供初值」全表只该有一种答案，混着来必有一次漏改）。
 */
export type LocationSlice = Pick<
  UiState,
  | 'toggleLocTreeLevel'
  | 'openLocEditor'
  | 'closeLocEditor'
  | 'toggleLocPicker'
  | 'closeLocPicker'
  | 'setLocView'
  | 'setGlobePose'
>

export function createLocationSlice({ set, get }: StoreActions): LocationSlice {
  return {
    /**
     * 侧栏「全部地点」树的层级过滤（2026-10-01，2026-10-10 起**多选**）：
     * `all` = 回完整三级树；具体档 = 在集合里加上 / 去掉那一级，一级不剩时
     * 归一回 `['all']`（`normalizeLocTreeLevels` 的口径）。只改这棵树显示哪几级
     * （`filterLocTreeByLevels`），**不动地点筛选**——主区还筛着的地区照筛，
     * 与 tagFilter 一个路数（会话态、不落盘、重开面板回完整树）。
     */
    toggleLocTreeLevel(level: LocTreeLevel) {
      if (level === 'all') {
        set({ locTreeLevels: DEFAULT_LOC_TREE_LEVELS })
        return
      }
      const cur = normalizeLocTreeLevels(get().locTreeLevels).filter((v) => v !== 'all')
      const next = cur.includes(level) ? cur.filter((v) => v !== level) : [...cur, level]
      set({ locTreeLevels: normalizeLocTreeLevels(next) })
    },

    /**
     * 单卡地点编辑弹层（F3）：路径 + 落点都由调用方给——x/y 是调用方按 mappin
     * 按钮相对 .momo-app 的偏移算好的，弹层不摸真实 DOM（与 CardActions 的
     * 其余操作行按钮同一路数）。落点算不出来时传 (0,0)，弹层自己兜底。
     */
    openLocEditor(path, x, y) {
      set({ locEditor: { path, x, y } })
    },

    /** 关单卡编辑弹层（「完成」/ Esc / 点到别处） */
    closeLocEditor() {
      set({ locEditor: null })
    },

    /**
     * 批量「设地点 / 去地点」（F4）：同一颗 fab 钮再点一次 = 收起（省一次
     * 「取消」）。换模式时换成新模式并按**当时的**选中集重绑——路径在这里现取
     * （与 toggleTagPicker 同一形状，队列在弹层侧按 mode 重挂）。
     */
    toggleLocPicker(mode) {
      const cur = get().locPicker
      set({ locPicker: cur && cur.mode === mode ? null : { paths: [...get().selected], mode } })
    },

    /** 关批量弹层：Esc / 写完 / App 的 mode==='trash' 收弹层都走这里 */
    closeLocPicker() {
      set({ locPicker: null })
    },

    /**
     * 地点视图档位（2026-10-01，视图分段里的星球 / 地点分组两颗图标）：off = 回
     * 常规卡片流，globe = 星球，group = 地点分组流。位姿**不动**——切走再回来
     * 回到离开时的角度（与密度切换同一个记忆位）。两颗图标是**幂等 select**
     * （BUG-139，2026-10-09）：点当前那颗原地不动，离开走「任何一档密度」或 0 地点
     * 空态的「先浏览全部笔记」，见 ListControls 的 DensitySegmented。
     */
    setLocView(view) {
      set({ locView: view })
    },

    /**
     * 星球位姿（F7，拖拽 / 回正 tween / 选中转向都走这里）：倾角与绕竖轴
     * 转角，单位度。不做钳制——投影对 rotLng 是 360° 周期的（cos/sin），
     * 连续拖到几百度与归位后的投影逐像素一致，Wrap 反而多一次浮点核算。
     * rotLat 的合法区间由投影侧保证（asinf 的参数恒在 [-1,1]，见 globeMath）。
     */
    setGlobePose(lat, lng) {
      set({ locGlobeLat: lat, locGlobeLng: lng })
    },
  }
}
