import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { TAG_MATCH_MODES } from '../../momo/types'
import { PopDialog, PopRow, useFreePopPlacement } from '../kit'

// 多选标签的组合方式浮层（2026-10-12）：点「过滤标签」输入框右侧那枚「两圆交叠」
// 按钮唤起。两行——并集 / 交集，点完即关（同 TagSortMenu）。
//
// 为什么它**不**进工具行（TagTreeToolbar 那颗漏斗的筛选浮层里）：工具行两枚按钮管
// 「侧栏显示哪些标签行」，这里管「主区怎么组合用户点中的那些标签」——一个是挑候选，
// 一个是读命中口径。挤进同一个浮层会让「筛选」这一词同时指两件事。
//
// 与筛选浮层另一处不同：它改的是**视图偏好**（落盘，ADR-003），筛选是会话内 transient。
// 所以这里没有「清除全部」——两行都是合法值，没有「回到未设状态」可言（并集只是默认值，
// 不是空态）。
//
// 两行各带一句口径（copy.tags.matchUnionHint / matchIntersectionHint）：名字「并集 /
// 交集」只是术语，用户要的是「点下去我的卡片列表会怎么变」。副文走 .momo-pop-sub，
// 行高因此从固定 28 改成随内容（见 30-pop/001-pop.css 的 .momo-pop-list-twoline）。
//
// 两行**不画左列图标**（2026-10-14 用户裁决，原话「每个选项左侧不需要有圆点图标，
// 文字即可」）：走 PopRow 的 bare（同标签管理弹层的候选行）。选中态本来就有底色 +
// 字重 + 文字色三重信号，那只圈既不是唯一信号、也不是最多的那个——单选列表里的一列
// 空心圈只是装饰，白占 14px 圈 + 8px 间距。

/**
 * 弹层**最大**宽（内容撑不下才用满）。两处共用：TagFilterInput 算落点时的右对齐锚
 * （那边 `import { MENU_W }`，别在两处各写一个数），以及这里的边界夹取上限。
 * 2026-10-14 用户裁决「不要留那些空间」：左列图标退掉之后定宽 236 会空出一大截，
 * 改成 `width: max-content` 随内容收——右缘仍钉在按钮右缘（实测回拉在 kit 的
 * useFreePopPlacement，anchor: 'right'），所以落点仍按这个上限算，实际宽由内容决定。
 * 236 同时是与筛选浮层对齐的上限：两颗按钮在侧栏上下相邻，最宽时一样宽才不显得歪。
 * 高只是那个 hook 的**兜底估值**（2026-10-13 删掉组名与口径说明后：两行各约 36 +
 * 间距与内距）；落点夹取先量真实高度，量不到（jsdom 无布局）才用它。
 */
export const MENU_W = 236
const MENU_H = 96

export function TagMatchMenu({
  x,
  y,
  onClose,
  returnFocus,
}: {
  x: number
  y: number
  onClose: () => void
  /** BUG-82d：焦点归还落点（过滤框右侧那颗组合方式按钮），见 PopDialog.returnFocus */
  returnFocus?: () => HTMLElement | null
}) {
  const tagMatchMode = useUi((s) => s.tagMatchMode)
  const setTagMatchMode = useUi((s) => s.setTagMatchMode)
  // x / y 已由调用方换算成「相对 .momo-app」的偏移（x = 按钮右缘 − MENU_W）。
  // 本浮层宽是 `max-content`（随内容收），所以只能按**右缘**对齐锚点：把 x + MENU_W
  // （= 按钮右缘）交出去、锚缘口径交给 kit 的 useFreePopPlacement，左缘由它按实测宽
  // 反推——夹取也收在那一处（含「先量真实高度再夹」，见那里的文件头）。
  const { dialogRef, style } = useFreePopPlacement(
    x + MENU_W,
    y,
    { w: MENU_W, h: MENU_H },
    { anchor: 'right', style: { width: 'max-content', maxWidth: MENU_W } },
  )

  return (
    <PopDialog
      variant="free"
      ariaLabel={copy.tags.matchAria}
      style={style}
      dialogRef={dialogRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      onMaskClick={onClose}
      returnFocus={returnFocus}
    >
      {/* 无标题弹层（BUG-160 起 dialog 左上角不放标题，2026-10-13 连组名与它下面那句
          口径说明一起删了——同 TagFilterMenu 的组名说明：两行的副文已经各自说清口径）。
          两行选项的行高随内容（.momo-pop-list-twoline），左列图标退休（bare，2026-10-14）。 */}
      <div className="momo-pop-list momo-pop-list-twoline">
        {TAG_MATCH_MODES.map((mode) => (
          <PopRow
            key={mode}
            bare
            label={
              <>
                <span>{copy.meta.tagMatch[mode]}</span>
                <span className="momo-pop-sub">
                  {mode === 'union' ? copy.tags.matchUnionHint : copy.tags.matchIntersectionHint}
                </span>
              </>
            }
            on={mode === tagMatchMode}
            onClick={() => {
              setTagMatchMode(mode)
              onClose()
            }}
          />
        ))}
      </div>
    </PopDialog>
  )
}
