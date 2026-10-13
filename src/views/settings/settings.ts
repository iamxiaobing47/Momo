import { Notice, Plugin, PluginSettingTab, type App } from 'obsidian'
import type { MomoService } from '../../momo/service'
import { deferredRun, errMsg, type DeferredRun } from '../../momo/core'
import { useUi } from '../../ui/store'
import { copy } from '../../momo/i18n'
import {
  COLOR_SCHEMES,
  DEFAULT_BRAND_NAME,
  type ColorScheme,
  type MomoData,
  type MomoSettings,
} from '../../momo/types'
import { h, iconSvg, arrowNav } from './dom'
import { applyFontVars, syncFontStyle } from '../../ui/shared/fontStyle'
import { SECTION_TABS } from './tabs'
import { SECTION_IDS, type MomoHost, type SectionId } from './sections'
import type { DirCommit, DirHooks, SettingsCtx } from './context'
import { askDirChange, askNotesMigration, type DirChangeRow } from './notesMigration'
import * as field from './fields'

// Momo 设置页（v0.8 重设计 · v0.9.6 按设计稿重绘）：视觉 / 配色 / 排版 / 组件
// 全部对齐主面板设计体系；版式与元件尺寸逐项读自 Ardot「Momo 设置 · 界面外观
// 重设计」帧 ①，颜色一律走 --momo-* 令牌（设计稿画在雾蓝方案下，硬抄它的
// #1A73E8 会让另外三套配色方案里出现一根蓝线）。
//
// 为什么不用 Obsidian 原生 `new Setting()`：原生行是「左文字 + 右控件」的灰底条，
// 靠 !important 去改它的 padding / 边框 / 背景既脆又难维护；而且这里一半的行需要
// 原生没有的元件（分段控件 / 步进器 / 开关网格 / 区块 chip），改成原生再覆盖反而更绕。
// 所以整页自建 DOM，类名一律 `momo-set-*`，令牌一律 `var(--momo-*)`——
// 配色方案一换，设置页跟着主面板一起变。
//
// 取值的唯一真源是设计稿（Ardot「Momo 配置页重设计」帧 ①）与 styles.css 的令牌，
// 不在本文件里新造任何色值 / 字号 / 圆角。
//
// 拆分：本文件只剩**编排**（display() 把七个分页的建造函数跑一遍），具体的行与
// 控件在各 Tab 文件里：
//   sections.ts 分页定义与默认值 · dom.ts DOM 基建 · fields.ts 控件库
//   PathsTab / LookTab / PanelTab / ReviewTab / StatsTab / LocTab / TagsTab 各一页

export type { MomoHost } from './sections'
export { PREFS_DEFAULTS, SECTION_IDS, sectionLabel } from './sections'
export type { SectionId } from './sections'

/** 目录 patch 落盘的结局：落盘了 / 用户取消 / 失败（调用方据此决定要不要继续） */
type DirOutcome = 'saved' | 'cancelled' | 'failed'

/** 目录类输入停顿多久才落盘：saveSettings 会清索引缓存 + 全库重读 + 整列表重渲，
 *  跟着每个按键跑一遍既卡面板，输入到一半的临时路径还会让列表闪空。手改路径与
 *  「恢复默认」共用这一个数。 */
const DIR_DEBOUNCE_MS = 600

/**
 * 目录 patch 的落盘路径（v0.9.26 起两道闸，2026-10-04 起第一道是所有改动的总闸）：
 * ① `askDirChange`：这次 patch 里真正变了值的行逐个列出来（行名 + 旧值 → 新值），
 *    用户点「确认修改」才继续；取消 = 当什么都没发生（调用方还输入框、卡片级
 *    「恢复默认」则整套作废）。附件 / 回收目录一样过——它们不牵动笔记位置，但改错一样要人命。
 *    一个行都没变时不弹（绕回原值、当前正是默认值时的「恢复默认」）；
 * ② 有笔记会被甩在老位置时再弹一次「搬过去 / 只改路径 / 取消」，按选择搬（连回收站
 *    登记、置顶一起）或只落路径。
 *
 * 为什么放在模块层：display() 里的 ctx 与卡片级「恢复默认」都要过这道闸门，
 * 落盘逻辑收在模块层两边才共用同一份。
 */
/** BUG-79a：目录行名（写盘侧静默回退的 Notice 要点名是哪一行）。panelSide 是
 *  枚举不是目录输入，不在这张表里（也不会走 notifyDirReverts 的字符串比对）。
 *  行名里可能带品牌词（BUG-105c 同族：`Momo 根目录` → `<品牌> 根目录`），
 *  所以每项吃一个 brand 入参；不带品牌的两行写作零参闭包（可赋值）。 */
