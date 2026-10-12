import { memo, useCallback } from 'react'
import { useUi } from '../store'
import type { MainMode } from '../store'
import type { LocationPosition, TagPosition } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { CheckCircle, Spacer, PinMark } from '../kit'
import { Icon } from '../shared/icons'
import { LocationPills } from '../locations/locPills'
import { CardTags } from './CardTags'
import { CardActions, type CardActionsProps } from './CardActions'

// 元信息行（.momo-card-meta）：置顶 PinMark · 时间戳 · 字数（dot + stamp）· Spacer ·
// 标签挂点 CardTags · 勾选圈 / 操作行右半。从 Card.tsx 拆出（拆卡片组件）。
// **纯展示原则**：stamp（时间戳字符串）与 charCount（字数）由 Card.tsx 算好再传进来，
// 本组件不做任何取法 / 拼串——卡片的计算留在卡片，这里只负责摆。
//
// 多选态（selectMode / 勾选与否）与「加标签」从 store 读（v0.9.10，见 Card.tsx
// 同处注释）：按卡选布尔量，zustand 同值 bail out；action 引用恒定。

export interface CardMetaProps extends CardActionsProps {
  /** 是否置顶：置顶图钉常显（网格这类没有「置顶」组可依附的密度全靠它表示状态） */
  isPinned: boolean
  /**
   * 当前模式（v0.9.26 起透传）：trash 模式下操作行换成「恢复 / 彻底删除」、
   * 地点 pill 收起（见 Card.tsx 的两处）。只透传，本组件不据此改别的东西。
   */
  mode: MainMode
  /**
   * 补记痕迹（MomoEntry.backfilled）：日期戳前一枚小日历 + hover 全说明。
   * 它回答的是「这条为什么在这儿」——补记的 createdAt 在过去、updatedAt 是落盘
   * 时刻，「按更新时间」排序下它会排到列表最前（预期行为，见 momo/sort.ts）。
   * 没有这枚标记，那次排序在用户眼里就是一次无法解释的跳动。
   */
  isBackfilled: boolean
  /**
   * 预写痕迹（MomoEntry.scheduled）：日期戳前一枚小时钟 + hover 全说明。
   * 与 isBackfilled 同一条理由的另一个方向——预写的 createdAt 在未来、updatedAt
   * 是落盘时刻，「按更新时间」排序下它同样排在最前，也需要一枚标记向用户解释
   * 「这条为什么在这儿」。两枚标记互斥（create(at) 按方向只落一个痕迹字段）。
   */
  isScheduled: boolean
  /** 时间戳（Card.tsx 按 cardStamp / density 算好，如「12:00」/「9月19日 12:00」） */
  stamp: string
  showCharCount: boolean
  /** 字数（trim 后长度，与统计页同口径；showCharCount 为 false 时连分隔点一起收起） */
  charCount: number
  /** 标签挂点：meta 行右侧（默认）或卡片底部一行（底部那份由 Card.tsx 直接渲染） */
  tagPosition: TagPosition
  tags: readonly string[]
  /**
   * 地点标签挂点（2026-10-01 从 tagPosition 拆出）：meta 行右侧（默认）或卡片
   * 底部一行（底部那份由 Card.tsx 直接渲染）。与 tagPosition 互不影响。
   */
  locPosition: LocationPosition
  /** 本篇的地点清单（frontmatter locations）：喂 meta 行的地点 pill */
  locations: readonly string[]
  /**
   * 只读预览（统计页「最长笔记」那三张，2026-10-01 用户反馈）：**整行操作区都不渲染**——
   * 预览卡是「看一眼然后去 Obsidian 读」，不在面板里改它（用户裁决：与主页面卡片
   * 一致，但只读）。勾选圈同样不渲染（多选态在统计模式进不去，留着一颗点了没反应的
   * 圈只是噪声）。
   */
  preview?: boolean
}

