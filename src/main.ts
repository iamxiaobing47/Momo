import { getLanguage, Notice, Plugin, WorkspaceLeaf } from 'obsidian'
import { MomoService } from './momo/service'
import { errMsg } from './momo/core'
import { parseInlineTags } from './momo/tags'
import { copy, getLocale, resolveLocale, setLocale } from './momo/i18n'
import { MomoView, VIEW_MOMO } from './views/views'
import { MomoSettingTab } from './views/settings'
import { COMMANDS, type CommandHost } from './views/commands'
import { attachmentPasteExtension } from './views/attachmentPaste'
import { useUi } from './ui/store'
import { removeFontVars } from './ui/shared/fontStyle'

// Momo插件入口：注册视图 / 命令 / Ribbon / 设置页 / vault 事件。
// 纯本地（ADR-001/002/003）：无网络、无 localStorage、无 AI；
// 文件是唯一事实源，data.json 只存软删登记、视图偏好与设置。

export default class MomoPlugin extends Plugin {
  service!: MomoService
  private unsubscribe: (() => void) | null = null
  /** N10：设置页实例（卸载时 flush 排着的目录输入 + persist 兜底） */
  private settingsTab: MomoSettingTab | null = null

  async onload(): Promise<void> {
    // 语言探测的唯一入口（分层：src/momo/i18n 不 import obsidian，所以 getLanguage()
    // 只能在 views/main 这层调）。必须早于视图与设置页构造——插件启动后不再切语言，
    // Obsidian 改界面语言本来也要重启。
    setLocale(resolveLocale(getLanguage()))

    // N09：AGENTS.md §8 禁 console.log。同一条许可了「console.debug + 构建时 tree-shake」，
    // 所以改 console.debug，并在 esbuild.config.mjs 里把它标成 pure（production 构建整条消失）。
    // 排查用途不变：确认 Obsidian 真正执行的是哪一份 main.js（换构建后只做「开关插件」
    // 有时仍跑旧模块，见 docs/requirements/overview.md §8 的构建小节）
    console.debug(`[Momo] loaded v${this.manifest.version}（编辑器 = Obsidian 原生）· 语言 ${getLocale()}`)
    this.service = new MomoService(this)
    try {
      await this.service.init()
    } catch (e) {
      // BUG-130a：init 里的读 / 写盘失败（data.json 只读、同步软件占用）不该让整个
      // 插件加载失败、界面上一句话都没有。记日志 + 一条 Notice，继续注册视图与事件——
      // 面板能起来，数据可能不全（比「插件根本不动」可控）。
      console.error('[Momo] 初始化失败，插件降级加载', e)
      new Notice(copy.errors.initFailed(errMsg(e)))
    }
    this.service.registerVaultEvents()

    // 界面语言的最终定夺（v0.9.x 起设置页可手动选）：prefs.lang 固定值优先；
    // 'auto'（默认）跟随 Obsidian。onload 顶部那次 setLocale 只是 init 前的兜底
    // （copy 在 data.json 读出来前就可能被读到）。改完立即生效，无需重启。
    const langPref = this.service.data.prefs.lang
    setLocale(langPref === 'auto' ? resolveLocale(getLanguage()) : langPref)

    // vault 事件 → 刷新 React 视图（索引随事件重建，不轮询）
    this.unsubscribe = this.service.onChange(() => void useUi.getState().refresh())

    // 首次安装播种（2026-10-13）：全新安装 + 库内一条 Momo 文件都没有 → 建一张
    // 欢迎卡（正文 / 标签 / 地点 = service/firstCard.ts 那三样常量，三语同一张）。
    // 挂在 init 之后（那时 settings / prefs 才是真的）。内容不随界面语言变，
    // 所以不依赖 setLocale 的时机；放在这里是因为它是「用户的第一条内容」，
    // 应该在设置就位、vault 事件已注册之后落盘。
    // 不 await：它只写一个文件，不该拖住插件加载；失败记日志、其余注册照旧
    // （与 init 失败的降级同一口径，BUG-130a）。两道闸（全新安装 / 库还空着）在
    // service.seedFirstCard 里，没事发生时它安静地返回 null。
    void this.service.seedFirstCard().catch((e) => {
      console.error('[Momo] 首次安装播种失败', e)
    })

    // 布局变化 → 记住面板被拖到哪一侧（只在「恰好一个面板」时记，避免搬家过程中的竞态）
    this.registerEvent(this.app.workspace.on('layout-change', () => this.rememberPanelSide()))

    this.registerView(VIEW_MOMO, (leaf) => new MomoView(leaf, this.service, this))

    // 首次安装 / 首次启用：布局就绪后自动把面板开在停靠侧（默认右栏），
    // 「装完插件就能看见 Momo」；只做这一次，之后由用户自己开关
    // （记账键 prefs.panelAutoOpened，裁决与口径见 types/entry.ts 的字段注释）。
    this.app.workspace.onLayoutReady(() => void this.autoOpenPanelOnce())

    // 命令面板 / Ribbon 里的品牌词：取用户设置的那个（默认「Momo」），不再写死。
    // BUG-131d 口径勘正：`addCommand` 的 name 是 Obsidian 的**静态字段**，改名后要
    // 重载插件（或重开面板）才更新——settings.md 的诚实说明写着这条。右键菜单没有
    // 这个约束（每次开菜单现建 item），所以它在回调里**现读** brandName（见下）。
    const brand = this.service.data.prefs.brandName

    // 编辑器右键菜单：选中一段 Markdown 源文本 → 存为 Momo
    // editor.getSelection() 返回原始源码（保留 ==高亮== / 列表 / 代码块等格式），
    // 原样写入新 Momo 文件，不做任何转换。
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection()
        if (!selection?.trim()) return
        menu.addItem((item) =>
          item
            .setTitle(copy.commands.saveSelection(this.service.data.prefs.brandName))
            .setIcon('notebook-pen')
            .onClick(async () => {
              try {
                await this.service.create(selection, parseInlineTags(selection))
                await useUi.getState().refresh()
              } catch {
                // 静默失败：不再弹出黑底白字提醒
              }
            }),
        )
      }),
    )

    // 功能区图标（v0.9.3 起固定内置 notebook-pen：自定义 Ribbon 图标的能力已
    // 移除——「上传自己的图片」迁移到设置 → 界面外观 → 左上角图标，侧栏那枚
    // 30px 的品牌标才是插件自己的脸）
    this.addRibbonIcon('notebook-pen', copy.commands.ribbon(brand), () => void this.openView())

    // 粘贴 / 拖放图片 → 存进 settings.attachmentsDir 并在正文写引用（作用域限
    // Momo 笔记，见 views/attachmentPaste.ts）。此前这条路完全没人走：正文是
    // Obsidian 原生编辑器写的，粘贴由 Obsidian 核心处理、只认它自己的
    // attachmentFolderPath，于是设置页「图片会复制到这个目录」是一句空承诺。
    this.registerEditorExtension(attachmentPasteExtension(this.service))


    // 命令面板（R6 插槽化）：四条命令收在 views/commands.ts 的 COMMANDS 注册表，
    // onload 只保留遍历注册——加一条命令改注册表，不再来这里手写。
    // 命令名仍在这里从 brandName 取一次（用户在设置里改名后命令名跟着走；名字是
    // brand 的函数，取一次的时机与原实现一致）。callback 闭包的本体能力经 host
    // 转交（注册表不反向 import main.ts）。
    const commandHost: CommandHost = {
      service: this.service,
      app: this.app,
      openView: () => this.openView(),
    }
    for (const def of COMMANDS) {
      this.addCommand({ id: def.id, name: def.name(brand), callback: () => void def.run(commandHost) })
    }

    // v1.0.0：内置开源字体退役（改用 Obsidian 自己的字体角色），不再注入 @font-face；
    // 「选了哪个角色」的变量注入在 ui/shared/fontStyle.ts，随偏好（App / 设置页）同步。

    // N10：留住设置页实例——卸载时要结算它手里还排着的输入（目录输入只 cancel，
    // 理由见 onunload——它们的落盘要先过人肉确认）
    this.settingsTab = new MomoSettingTab(this.app, this, this)
    this.addSettingTab(this.settingsTab)
  }

  onunload(): void {
    this.unsubscribe?.()
    // N07：撤掉还没跑的空白草稿清扫，卸载后 3s 内不再动 vault
    this.service.dispose()
    // 运行期写进四类宿主内联样式的字体变量随手撤掉：styles.css 那份由 Obsidian 撤，
    // 这份是我们自己 setCssProps 写的（禁用插件后不应再占着字体）。
    removeFontVars()
    // N10：setPrefLive 的 400ms 防抖窗口内重载，最后改动只活在内存里——卸载时补一次
    // persist。prefs 已经并进 service.data（persist 就够）；设置页还排着的普通输入
    //（品牌名一类）也要 flush，否则同样只活在内存。目录输入例外（BUG-111a 起用
    // cancelDirs 显式区分）：它们的落盘要先过 applyDirSettings 的确认框，卸载时
    // flush 等于弹出一个没人回答的框——而「没确认的路径改动」本来也不该写进盘。
    // （关设置窗 hide 是另一回事：那是 flush，与切分页同一条纪律。）与 N07 的
    // dispose 同一处收尾。
    this.settingsTab?.flushPendingSettings({ cancelDirs: true })
    void this.service.persist().catch((e) => console.error('[Momo] 卸载前保存偏好失败', e))
  }

  /**
   * 首次安装 / 首次启用时自动开一次面板（2026-10-13 用户要求「安装完插件后，
   * Momo 可以出现在右侧侧边栏」；「只开这一次」的裁决与理由见
   * types/entry.ts 的 prefs.panelAutoOpened 字段注释）。
   *
   * 跑在 onLayoutReady 之后：布局恢复已经走完，此刻 getLeavesOfType() 才答得出
   * 「用户上次就是开着退出的」——那种盘面只记账，不再开第二个叶子。
   * 停靠侧仍走 settings.panelSide（默认右栏 = 用户要的右侧；用户此前把面板拖到
   * 左边的话，这里尊重那一侧，不硬掰回右）。
   *
   * 记账落盘失败只记日志：面板已经开出来了、用户看得见，下次启动再试一次即可；
   * 为了记账把刚开出来的面板收回去才是真的糟。
   */
  private async autoOpenPanelOnce(): Promise<void> {
    if (this.service.data.prefs.panelAutoOpened) return
    try {
      if (this.app.workspace.getLeavesOfType(VIEW_MOMO).length === 0) await this.openView()
      await this.service.savePrefs({ panelAutoOpened: true })
    } catch (e) {
      console.error('[Momo] 首次自动打开面板失败', e)
    }
  }

  /**
   * 打开 Momo 面板：已经有面板就地显示 —— 不管它在左栏还是右栏，都不搬回去。
   * 只有不存在时才新建，落在设置里的停靠侧（默认右栏）。
   */
  private async openView(): Promise<void> {
    const { workspace } = this.app
    const existing = workspace.getLeavesOfType(VIEW_MOMO)[0]
    if (existing) {
      await workspace.revealLeaf(existing)
      return
    }
    const leaf = await this.createPanelLeaf(this.service.settings.panelSide)
    if (leaf) await workspace.revealLeaf(leaf)
  }

  /**
   * 在指定侧边栏新建一个 Momo 标签页。
   * ensureSideLeaf(split: false)：落在侧栏既有 Tab 列表里，与 文件 / 大纲 / 反向链接
   * 并列成列表之一；split: true 才会把侧栏拆成上下两窗、让插件独占一整块
   * （旧实现 getRightLeaf(true) 就是踩了这个坑）。
   * 声明面是 1.8.7（BUG-216），`ensureSideLeaf` 一定有；`typeof` 兜底留作**防御**
   * （宿主 API 被改 / 被 polyfill 掉时仍能开面板），不再是支持面承诺。
   */
  private async createPanelLeaf(side: 'left' | 'right'): Promise<WorkspaceLeaf | null> {
    const { workspace } = this.app
    if (typeof workspace.ensureSideLeaf === 'function') {
      return workspace.ensureSideLeaf(VIEW_MOMO, side, {
        split: false,
        active: true,
        // 显示统一交给 openView 里的 revealLeaf，这里只负责「取格 / 建格」
        reveal: false,
        state: { type: VIEW_MOMO, active: true },
      })
    }
    const leaf =
      (side === 'left' ? workspace.getLeftLeaf(false) : workspace.getRightLeaf(false)) ??
      workspace.getLeaf('tab')
    await leaf.setViewState({ type: VIEW_MOMO, active: true })
    return leaf
  }

  /** 面板现在停靠在哪一侧；主区标签页 / 弹出窗口返回 null。 */
  sideOf(leaf: WorkspaceLeaf): 'left' | 'right' | null {
    const { workspace } = this.app
    // 先问 getRoot()（侧边栏叶子的 root 就是左/右 split）
    const root = leaf.getRoot()
    if (root === workspace.leftSplit) return 'left'
    if (root === workspace.rightSplit) return 'right'
    // 兜底：沿 parent 链上溯（侧边栏里再分组时 getRoot() 不一定是 split 本身）
    let node: WorkspaceParentLike | null = leaf.parent
    while (node) {
      if (node === workspace.leftSplit) return 'left'
      if (node === workspace.rightSplit) return 'right'
      node = node.parent ?? null
    }
    return null
  }

  /**
   * 把已打开的面板整格搬到另一侧（标签页右键 / 命令面板 / 设置页三个入口共用）。
   * 同时把目标侧记进设置，让「关掉后再打开」也落在同一侧。
   */
  async moveViewTo(side: 'left' | 'right'): Promise<void> {
    const { workspace } = this.app
    const leaf = workspace.getLeavesOfType(VIEW_MOMO)[0]
    if (leaf) {
      const current = this.sideOf(leaf)
      // 主区标签页 / 弹出窗口是用户自己拖过去的，不擅自搬回侧边栏；已在目标侧则无事发生
      if (current && current !== side) {
        const next = await this.createPanelLeaf(side)
        if (next) {
          leaf.detach()
          await workspace.revealLeaf(next)
        }
      }
    }
    // BUG-133f：**先搬叶子再记侧别**，且记忆失败 best-effort。旧实现把
    // `await savePanelSide(side)` 放在最前——写盘失败（data.json 只读）经 link 抛给
    // 调用方被 `void` 丢弃 = unhandled rejection，而且面板**根本没搬**（落盘成了
    // 用户动作的前置条件）。记忆是锦上添花，不该阻塞搬家。
    try {
      await this.service.savePanelSide(side)
    } catch (e) {
      console.error('[Momo] 记住面板停靠侧失败', e)
      new Notice(copy.errors.prefsSaveFailed(errMsg(e)))
    }
  }

  /** 用户自己拖动面板后跟随（layout 变化时对比一次，值没变不写盘）。 */
  private rememberPanelSide(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_MOMO)
    if (leaves.length !== 1) return
    const side = this.sideOf(leaves[0])
    if (side)
      void this.service.savePanelSide(side).catch((e) => {
        // BUG-133f：rememberPanelSide 同款 void——补 catch，别留 unhandled rejection
        console.error('[Momo] 记住面板停靠侧失败', e)
      })
  }
}

/** 沿 parent 链上溯时的最小结构：Obsidian 的 WorkspaceParent 没有声明 parent，只能自备 */
type WorkspaceParentLike = { parent?: WorkspaceParentLike | null }