const DIR_ROW_NAME: Partial<Record<keyof MomoSettings, (brand: string) => string>> = {
  root: (brand) => copy.settingsPage.paths.root.name(brand),
  notesDir: (brand) => copy.settingsPage.paths.notesDir.name(brand),
  attachmentsDir: () => copy.settingsPage.paths.attachmentsDir.name,
  trashDir: () => copy.settingsPage.paths.trashDir.name,
}

/**
 * BUG-79a：写盘侧的 sanitize / 冲突裁决会**静默**把非法目录（`..` / `.`）与
 * 互撞目录（notesDir === trashDir）改回合法值——提交值与落盘值从此分叉，输入框
 * 与预览树还挂着用户原值，重开设置页才发现「设置自己变回去」。这里逐键比对，
 * 有出入就 Notice 点名；输入框 / 预览树的回显由行级 onSaved（PathsTab）负责。
 */
/**
 * 这个 patch 里**提交值与盘上值分叉**的目录键（L5）。
 * 三个条件（两边都是字符串 ∧ 值不同 ∧ 这一行有名字）曾经在 `notifyDirReverts` 与
 * `changedDirRows` 里各抄一遍，注释写着「必须一致」却没有机关保证——下一个给目录行
 * 加条件的人只改一边，症状是「框里没列、Notice 却点名」，两头都对不上。收成一份。
 */
function divergedDirKeys(patch: Partial<MomoSettings>, settings: MomoSettings): Array<keyof MomoSettings> {
  const keys: Array<keyof MomoSettings> = []
  for (const key of Object.keys(patch) as Array<keyof MomoSettings>) {
    const wanted = patch[key]
    const saved = settings[key]
    if (typeof wanted === 'string' && typeof saved === 'string' && wanted !== saved && DIR_ROW_NAME[key]) {
      keys.push(key)
    }
  }
  return keys
}

function notifyDirReverts(service: MomoService, patch: Partial<MomoSettings>): void {
  for (const key of divergedDirKeys(patch, service.settings)) {
    new Notice(copy.settingsPage.paths.revertedNotice(DIR_ROW_NAME[key]!(service.data.prefs.brandName)))
  }
}

/**
 * 这次 patch 里**真正变了值**的目录行（确认框要列的内容）。
 * 判据走 `divergedDirKeys`——与发 Notice 那一边同一把尺（见上）。
 */
function changedDirRows(
  patch: Partial<MomoSettings>,
  settings: MomoSettings,
  brand: string,
): DirChangeRow[] {
  return divergedDirKeys(patch, settings).map((key) => ({
    name: DIR_ROW_NAME[key]!(brand),
    from: String(settings[key]),
    to: String(patch[key]),
  }))
}

async function applyDirSettings(
  app: App,
  service: MomoService,
  patch: Partial<MomoSettings>,
  hooks: DirHooks | undefined,
): Promise<DirOutcome> {
  // 闸门一（2026-10-04，用户要求「存放路径的改动必须手动确认才生效」）：这一页
  // 改的是 Momo 文件落在哪，影响面大，所以任何一次落盘前先把变了哪几行列清楚，
  // 让用户点「确认修改」。取消了就原样返回——输入框 / 预览树的回滚由行级
  // onCancel 做（PathsTab 四行都挂了），卡片级「恢复默认」则由调用方看到非 'saved' 整体作废。
  const changed = changedDirRows(patch, service.settings, service.data.prefs.brandName)
  if (changed.length > 0) {
    const ok = await askDirChange(app, changed, service.data.prefs.colorScheme)
    if (!ok) {
      hooks?.onCancel?.()
      return 'cancelled'
    }
  }
  // 闸门二（v0.9.26）：还有笔记会被甩在老位置时，再问一次「搬不搬」
  const info = service.notesRelocation(patch)
  if (info.count === 0) {
    try {
      await service.saveSettings(patch)
      notifyDirReverts(service, patch)
      return 'saved'
    } catch (e) {
      console.error('[Momo] 保存目录设置失败', e)
      new Notice(copy.errors.prefsSaveFailed(errMsg(e)))
      // BUG-148：写盘失败也意味着「设置没有落盘」，与取消同类——输入框 / 预览树
      // 必须回滚（旧实现只在 'cancelled' 分支调 onCancel，'failed' 被当成已处理）。
      hooks?.onCancel?.()
      return 'failed'
    }
  }
  const choice = await askNotesMigration(app, info, service.data.prefs.colorScheme)
  if (choice === 'cancel') {
    hooks?.onCancel?.()
    return 'cancelled'
  }
  try {
    if (choice === 'migrate') {
      const r = await service.migrateNotes(patch)
      if (r.moved > 0) new Notice(copy.settingsPage.paths.migrated(r.moved))
      // BUG-111b：migrate 出口同样要过回退检测——它与直存（上面 count===0 那支）
      // 和 keep（下面那支）是同一批「提交值与盘上值分叉」的出口（sanitize 在
      // migrateNotes 内部照样生效，非法值一样落成默认值）。三个出口里只有这里
      // 漏了：选「搬过去」的用户只见「已把 N 条笔记搬到新目录」，脚上其实已回退。
      notifyDirReverts(service, patch)
      // 置顶笔记与回顾展示记录跟着改路：service 已经把两个键按新路径迁好（随这次
      // saveSettings 一起落盘），这里把它们推进 store——面板开着时 store 才是
      // 渲染真源，不推的话下一轮 refresh 的自愈会按旧路径把置顶 / 已回顾记录
      // 静默剔掉（pinnedNotes 自 v0.8.3 起推，BUG-162 补上 reviewSeen）。
      // 两个键都是**换引用**迁移（trash 登记是原地改路，不用推），且 reviewSeen 的
      // 改路在 movers 为空时也跑（BUG-130b/c）——故不做 renamed.size 判断，无条件推。
      useUi.setState({
        pinnedNotes: service.data.prefs.pinnedNotes,
        reviewSeen: service.data.prefs.reviewSeen,
      })
    } else {
      await service.saveSettings(patch)
      notifyDirReverts(service, patch)
    }
    return 'saved'
  } catch (e) {
    // migrateNotes 抛的已是本地化文案（notesMigrateFailed，带「已搬回原处」的
    // 回滚说明），直接透传；savePrefs 那一路失败也走同一把尺子。
    console.error('[Momo] 保存目录设置失败', e)
    new Notice(errMsg(e))
    // BUG-148：同直存分支——'failed' 也要回滚输入框 / 预览树。
    hooks?.onCancel?.()
    return 'failed'
  }
}

