import { useEffect, useRef } from 'react'
import type { TagPickerMode } from '../tags/picker'
import { BatchTagPicker } from '../tags/picker'
import type { LocPickerMode } from '../locations/picker'
import { LocBatchPicker } from '../locations/picker'
import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'

// 底部浮起的批量操作条（设计稿 §2）：替代旧版顶部多选横幅，
// 批量改标签 / 删除时不用把列表滚回顶部。
// 面板窄时它会**缠绕成多行**（按钮横排放不下），高度不再是固定的 52px：
// 内容区据此预留底部空隙（见 App 的 --momo-fab-h 测量），否则最后几张卡片会被它盖住。
// （「导出已选」随导出整块移除，浮条少一颗按钮。）

export interface BatchBarProps {
  /** 选中数（0 时按钮禁用，但弹层不卸载——见 BatchTagPicker 那侧的注释） */
  selectedCount: number
  /** 批量删除进行中：防重复提交（再点一次会对已删路径空转并误报失败） */
  deleting: boolean
  /** 批量标签弹层：null = 关闭；否则 = 作用在这批路径上、用哪种模式 */
  tagPicker: { paths: string[]; mode: TagPickerMode } | null
  /** 「加标签 / 去标签」：同一颗再点一次 = 收起（省一次「取消」）。
      切换按钮时换成新模式并按**当时的**选中集重绑，队列随之清空（弹层按 mode 重挂）。 */
  onToggleTagPicker: (mode: TagPickerMode) => void
  onCloseTagPicker: () => void
  /** 批量地点弹层（F4，与 tagPicker 平行）：null = 关闭；否则 = 作用在这批
      路径上、加还是摘。**一颗按钮一种模式**（与「加标签 / 去标签」同构）：
      「添加地点」进 add、「移除地点」进 remove，弹层打开即固定在该模式。 */
  locPicker: { paths: string[]; mode: LocPickerMode } | null
  onToggleLocPicker: (mode: LocPickerMode) => void
  onCloseLocPicker: () => void
  /** 选中的 Momo 里有没有地点可摘：一个都没有时「移除地点」置灰（摘谁都是空操作）。
      判据由 App 按 entries × 选中集算好传下来（批量条自己是纯 props 组件）。 */
  locRemovable: boolean
  onDeleteSelected: () => void
  onCancel: () => void
  /** 面板根节点：实际高度写进它的 `--momo-fab-h`（测量在 App 里，见 useFabHeight） */
  fabRef: React.RefObject<HTMLDivElement | null>
}

