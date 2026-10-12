import { useMemo } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'
import { EmptyState } from '../kit'
import { NoMatchEmpty } from '../shell/EmptyStates'
import { useMatchedInputs } from '../hooks/useMatchedInputs'
import { useTodayKey } from '../hooks/useTodayKey'
import { matchEntries } from '../store/matched'
import { groupByDate } from '../../momo/dates'
import { sortEntries } from '../../momo/core'
import { DENSITY_VIEWS } from '../registry/densityViews'
import type { Density } from '../../momo/types'

// 回收（concept-momo-trash）：v0.9.26 起按**正常卡片**渲染。
//
// 旧版面（v0.5–v0.9.25）是 78px 一行的图标列表（TrashRow.tsx）：标题取 80 字预览、
// 元信息是「删于 + 原路径」，右下角恢复 / 彻底删除。2026-09-30 用户裁定：
// 「回收站里的卡片要和原本一样，正常渲染，也可以过滤」——行式列表整块退役，
// 换成与列表页同一套卡片流（密度查表 + 同一套筛选口径）。
//
// 三件事让「和原本一样」成立：
//   ① 语料：service.listTrash() 每行带完整索引投影 `entry`（正文 / 标签 / 日期
//      都读盘），它就是一张普通 MomoEntry（path 在回收目录内）；
//   ② 渲染：走 DENSITY_VIEWS 注册表里的 **list 档**——卡片 / 日期分组 / 窗口化
//      全部复用，本文件不再有自己的行结构；
//   ③ 筛选：与 matched() 同一套 matchEntries 规则（消费路径见本文件下方的 useMatchedInputs）（搜索 / 标签 / 活跃度选日 /
//      下钻维度全部交叠），侧栏与顶栏的筛选原地生效——**不再跳回全部笔记**。
//
// 与列表页的差异，全部来自「删掉的条目」这件事本身，不是渲染降级：
//   - **恒定列表视图**（2026-10-01 用户裁定「回收站页面，不要受视图选择影响，
//     应该始终保持列表视图」）：本文件**不读 `prefs.density`**，永远查 list 档。
//     网格 / 焦点 / 节奏 / 深夜都不适用于「看删掉的东西」这一个用途
//     （深夜档尤其：把删掉的条目拿去放映没有意义）；用户偏好原样留着，回到
//     列表模式仍是进来前那一档。
//   - 操作行在 trash 模式换成「恢复 / 彻底删除」（registry/cardActions.tsx 的
//     第 ④ 种门控）；右键菜单（置顶）与地点 pill 一并收起（Card.tsx）；
//   - 没有置顶组：置顶表按 entries 对账，回收站路径进不去也留不住；
//   - 多选不支持（selectableModes.ts：软删的中间态，批量删除没有意义）。
//
// 「全部恢复 / 清空回收站」两个全局动作留在**顶栏**（TrashControls），
// 所以这里只渲染列表本体，不与顶栏重复。
// 二次确认走 caps.confirmDialog（Obsidian Modal），不用原生 confirm()。

/**
 * 回收站恒定的视图档（永远列表）。
 *
 * 与列表页共用注册表里的同一条 manifest（`renderGroups`：置顶组 + 日期组 +
 * 窗口化卡片流），只是**不看 `prefs.density`**——回收站不是「换个看法」的场景，
 * 而是「看删掉的东西」；视图分段在回收站模式本来也不出现（TrashControls 只有
 * 搜索 + 两个全局动作），让人在列表页切了网格却发现回收站跟着变，才是意外。
 */
const TRASH_DENSITY: Density = 'list'

export function Trash() {
  const trash = useUi((s) => s.trash)
  const sortMode = useUi((s) => s.sortMode)
  const brand = useUi((s) => s.brandName)
  const clearFilters = useUi((s) => s.clearFilters)
  // BUG-67：筛选输入整份订阅（与列表页同一份读取面 useMatchedInputs），整份进依赖。
  // 不再手抄筛选字段——BUG-48 就是漏抄了 filterLocations / locRegions / reviewSeen。
  const matchedInputs = useMatchedInputs()
  // BUG-201：matchEntries 的 recent7/30 窗口与「今天」上界按**调用时刻**折算，而
  // useMatchedInputs 的字段无一跨零点变化——不把这个会翻转的键放进依赖，回收站
  // 页开着过夜就停在昨天的窗口口径（BUG-131c 在列表页修过同一病灶，这里同款补齐）。
  const todayKey = useTodayKey()
  const trashEntries = useMemo(() => trash.map((t) => t.entry), [trash])

  const list = useMemo(
    () => sortEntries(matchEntries(matchedInputs, trashEntries), sortMode),
    [matchedInputs, trashEntries, sortMode, todayKey],
  )
  // 日期分组：恒定列表视图，永远分组（不再看 `prefs.density`——见 TRASH_DENSITY）。
  const dateGroups = useMemo(() => groupByDate(list), [list])

  if (trash.length === 0) {
    return <EmptyState title={copy.trash.emptyTitle} sub={copy.trash.emptySub(brand)} />
  }

  // 查表渲染：固定 list 档。找不到就抛——不静默回退，与 CardFlow 同一条口径
  // （回退会把「加了密度档忘了注册」藏进用户眼里）。
  const view = DENSITY_VIEWS.find((v) => v.id === TRASH_DENSITY)
  if (!view) throw new Error(`[momo] density view not registered: ${TRASH_DENSITY}`)

  return (
    <div className="momo-trcol">
      {/* 保留期说明前置：先讲清「还会留 30 天」，用户才敢点彻底删除 */}
      <div className="momo-notice">
        <Icon name="clock" size={15} />
        <span className="momo-notice-text">{copy.trash.retention}</span>
      </div>
      {list.length === 0 ? (
        // 有条目但被筛空了：给一个「清除筛选」的出口（与列表页同一个空态）
        <NoMatchEmpty onClearFilters={clearFilters} />
      ) : (
        view.render({ list, pinnedList: [], dateGroups })
      )}
    </div>
  )
}
