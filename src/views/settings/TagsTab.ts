import { Notice } from 'obsidian'
import { copy } from '../../momo/i18n'
import { errMsg } from '../../momo/core'
import { defectiveTags, hasTagSpace, type DefectiveTag } from '../../momo/tags'
import { h } from './dom'
import type { SettingsCtx } from './context'

// ⑦ 标签：失效标签体检（用户要求「识别所有的失效标签，还能一键修复」）。
//
// 一张卡、一个动作：**找出含空白的标签，清掉空格**。判定与修法的口径全在
// momo/tags/tagHealth.ts（为什么只有这一类失效、为什么修法只有一种），这里只负责把
// 结果摊开、把动作接上 service。
//
// 两个设计决定值得写下来：
// - **空白必须画出来**。这类标签最常见的是全角空格（U+3000），在正文里就是一段
//   看得见留白的间隙——用户扫一眼根本看不出「哪里坏了」。所以行内的空白逐个换成
//   可见的开框空格标记（␣），并在右侧把修复后的样子原样摆出来：点之前就知道会改成
//   什么，不点也没关系。
// - **修不了的照实说**。`19 84` 清掉空格后是 `1984`，纯数字不是合法标签（写侧
//   normalizeTags 会把它整条丢掉）。这类行不给按钮，写清原因让人手工改名——
//   「点一下修复」绝不能等于「静默删掉我的标签」。
//
// 这张卡**没有**卡头「恢复默认」：它改的是笔记文件里的标签（用户数据，同
// pinnedNotes 一类），不是设置项；给一颗「恢复」它的按钮没有意义。

