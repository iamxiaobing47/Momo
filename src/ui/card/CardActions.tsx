import { Fragment, memo } from 'react'
import type { MainMode, MomoCaps } from '../store'
import { CARD_ACTIONS, type CardActionCtx } from '../registry/cardActions'

// 元信息行右侧那排操作按钮（复制 / 加标签 / 设地点 / 删除）：从 Card.tsx 拆出。
// R8b 起按钮收进 registry/cardActions.tsx 注册表（含四种门控形状与归属功能），
// 本文件只做「按 ctx 过滤 → map」——加一颗按钮改注册表，不再动这里。
// 复制 / 加标签 / 删除三枚的显隐由 prefs.showCardCopy / showCardTag /
// showCardDelete 控制（v0.9.22，设置页「卡片行为」可配，默认 true = 升级前写死的
// 行为）；「设地点」那颗 mappin 没有对应开关（F3 起就是常驻第 4 颗——地点是内容，
// 每个入口都该够得着它）。
// 只读浏览（prefs.readOnly）时多一枚「在 Obsidian 中打开」——只读态点击正文不跳转，
// 打开这件事只由它负责；它不受那三个开关管（关掉会把用户锁在面板外）。
// DOM 与交互逐字不变：四个按钮都 stopPropagation（多选态整张卡是勾选热区，
// 冒泡上去会变成「勾选」而不是「操作」）。
// 置顶**入口**不在这里：置顶走右键菜单（CardContextMenu），操作行只按 isPinned
// 决定要不要加高亮类（momo-card-actions-on）。

export interface CardActionsProps {
  /** 本条 Momo 的 vault 路径（打开编辑 / 删除 / 加标签的入口） */
  path: string
  /** 正文：复制按钮写入剪贴板的内容 */
  content: string
  /** 是否已置顶：只影响操作行高亮类，不含置顶开关本身 */
  isPinned: boolean
  readOnly: boolean
  /**
   * 右上角三枚操作按钮的显隐（v0.9.22，设置页「卡片行为」可配，默认 true）：
   * 只决定按钮出不出现——加标签 / 删除在多选批量条里仍有入口；复制没有第二个
   * 入口。只读态那枚「在 Obsidian 中打开」不受这里管（readOnly 开启后它是
   * 唯一的打开入口）。
   */
  showCardCopy: boolean
  showCardTag: boolean
  showCardDelete: boolean
  /**
   * 当前模式（v0.9.26）：trash 模式下注册表把操作行换成「恢复 / 彻底删除」
   * （见 registry/cardActions.tsx 的第 ④ 种门控）。卡片算时间戳时本来就订着
   * mode，这里只是顺着 CardMeta 透传下来。
   */
  mode: MainMode
  /** 设地点（单条，F3）：卡片操作行第 4 颗 mappin。x/y 由本组件按按钮位置
       换算成「相对 .momo-app」的偏移——弹层是 free 变体，落点夹取量的是宿主面板 */
  onLoc?: (path: string, x: number, y: number) => void
  /** 加标签（单条）：卡片操作行的「加标签」按钮 */
  onTag?: (paths: string[]) => void
  /** 能力由 App 层注入（ui/ 不 import obsidian）；由调用方从 store 传入，不在此订阅 */
  caps: MomoCaps | null
}

export const CardActions = memo(function CardActions(props: CardActionsProps): React.JSX.Element {
  const { isPinned } = props
  const ctx: CardActionCtx = props
  return (
    <div className={`momo-card-actions${isPinned ? ' momo-card-actions-on' : ''}`}>
      {CARD_ACTIONS.filter((a) => a.visible(ctx)).map((a) => (
        <Fragment key={a.id}>{a.render(ctx)}</Fragment>
      ))}
    </div>
  )
})
