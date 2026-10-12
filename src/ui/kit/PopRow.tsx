import type { ReactNode } from 'react'
import { Icon } from '../shared/icons'

// 浮层候选行（.momo-pop-row）：check 圈 + 标签文字 + 右列计数。批量标签弹层
// （src/ui/tags/picker/BatchTagPicker.tsx：加 / 去两种模式 + 「新建 父/子」行）
// 与标签管理弹层（src/ui/tags/TagEditMenu.tsx 的候选列表）逐字同形，收敛到这一份。
//
// 类名集合与三个调用点逐字一致：momo-pop-row / momo-pop-row-on /
// momo-pop-row-cursor / momo-pop-newrow / momo-pop-check / momo-pop-check-have /
// momo-pop-check-new / momo-pop-label / momo-tag-virtual / momo-pop-stat。
// 原调用点是模板字面量拼类名，空槽会留下尾随空格（如 `momo-pop-row  `）；
// 这里改用聚合写法——classList 不可观测尾随空格，而每个开关组合的类名集合
// 仍然逐字对齐，DOM 结构（三个 span 的顺序、Icon 的尺寸）分毫未动。
//
// check 圈三态：on → 勾（10/2.6）；new 未选 → 加号（11/1.8）；
// have 未选 → 小一号的勾（11/2.2）。三态之外什么都不渲染（调用方想要「连空圈
// 都没有」时传 bare，见下）。
//
// v0.9.26 密度一刀：**bare = 连空圈都不画**。标签管理弹层的候选没有「选中态」
// 可言（点一下只是把名字填进输入框），那只恒空的圈是纯装饰——白占 14px 圈 +
// 8px 间距，一行 22px 的标签宽度。该弹层改传 bare，圈整列退役。
//
// 交互留在调用方：BatchTagPicker 的高亮（cursor）/ 悬停（setCursor）/ 回车
// （rows[cursor]）共用一套全局下标（D-04，组内 ≠ 全局会同时高亮两行、回车
// 选错行，scripts/batch-tag-picker-groups.test.mts 守着），这里只承接回调。

export interface PopRowProps {
  /** check 圈右侧文字（调用方决定「#路径」还是「新建 父/子」文案） */
  label: ReactNode
  /** 虚拟标签斜体（两个调用点同一个判定、同一个类名） */
  virtual?: boolean
  /** 右列计数（「共 N 条」「+N」「−N」「已含」）；不传则不渲染右列 */
  stat?: string
  /** 已进「待处理」队列：打勾 + momo-pop-row-on */
  on?: boolean
  /** 加模式全命中（写了也是空操作）：禁用 + momo-pop-check-have + 小一号的勾 */
  have?: boolean
  /** 键盘 / 悬停高亮行 */
  cursor?: boolean
  /** 「新建 父/子」行：momo-pop-newrow + 未选时的加号 */
  new?: boolean
  /** 不画 check 圈（候选没有选中态可言时：标签管理弹层的合并候选） */
  bare?: boolean
  disabled?: boolean
  /**
   * 无障碍名。默认不传 = 浏览器把「label + stat」两段文字念出来；右列是**裸数字**
   * （`12` / `+3` / `已含`）时那句话听着没头没尾，调用方可以给一句完整的名
   * （地点跳转行给 `copy.location.groupAria`：「北京，12 条」）。
   */
  ariaLabel?: string
  onMouseEnter?: () => void
  onClick: () => void
}

export function PopRow({
  label,
  virtual,
  stat,
  on,
  have,
  cursor,
  new: isNew,
  bare,
  disabled,
  ariaLabel,
  onMouseEnter,
  onClick,
}: PopRowProps): React.JSX.Element {
  return (
    <button
      className={[
        'momo-pop-row',
        isNew ? 'momo-pop-newrow' : '',
        on ? 'momo-pop-row-on' : '',
        cursor ? 'momo-pop-row-cursor' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {!bare && (
        <span
          className={[
            'momo-pop-check',
            isNew ? 'momo-pop-check-new' : '',
            !on && have ? 'momo-pop-check-have' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {on ? (
            <Icon name="check" size={10} strokeWidth={2.6} />
          ) : isNew ? (
            <Icon name="plus" size={11} strokeWidth={1.8} />
          ) : have ? (
            <Icon name="check" size={11} strokeWidth={2.2} />
          ) : null}
        </span>
      )}
      <span className={['momo-pop-label', virtual ? 'momo-tag-virtual' : ''].filter(Boolean).join(' ')}>
        {label}
      </span>
      {stat !== undefined && <span className="momo-pop-stat">{stat}</span>}
    </button>
  )
}
