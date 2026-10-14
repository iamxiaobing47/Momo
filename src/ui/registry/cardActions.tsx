// 卡片操作注册表（R8b 插槽化）：元信息行那排按钮 + 右键菜单项的唯一登记处。
// 原 CardActions.tsx 里五段写死的 JSX 与 CardContextMenu 里那一枚按钮收进这里，
// 消费侧只做「过滤 → map」。
//
// 门控形状**不统一**是刻意的（四种语义，统一成一种就会弄丢）：
//   ① readOnly 反向门——只读态才出现（唯一的打开入口，关掉会把用户锁在面板外）；
//   ② 三个 pref 门——showCardCopy / showCardTag / showCardDelete（默认 true =
//      升级前写死的行为；加标签 / 删除在多选批量条另有入口，复制没有）；
//   ③ 常驻无门——mappin「设地点」（地点是内容，每个入口都该够得着）；
//   ④ **trash 模式反向门**（v0.9.26）——回收站行按正常卡片渲染后，操作行换成
//      「恢复 / 彻底删除」：加标签 / 设地点 / 再删一次对已删的条目没有意义，
//      复制保留（正文照常可读）。
//
// feature 字段 = 这个动作归属哪个功能（R1b 锚定：必须是 FEATURES 里的真 id）——
// P5 广场的「分享」按钮会是这里第一条 feature: 'plaza.share' 的条目。
import type { JSX } from 'react'
import { copy } from '../../momo/i18n'
import { FEATURES } from '../../momo/core'
import type { MainMode, MomoCaps } from '../store'
import { Icon } from '../shared/icons'
import { CopyButton } from '../card/CopyButton'
import { purgeTrashItem, restoreTrashItem, trashNameOf } from '../card/trashActions'

/** 操作行的渲染上下文（= CardActionsProps 减去 isPinned； props 契约不变） */
export interface CardActionCtx {
  path: string
  content: string
  readOnly: boolean
  showCardCopy: boolean
  showCardTag: boolean
  showCardDelete: boolean
  /**
   * 当前模式（v0.9.26 起进 ctx）：trash 模式下操作行换成「恢复 / 彻底删除」，
   * 见文件头第 ④ 种门控。卡片本来就读 mode（算时间戳），顺手带下来即可。
   */
  mode: MainMode
  onLoc?: (path: string, x: number, y: number) => void
  /** 加标签（单条，见注册表里 addTag 的注释）：第二参 = 那颗按钮相对 `.momo-app`
   *  的落点（free 变体弹层用）。批量那一路不走这里（store 的 toggleTagPicker）。 */
  onTag?: (paths: string[], at?: { x: number; y: number }) => void
  caps: MomoCaps | null
}

export interface CardActionDef {
  id: string
  /** 归属功能（R1b 锚定到 FEATURES） */
  feature: string
  /** 显隐判定（四种门控形状见文件头） */
  visible: (ctx: CardActionCtx) => boolean
  render: (ctx: CardActionCtx) => JSX.Element
}

/** 右键菜单项的渲染上下文 */
export interface CardMenuCtx {
  path: string
  isPinned: boolean
  /** 点当前条目后的收尾（菜单自身在 CardContextMenu 里关） */
  onPick: () => void
}

export interface CardMenuActionDef {
  id: string
  feature: string
  render: (ctx: CardMenuCtx) => JSX.Element
}

/** 卡片操作行上那颗按钮的落点：换算成「相对 `.momo-app`」的偏移（free 变体弹层用）。
 *  「加标签」与「设地点」两颗共用一份——两颗弹层挂在同一排、同一套落点口径，
 *  各写一遍必然漂移（BUG-242 那族：落点口径只该有一个真源）。换算只需要按钮这一下，
 *  弹层自己再也不碰真实 DOM。量不到 `.momo-app`（理论上不会）时退回 (0,0) 兜底。 */
function buttonAnchor(btn: HTMLElement): { x: number; y: number } {
  const app = btn.closest<HTMLElement>('.momo-app')
  const rect = btn.getBoundingClientRect()
  const base = app?.getBoundingClientRect()
  return { x: rect.left - (base?.left ?? 0), y: rect.bottom - (base?.top ?? 0) }
}