export function buildTagsTab(ctx: SettingsCtx): void {
  const tc = copy.settingsPage.tags
  // 品牌词（默认 Momo，用户可改名）：会写进 Notice 的摘要里都点它的名。
  // BUG-131d：取值函数而不是 display() 时的快照——改名后不重挂设置页也要现读。
  const brand = (): string => ctx.service.data.prefs.brandName
  const c = ctx.card('momo-set-tags', 'momo-set-tags-card', tc.title, tc.desc)

  const block = h('div', 'momo-set-block is-group is-defect')
  const head = h('div', 'momo-set-block-head')
  const headTitle = h('span', 'momo-set-block-title')
  const headNote = h('span', 'momo-set-block-note')
  head.append(headTitle, headNote)
  const acts = h('div', 'momo-set-tag-acts')
  const listBox = h('div', 'momo-set-tag-list')
  block.append(head, acts, listBox)
  c.append(block)

  /** 上一轮 paint 算出的清单：点「修复」时用它当「用户看到的那些」，不再重扫一遍 */
  let rows: DefectiveTag[] = []
  /** 本轮画出来的行内修复钮：每轮 paint 重建（连同 disabled 状态） */
  let rowBtns: HTMLButtonElement[] = []
  let busy = false

  const fixAll = ctx.field.actionButton(tc.fixAll, 'is-primary', () => void run())
  const rescan = ctx.field.actionButton(tc.rescan, 'is-ghost', () => void paint())
  // 建出来先禁掉：listEntries 是异步的，paint 回来才把清单与可用动作摆上桌
  fixAll.disabled = true
  rescan.disabled = true
  acts.append(fixAll, rescan)

  /** 修复期间把两颗全局钮与全部行内钮一并禁掉——连点两遍就写两遍盘 */
  const setBusy = (v: boolean): void => {
    busy = v
    fixAll.disabled = v
    rescan.disabled = v
    for (const b of rowBtns) b.disabled = v
  }

  /** 标签名：空白逐个换成可见标记，其余按原样（含大小写） */
  const buildName = (tag: string): HTMLElement => {
    const name = h('span', 'momo-set-tagrow-name')
    let buf = ''
    for (const ch of tag) {
      if (hasTagSpace(ch)) {
        if (buf !== '') {
          name.append(h('span', 'momo-set-tagrow-text', buf))
          buf = ''
        }
        name.append(h('span', 'momo-set-tagrow-ws', tc.wsMark))
      } else {
        buf += ch
      }
    }
    if (buf !== '') name.append(h('span', 'momo-set-tagrow-text', buf))
    return name
  }

  /** 一行失效标签：原样（含标出来的空白） | 修复后 | 条数 | 动作 */
  const buildRow = (d: DefectiveTag): HTMLElement => {
    const row = h('div', 'momo-set-tagrow')
    // 原样写法挂一份在 data 上：测试按它定位行，不必从「空白已换成标记」的文本反推
    row.dataset.tag = d.tag
    row.append(buildName(d.tag))
    row.append(
      h('span', `momo-set-tagrow-to${d.fix === null ? ' is-none' : ''}`, d.fix === null ? tc.unfixable : `${tc.arrow} ${d.fix}`),
      h('span', 'momo-set-tagrow-count', tc.count(d.notes)),
    )
    const rowActs = h('div', 'momo-set-tagrow-acts')
    if (d.fix !== null) {
      const btn = ctx.field.actionButton(tc.fix, 'is-ghost', () => void run([d.key]))
      btn.disabled = busy
      rowBtns.push(btn)
      rowActs.append(btn)
    }
    row.append(rowActs)
    return row
  }

  /** 重画清单。listEntries 是异步的，所以画之前先占位，回来再落数字与行。 */
  let seq = 0
  async function paint(): Promise<void> {
    const mine = ++seq
    headTitle.textContent = tc.scanning
    headNote.textContent = ''
    const found = defectiveTags(await ctx.service.listEntries())
    // 期间又起了一轮（重新检查 / 修复后重画）：这一轮的答案是过期快照，丢掉
    if (mine !== seq) return
    rows = found
    const notes = found.reduce((n, d) => n + d.notes, 0)
    headTitle.textContent = tc.blockTitle
    // 一个都没有：摘要行留空（那句话删了），空态那一句就立在列表位上
    headNote.textContent = found.length === 0 ? '' : tc.summary({ tags: found.length, notes }, brand())
    fixAll.disabled = busy || !found.some((d) => d.fix !== null)
    rescan.disabled = busy
    listBox.empty()
    // 行内按钮随行重建：连上一轮的 disabled 状态一起丢，别让它们跨轮攒着
    rowBtns = []
    if (found.length === 0) {
      listBox.append(h('div', 'momo-set-tag-empty', tc.empty))
      return
    }
    for (const d of found) listBox.append(buildRow(d))
  }

  /**
   * 修复：缺省 = 全库能修的都修，给了 keys = 只修点名的几个（行内那颗钮）。
   * 顺序是「写盘 → 面板重算 → 提示 → 重画清单」——提示先给结果，重画再把新盘面
   * 摆上桌（面板开着时它也得跟着更新：quiet 机制把批量期间的 vault 事件全丢了，
   * 与 caps 层批量操作收尾那一次 refresh 同一口径）。
   */
  async function run(keys?: readonly string[]): Promise<void> {
    if (busy) return
    const targets = rows.filter((d) => d.fix !== null && (keys === undefined || keys.includes(d.key)))
    if (targets.length === 0) return
    setBusy(true)
    const notes = targets.reduce((n, d) => n + d.notes, 0)
    try {
      const r = await ctx.service.squeezeTagSpaces(targets.map((d) => d.key))
      await ctx.refreshPanel()
      new Notice(
        keys === undefined
          ? tc.repaired({ tags: targets.length, notes, failed: r.failed }, brand())
          : tc.repairedOne({ tag: targets[0]!.tag, notes, failed: r.failed }),
      )
    } catch (e) {
      console.error('[Momo] 修复失效标签失败', e)
      new Notice(copy.errors.writeFailed(errMsg(e)))
    } finally {
      setBusy(false)
    }
    await paint()
  }

  void paint()
}
