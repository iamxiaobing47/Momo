import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEventHandler, ReactNode, Ref, RefObject } from 'react'

// 浮层弹壳（.momo-pop-mask + .momo-pop + 头 + 脚）：标签管理弹层
// （src/ui/tags/TagEditMenu.tsx）与批量标签弹层（src/ui/tags/picker/BatchTagPicker.tsx，
// 加 / 去两种模式）逐字同形，收敛到这一份。两处都渲染
// 「遮罩 + 对话框 + 头部（可选标题 + 右侧 meta）+ 调用方内容 + 底栏（左列 + 右列）」，
// DOM 类名与调用点逐字一致：momo-pop-mask / momo-pop / momo-pop-free /
// momo-pop-below / momo-pop-head / momo-pop-title / momo-pop-meta /
// momo-pop-foot。底栏左列各调用方不是同一个元素（管理标签是 .momo-pop-footleft
// 文字钮组、批量标签是 .momo-pop-status 状态块、批量地点是 .momo-pop-sum 摘要），
// 由调用方经 footerLeft 原样传入。
//
// 头 / 脚都是**真有内容才渲染**（title / meta 都不传 → 头部整行消失，
// `.momo-pop-nohead` 补上内距；footerLeft / footerActions 都不传 → 底栏不渲染）。
// 2026-10-10 起批量标签弹层也不传 title / meta（头顶的「添加标签」与批量条按钮、
// 底栏主按钮是同一句话的第三遍，「已选 N 条」搬到底栏左列，见 BatchTagPicker 文件头）。
//
// 外壳只接管「壳 + 头 + 脚」的 markup；定位、关闭、焦点与键盘全部留在调用方：
// - free 变体由调用方用 useLayoutEffect 把落点夹回视口（相对 .momo-app 换算），
//   结果经 style / dialogRef 传进来（TagEditMenu 要量宿主尺寸）；
// - below 变体由 CSS 挂在定位锚 .momo-batchtag-wrap 下方，调用方无样式；
// - onKeyDown 原样透传：TagEditMenu 只拦 Escape；BatchTagPicker 还管
//   Enter（含 Ctrl/Cmd 直接应用）、方向键与退格删 chip——它的高亮 / 悬停 /
//   回车共用一套全局下标（D-04，scripts/batch-tag-picker-groups.test.mts 守着）。
//
// v0.9.18 起侧栏的两个小浮层（TagSortMenu / TagFilterMenu）也走这里：排序那个
// 没有底栏（连 footerLeft 都不给 → 底栏整块不渲染），筛选那个只有 footerLeft。
//
// BUG-82d 起多接管一件：**焦点归还**。旧实现五个调用点的关闭路径（Esc / 遮罩 /
// 取消 / 写完即关）全部等于「直接卸载弹层」——焦点原地消失，键盘用户被撂在
// document.body。壳在 unmount 时把焦点还给「唤起它的那颗控件」：调用方显式给
// returnFocus（按钮引用它自己攥着），没给时用**渲染时快照**的 activeElement（点
// 按钮 / 点遮罩那两条路，上一个焦点正是它）。挂在 unmount 而不是逐个关闭
// 回调：五条关闭路径（含 autoFocus 输入框之外的按钮）一处不漏。
//
// BUG-109 起再补两件（键盘可达性）：
// b) 上述快照此前存的是「现读 activeElement」的 thunk——真正的读取发生在卸载
//    cleanup 里，那时焦点已随弹层内部元素被摘除而落回 body，不传 returnFocus
//    的四个入口（批量加/设标签、批量设地点、单卡设地点、地点层级筛选）什么都
//    还不成。改成首次渲染把**元素本身**快照进 ref。
// a) 对话框补 tabIndex=-1 并在打开时收焦点：三个 free 小浮层（标签排序 / 标签
//    筛选 / 地点层级）里没有任何可聚焦控件，焦点留在触发按钮上，而 Esc 处理器
//    挂在对话框 div 上——按钮不是它的后代，keydown 永远到不了。焦点已经在浮层
//    里时不动（autoFocus 输入框在 commit 阶段就拿了焦点，不能被抢）。

