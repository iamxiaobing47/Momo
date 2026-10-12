import { DEFAULT_SETTINGS, type MomoSettings } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { h } from './dom'
import type { DeferredRun, SettingsCtx } from './context'

// ① 文件路径：root 下分 notes / attachments / trash。
// 目录输入走 600ms 防抖才落盘（saveSettings 会清索引 + 全库重读），因此
// service.settings 在落盘前还是旧值——预览树读它的话会与输入框对不上（B 系列复查
// 「实际结构」陈显）。pendingDirs 收着还没落盘的 patch，预览合并。
//
// 落盘分两条路，但**两条都先过人肉确认**（v0.9.26 + 2026-10-04）：
//   root / 卡片存放路径 → ctx.debouncedNotesDir：停顿后先过 applyDirSettings 闸门一
//     （确认框列出变了哪几行，用户点「确认修改」才继续），闸门二是原有的迁移
//     三选一——还有笔记会被甩在老位置时问「搬过去 / 只改路径 / 取消」；
//   附件 / 回收站路径 → ctx.debouncedSettings：同样过闸门一（不牵动笔记位置，问不到
//     迁移），用户取消则输入框还回已保存的值（hooks.onCancel 由攥着 input 的本行现搭）。
// 用户要的是「这一页影响面大，修改必须手动点击确认才生效」——所以四行一视同仁，
// 没有哪一行能静默落盘。
//
// 四个目录键在各行的入参上写字面量，不用 `keyof MomoSettings`——`panelSide`
// 同样是 settings 的键，但它录的是 'left' | 'right'，落到这里会被 `String()`
// 写坏。

