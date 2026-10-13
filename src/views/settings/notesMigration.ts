import { Modal } from 'obsidian'
import type { App } from 'obsidian'
import { copy } from '../../momo/i18n'

// 改笔记路径前的询问弹窗（v0.9.26，设置页「存放路径」落盘前最后一道闸）。
//
// 为什么不复用 caps 的 openConfirmModal：那是「是 / 否」两态，这里有三态——
// 搬过去 / 只改路径 / 取消。「否」具体是哪种否（改路径但文件不动，还是这次
// 修改不算数）必须让用户自己说，二值框只能替他猜一个。
//
// 视觉完全复用确认弹窗那一套（.momo-confirm + 配色类 + .momo-pop-btn 三件套），
// 不新造 CSS：三颗按钮都是浮层骨架里已有的类，「搬过去」照主动作实底 accent。
// resolve 恰好一次：三个按钮各一条路，Esc / 点遮罩走 modal.onClose 兜底成
// 「取消」（与 openConfirmModal 同口径——关掉不是默许，是「当什么都没发生」）。
//
// 两个框的分工（2026-10-04 加 askDirChange 之后）：
//   askDirChange     —— 所有目录改动的**总闸**，附件 / 回收目录也过它；
//   askNotesMigration —— 只在总闸放行后追加一间「笔记搬不搬」，没有笔记会被
//                       甩下时根本不出现。

/** 用户对「迁不迁」的答复 */
export type NotesMigrationChoice = 'migrate' | 'keep' | 'cancel'

/** 弹窗要知道的三件事（service.notesRelocation 的返回值直接喂进来） */
export interface NotesMigrationInfo {
  /** 老正文目录（vault 相对路径） */
  from: string
  /** 新正文目录（vault 相对路径） */
  to: string
  /** 还留在老位置的笔记条数（> 0 才会弹这个框） */
  count: number
}

/**
 * 弹出「迁移笔记吗？」并等待用户选择。
 *
 * `colorScheme` 让弹窗跟随用户选的配色（caps 的确认弹窗同一手法：Modal 挂在
 * body 下拿不到 .momo-app 的令牌，共享令牌块挂在 .momo-confirm 上，配色类再
 * 挂一层）。设置页这一侧现成就有 `prefs.colorScheme`，直接传。
 *
 * 2026-10-10 起没有头部标题（BUG-160：用户「所有的 dialog，左上角都不要有标题」）：
 * 问句由提示句与三颗按钮自己说清（「搬过去」/「只改路径」正对着那个问题），
 * 头顶再放一行标题是同一句话的第二遍。
 */
export function askNotesMigration(
  app: App,
  info: NotesMigrationInfo,
  colorScheme: string,
): Promise<NotesMigrationChoice> {
  return new Promise<NotesMigrationChoice>((resolve) => {
    let settled = false
    const done = (v: NotesMigrationChoice): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const c = copy.dialog.notesMigrate
    const modal = new Modal(app)
    modal.modalEl.addClass('momo-confirm')
    modal.modalEl.addClass(`momo-theme-${colorScheme}`)
    // 遮罩浓度规则（20-panel/060-trash.css）判的是 containerEl 上的合成类——
    // 要改 .modal-bg 而它是 .modal 的兄弟节点，旧实现靠 `:has` 从后代反查祖先，
    // BUG-227 按评审去 :has 后改为建窗时主动挂类（四个弹窗各自挂）。
    modal.containerEl.addClass('momo-confirm-container')
    modal.contentEl.createEl('p', { text: c.hint(info), cls: 'momo-confirm-message' })
    const actions = modal.contentEl.createDiv('momo-confirm-actions')
    const acts = actions.createDiv('momo-confirm-acts')
    const cancel = acts.createEl('button', { text: copy.common.cancel })
    cancel.addClass('momo-pop-btn')
    cancel.addEventListener('click', () => {
      done('cancel')
      modal.close()
    })
    // 次动作：只落盘新路径，文件原地不动（用户打算自己在 Obsidian 里搬）
    const keep = acts.createEl('button', { text: c.keep })
    keep.addClass('momo-pop-btn')
    keep.addEventListener('click', () => {
      done('keep')
      modal.close()
    })
    // 主动作：文件 + 回收站登记 + 置顶一起搬，再落盘新路径
    const migrate = acts.createEl('button', { text: c.migrate })
    migrate.addClass('momo-pop-btn')
    migrate.addClass('momo-pop-btn-primary')
    migrate.addEventListener('click', () => {
      done('migrate')
      modal.close()
    })
    modal.onClose = () => done('cancel')
    modal.open()
    // 默认聚焦主动作（与 openConfirmModal 的非危险路径一致）：这个选择不危险，
    // 三个按钮都写明了后果，回车交给概率最大的那个答案。
    migrate.focus()
  })
}

/** 确认框要列的一行改动：行名 + 旧值 → 新值（service.settings 的现读与 patch 比对出来） */
export interface DirChangeRow {
  name: string
  from: string
  to: string
}

/**
 * 弹出「确认修改存放路径？」并等待用户确认（2026-10-04，用户要求：存放路径这一页
 * 影响面大，任何修改都必须手动点击确认才生效）。
 *
 * 与 askNotesMigration 是两个框不是合成一个：本框管「这次改动算不算数」（列清
 * 变了哪几行、旧值新值），迁移框管「笔记搬不搬」。合成一个会逼出四颗按钮，
 * 而多数改动（附件 / 回收目录、绕回原值附近的小改）根本问不到迁移那一步。
 *
 * 同样不复用 caps 的 openConfirmModal（二值框列不了 N 行改动），视觉走同一套
 * .momo-confirm 骨架，「确认修改」照主动作实底 accent；Esc / 遮罩兜底成取消
 * ——关掉不是默许。
 *
 * 2026-10-10 起没有头部标题（BUG-160）：问句由提示句 + 那几行改动 + 「确认修改」
 * 按钮说清，头顶再放一行是同一句话的第二遍。
 */
export function askDirChange(
  app: App,
  rows: readonly DirChangeRow[],
  colorScheme: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const c = copy.dialog.dirChange
    const modal = new Modal(app)
    modal.modalEl.addClass('momo-confirm')
    modal.modalEl.addClass(`momo-theme-${colorScheme}`)
    modal.containerEl.addClass('momo-confirm-container')
    modal.contentEl.createEl('p', { text: c.hint, cls: 'momo-confirm-message' })
    const list = modal.contentEl.createDiv('momo-confirm-rows')
    for (const r of rows) {
      list.createDiv({ cls: 'momo-confirm-row', text: c.row(r.name, r.from, r.to) })
    }
    const actions = modal.contentEl.createDiv('momo-confirm-actions')
    const acts = actions.createDiv('momo-confirm-acts')
    const cancel = acts.createEl('button', { text: copy.common.cancel })
    cancel.addClass('momo-pop-btn')
    cancel.addEventListener('click', () => {
      done(false)
      modal.close()
    })
    const ok = acts.createEl('button', { text: c.confirm })
    ok.addClass('momo-pop-btn')
    ok.addClass('momo-pop-btn-primary')
    ok.addEventListener('click', () => {
      done(true)
      modal.close()
    })
    modal.onClose = () => done(false)
    modal.open()
    ok.focus()
  })
}