export interface PopDialogProps {
  /** free = JS 换算的自由落点（style 给 left/top）；below = 挂在定位锚下方 */
  variant: 'free' | 'below'
  /** 头部右侧 meta（当前标签 / 模式小分段）；不传或空串则头部整行不渲染。
   *  单卡地点编辑弹层 2026-10-10 起两项都不传（右上角不显示笔记首行，见
   *  LocEditPop 文件头）——它与其他 free 小浮层一样整行没有头部。
   *
   *  BUG-187：`title` prop 与 `.momo-pop-title` 一并退役——2026-10-10 的
   *  「所有 dialog 左上角都不要有标题」一族的收尾：七个调用点全都不再传，
   *  渲染分支与唯一的衬线消费者 `--momo-serif` 都是空转。要再放"一行标题"的
   *  新弹层，先想清它是不是已有可见文字的第三遍（157/158/160 的判据）。 */
  meta?: ReactNode
  /** 对话框无障碍名（各调用方自己的 copy 键）。
   *  2026-10-10 起可选：批量标签弹层不再传——那个名字（「批量添加标签」）与唤起它
   *  的批量条按钮、底栏主按钮是同一句话的第三遍，而部分 Electron / Chromium 环境会把
   *  aria-label 渲染成黑底原生气泡（用户报「最下面不要有黑底白字的提示文字」，见
   *  BUG-159）；弹层里的输入框提示文字已经说明了用途，读屏软件靠它也能定位。
   *  只在该名字**不重复任何可见文字**时才值得传（标签管理 / 排序 / 筛选那几个小浮层）。 */
  ariaLabel?: string
  /** 底栏左列：置顶 / 删除文字钮组、批量标签弹层的「已选 N 条 + 影响面摘要」
   *  （.momo-pop-status 状态块），或批量地点的影响面摘要 */
  footerLeft?: ReactNode
  /** 底栏右列：取消 + 主按钮（文案由调用方从 copy 传） */
  footerActions?: ReactNode
  /** 弹层主体：输入框 / note / 待处理 chips / 候选列表 */
  children?: ReactNode
  /** 仅 free 变体用：相对 .momo-app 的落点 */
  style?: CSSProperties
  /** 仅 free 变体用：夹回视口要量宿主尺寸（TagEditMenu 的 menuRef） */
  dialogRef?: Ref<HTMLDivElement>
  /** 原样透传给对话框 div 的 onKeyDown（见文件头） */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  /** 点遮罩（弹层外）——两处调用点都等于 onClose */
  onMaskClick: () => void
  /**
   * BUG-82d：关闭时把焦点还给**唤起它的那颗控件**（unmount 兜底归还）。
   * 调用方攥着那颗按钮（顶栏 / fab / 侧栏工具行），直接传它的引用。
   * 不传 = 退化成出栈前的 activeElement（点按钮 / 点遮罩的路常够用）。
   */
  returnFocus?: () => HTMLElement | null
}

