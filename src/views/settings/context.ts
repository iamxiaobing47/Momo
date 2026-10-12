import type { deferredRun, DeferredRun } from '../../momo/core'
import type { MomoService } from '../../momo/service'
import type { ColorScheme, MomoData, MomoSettings } from '../../momo/types'
import type { MomoHost, SectionId } from './sections'
import type { SettingsFields } from './fields'

// 各分页建造函数的共享上下文：display() 里那套闭包（setPref / deferral / card / row…）
// 收成一个对象传进去。这样每个分页都是 `(ctx) => void` 的纯建造函数，可以单独看、
// 单独改，不会出现「六个分页各写一套落盘路径」。

export interface SettingsCtx {
  /** main.ts 注入的能力：面板搬家（设置页改停靠侧时顺手搬过去） */
  host: MomoHost
  service: MomoService
  /** display() 那一刻的 prefs 快照（只读初值；写入一律走 service 现读，见各分页注释） */
  prefs: MomoData['prefs']
  /** 落盘 + 同步 store：service.savePrefs（合并 + persist）与 useUi.setState 一起 */
  setPref: (patch: Partial<MomoData['prefs']>) => void
  /** 连发控件专用：立即更新 service.data + store，persist 合并到最后一次（400ms） */
  setPrefLive: (patch: Partial<MomoData['prefs']>) => void
  /**
   * 目录 patch 的落盘闸门（v0.9.26 起，2026-10-04 加总闸）：先弹确认框把这次真正
   * 变了值的行列出来（行名 + 旧值 → 新值），用户点「确认修改」才继续；改的是笔记
   * 路径（root / notesDir）且盘上还有笔记会被甩在老位置时，接着再弹一次问
   * 「搬过去 / 只改路径 / 取消」。附件 / 回收目录不牵动笔记位置，只过前一个框。
   * 任何一环取消都当什么都没发生：调用方靠 onCancel 还输入框，卡片级恢复默认看到非
   * 'saved' 整体作废。
   * 卡片级「恢复默认」用它 + `hooks.onSaved` 重建界面。
   */
  commitDir: (patch: Partial<MomoSettings>, hooks?: DirHooks) => void
  /**
   * 笔记路径两行（root / 正文目录）专用：停顿 600ms 后走 commitDir（过同一道闸门）。
   * 载荷带 patch 与 hooks——「取消时把输入框还回已保存的值」只有那一行做得到。
   */
  debouncedNotesDir: () => DeferredRun<DirCommit>
  /** 整页重建（卡片级「恢复默认」的收尾：写完默认值让全部控件按新值重画，
   *  与卡片级「恢复默认」同一条路径——display() 开头会顺手撤掉还没落盘的输入） */
  rerender: () => void
  /**
   * 让**主面板**重算一次（写完笔记文件之后收尾用）。面板开着时它才是渲染真源，
   * 而 service 的 quiet 机制把批量写盘期间的 vault 事件整轮丢掉了——不补这一次，
   * 用户在设置页修完标签、面板上还是旧标签（与 caps 层批量操作收尾那次 refresh
   * 同一口径；面板没开时 store 的 refresh 本身就很轻，不额外判「开没开」）。
   */
  refreshPanel: () => Promise<void>
  /** 「停顿 / 失焦才落盘」的输入登记进当前批次；切分页 flush、重建前 cancel */
  deferral: <T>(ms: number, run: (value: T) => void) => DeferredRun<T>
  /**
   * 订阅偏好改动（**可视化预览**用）：任何一次 setPref / setPrefLive 之后回调一遍
   * （滑杆每帧也回调——预览重画是十几个 DOM 节点，比一次全库重读便宜几个量级）。
   *
   * 为什么不各写各的「set 完之后顺手 paint 一下」：设置页一半控件是 get/set 一对
   * 回调的形状，预览与控件分居两处，逐个接线必漏；而漏一处的表现正是用户报的
   * 「改了没动」。订阅制让预览与控件解耦——预览只认「偏好变了」，不认是哪个控件。
   */
  onPrefChange: (fn: () => void) => void
  /**
   * 附件 / 回收目录行（与笔记路径两行同一形状）：停顿 600ms 后过 applyDirSettings
   * 那道闸门。不牵动笔记位置所以问不到「搬不搬」，但确认框（2026-10-04 起）照样
   * 要过——这一页改的是 Momo 文件落在哪，改错附件 / 回收目录一样要人命。
   * 载荷 DirCommit 吃静默回退检测与行级 onSaved 回显（BUG-79a）。
   */
  debouncedSettings: () => DeferredRun<DirCommit>
  /**
   * 把 momo-theme-* 挂到设置页根上，整页令牌随方案切换。
   */
  applyScheme: (scheme: ColorScheme) => void
  /**
   * 建一张卡片（白底 + 1px 线 + r8，卡头下有一条分隔线）。
   * `section` 决定它跟哪一页一起显隐——**一页可以有多张卡**（v0.9.6：界面外观
   * 拆成配色 / 品牌 / 排版 / 卡片行为四张），id 只用来给 DOM 定位。
   * 传 `onReset` 时卡头右侧多一颗「恢复默认」（v0.9.12）：只复杂配置卡配，
   * 两数控行的「回顾与活跃度」不配——理由见字典 settingsPage.cardReset。
   */
  card: (
    section: SectionId,
    id: string,
    title: string,
    desc: string,
    opts?: { onReset?: () => void },
  ) => HTMLElement
  /** 一行：左文字列（名称 13/500 + 说明 12 + 补充 11），右控件列固定 260。
   *  desc 传空串 = 这一行没有说明（不建 .momo-set-desc 元素），2026-10-09 起的
   *  回收站路径行就是这种。 */
  row: (
    parent: HTMLElement,
    name: string,
    desc: string,
    opts?: { warn?: string; note?: string; wide?: boolean },
  ) => HTMLElement
  field: SettingsFields
}

export type { DeferredRun }
export type { deferredRun }

/** commitDir 的两个回调时机（都不附子，调用方按需给） */
export interface DirHooks {
  /** 用户在弹窗里按了取消：把输入框还回已保存的值，抹掉还没落盘的预览 */
  onCancel?: () => void
  /** 真的落盘 / 迁移成功后：卡片级「恢复默认」靠它重建界面 */
  onSaved?: () => void
}

/** debouncedNotesDir 的载荷：patch + 回调（输入框的引用只有那一行攥着，随 push 交出去） */
export interface DirCommit {
  patch: Partial<MomoSettings>
  hooks?: DirHooks
}