export const CardMeta = memo(function CardMeta({
  isPinned,
  isBackfilled,
  isScheduled,
  stamp,
  showCharCount,
  charCount,
  tagPosition,
  tags,
  locPosition,
  locations,
  mode,
  path,
  content,
  readOnly,
  preview = false,
  showCardCopy,
  showCardTag,
  showCardDelete,
  caps,
}: CardMetaProps): React.JSX.Element {
  const selectMode = useUi((s) => s.selectMode)
  const checked = useUi((s) => s.selected.has(path))
  // 「加标签」开弹层是 store 动作（selection.ts）：卡片操作行只有单条 add 这一路，
  // 在这里收窄成 CardActionsProps 的 (paths) => void 形状（useCallback 保引用稳定，
  // CardActions 是 memo，别每次渲染都换新回调）
  const openTagPicker = useUi((s) => s.openTagPicker)
  const onTag = useCallback((paths: string[]) => openTagPicker(paths, 'add'), [openTagPicker])
  // 「设地点」开单卡编辑弹层（store 的 location slice）：落点由 CardActions 按
  // mappin 按钮相对 .momo-app 算好后传进来（DOM 测量留在按钮那一侧）
  const openLocEditor = useUi((s) => s.openLocEditor)
  const onLoc = useCallback(
    (p: string, x: number, y: number) => openLocEditor(p, x, y),
    [openLocEditor],
  )
  return (
    <div className="momo-card-meta">
      {/* 置顶指示（v0.8.3）：非 hover 状态下操作行是隐藏的，光靠图钉按钮的高亮
          用户看不出哪条被置顶了——这里给一枚常显的小图钉。网格这类
          没有「置顶」组可依附的密度，全靠它表示状态。 */}
      {isPinned && <PinMark className="momo-card-pinmark" />}
      {isBackfilled && (
        // BUG-159 登记、BUG-212 执行的两枚图标说明：从原生 `title` 迁到
        // `role=img + aria-label`。title 是 v0.9.0 用户裁决「面板一律不用原生气泡」
        // 禁用的东西（app.drill 有守卫扫 [title]，这两枚因 fixture 没有补记/定时卡
        // 一直在扫描盲区里）；迁到 aria-label 后说明本身留给读屏软件，视觉层不弹
        // （气泡由 110-globe.css 的 --no-tooltip 压制，见 aria-tooltip-css 守卫）。
        <span className="momo-card-backfill" role="img" aria-label={copy.card.backfilled.tip}>
          <Icon name="calendar" size={12} />
        </span>
      )}
      {isScheduled && (
        <span className="momo-card-scheduled" role="img" aria-label={copy.card.scheduled.tip}>
          <Icon name="clock" size={12} />
        </span>
      )}
      <span className="momo-card-stamp">{stamp}</span>
      {showCharCount && (
        <>
          <span className="momo-card-dot" />
          <span className="momo-card-stamp">
            {charCount} {copy.common.unit.char}
          </span>
        </>
      )}
      <Spacer />
      {/* 地点标签（F6 pill 升级形态，2026-10-01）：位置由 locPosition 决定——
          meta 行时放这里、标签之前；bottom 那份由 Card.tsx 渲染。点一颗即筛那个地点 */}
      {locPosition === 'meta' && <LocationPills locations={locations} selectMode={selectMode} />}
      {/* 标签在 meta 行右侧（v0.7.3 起，v0.7.4 做成可配）：回顾页把 pill 放在
          日期同一行，两种排布共用同一份 pill 与点击行为，只换挂点 */}
      {tagPosition === 'meta' && <CardTags tags={tags} selectMode={selectMode} />}
      {preview ? null : selectMode ? (
        <CheckCircle checked={checked} />
      ) : (
        <CardActions
          path={path}
          content={content}
          isPinned={isPinned}
          readOnly={readOnly}
          showCardCopy={showCardCopy}
          showCardTag={showCardTag}
          showCardDelete={showCardDelete}
          mode={mode}
          onLoc={onLoc}
          onTag={onTag}
          caps={caps}
        />
      )}
    </div>
  )
})
