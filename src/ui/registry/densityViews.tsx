import type { Density, MomoEntry } from '../../momo/types'
import type { DateGroup } from '../../momo/dates'
import { CardGroup } from '../shell/CardGroup'
import { FocusScroll } from '../focus'
import { Icon } from '../shared/icons'
import type { IconName } from '../shared/icons'
import { copy } from '../../momo/i18n'

// 密度分流注册表（组件化 P4 的插槽之一，与 statsCards 样板同形）。
//
// 服务对象：`shell/CardFlow` —— 它只留「模式分支 + 空态」，同一份筛选结果的
// 几种看法（list / focus）查这张表：
// `DENSITY_VIEWS.find((v) => v.id === density)` 后 `view.render(ctx)`。
// 找不到就抛（不静默回退）：下面的 never 守卫保证 `DENSITIES` 每个成员都登记过，
// 走到抛错那条路说明有人加了密度忘了写 manifest。
//
// 加一档密度要动三处（少一处编译不过）：
//   ① `momo/types/prefs.ts` 的 `Density` 联合类型 + `DENSITIES` 数组
//   ② 本文件加一条 manifest（`_MissingDensity` 的 never 守卫盯这一处）
//   ③ `i18n/zh/panel.ts` 的 `copy.panel.density` 段落实例（顶栏分段控件按
//      `DENSITIES` 遍历，那边不用动；忘写名字是 `satisfies Record<Density,…>` 的错）
// 顶栏分段控件本身零改动：它遍历 `DENSITIES`，本表只决定 CardFlow 渲染什么。
//
// 2026-10-12：**网格档整体移除**（用户裁定「没有收益、难度还高」）——本表从三条
// manifest 降到两条，`shell/GridFlow.tsx` 与相关 CSS / 文案 / 用例一并删除。
// 盘上 `density: "grid"` 经 `sanitizeDensity` 白名单回落「列表」。

/**
 * 密度视图拿到的派生数据（CardFlow 已经算好的那部分；props 全名见 `CardFlowProps`）。
 *
 * **刻意不在表里的字段**：
 * - `mode` / `loading` / `entries`：它们只决定空态与模式分支（review / stats / trash），
 *   那三段留在 CardFlow，注册表只管密度分流；
 * - `restList`：日期分组已由 App 在 `dateGroups` 里算完，密度视图不再碰原始拆分；
 * - `onClearFilters`：筛空态专属，同上留 CardFlow；
 * - `selectMode` / `selected` / `onToggleCheck` / `onTag`（v0.9.10 起连 CardScope
 *   那层 Context 也不走了，直接删）：多选态在 store 的 selection slice，卡片自己
 *   按卡选布尔量（见 Card.tsx 同处注释），注册表不再是二传手——原来这四个字段
 *   要把 Card → CardGroup → FocusItem 全串一遍，加一档密度就多抄四处。
 */
export interface DensityContext {
  /** 当前可见列表（置顶优先的展示顺序，见 App 的 list 派生） */
  list: MomoEntry[]
  /** 置顶组（按置顶先后）与非空置顶项的分组标题由本表渲染 */
  pinnedList: MomoEntry[]
  dateGroups: readonly DateGroup[]
}

/** 一条密度 manifest：`id` 命中哪个密度档，`render` 就渲染成什么样 */
export interface DensityView {
  id: Density
  /**
   * 顶栏那个图标按钮的画法（形状只在 icons.tsx 的 PATHS 里定义一次）。
   * 形状住在注册表而不是消费者（ListControls）里：顶栏的视图分段按
   * `prefs.densityViews` 过滤 + 排序渲染，图标得跟着 `id` 走——放这里，
   * 「这一档长什么样」与「这一档渲染成什么样」就是同一份真源。
   */
  icon: IconName
  render: (ctx: DensityContext) => React.JSX.Element
}

/**
 * 日期分组 + 置顶组（列表的主体，DOM 逐字未动）。
 *
 * 分组**只对非置顶项**做：置顶项由下面那个「置顶」组渲染，若仍留在日期组里
 * 同一条会出现两遍（App 侧 `dateGroups` 就是对 restList 建的）。
 * 置顶组标题（图钉 + 「置顶」）：带图标是为了扫视时跟日期组一眼可分。
 */
function renderGroups(ctx: DensityContext): React.JSX.Element {
  const { pinnedList, dateGroups } = ctx
  return (
    <>
      {/* 置顶组常驻在最上面：它不参与日期分组，日期组只看非置顶项。
          筛选后置顶组为空时整组不渲染——不留一个空标题占位。 */}
      {pinnedList.length > 0 && (
        <CardGroup
          items={pinnedList}
          label={
            <>
              <Icon name="pin" size={12} strokeWidth={2.4} />
              {copy.panel.pin}
            </>
          }
          pinned
        />
      )}
      {dateGroups.map((g) => (
        <CardGroup key={g.key} items={g.entries} label={g.label} />
      ))}
    </>
  )
}

/**
 * 焦点滚动（v0.8.0）：当前筛选结果的连续滚动浏览，一张占焦点、上下毛玻璃。
 * 窗口裁剪 / 高度测量都在 FocusScroll 里，本表只负责把 list 递过去。
 */
function focusView(ctx: DensityContext): React.JSX.Element {
  return <FocusScroll entries={ctx.list} />
}

/**
 * 密度分流表（数组顺序无意义，按 `id` 命中）。
 *
 * 每档密度各一条 manifest——SOP 是「一档密度 = 一条」，漏登记哪一档下面的守卫
 * 都会红。（网格那条 2026-10-12 随视图移除，见文件头。）
 */
export const DENSITY_VIEWS = [
  { id: 'focus', icon: 'focus', render: focusView },
  { id: 'list', icon: 'rows', render: renderGroups },
] as const satisfies readonly DensityView[]

/**
 * 编译期守卫：`DENSITIES`（prefs.ts）新增成员时必须同步在上面登记一条 manifest，
 * 否则本行约束不满足（`_AssertNever<'新档'>`）编译失败。防「加了密度档，
 * CardFlow 找不到视图」。
 *
 * 三处细节，别顺手改掉：
 * ① `as const` 让 id 停在字面量上，守卫才看得见缺了谁（宽成 `Density` 就恒等于 never）；
 * ② 用「约束 extends never」而不是仓库旧写法 `const x: Missing = undefined as never` ——
 *    后者是**空转**的（never 可赋值给任何类型，实测漏三个档也 exit 0），本处要真能红；
 * ③ 纯类型层，**不给它配运行时引用**：`declare const` 会被 esbuild 擦掉而 `void` 引用
 *    留在产物里，一挂载就 ReferenceError（本次重构第一版踩过）。
 * `export` 只为消掉「defined but never used」（本仓 eslint 按 `^_` 忽略未用变量，
 * 评审平台跑的那份配置没有这条忽略）：导出即「被使用」，漏登记密度档照旧编译不过。
 * 守卫本身一字未动。
 */
type _RegisteredDensity = (typeof DENSITY_VIEWS)[number]['id']
type _MissingDensity = Exclude<Density, _RegisteredDensity>
/** 断言：入参必须是 never（即「DENSITIES 一个都没漏」） */
type _AssertNever<T extends never> = T
export type _DensitiesAllRegistered = _AssertNever<_MissingDensity>