export function buildPathsTab(ctx: SettingsCtx): void {
  const p = copy.settingsPage.paths
  /** 品牌词（默认 Momo，用户可改名）：目录名 / 树预览里的品牌字样都吃它（BUG-105c 同族口径）。
   *  BUG-131d：**取值函数**而不是 display() 时的快照——用户在别页改名后不重挂设置页，
   *  目录行 / 树预览重画时要现读，否则同一次交互里 Notice 用新名、行标签还是旧名。 */
  const brand = (): string => ctx.service.data.prefs.brandName
  /** 四个目录行各自的防抖器：卡片级「恢复默认」时先把还没静默够的输入撤掉——
   *  否则那个 600ms timer 会在恢复默认落盘之后 fire，把输入值写回 service，
   *  静默覆盖刚恢复的默认值（B06；与 trash 行拒绝「.」开头时同一手法）。
   *  只收 `cancel` 这一个能力：两种载荷类型的防抖器都能进这个数组。 */
  const dirSaves: Array<Pick<DeferredRun<unknown>, 'cancel'>> = []
  // 卡头说明 2026-10-09 按用户裁定整段删除（「四类文件的落点…」）——四个目录行
  // 与「实际结构」预览就在卡里摆着，卡头不重复。desc 传空串即不建那个 <p>
  // （settings.ts 的 card 对空串的处理，同 panel / stats / review 三卡）。
  const c = ctx.card('momo-set-paths', 'momo-set-paths-card', p.title, '', {
    // 四个目录一把回默认。改 root / 正文目录可能把笔记甩在老位置，所以走
    // commitDir 那道闸门而不是裸 saveSettings：弹窗问「搬过去 / 只改路径 /
    // 取消」，搬过去才落盘 + 重建界面。取消 = 什么都没落盘、界面也不重建
    // （还没落盘的输入照旧挂在框里，与「打字后没等够 600ms」同一性质；这时候
    // 重建会顺手撤掉别的页签排着的输入，正是 B06 要防的那件事）。
    // saveSettings 会清索引 + 全库重读，与卡片级「恢复默认」同一代价。
    onReset: () => {
      for (const d of dirSaves) d.cancel()
      ctx.commitDir(
        {
          root: DEFAULT_SETTINGS.root,
          notesDir: DEFAULT_SETTINGS.notesDir,
          attachmentsDir: DEFAULT_SETTINGS.attachmentsDir,
          trashDir: DEFAULT_SETTINGS.trashDir,
        },
        { onSaved: () => ctx.rerender() },
      )
    },
  })

  const tree = h('pre', 'momo-set-tree')
  const pendingDirs: Partial<MomoSettings> = {}
  const paintTree = () => {
    const cur = { ...ctx.service.settings, ...pendingDirs }
    tree.textContent = [
      p.tree.root(cur.root || DEFAULT_SETTINGS.root),
      p.tree.notes(cur.notesDir || 'notes', brand()),
      p.tree.attachments(cur.attachmentsDir || 'attachments'),
      p.tree.trash(cur.trashDir || 'trash', brand()),
    ].join('\n')
  }

  /**
   * 提交落定后的**行级回显**（BUG-79a）：写盘侧的 sanitize / 冲突裁决可能把
   * 非法 / 冲突目录静默改回（`..`、notesDir 撞 trashDir）——Notice 由闸门统一发，
     这里把输入框还回**真实保存值**、抹掉这次改动的预览。没有这一步，输入框 /
     预览树挂着用户原值、data.json 里已是回退后的值，「重开设置页才发现设置
     自己变回去」正是当初的假反馈。
   */
  const resyncInput = (key: keyof MomoSettings, input: HTMLInputElement): (() => void) => {
    return () => {
      input.value = String(ctx.service.settings[key])
      delete pendingDirs[key]
      paintTree()
    }
  }

  /**
   * 笔记路径两行（root / 正文目录）：停顿后过 commitDir 闸门（见文件头）。
   * 「取消」要把输入框还回已保存的值、抹掉还没落盘的预览——这只有攥着 input
   * 的这一行做得到，所以 hooks 在这里现搭，随 push 交给 debouncedNotesDir。
   */
  const notesPathRow = (name: string, desc: string, key: 'root' | 'notesDir'): void => {
    const ctrl = ctx.row(c, name, desc)
    const save = ctx.debouncedNotesDir()
    dirSaves.push(save)
    const input = ctx.field.textInput(
      String(ctx.service.settings[key]),
      String(DEFAULT_SETTINGS[key]),
      (v) => {
        const next = v.trim() || String(DEFAULT_SETTINGS[key])
        // 一个分支一个字面量 patch。早先这里写成 `save({ [key]: next })`：
        // key 是联合类型时 TS 会把对象退化成 `{ [x: string]: string }` 而**不报错**，
        // 于是键一旦错配（或将来 settings 里多了布尔 / 联合字面量字段）只会在运行时裸崩。
        const patch: Partial<MomoSettings> = key === 'root' ? { root: next } : { notesDir: next }
        save.push({
          patch,
          hooks: {
            onCancel: () => {
              // 用户取消了，设置没有落盘：现读的 service.settings 正是「已保存
              // 的值」。把它写回输入框，同时抹掉这次改动的预览——只回滚输入框的
              // 话，预览树还挂着没落盘的新路径，与输入框两个状态打架。
              input.value = String(ctx.service.settings[key])
              delete pendingDirs[key]
              paintTree()
            },
            onSaved: resyncInput(key, input),
          },
        })
        Object.assign(pendingDirs, patch)
        paintTree()
      },
    )
    ctrl.append(input)
  }

  /** 附件 / 回收站路径两行：不牵动笔记位置，停顿后直接落盘（确认框照过，见
   *  applyDirSettings 闸门一）。`guard` 只有回收站路径用——「.」开头 Obsidian 不当
   *  索引目录，回收站会扫不到文件，那一刀在这里挡掉。两行都挂 onCancel：用户在
   *  确认框按取消时输入框与预览树一起还回已保存的值。
   *  desc 由调用方给、可缺（回收站路径 2026-10-09 起没有行说明）：空说明时
   *  ctx.row 不建 .momo-set-desc 元素，行里只剩名称与控件。 */
  const dirRow = (
    name: string,
    desc: string | undefined,
    key: 'attachmentsDir' | 'trashDir',
    opts?: { warn?: string; guard?: (v: string) => boolean },
  ): void => {
    const ctrl = ctx.row(c, name, desc ?? '', { warn: opts?.warn })
    const save = ctx.debouncedSettings()
    dirSaves.push(save)
    const input = ctx.field.textInput(
      String(ctx.service.settings[key]),
      String(DEFAULT_SETTINGS[key]),
      (v) => {
        const next = v.trim() || String(DEFAULT_SETTINGS[key])
        if (opts?.guard && !opts.guard(next)) {
          // 连带撤销上一轮还排着的落盘：只回滚输入框的话，那个值 600ms 后照样写进
          // data.json ——「已忽略本次修改」和「其实改了」会同时成立，用户无从判断。
          save.cancel()
          delete pendingDirs[key]
          input.value = String(ctx.service.settings[key])
          paintTree()
          return
        }
        save.push({
          patch: { [key]: next },
          hooks: {
            onCancel: () => {
              input.value = String(ctx.service.settings[key])
              delete pendingDirs[key]
              paintTree()
            },
            onSaved: resyncInput(key, input),
          },
        })
        Object.assign(pendingDirs, { [key]: next })
        paintTree()
      },
    )
    ctrl.append(input)
  }

  notesPathRow(p.root.name(brand()), p.root.desc, 'root')
  notesPathRow(p.notesDir.name(brand()), p.notesDir.desc(brand()), 'notesDir')
  dirRow(p.attachmentsDir.name, p.attachmentsDir.desc, 'attachmentsDir')
  // 回收站路径：以「.」开头会被 Obsidian 当成隐藏目录、不索引，回收站就扫不到文件
  dirRow(p.trashDir.name, undefined, 'trashDir', {
    warn: p.trashDir.warn,
    guard: (v) => !v.startsWith('.'),
  })

  const preview = h('div', 'momo-set-block is-preview')
  preview.append(h('div', 'momo-set-block-title', p.treeTitle), tree)
  c.append(preview)
  paintTree()
}