/** debouncedNotesDir 落定后的收尾：真的落盘了才跑 onSaved（重建界面） */
const afterDirCommit = (outcome: DirOutcome, hooks: DirHooks | undefined): void => {
  if (outcome === 'saved') hooks?.onSaved?.()
}

export class MomoSettingTab extends PluginSettingTab {
  /**
   * 当前停在哪一页。`MomoSettingTab` 在插件生命周期内只有一个实例
   * （main.ts 里 `addSettingTab(new MomoSettingTab(...))` 一次性建），所以关掉设置
   * 弹窗再打开仍停在刚才那一页——不必为它往 data.json 里多塞一个偏好字段。
   */
  private activeSection: SectionId = SECTION_IDS[0]

  /** 当前这一批 display() 登记的「停顿才落盘」输入。切换分页 flush、重建前 cancel、
   *  卡片级「恢复默认」开头 cancel——否则用户输入后 600ms 内点它 / 关掉设置再打开，
   *  旧 timer 照常 fire，把输入值写回 service，静默覆盖刚恢复的默认值（B06）。 */
  private pendingDeferrals: Array<Pick<DeferredRun<unknown>, 'flush' | 'cancel'>> = []

  /** 上面那批里**目录输入**的几个（debouncedNotesDir / debouncedSettings 造出来的）。
   *  单独记一份：仅插件卸载兜底（flushPendingSettings 的 cancelDirs）时它们只
   *  cancel 不 flush——落盘要过人肉确认；关窗 / 切页照常 flush，见 flushPendingSettings。 */
  private pendingDirCommits: Array<Pick<DeferredRun<unknown>, 'cancel'>> = []

  /** N10 / BUG-111a：把当前批次还排着的输入立刻结算。setPrefLive 的 prefs 改的是
   *  service.data，persist 兜底就够；但普通文本输入（品牌名一类）走 deferral，
   *  patch 要几百 ms 后才交回 service。
   *
   *  目录输入的两种结算语义（2026-10-07 拆分，BUG-111a）：
   *  - 默认（关设置窗 hide / 收尾）：与切分页同一条纪律，**照样 flush**——用户
   *    裁定「关设置窗时目录输入应 flush」。确认框紧跟关闭弹出，落盘发生在用户
   *    刚改完路径的上下文里；cancel 会把刚打完的路径悄悄丢掉，重开设置页又见
   *    旧值，那是另一种假反馈（hide 的注释早就这么写，此前实现的 cancel 与它打架）。
   *  - `{ cancelDirs: true }`（仅插件卸载 onunload）：目录输入只 cancel 不 flush。
   *    卸载时 flush 等于弹出一个没人回答的确认框；而「没确认的路径改动」本来
   *    也不该写进盘。 */
  flushPendingSettings(opts?: { cancelDirs?: boolean }): void {
    const dirs = new Set<unknown>(this.pendingDirCommits)
    for (const d of this.pendingDeferrals) {
      if (opts?.cancelDirs && dirs.has(d)) d.cancel()
      else d.flush()
    }
    this.pendingDeferrals = []
    this.pendingDirCommits = []
  }