const _CARD_ACTIONS = [
  {
    id: 'openInEditor',
    feature: 'notes',
    // 只读态专属：点击正文不跳转，「打开」只由它负责（不受三个开关管）
    visible: (c: CardActionCtx) => c.readOnly,
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act"
        aria-label={copy.card.openInEditor}
        onClick={(e) => {
          e.stopPropagation()
          c.caps?.openInEditor(c.path)
        }}
      >
        <Icon name="pencil" size={14} />
      </button>
    ),
  },
  {
    id: 'copy',
    feature: 'notes',
    visible: (c: CardActionCtx) => c.showCardCopy,
    render: (c: CardActionCtx) => <CopyButton content={c.content} />,
  },
  {
    id: 'addTag',
    feature: 'notes',
    // trash 模式不出：回收站的条目不会再进列表，加标签没有着落
    visible: (c: CardActionCtx) => c.showCardTag && c.mode !== 'trash',
    // 落点按「相对 .momo-app」换算后交给 store 的 openTagPicker（与下一颗 mappin
    // 同一路数，共用 buttonAnchor）：单卡弹层因此开在这颗按钮旁边，而不是顶栏
    // 锚点下——按钮在卡片上，锚点在顶栏，隔着半屏（用户报「偶尔距离卡片很远」）。
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act"
        aria-label={copy.card.addTag}
        onClick={(e) => {
          e.stopPropagation()
          c.onTag?.([c.path], buttonAnchor(e.currentTarget))
        }}
      >
        <Icon name="tag" size={14} />
      </button>
    ),
  },
  {
    id: 'setLocation',
    feature: 'notes',
    // 常驻第 4 颗（F3 起没有开关）。落点按「相对 .momo-app」换算后交给 store 的
    // openLocEditor——弹层自己再也不去摸真实 DOM（换算只需要按钮这一下）。
    // trash 模式不出（与 addTag 同一条理由：改写一条已删条目的元数据没有意义）。
    visible: (c: CardActionCtx) => c.mode !== 'trash',
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act"
        aria-label={copy.card.setLocation}
        onClick={(e) => {
          e.stopPropagation()
          const { x, y } = buttonAnchor(e.currentTarget)
          c.onLoc?.(c.path, x, y)
        }}
      >
        <Icon name="mappin" size={14} />
      </button>
    ),
  },
  {
    id: 'trash',
    feature: 'notes',
    // 单卡「删除到回收站」：非 trash 模式才出（回收站里再删一次没有意义，
    // 那一档的操作是下面的 restore / purge 两颗）
    visible: (c: CardActionCtx) => c.showCardDelete && c.mode !== 'trash',
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act momo-card-act-danger"
        aria-label={copy.common.delete}
        onClick={(e) => {
          e.stopPropagation()
          void c.caps?.trashMany([c.path])?.catch(() => {})
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    ),
  },
  {
    id: 'restore',
    feature: 'notes',
    // 回收站专属：恢复（可逆，无二次确认）。按**回收站文件名**递——entry.path
    // 是回收目录内的路径，name 就是它的 basename（见 trashNameOf）。
    visible: (c: CardActionCtx) => c.mode === 'trash',
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act"
        aria-label={copy.trash.restore}
        onClick={(e) => {
          e.stopPropagation()
          restoreTrashItem(trashNameOf(c.path))
        }}
      >
        <Icon name="reset" size={14} />
      </button>
    ),
  },
  {
    id: 'purge',
    feature: 'notes',
    // 回收站专属：彻底删除（不可逆，先过二次确认弹窗，见 purgeTrashItem）
    visible: (c: CardActionCtx) => c.mode === 'trash',
    render: (c: CardActionCtx) => (
      <button
        className="momo-card-act momo-card-act-danger"
        aria-label={copy.trash.purge}
        onClick={(e) => {
          e.stopPropagation()
          void purgeTrashItem(trashNameOf(c.path))
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    ),
  },
] as const satisfies readonly CardActionDef[]

const _CARD_MENU_ACTIONS = [
  {
    id: 'pin',
    feature: 'notes',
    render: (c: CardMenuCtx) => (
      <button
        type="button"
        role="menuitem"
        className={'momo-pop-menu-item' + (c.isPinned ? ' momo-pop-menu-item-on' : '')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={c.onPick}
      >
        <Icon name="pin" size={14} />
        <span>{c.isPinned ? copy.panel.unpin : copy.panel.pin}</span>
      </button>
    ),
  },
] as const satisfies readonly CardMenuActionDef[]

/**
 * 数组顺序即操作行顺序。
 * 列表 / 地点 / 回顾：pencil（只读态） / copy / tag / mappin / trash（v0.5 版面序）；
 * trash 模式：只剩 copy 与末尾两颗 restore / purge（其余按 mode 门控收起）。
 */
export const CARD_ACTIONS: readonly CardActionDef[] = _CARD_ACTIONS
/** 右键菜单项（当前只有置顶一枚；P5 起「分享到广场」会来这里） */
export const CARD_MENU_ACTIONS: readonly CardMenuActionDef[] = _CARD_MENU_ACTIONS

// R1b 补齐的 cardAction 半边锚定：注册表条目的 feature 必须是 FEATURES 里的真 id
// （premium 的分享按钮落地时会声明 'plaza.share'；拼错 = 编译不过）。
//
// 两个注册表**各锚一次**（BUG-224）：并成 `A | B` 一个联合时，两边含同一个 feature
// （菜单里的 'notes' 同时也在操作行里）会让那层联合出现重复成员，
// `no-duplicate-type-constituents` 报错；分开锚还各自说得出「是哪张表漏了」。
// `export` 只为消掉「defined but never used」（本仓 eslint 按 `^_` 忽略未用变量，
// 评审平台跑的那份配置没有这条忽略）：导出即「被使用」，拼错 feature id 照旧编译不过。
// 守卫本身一字未动。
type _AssertNever<T extends never> = T
type _ActionFeatureOf<T> = T extends { feature: infer F } ? F : never
type _UnknownActionFeatureOf<T> = Exclude<_ActionFeatureOf<T>, (typeof FEATURES)[number]['id']>
export type _EveryActionFeatureIsReal = _AssertNever<_UnknownActionFeatureOf<(typeof _CARD_ACTIONS)[number]>>
export type _EveryMenuActionFeatureIsReal = _AssertNever<_UnknownActionFeatureOf<(typeof _CARD_MENU_ACTIONS)[number]>>
