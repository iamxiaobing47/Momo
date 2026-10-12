import { useRef } from 'react'
import type { ReactNode } from 'react'
import { isRepeatClick } from '../shared/activationGate'

// 顶栏三处分段控件（密度图标档 / 回顾模式文字档 / 统计范围文字档）逐字同形，
// 收敛到这一份。DOM 与类名逐字保持原状（momo-segmented + momo-seg +
// momo-seg-on / momo-seg-text，含原有的空串尾随空格）——视觉与既有测试断言
// 都是契约，不改。
//
// 2026-09-29：**压灰禁用（`disabled` / `momo-seg-off`）整条撤掉**。
// 于是这条能力连同它的样式一起清掉，不留没人用的分支（再需要时按当时的语义重加）。
//
// 两档的 aria 形状不同（既有行为，不许「统一」）：
// - 图标档：容器 role=group，按钮 aria-label + aria-pressed；
// - 文字档：容器 role=tablist，按钮 role=tab + aria-selected。
//
// 2026-10-01 起多一个可选出参 `className`（追加在 momo-segmented 之后）：
// 调用方给分段打语义标记用，目前唯一的消费者是 DensitySegmented 的
// `momo-density-seg`——它是**窄档保留项的标记**，不是「收起我」的开关
// （2026-10-01 用户裁定窄面板要**留**视图切换、收搜索框，见 95-responsive.css 的
// ≤560 块与 ListControls 的头注）。该类没有自己的规则，只作身份钩子。
// **不传时下面那条 DOM 契约逐字不变**。
//
// BUG-135：**同一颗的连击只派发一次 `onChange`**。分段里混着几种语义：密度档与
// 视图分段末尾的星球 / 地点分组是幂等 select（后两颗 2026-10-09 起才是，见
// BUG-139——它们原本是「开着再点一次 = 收回」的 toggle，双击 = 开了又关，被用户
// 报了两次）；回顾档的 onChange 还带重抽批次的副作用、排序菜单会穿透。浏览器把
// 一次双击派发成两次 click，于是「同一手势不同结局」在这排按钮上反复出现。闸装在
// 这里而不是各个调用方：「一次手势 = 一次激活」是这个控件该有的单位，四个消费者
// 一起受益。判据用浏览器自己的连击计数（`detail`），见 shared/activationGate。
// 注意它只覆盖「同一位置、间隔在系统双击阈值内」的那第二下（Windows ±4px /
// 500ms）——**治不了慢双击与连点**，别指望它兜住 toggle 语义（BUG-139 的教训）。
//
// `onIntent`（可选）在**悬停或键盘聚焦**某一档时派发，带上是哪一档：调用方
// （DensitySegmented）借意图期预热——悬停星球档就预装载贴图与 globe3d.js，
// 其余档预热正文渲染缓存（见 ListControls / App 的 onDensityIntent）。两个
// 细节是后来补的，别改回去：
//   ① **带上档位**：鼠标路径原来挂在容器上（整组一份 onPointerEnter），预热
//      因此不知道指向哪一档，星球资产的预装载无从挂接；
//   ② **键盘路径**：原来只有 pointerenter，Tab 聚焦 + Enter 切换的键盘用户
//      完全吃不到意图期预热（hover 预热对他们等于不存在）。
// 挂在每颗按钮上两条路都覆盖；DOM 与激活语义逐字不变（意图不改变任何状态）。

export interface SegmentedItem<T extends string> {
  value: T
  /** 图标档传 Icon 节点（aria 另给）；文字档传字符串 */
  label: ReactNode
  /** 图标档的无障碍名（文字档不需要——文字本身就是名） */
  aria?: string
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = 'text',
  onIntent,
  className,
}: {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  variant?: 'icon' | 'text'
  /** 悬停 / 聚焦某一档的意图（不改变 DOM 与既有交互）：调用方可借意图期预热，
   *  带上是哪一档（预热按档做），见文件头与 ListControls */
  onIntent?: (value: T) => void
  /** 调用方给分段的语义标记（追加在 momo-segmented 之后）：密度分段挂
      `momo-density-seg`，标记「窄档保留项」。不传 = 单值类名 */
  className?: string
}) {
  /** 上一次被激活的档 / 视图（判「同一颗的第二下」，见文件头 BUG-135） */
  const lastRef = useRef<T | null>(null)
  const activate = (value: T, detail: number): void => {
    // 一次双击的第 2 下：**同一颗**就吞掉。换一颗照常放行——快速依次点隔壁那两档时
    // 第 2 下 detail 同样是 2，那不是误触（用户真的要换档）。
    if (isRepeatClick(detail) && lastRef.current === value) return
    lastRef.current = value
    onChange(value)
  }
  return (
    <div
      className={`momo-segmented${className === undefined ? '' : ` ${className}`}`}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const on = item.value === value
        // 意图期（悬停 / 键盘聚焦）带上档位：预热按档做（见文件头 ①②）。
        // 不改变 DOM 与激活语义——它不 stopPropagation、不碰任何状态。
        const intent = (): void => onIntent?.(item.value)
        if (variant === 'icon') {
          return (
            <button
              key={item.value}
              // 类名逐字保持原状（含那个空串尾随空格——DOM 契约，测试断言着呢）
              className={`momo-seg ${on ? 'momo-seg-on' : ''}`}
              aria-label={item.aria}
              aria-pressed={on}
              onPointerEnter={intent}
              onFocus={intent}
              onClick={(e) => activate(item.value, e.detail)}
            >
              {item.label}
            </button>
          )
        }
        return (
          <button
            key={item.value}
            // BUG-128b：文字档也改成 `role="group"` + `aria-pressed`（与上面的图标档同形）。
            // 旧实现挂 `role="tablist"` + 子项 `role="tab"` + `aria-selected`，却没有
            // `aria-controls` / `tabpanel` / roving tabindex / 方向键——读屏会照
            // tablist 的契约去操作然后失败，比缺 role 更糟。
            className={`momo-seg momo-seg-text ${on ? 'momo-seg-on' : ''}`}
            aria-pressed={on}
            onPointerEnter={intent}
            onFocus={intent}
            onClick={(e) => activate(item.value, e.detail)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