  /** BUG-79b：设置弹窗**关闭**时结算未静默够的输入。旧实现既不 flush 也不
   *  cancel——600ms 防抖 timer 在弹窗关闭后照常 fire，「改完笔记路径 600ms 内
   *  关设置，迁移确认框凭空弹在主界面上」。flush 让提交紧跟关闭发生（迁移询问
   *  出现在用户刚改完路径的上下文里），与切分页统一 flush 是同一条纪律（B06）；
   *  cancel 会把用户刚打完的路径悄悄丢掉，回开设置页又见旧值，那是另一种假反馈。
   *  已执行落盘的那轮 flush 是空操作，与 switchTab 的 flush 叠加无副作用。
   *  BUG-111a（2026-10-07）：这段语义此前名不副实——flushPendingSettings 自
   *  2026-10-04 起只 cancel 目录输入，hide 跟着一起被带上（关窗 = 悄悄丢输入，
   *  正是本注释说的假反馈）。现在目录输入默认 flush，cancel 只留给卸载。 */
  hide(): void {
    this.flushPendingSettings()
  }

  /** 全部撤销当前批次的 pending 输入（重建前 / 恢复默认前；已执行落盘的那轮撤不回来） */
  private cancelDeferrals(): void {
    for (const d of this.pendingDeferrals) d.cancel()
    this.pendingDeferrals = []
  }

  constructor(
    app: import('obsidian').App,
    plugin: Plugin,
    private host: MomoHost,
  ) {
    super(app, plugin)
  }