export function BatchBar({
  selectedCount,
  deleting,
  tagPicker,
  onToggleTagPicker,
  onCloseTagPicker,
  locPicker,
  onToggleLocPicker,
  onCloseLocPicker,
  locRemovable,
  onDeleteSelected,
  onCancel,
  fabRef,
}: BatchBarProps) {
  // BUG-128g：批量条被**卸载**（键盘触发「删除」成功后 exitSelectMode 整块卸载它）时，
  // 焦点正落在被移除的按钮上 → 落回 document.body（删除期间那颗钮还被 disabled，
  // 卸载前已被浏览器摘焦）。在卸载时把焦点交还给「进批量条之前聚焦的元素」（还在才给）；
  // 那个元素也随删除消失时，退到顶栏第一颗可聚焦控件，别把键盘用户撂在 body 上。
  //
  // BUG-167a：`prev` 必须在**渲染期**读。`setSelectMode(true)` 那一个提交里，顶栏把
  // 点下去那颗「多选」钮连同 ModeControls 整块换成 SelectModeControls（Topbar.tsx
  // 的三元分支）——浏览器随即把被移除的焦点元素打回 body，而 passive effect 要等
  // mutation / layout 都跑完才执行，那时 activeElement 已经是 body。读在 effect 里
  // 等于永远拿到 body，两条最常见的路径（顶栏「多选」进场、删除成功后退出）全是
  // 空操作。渲染期读 DOM 是不纯动作，但只读一次，且两次渲染（StrictMode 双调用）
  // 都发生在 DOM mutation 之前、读到同一个值——为拿回「进场前那颗钮」值得。
  const prevFocusRef = useRef<Element | null>(null)
  if (prevFocusRef.current === null) prevFocusRef.current = document.activeElement
  useEffect(() => {
    // 挂载时抓一次批量条节点（cleanup 里再读 `fabRef.current` 会被规则判成「读到可能
    // 已换过的 ref」）；`fabRef` 是父级传下来的稳定 ref 对象，写进依赖表是**诚实表达**，
    // 不是「多跑几次」——本 effect 仍只在卸载时跑一次（BUG-221 的 WindowSlot 同一口径）。
    const bar = fabRef.current
    return () => {
      const active = document.activeElement
      const lost = active === null || active === document.body || (bar !== null && bar.contains(active))
      if (!lost) return
      const prev = prevFocusRef.current
      if (prev instanceof HTMLElement && prev.isConnected && prev !== document.body && prev !== document.documentElement) {
        prev.focus()
        return
      }
      // 兜底：顶栏第一颗**可见**的可聚焦控件。文档序第一颗不能用——宽面板常态下
      // 那是 `.momo-composer-top`（070-content.css 的基础规则 display:none，只在
      // ≤620 档翻上来），对 display:none 元素 focus() 不产生任何效果（BUG-167a
      // 的第二层：前置判据对了、落点还是空的）。offsetParent 是「布局可见」的现成
      // 判据：display:none 子树里它恒为 null。
      const first = Array.from(
        document.querySelectorAll<HTMLElement>('.momo-app .momo-topbar button, .momo-app .momo-topbar [tabindex]'),
      ).find((el) => el.offsetParent !== null)
      first?.focus()
    }
    // 依赖表写 fabRef（稳定 ref 对象）：本 effect 仍只在挂载 / 卸载跑一次；
    // prevFocusRef 与 bar 都不需要进表（前者是 ref，后者已在 body 里抓成局部量）。
  }, [fabRef])

  return (
    <div className="momo-fab" ref={fabRef}>
      <span className="momo-fab-count">{copy.panel.select.count(selectedCount)}</span>
      <span className="momo-fab-sep" />
      <div className="momo-batchtag-wrap">
        {/* 三颗 fab（加 / 去标签、删除）不传 aria-label（BUG-197）：传了就是与可见文字
            逐字同键，部分 Electron 会把它漏成黑底原生气泡（BUG-159 取证）。名字由可见
            文字承担，窄面板下文字转 sr-only 不出视觉、仍在无障碍树（95-responsive.css）。 */}
        <button
          className="momo-fab-btn"
          disabled={selectedCount === 0}
          onClick={() => onToggleTagPicker('add')}
        >
          <Icon name="tag" size={14} />
          <span className="momo-fab-text">{copy.panel.batch.addTag}</span>
        </button>
        <button
          className="momo-fab-btn"
          disabled={selectedCount === 0}
          onClick={() => onToggleTagPicker('remove')}
        >
          <Icon name="tag-off" size={14} />
          <span className="momo-fab-text">{copy.panel.batch.removeTag}</span>
        </button>
        {/* 弹层不随「选中数归零」卸载：否则取消勾选时面板会突然消失、队列也丢了。
           0 条时弹层里底部按钮自动禁用。 */}
        {tagPicker && (
          <BatchTagPicker
            key={tagPicker.mode}
            selected={tagPicker.paths}
            mode={tagPicker.mode}
            onClose={onCloseTagPicker}
          />
        )}
        {/* 第 5 / 6 颗「添加地点 / 移除地点」（F4，设计稿 F4 的位置：标签两颗之后、
           删除之前）。一颗按钮一种模式，与「加标签 / 去标签」同构——弹层打开即
           固定在该模式（切换 = 关掉点另一颗）。「移除地点」在选中的 Momo 一个
           地点都没有时置灰：摘谁都是空操作。
           两颗与左边三颗同判据**不传 aria-label**（BUG-197 / BUG-212）：名字由
           可见文字承担，窄面板下文字转 sr-only 不出视觉、仍在无障碍树
           （95-responsive.css）。曾挂的 `location.batch.ariaAdd / ariaRemove`
           （「批量添加地点」）与可见文字只差一个语境已知的「批量」——在批量条里
           纯重复，黑底气泡就是它漏的；两个键已随本单从三语言字典删除
           （BUG-159 纪律：UI 走了，键不留）。 */}
        <button
          className="momo-fab-btn"
          disabled={selectedCount === 0}
          onClick={() => onToggleLocPicker('add')}
        >
          <Icon name="mappin" size={14} />
          <span className="momo-fab-text">{copy.location.batch.fabAdd}</span>
        </button>
        <button
          className="momo-fab-btn"
          disabled={selectedCount === 0 || !locRemovable}
          onClick={() => onToggleLocPicker('remove')}
        >
          <Icon name="mappin-off" size={14} />
          <span className="momo-fab-text">{copy.location.batch.fabRemove}</span>
        </button>
        {locPicker && (
          <LocBatchPicker
            key={locPicker.mode}
            selected={locPicker.paths}
            mode={locPicker.mode}
            onClose={onCloseLocPicker}
          />
        )}
      </div>
      <button
        className="momo-fab-btn momo-fab-danger"
        disabled={selectedCount === 0 || deleting}
        onClick={onDeleteSelected}
      >
        <Icon name="trash" size={14} />
        <span className="momo-fab-text">{copy.common.delete}</span>
      </button>
      <span className="momo-fab-sep" />
      <button
        className="momo-fab-btn momo-fab-ghost"
        aria-label={copy.panel.select.cancelAria}
        onClick={onCancel}
      >
        <span className="momo-fab-text">{copy.common.cancel}</span>
      </button>
    </div>
  )
}