export function PopDialog({
  variant,
  meta,
  ariaLabel,
  footerLeft,
  footerActions,
  children,
  style,
  dialogRef,
  onKeyDown,
  onMaskClick,
  returnFocus,
}: PopDialogProps): React.JSX.Element {
  const hasHead = meta !== undefined && meta !== ''
  /**
   * BUG-82d（BUG-109b 修正）：挂载后**首次渲染**把「上一个焦点」快照成元素
   * 本身。必须在 render 期取（effect 里已经晚了——autoFocus 的输入框把
   * activeElement 换成了弹层自己），而且只取一次——旧实现存的是现读
   * activeElement 的 thunk，真正的读取拖到 unmount 的 cleanup，那时焦点已随
   * 弹层内部元素被摘除而落回 body，不传 returnFocus 的入口什么都还不成。
   */
  const prevFocusRef = useRef<HTMLElement | null | undefined>(undefined)
  if (prevFocusRef.current === undefined) {
    const el = document.activeElement
    prevFocusRef.current = el instanceof HTMLElement && !el.closest('.momo-pop') ? el : null
  }
  useEffect(
    () => () => {
      const el = returnFocus ? returnFocus() : prevFocusRef.current
      if (el instanceof HTMLElement && el.isConnected === true) el.focus()
    },
    // 挂载一次就钉住出栈焦点；returnFocus 是调用方的 inline 回调（每次渲染
    // 新引用），放进依赖会让「弹层开着时调用方一次无关重渲」也跑归还判定
    // （cleanup 不跑就不误还，restore 只在真 unmount 时发生）——ref 现读即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上
    [],
  )

  /**
   * BUG-109a：打开时把焦点收进对话框（tabIndex=-1 让它可接收）。焦点已经在
   * 浮层里就跳过：autoFocus 输入框在 commit 阶段取焦，早于这个 effect；重渲
   * 也不抢（依赖空数组，每个挂载只跑一次）。
   *
   * ref 是「局部 + 调用方 dialogRef」的合并：局部 ref 供本 effect 定位对话框，
   * 调用方那份（三个 free 浮层用它量宿主尺寸夹落点）原样转发。
   */
  const dialogElRef = useRef<HTMLDivElement | null>(null)
  const setDialogRef = useCallback(
    (el: HTMLDivElement | null): void => {
      dialogElRef.current = el
      if (typeof dialogRef === 'function') dialogRef(el)
      else if (dialogRef !== null && dialogRef !== undefined) (dialogRef as RefObject<HTMLDivElement | null>).current = el
    },
    [dialogRef],
  )
  useEffect(() => {
    const el = dialogElRef.current
    if (el !== null && !el.contains(document.activeElement)) el.focus()
  }, [])

  /**
   * BUG-128a：焦点陷阱。遮罩只是 `position:fixed` 的 div，对话框 `role="dialog"`
   * 却没有焦点约束——Tab 会走进遮罩**背后**的卡片按钮（点「加标签」→ 浮层开 →
   * 连按 Tab → Enter 把那张卡删进回收站）。这里在对话框上循环 Tab / Shift+Tab：
   * 焦点在对话框外、或已到首 / 末可聚焦元素时，绕回另一端。没有可聚焦元素时把
   * 焦点留在对话框本身（Esc 处理器挂在它上面，必须留得住）。
   */
  const trapTab: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Tab') {
      const root = dialogElRef.current
      if (root) {
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        if (focusables.length === 0) {
          e.preventDefault()
          root.focus()
        } else {
          const first = focusables[0]!
          const last = focusables[focusables.length - 1]!
          const active = document.activeElement
          const inside = active instanceof HTMLElement && root.contains(active)
          if (e.shiftKey) {
            if (!inside || active === first) {
              e.preventDefault()
              last.focus()
            }
          } else if (!inside || active === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    onKeyDown?.(e)
  }

  return (
    <>
      {/* 点面板外关闭（不写文件）；弹层本体 z-index 更高，点它不会命中这里 */}
      <div className="momo-pop-mask" onClick={onMaskClick} />

      <div
        ref={setDialogRef}
        className={`momo-pop ${variant === 'free' ? 'momo-pop-free' : 'momo-pop-below'}${
          hasHead ? '' : ' momo-pop-nohead'
        }`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        {/* 头部只在真有内容时渲染（同底栏的口径）：free 小浮层标题 meta 都不传，
            整行消失——36px 的空带会像被截断（理由见底栏注释）。 */}
        {hasHead && (
          <div className="momo-pop-head">
            <span className="momo-pop-meta">{meta}</span>
          </div>
        )}

        {children}

        {/* 底栏只在真有内容时渲染。排序浮层（TagSortMenu）没有任何底栏动作，
            恒渲染会多出一条 min-height 54 的空白带——浮层看着像被截断了。 */}
        {(footerLeft !== undefined || footerActions !== undefined) && (
          <div className="momo-pop-foot">
            {footerLeft}
            {footerActions}
          </div>
        )}
      </div>
    </>
  )
}