  display(): void {
    // B06：上一批 display()（用户关掉设置再打开 / 卡片级「恢复默认」后的重建之前）留下的 pending
    // 输入作废——输入框都要重建了，旧 timer 再 fire 只会把上一页的值写回 service
    this.cancelDeferrals()
    const { containerEl } = this
    containerEl.empty()
    containerEl.addClass('momo-settings')

    const service = this.host.service
    // 视图偏好（prefs）的初值以 service.data 为准（store 在面板没开时可能是旧值）
    const prefs = service.data.prefs

    // 字体变量（BUG-217）：设置页根是四类宿主之一，而令牌块在 .momo-settings 上自己
    // 声明了 --momo-sans 本体——用户的字体选择必须写成这个宿主上的**内联**变量才压得过。
    // 两件事一起做：① syncFontStyle 把盘上的值记成模块级当前值（面板可能压根没开过，
    // currentVars 还是空的）并穿给所有已在文档里的宿主；② 本容器无论挂没挂上文档都领
    // 一份，别指望 ① 的 querySelectorAll 找得到它（设置页 DOM 测试里就不在文档里）。
    syncFontStyle({ uiFont: prefs.uiFont, cardFont: prefs.cardFont })
    applyFontVars(containerEl)

    /** 偏好改动的订阅表（v0.9.32 可视化预览）：setPref / setPrefLive 落库后各通知一遍。
     *  预览块与控件解耦——它只认「偏好变了」，不认是哪个控件改的（见 context.ts）。 */
    const prefSubs = new Set<() => void>()
    const notifyPrefs = (): void => {
      for (const fn of prefSubs) fn()
    }

    /** 偏好统一走这条路径：service.data（持久化）与 useUi store（面板渲染）同时更新。
     *  不走 setPrefs（那会经 caps 再 persist 一次）；也不走 saveSettings（那会清索引全库重读）
     *  ——纯 UI 偏好不值得付全库重读的代价。
     *
     *  N08：savePrefs 的 Promise 必须接住。这里的路径**绕过** caps.savePrefs 的
     *  catch → Notice 处理，一旦 data.json 写失败（只读分区 / 磁盘满 / 文件被占用），
     *  `useUi.setState(patch)` 已经乐观更新：面板显示「已改」、控制台多一条
     *  unhandled rejection、重载后从盘上回退——正是 N08 要消灭的「UI 显示已改、
     *  重载后回退」。提示文案与 caps 同一把尺子（copy.errors.prefsSaveFailed）。 */
    const setPref = (patch: Partial<MomoData['prefs']>): void => {
      void service.savePrefs(patch).catch((e) => {
        console.error('[Momo] 保存偏好失败', e)
        new Notice(copy.errors.prefsSaveFailed(errMsg(e)))
      })
      useUi.setState(patch)
      notifyPrefs()
    }

    /** 本次 display() 里所有「停顿 / 失焦才落盘」的输入。切换分页时统一 flush —— 见 switchTab。
     *  这里只收 `flush`：deferrals 要装 payload 类型各不相同的 DeferredRun，
     *  收的是 flush 这一个能力，所以不必为此引入任何类型断言。 */
    const deferrals: Array<Pick<DeferredRun<unknown>, 'flush' | 'cancel'>> = []
    this.pendingDeferrals = deferrals
    /** 目录输入那几个防抖器另记一份：卸载兜底时只 cancel 不 flush（见
     *  flushPendingSettings——它们的落盘要过人肉确认）。 */
    const dirCommits: Array<Pick<DeferredRun<unknown>, 'cancel'>> = []
    this.pendingDirCommits = dirCommits
    const deferral = <T>(ms: number, run: (value: T) => void): DeferredRun<T> => {
      const d = deferredRun(ms, run)
      deferrals.push(d)
      return d
    }
    /** 目录两路防抖（笔记路径 / 附件回收）共用这一个实现：停顿 600ms 后过
     *  applyDirSettings 那道闸门（2026-10-04 起先过人肉确认，该问迁移的再问迁移）。
     *  同时进 dirCommits，好让卸载兜底把它们和普通输入分开对待。 */
    /**
     * 目录落盘的**串行链**（BUG-136l）：四行各有各的防抖器，两个防抖几乎同时到点是
     * 完全正常的——改完「根目录」不点确认、Tab 过去接着改「附件目录」就会。而
     * `applyDirSettings` 会停在「确认修改」那个 Modal 上**等答复**，此刻
     * `service.settings` 还是旧值：第二个 commit 于是又算出一份 changed、再弹一个框
     * 叠上去；两个框各跑一遍 saveSettings / migrateNotes（后者清索引 + 全库重读，
     * 并发两次会互相踩）。串成一条链——一次只跑一个，前一个答复完才轮到下一个。
     * 每个链节自带 catch：一节失败不会把整条链永久毒死。
     */
    let dirChain: Promise<void> = Promise.resolve()
    const dirDeferral = (): DeferredRun<DirCommit> => {
      const d = deferral<DirCommit>(DIR_DEBOUNCE_MS, (commit) => {
        dirChain = dirChain
          .then(() => applyDirSettings(this.app, service, commit.patch, commit.hooks))
          .then((outcome) => afterDirCommit(outcome, commit.hooks))
          .catch((e: unknown) => {
            console.error('[Momo] 目录设置落盘失败', e)
          })
      })
      dirCommits.push(d)
      return d
    }

    /** 目录类文本设置停顿 600ms 后才落盘：saveSettings 会清索引缓存 + 全库重读 +
     *  整列表重渲，跟着每个按键跑一遍既卡面板，输入到一半的临时路径还会让列表闪空。
     *  每个字段各自一把防抖器，互不吞改动。写盘失败同样要提示（N08）：用户看到的是
     *  输入框里自己刚打的路径，不提示的话只会在面板静默全空时对不上账。
     *  BUG-79a：附件 / 回收目录也走 applyDirSettings 那道闸（载荷与 debouncedNotesDir
     *  同为 DirCommit）——它们不牵动笔记位置（notesRelocation 恒 0 条，问不到迁移），
     *  但同样吃确认框、sanitize 回退检测（notifyDirReverts）与行级 onSaved 回显。 */
    const debouncedSettings = (): DeferredRun<DirCommit> => dirDeferral()

    /** 连发控件专用（滑杆 / 步进器）：store 与 service.data 立即更新以保持实时反馈，
     *  只把落盘合并到最后一次。`savePrefs` = 合并 **加** `persist()`，而 persist 是
     *  整份 data.json 的 JSON.stringify + 写盘——侧栏宽度 150–480 拖满一趟就是三百多次，
     *  实时预览要的是前者，落盘压根用不着跟得这么紧。
     *  persist 的 Promise 也要接住（N08）：这里丢的值连 Notice 都没有，用户只会发现
     *  重载后侧栏宽度回到默认。 */
    // 走 deferredRun 而不是 obsidian 的 debounce（BUG-31）：后者没有 flush——
    // 拖完滑杆 400ms 内重载插件，内存与 store 都是新值、盘上还是旧的（N08 的
    // 「重载后回退」窄窗）。注册进 pendingDeferrals 后，卸载兜底 flushPendingSettings
    // 会把最后那轮一并结算。
    const persistSoon = deferredRun(400, () => {
      void service.persist().catch((e) => {
        console.error('[Momo] 保存偏好失败', e)
        new Notice(copy.errors.prefsSaveFailed(errMsg(e)))
      })
    })
    deferrals.push(persistSoon)
    const setPrefLive = (patch: Partial<MomoData['prefs']>): void => {
      // 这里刻意自己合并 service.data.prefs：要的是「合并立即、persist 延后」，
      // 而 savePrefs 只提供「两者一起」这一种节奏。
      service.data.prefs = { ...service.data.prefs, ...patch }
      useUi.setState(patch)
      persistSoon.push(undefined)
      notifyPrefs()
    }

    // ---- 配色方案：把 momo-theme-* 挂在设置页根上，整页令牌随方案切换 ----
    // class 的增删由它一次做齐；LookTab 的 picker 与这里的初次调用共用。
    const applyScheme = (scheme: ColorScheme): void => {
      for (const c of COLOR_SCHEMES) containerEl.removeClass(`momo-theme-${c.id}`)
      containerEl.addClass(`momo-theme-${scheme}`)
    }
    applyScheme(prefs.colorScheme)

    // ======================= 页头 =======================
    // 品牌名 / 图标跟着 LookTab 的输入与格子**实时**变：那里写完只重画各自控件、
    // 不 rerender 整页，页头要自己订阅（onPrefChange，ctx 统一收口）。
    // BUG-74：旧实现把品牌名做成 textContent getter——getter 只对 JS 读取可见，
    // 浏览器渲染只认子文本节点，页头品牌名因此**永远空白**（BUG-33 的用例只
    // 断言 getter 读取，被它骗过）；图标 thunk 同理只在创建时求值一次。正解是
    // 真实文本节点 + 订阅里更新 / 重建（dom.ts 的 TextLike 已收成纯字符串）。
    const head = h('div', 'momo-set-head')
    const mark = h('span', 'momo-set-mark')
    mark.append(iconSvg(service.data.prefs.brandIcon, 16))
    const brand = h('span', 'momo-set-brand')
    brand.append(document.createTextNode(service.data.prefs.brandName || DEFAULT_BRAND_NAME))
    // 订阅在 ctx 建好之后挂（syncHead 提到下面 onPrefChange 处）——页头块
    // 在 ctx 字面量之前，直接调 ctx.onPrefChange 会撞 TDZ。
    const syncHead = (): void => {
      const name = service.data.prefs.brandName || DEFAULT_BRAND_NAME
      if (brand.textContent !== name) brand.textContent = name
      // 图标格换形状：path 在创建时写死，订阅里整枚重建
      mark.replaceChildren(iconSvg(service.data.prefs.brandIcon, 16))
    }
    // 页头右侧：联系方式（2026-10-12 用户要求「配置页面右上角添加我的联系方式」）。
    // 两枚邮箱是语言中立的数据，三门字典同一份（header.contact 数组；在 display()
    // 里现读，不犯 BUG-04 那种模块求值期快照）。刻意**不做成** mailto 链接——
    // Obsidian 对 mailto: 的点击处理不可靠（可能被当成库内链接去解析），而邮箱
    // 文本本身就能选中复制。与左边那一组之间由 CSS 的 margin-inline-start:auto
    // 推开，落在内容列右边缘——和卡片的右边缘是同一条线。
    const contact = h('div', 'momo-set-contact')
    copy.settingsPage.header.contact.forEach((mail, i) => {
      if (i > 0) contact.append(h('span', 'momo-set-contact-dot'))
      contact.append(h('span', 'momo-set-contact-mail', mail))
    })
    head.append(
      mark,
      brand,
      h('span', 'momo-set-dot'),
      h('span', 'momo-set-page', copy.settingsPage.header.title),
      contact,
    )
    containerEl.append(head)

    // ======================= 分页导航 =======================
    // 七个区段是**分页**，不是一张长页面的锚点：同一时刻只有一个区段可见。
    // 之前的版本用 scrollIntoView 跳转 + 滚动跟随反算高亮，两套逻辑互相打架
    // （看着像 tab，点下去是滚动，滚回来又把高亮改了），这里统一成一个 `is-active`。
    // 视觉上是**分段轨道**（与页内 .momo-set-seg 同一套选中语言）：nav 是贴顶的
    // 横条，chips 装进里面的轨道 wrapper——结构上只多这一层，选中态仍由 paintTab
    // 打 `is-on`，样式细则在 80-settings.css。
    // BUG-176b：role 从 tablist 降成 group + aria-pressed，与 BUG-128b 给全部文字档
    // 定的口径一致（tablist 契约缺 aria-controls / tabpanel 关联时，"声明了语义却没
    // 兑现"比缺 role 更糟）。roving tabindex 与方向键（arrowNav）照旧。
    const nav = h('nav', 'momo-set-nav')
    nav.setAttribute('role', 'group')
    const track = h('div', 'momo-set-nav-track')
    const navChips: HTMLButtonElement[] = []
    /** 区段 id → 该区段的**全部**卡片（v0.9.6 起一页可以有多张）；由 card() 建出来时登记 */
    const cards = new Map<SectionId, HTMLElement[]>()

    // 可见 tab（R8a：entitlement 门 P4 起用，现在全部常驻）；chip 与建造都只过这张表
    const visibleTabs = SECTION_TABS.filter((t) => !t.visible || t.visible())
    // activeSection 是单例且活得比本页久（关掉再开不重置）：当前页被 entitlement
    // 隐藏时重新指向第一个可见页——否则 paintTab 每回合都在兜底，行为不可预期。
    if (!visibleTabs.some((t) => t.id === this.activeSection)) this.activeSection = visibleTabs[0].id

    const paintTab = (active: string): void => {
      // 兜底：给的 id 不在页面里（将来区段增删不同步、或当前页被隐藏）时退回第一个
      // 可见页，而不是整片空白
      const target = cards.has(active as SectionId) ? active : visibleTabs[0].id
      for (const chip of navChips) {
        const on = chip.dataset.target === target
        chip.classList.toggle('is-on', on)
        // BUG-176b：aria-pressed（与 BUG-128b 的文字档同形），不是 aria-selected
        chip.setAttribute('aria-pressed', String(on))
        // roving tabindex：方向键在页间切（见 arrowNav），Tab 进组落在当前页
        chip.tabIndex = on ? 0 : -1
      }
      for (const [id, list] of cards) {
        for (const el of list) el.classList.toggle('is-active', id === target)
      }
    }

    /** 切分页：先把当前页还没静默够的输入结算掉再切——别让用户已经离开的那一页
     *  在背地里慢半拍落盘（目录类还会顺带触发一次全库重读）。 */
    const switchTab = (id: SectionId): void => {
      if (id === this.activeSection) return
      for (const d of deferrals) d.flush()
      this.activeSection = id
      paintTab(id)
    }

    for (const tab of visibleTabs) {
      // display 时现读字典（tab.label 是 () => string）：语言切换后 rerender 会按新语言重画
      const chip = h('button', 'momo-set-nav-chip', tab.label())
      chip.type = 'button'
      chip.dataset.target = tab.id
      // BUG-176b：不再声明 role=tab（tablist 契约差 aria-controls 那半；见 nav 处注释）
      chip.onclick = () => switchTab(tab.id)
      navChips.push(chip)
      track.append(chip)
    }
    nav.append(track)
    containerEl.append(nav)
    // tab 的箭头即切换：左右循环换页（切页本身会 flush 当前页的未落盘输入，见 switchTab）
    arrowNav(nav, '.momo-set-nav-chip', (el) => el.click())

    // ======================= 内容列 =======================
    const body = h('div', 'momo-set-body')
    containerEl.append(body)

    /** 卡片：白底 + 1px 线 + r8，卡头（标题 14/600 + 说明 12）下有一条分隔线。
     *  opts.onReset（v0.9.12）：卡头右侧多一颗回退钮，只把这一张卡的设置恢复
     *  默认——复杂配置卡才配（见 context.ts 的 card 注释）。 */
    const card = (
      section: SectionId,
      id: string,
      title: string,
      desc: string,
      opts?: { onReset?: () => void },
    ): HTMLElement => {
      const el = h('section', 'momo-set-card')
      el.id = id
      // BUG-176b：不再声明 role=tabpanel（配对 tablist 已撤；section 元素本身即可）
      const header = h('header', 'momo-set-card-head')
      const main = h('div', 'momo-set-card-head-main')
      main.append(h('h3', 'momo-set-card-title', title))
      // desc 为空串时整个 <p> 都不建（2026-10-09 统计页卡起）：head-main 是
      // flex-column + gap:4px，留一个空元素进去就是白留一条 4px 缝。
      if (desc) main.append(h('p', 'momo-set-card-desc', desc))
      header.append(main)
      if (opts?.onReset) {
        // 档位：次级（带框）在每张卡头都出现就太重，主行动是「保存 / 完成」专用，
        // 文字档（ghost）最安静——与行内「移除自定义」同一族，14px 回退箭头 +
        // 文案说清「把这一张卡恢复默认」
        const resetCard = h('button', 'momo-set-btn is-ghost momo-set-card-reset')
        resetCard.type = 'button'
        resetCard.append(
          iconSvg('reset', 14),
          h('span', 'momo-set-btn-text', copy.settingsPage.cardReset),
        )
        resetCard.onclick = () => opts.onReset?.()
        header.append(resetCard)
      }
      el.append(header)
      body.append(el)
      const list = cards.get(section)
      if (list) list.push(el)
      else cards.set(section, [el])
      return el
    }

    /** 一行：左文字列（名称 13/500 + 说明 12 + 补充 11），右控件列固定 260。
     *  desc 可传空串（2026-10-09 起回收站路径那一行就没有说明）：空串时整个
     *  .momo-set-desc 都不建——info 是 flex-column + gap，留一个空元素进去
     *  就是白留一条缝（同 card 对空 desc 的处理）。 */
    const row = (
      parent: HTMLElement,
      name: string,
      desc: string,
      opts?: { warn?: string; note?: string; wide?: boolean },
    ): HTMLElement => {
      const wrap = h('div', `momo-set-row${opts?.wide ? ' is-wide' : ''}`)
      const info = h('div', 'momo-set-info')
      info.append(h('div', 'momo-set-name', name))
      if (desc) info.append(h('div', 'momo-set-desc', desc))
      // 补充行比说明再弱一档（11px / ink-3）：格式限制、取值范围这类「知道了就不用
      // 再看第二遍」的信息，塞进说明里会把两行都撑成三行。
      if (opts?.note) info.append(h('div', 'momo-set-note', opts.note))
      if (opts?.warn) info.append(h('div', 'momo-set-warn', opts.warn))
      const ctrl = h('div', 'momo-set-ctrl')
      wrap.append(info, ctrl)
      parent.append(wrap)
      return ctrl
    }

    // 七个分页的建造函数共享这一份上下文（含 host：改停靠侧要搬面板）
    const ctx: SettingsCtx = {
      host: this.host,
      service,
      prefs,
      setPref,
      setPrefLive,
      // 卡片级「恢复默认」的收尾（display() 开头会先撤销
      // 还没落盘的输入，B06），用户仍停在当前分页
      rerender: () => {
        // 整页空重建会**自己**跳一下滚动：滚动容器就是 containerEl 自己
        // （.vertical-tab-content，真 app.css 里 overflow-y:auto + height:100%），
        // 它的内容被整体替换时，Chromium 的 scroll anchoring 锚点随旧子树一起
        // 被丢弃，重建后的首次布局按锚点残影补一笔 scrollTop——实测同等内容
        // 白送 +17px / +52px（不等值，随视口位置变；真 Chromium + 真 app.css +
        // 真 styles.css 复现）。用户刚点的那颗「恢复默认」就在视口里，这一笔
        // 就是「UI 跳一下」（2026-10-06 用户报障）。等价位重建（偏好本就是默认值）
        // 实测分毫不动——跳的不是内容，是那笔残影。
        // 两道都上：重建期间摘掉滚动锚定（把会被替换掉的锚点清掉，那一笔无从算起），
        // 再把 scrollTop 原样写回（兜住重建途中任何一次强制布局可能造成的钳位）。
        // try/finally：display() 万一抛了，也别把 overflow-anchor:none 留在容器上。
        // BUG-217：摘锚定走类（`.momo-no-anchor`，规则在 80-settings/001-page.css）——
        // 旧实现写内联 overflowAnchor，那是 Obsidian 评审的 no-static-styles-assignment。
        const top = containerEl.scrollTop
        containerEl.classList.add('momo-no-anchor')
        try {
          this.display()
        } finally {
          containerEl.classList.remove('momo-no-anchor')
          containerEl.scrollTop = top
        }
      },
      // 写完笔记文件之后让主面板重算一次（quiet 机制把批量期间的 vault 事件丢了，
      // 与 caps 层批量操作收尾那一次 refresh 同一口径，见 context.ts 的注释）
      refreshPanel: async () => {
        await useUi.getState().refresh()
      },
      // 目录 patch 的落盘闸门（v0.9.26 起，2026-10-04 加总闸）：先弹确认框列出
      // 变了哪几行，用户点了「确认修改」才往下走；还会甩下笔记的路径改动接着再问
      // 一次「搬过去 / 只改路径 / 取消」。卡片级「恢复默认」用它，任一环取消则
      // 什么都不发生（onSaved 不会跑，界面也不重建）。
      commitDir: (patch, hooks) => {
        void applyDirSettings(this.app, service, patch, hooks).then((outcome) =>
          afterDirCommit(outcome, hooks),
        )
      },
      // 笔记路径两行（root / 正文目录）的防抖版：停顿 DIR_DEBOUNCE_MS 后过同一道
      // 闸门。载荷带 patch 与 hooks——「取消时把输入框还回已保存的值」只有攥着
      // 那一行的 PathsTab 做得到，所以随 push 一起交出去。
      debouncedNotesDir: (): DeferredRun<DirCommit> => dirDeferral(),
      deferral,
      debouncedSettings,
      applyScheme,
      card,
      row,
      field,
      onPrefChange: (fn: () => void): void => {
        prefSubs.add(fn)
      },
    }

    // 页头的品牌名 / 图标订阅（BUG-74）：挂在 ctx 建好之后（页头块在 ctx
    // 字面量之前，那边只留 syncHead 的定义）。notifyPrefs 是 setPref /
    // setPrefLive 的统一收口，LookTab 改名 / 换图标都会走到。
    ctx.onPrefChange(syncHead)

    // ======================= 分页建造（R8a：遍历注册表，顺序 = SECTION_TABS 声明序，
    // 与原来的 ①–⑦ 手写调用逐一对应）=======================
    for (const tab of visibleTabs) tab.build(ctx)

    // 卡片到这里才全部建完，可以定到底哪一页可见了（ctx 是「进来时在哪一页就在哪一页」）
    paintTab(this.activeSection)
    // 页脚已整块移除：本页改动全部即时落盘，「自动保存」是常真的事实，不需要一排
    // UI 来说它；关闭走 Obsidian 设置弹窗自带的关闭按钮，未静默够的输入由
    // main.ts 卸载时的 flushPendingSettings() 兜底结算（B06）。
    //
    // 页头的「全部恢复默认」已于 2026-10-04 按用户要求移除：一把梭会把目录 /
    // 语言 / 停靠侧 / 五十多个偏好同时打回默认，误触代价远超收益，而每一项本就
    // 都能在各自那一行单独改回去。恢复默认只保留**卡片级**那一颗（复杂配置卡
    // 卡头右侧，只管自己那一张卡）。
  }
}
