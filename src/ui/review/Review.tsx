import { useEffect, useMemo, useRef } from 'react'
import { dayOfCached, useUi } from '../store'
// D-12：streak 走日期键口径的 streakOfDays（+ useTodayKey 的跨零点翻页），
// 不再为拿一个数就对全库逐条 new Date（那个收 entries 的包装 2026-10-11 删掉了）
import { streakOfDays } from '../../momo/stats/insights'
import { copy } from '../../momo/i18n'
import { EmptyState, TextButton } from '../kit'
import { isRepeatClick } from '../shared/activationGate'
import { ReviewCard } from './ReviewCard'
import { ReviewHeader } from './ReviewHeader'
import { ReviewNav } from './ReviewNav'
import { useTodayKey } from '../hooks/useTodayKey'

// 回顾（concept-momo-review）：池子 = 当前筛选命中的 Momo（在侧栏选好标签再进来
// 就是「按标签回顾」）；五种抽法——随机 / 一周未看 / 一月未看 / 很久没看 / 往年今日，
// 在顶栏切换。
//
// v0.5 版面（设计稿 §3）：**单张聚焦**——顶部「第 N 张 / 共 M 张」+ 连续记录天数 +
// 进度条，中间一张大卡（日期 / 相对时间 / 标签 → 大字主行 → 其余正文），
// 底部两键（上一个 / 下一个），键盘 ← → / 空格也能走完一轮。
//
// 与设计稿的**内容口径差异**（用户 2026-09-19 裁决「按真实数据适配」）：
// 设计稿那张卡画的是「词条 / 释义 / 例句」三分区，但那套字段在插件里并不存在
// （源码无 WordCard 概念、vault 里也没有词卡目录，ADR-002 禁 AI 故无法自动生成释义）。
// 所以这里把三分区映射到 Momo 自身：短首行 → 26/700 大字，其余 → 正文 / 引用块。
// v0.5.2 起底部收成两键、卡片页脚不再展示文件路径来源（v0.5.2 用户反馈）。
//
// 版面三块已拆成独立组件（各自文件头有更细的口径注释）：
// ReviewHeader = 顶部「第 N 张 / 共 M 张」+ 连续记录 + 进度条；
// ReviewCard   = 中间大卡（meta / hero / MarkdownBody / foot + 「短首行升标题」的 split）；
// ReviewNav    = 底部上一个 / 下一个两键。
// 本文件只留：store 订阅、streak 的 memo、键盘监听、空态 / 完成态、路由。
//
// 多选态（selectMode / 勾选与否 / 勾选动作）从 store 选（v0.9.10）：回顾档与五档
// 密度共用同一份选择态，顶栏进的多选在这里一样能勾选。递给 ReviewCard 的仍是三个
// 显式 props（那是大卡自己的接口，且只此一跳）。

