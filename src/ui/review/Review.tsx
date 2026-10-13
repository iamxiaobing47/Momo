import { useEffect, useMemo, useRef } from 'react'
import { dayOfCached, useUi } from '../store'
// D-12：streak 走日期键口径的 streakOfDays（+ useTodayKey 的跨零点翻页），
// 不再为拿一个数就对全库逐条 new Date（那个收 entries 的包装 2026-10-11 删掉了）
import { streakOfDays } from '../../momo/stats/insights'
import { copy } from '../../momo/i18n'
import { EmptyState, TextButton } from '../kit'
import { isRepeatClick } from '../shared/activationGate'
import { Card } from '../card'
import { ReviewHeader } from './ReviewHeader'
import { ReviewNav } from './ReviewNav'
import { useTodayKey } from '../hooks/useTodayKey'

// 回顾（concept-momo-review）：池子 = 当前筛选命中的 Momo（在侧栏选好标签再进来
// 就是「按标签回顾」）；五种抽法——随机 / 一周未看 / 一月未看 / 很久没看 / 往年今日，
// 在顶栏切换。
//
// v0.5 版面（设计稿 §3）：**单张聚焦**——顶部「第 N 张 / 共 M 张」+ 连续记录天数 +
// 进度条，中间一张大卡，底部两键（上一个 / 下一个），键盘 ← → / 空格也能走完一轮。
//
// 2026-10-13 用户裁决（需求变更）：**中间那张卡就是主页面上那一张 `Card`**——
// 「随机回顾画面的卡片，也保持和主页面的卡片一样，只是标签不能做过滤了」。
// 于是本文件原先那份独立的大卡（`ReviewCard.tsx`：日期 · 相对时间 · 标签 →
// 大字主行 → 正文 → 「在 Obsidian 中打开」页脚）整块退役，版面、时间戳口径、
// 字数、操作行、右键菜单、点正文打开全部由 Card 自己那份偏好与实现负责；
// 唯一差别是 `filtersLocked`——回顾批次是进档那一刻 `matched()` 的快照，
// 筛选区块本来就整块锁着（BUG-123b），标签 / 地点胶囊只作展示。
// 这条「同一张卡、只多一个只读开关」的路，与统计页「最长笔记」预览卡
// （`preview` / `previewLines`）是同一条：两条渲染路径各写一遍，版面迟早漂移。
//
// 版面三块中的两块拆成独立组件（各自文件头有更细的口径注释）：
// ReviewHeader = 顶部「第 N 张 / 共 M 张」+ 连续记录 + 进度条；
// ReviewNav    = 底部上一个 / 下一个两键。
// 本文件只留：store 订阅、streak 的 memo、键盘监听、空态 / 完成态、路由。
//
// 多选态（selectMode / 勾选与否 / 勾选动作）从 store 选（v0.9.10）：回顾档与五档
// 密度共用同一份选择态，顶栏进的多选在这里一样能勾选（Card 自己订 store，
// 这里不再往下递 props）。

export function Review() {
  const entries = useUi((s) => s.entries)
  const batch = useUi((s) => s.reviewBatch)
  const index = useUi((s) => s.reviewIndex)
  const reviewMode = useUi((s) => s.reviewMode)
  const next = useUi((s) => s.reviewNext)
  const prev = useUi((s) => s.reviewPrev)
  const newBatch = useUi((s) => s.newReviewBatch)
  const setMode = useUi((s) => s.setMode)
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
    const target = e.target as HTMLElement
    // 多选态整卡是勾选热区（Card 自己带 role=checkbox / Enter·Space，见 BUG-82a
    // 与 BUG-199）：Space / Enter 归勾选，不该同时触发这里的「下一个」。方向键
    // 不拦，冒泡上来照常翻张——所以这条只看这两个键，豁免名单不能把它整类吞掉。
    if ((e.key === ' ' || e.key === 'Enter') && target.closest('[role="checkbox"]')) return
    // 焦点在卡内交互元素（操作行按钮 / 标签与地点 pill / 输入框）时，键盘事件归
    // 它们自己处理，根节点不再劫持 Space / Enter / 方向键（可键盘激活卡内控件）
    if (target.closest('button,input,textarea,[contenteditable],a')) return
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

        {/* 回顾档这一张 = 主页面上那一张（2026-10-13 用户裁决）：只多一个
            filtersLocked——标签 / 地点胶囊只作展示，不筛这批快照 */}
        <Card entry={entry} filtersLocked />

        <ReviewNav atFirst={index === 0} onPrev={prev} onNext={next} />
      </div>
    </div>
  )
}