export function Review() {
  const entries = useUi((s) => s.entries)
  const batch = useUi((s) => s.reviewBatch)
  const index = useUi((s) => s.reviewIndex)
  const reviewMode = useUi((s) => s.reviewMode)
  const next = useUi((s) => s.reviewNext)
  const prev = useUi((s) => s.reviewPrev)
  const newBatch = useUi((s) => s.newReviewBatch)
  const setMode = useUi((s) => s.setMode)
  // 多选态：与五档密度同一份（store 里的 selection slice），不钻 props
  const selectMode = useUi((s) => s.selectMode)
  const toggleSelected = useUi((s) => s.toggleSelected)
  // 卡内「在 Obsidian 中打开」改由 ReviewCard 自己订 caps（它只服务大卡）
  const titleFromFirstLine = useUi((s) => s.titleFromFirstLine)
  // 标题字数上限（v0.9.12 起可配）：与开关同一个 memo 的输入，递进 ReviewCard
  const titleMaxChars = useUi((s) => s.titleMaxChars)
  const brand = useUi((s) => s.brandName)
  const rootRef = useRef<HTMLDivElement>(null)

  // D-12：连续记录天数只需要「日期键集合 + 今天这一键」。旧写法
  // 为拿一个数就对全库逐条 new Date（dayKey），且把「今天」冻在 memo 求值时刻
  // ——面板跨天不翻页。
  // 现在走 store 的 dayOfCached（每条目的键只折算一次）+ useTodayKey（跨零点翻转）。
  const today = useTodayKey()
  const streak = useMemo(() => streakOfDays(new Set(entries.map(dayOfCached)), today), [entries, today])
  const entry = batch[index]
  const isDone = batch.length > 0 && index >= batch.length
  // 勾选与否 = 多选态 **且** 命中选中集（旧 props 口径：非多选时报 false）。
  // 放在早退之前：hook 顺序不能随「空态 / 收尾态 / 正常张」变化。
  const isChecked = useUi((s) => s.selectMode && s.selected.has(entry?.path ?? ''))

  /**
   * 「短首行作为标题」全局生效（v0.5.3）的那份 memo 搬去了 ReviewCard——它只服务
   * 大卡，且必须挂在组件自己的所有条件渲染之前（hook 顺序），放在这里反而不对。
   */

  // 键盘走完一轮：← → 切换、空格 / Enter = 下一个、Esc = 结束回顾。
  // 监听挂在回顾区自身（不是 window）：焦点在别的编辑器里按方向键不该动这里。
  // 每次换张后把焦点收回来，键盘用户才能连续按。
  useEffect(() => {
    rootRef.current?.focus()
  }, [index, batch.length])

  // BUG-128c：键盘处理抽出来给**两棵 JSX 共用**。旧实现把 onKeyDown 只挂在
  // 「正常张」那棵上，完成态走的是另一棵 JSX（没有它）→ 走完一轮后 ← → / Space /
  // Esc 全废，只能靠 Tab 找按钮。
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    // 焦点在卡内交互元素（卡内「在 Obsidian 中打开」等按钮）时，键盘事件归按钮自己处理，
    // 根节点不再劫持 Space / Enter / 方向键（可键盘激活卡内控件）
    if ((e.target as HTMLElement).closest('button,input,textarea,[contenteditable],a')) return
    // 多选模式下方向键仍可翻张（勾选靠点击，空格 / Enter 也给「下一个」）
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setMode('list')
    }
  }

  if (batch.length === 0) {
    const e = copy.review.empty
    const title =
      reviewMode === 'onthisday'
        ? e.onthisday(brand)
        : reviewMode === 'stale'
          ? e.stale(brand)
          : reviewMode === 'week'
            ? e.week
            : reviewMode === 'month'
              ? e.month
              : e.random(brand)
    return (
      <EmptyState
        title={title}
        action={
          <TextButton onClick={() => setMode('list')}>{copy.review.backToAll}</TextButton>
        }
      />
    )
  }

  if (isDone || !entry) {
    return (
      <div className="momo-review" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="momo-review-done">
          <span className="momo-review-done-text">{copy.review.doneBatch(batch.length)}</span>
          <div className="momo-review-acts">
            {/* BUG-184d：同「换一批」——第一下卸载自身后，双击的第二下落点不可控，
                先在自家这颗上吞掉同一个手势的第二下 */}
            <button
              className="momo-btn"
              onClick={(e) => {
                if (isRepeatClick(e.detail)) return
                newBatch()
              }}
            >
              {copy.review.newBatch}
            </button>
            <button className="momo-btn momo-btn-primary" onClick={() => setMode('list')}>
              {copy.review.backToAll}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="momo-review"
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="momo-review-col">
        <ReviewHeader index={index} total={batch.length} streak={streak} />

        <ReviewCard
          entry={entry}
          titleFromFirstLine={titleFromFirstLine}
        titleMaxChars={titleMaxChars}
          selectMode={selectMode}
          isChecked={isChecked}
          onToggleCheck={toggleSelected}
        />

        <ReviewNav atFirst={index === 0} onPrev={prev} onNext={next} />
      </div>
    </div>
  )
}
