import { ItemView, Menu, WorkspaceLeaf } from 'obsidian'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../ui/app/App'
import { useUi } from '../ui/store'
import type { MomoService } from '../momo/service'
import { copy } from '../momo/i18n'
import { VIEW_TYPE_MOMO } from '../momo/types'
import { buildCaps } from './caps'

// 视图外壳（contract-plugin-structure 依赖方向）：views → ui → Momo → obsidian。
// ui/ 不 import obsidian；MarkdownRenderer 等能力在此注入。
//
// 拆分：`buildCaps`（组装 ui/ 与 service 之间的全部能力）与确认弹窗在 caps.ts，
// 本文件只剩 React 视图外壳本身（挂载 / 卸载 / 标题 / 右键菜单 / 偏好回灌）。

/** 视图类型常量本体在 momo/types（service 也要用，避免反向依赖），此处按旧名再导出 */
export const VIEW_MOMO = VIEW_TYPE_MOMO

/** 面板停靠能力由插件入口（main.ts）注入：views/ 不反向 import main.ts，避免循环依赖 */
export interface MomoViewHost {
  /** 面板当前停靠侧；主区标签页 / 弹出窗口返回 null */
  sideOf(leaf: WorkspaceLeaf): 'left' | 'right' | null
  moveViewTo(side: 'left' | 'right'): Promise<void>
}

abstract class ReactItemView extends ItemView {
  protected root: Root | null = null
  /** onOpen 里挂上的 document 级 Ctrl/Cmd+C 监听；onClose 必须摘掉，否则视图关开
   *  累加（registerView 每次新建实例，onOpen 每次都会再挂一条）。 */
  private onCopyKey: ((e: KeyboardEvent) => void) | null = null

  async onOpen(): Promise<void> {
    this.contentEl.empty()
    this.root = createRoot(this.contentEl)
    this.render()

    // 复制兜底（v0.5.3，用户反馈「只读浏览也想复制文字」）：面板不是可编辑区域，
    // 选区存在时 Obsidian 的按键路由不一定放行原生复制。这里在 document 级监听
    // Ctrl/Cmd+C —— 仅当选区位于**本面板内**时接管并显式写入剪贴板，主编辑器的
    // 复制行为不受影响。
    // 两个要点：
    // 1. 手动 addEventListener + register(cleanup)：registerDomEvent 只在**插件卸载**
    //    时清理，而 onOpen 在每次视图打开时都会跑一遍（registerView 每次新建实例）——
    //    面板关开 N 次就累加 N 条 document 级监听，旧的闭包还攥着已 detach 的
    //    contentEl（功能上失效但仍每次 Ctrl+C 都跑 getSelection()）。
    // 2. 尽力写剪贴板 + 让原生复制兜底（BUG-22）：不做「写成功才 preventDefault」
    //    那套——`preventDefault()` 只在 keydown**分发期间同步调用**才有效，放进
    //    `.then()` 里是空操作（老早过点）。所以两条路都放行原生复制：写成功时同一
    //    文本被写两遍（后果良性），写失败时原生复制仍在。保留 catch 只为不让失败
    //    漏成 unhandled rejection。
    // BUG-235：写入收敛到唯一一个 caps 能力（`MomoCaps.writeClipboard`，契约见
    // store/types.ts）——这是用户按键手势里的写入，与 CopyButton 的点击写入同一出口；
    // 全仓不再有第二处 `navigator.clipboard.writeText`。
    const onCopyKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      if (!this.containerEl.contains(sel.anchorNode)) return
      const text = sel.toString()
      if (!text) return
      // 视图打开即 init（MomoView 构造函数），caps 必然在位；取不到就什么都不做，
      // 原生复制照常兜底
      const caps = useUi.getState().caps
      if (!caps) return
      void caps.writeClipboard(text).catch(() => {
        // 写失败（document 失焦 / 权限拒绝）：已有 reject 但只静默——原生复制会兜底
      })
    }
    document.addEventListener('keydown', onCopyKey)
    this.onCopyKey = onCopyKey
  }

  protected abstract render(): void

  async onClose(): Promise<void> {
    if (this.onCopyKey) {
      document.removeEventListener('keydown', this.onCopyKey)
      this.onCopyKey = null
    }
    this.root?.unmount()
    this.root = null
  }

  getViewType(): string {
    return VIEW_MOMO
  }

  getDisplayText(): string {
    return this.title
  }

  getIcon(): string {
    return this.iconName
  }

  protected abstract get title(): string
  protected abstract get iconName(): string
}

export class MomoView extends ReactItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private service: MomoService,
    private host: MomoViewHost,
  ) {
    super(leaf)
    // 视图打开即注入能力（store 为全局单例，视图关闭后 caps 仍指向 service，无害）
    useUi.getState().init(buildCaps(service))
    // 账号态回灌（R2a）：entitlement 缓存 + cachedAt（离线宽限的判据）。它不是
    // prefs——来自 data.json 的 account 段（服务器权威的本地缓存），不走
    // caps.savePrefs；未登录（service.account = null）= 空权益，三个付费门锁死。
    // 漏了这一步的症状：已登录用户 premiumActive 恒 false，高级功能永远锁着。
    useUi.setState({
      entitlements: service.account?.entitlements ?? {},
      accountCachedAt: service.account?.cachedAt ?? null,
    })
    // 偏好回灌（data.json → store，避免 init 默认值覆盖）
    useUi.setState({
      density: service.data.prefs.density,
      // 顶栏视图分段的显隐与顺序（v0.9.17）：漏了这一步的症状是「重载后顶栏
      // 回到五档全开、顺序也是默认」，点一下设置页又能写进去——极难自查。
      densityViews: service.data.prefs.densityViews,
      sidebar: service.data.prefs.sidebar,
      sortMode: service.data.prefs.sortMode,
      // 侧栏标签区排序（v0.9.18 漏网补丁）：这个键当初没进回灌列表，用户改过
      // 排序后重开面板会被 store 初值（'count'）盖掉。一并补上。
      tagSort: service.data.prefs.tagSort,
      // 多选标签组合方式（2026-10-12）：与 tagSort 同批补进回灌列表——漏了它，
      // 用户切到「交集」后重开面板会被 store 初值（并集）盖掉（tagSort 当初踩过）。
      tagMatchMode: service.data.prefs.tagMatchMode,
      pinned: service.data.prefs.pinned,
      pinnedNotes: service.data.prefs.pinnedNotes,
      reviewSeen: service.data.prefs.reviewSeen,
      // 回顾抽法档位（2026-10-24 起持久化）：漏灌 = 重载后档位静默掉回「随机」，
      // 用户选的「一周未看」以为自己还在用——这正是本轮修的那个报障
      reviewMode: service.data.prefs.reviewMode,
      sidebarWidth: service.data.prefs.sidebarWidth,
      sidebarSide: service.data.prefs.sidebarSide,
      sections: service.data.prefs.sections,
      statsSections: service.data.prefs.statsSections,
      reviewCount: service.data.prefs.reviewCount,
      heatmapMonths: service.data.prefs.heatmapMonths,
      statsRange: service.data.prefs.statsRange,
      statsCustomFrom: service.data.prefs.statsCustomFrom,
      statsCustomTo: service.data.prefs.statsCustomTo,
      colorScheme: service.data.prefs.colorScheme,
      customCss: service.data.prefs.customCss,
      uiFont: service.data.prefs.uiFont,
      cardFont: service.data.prefs.cardFont,
      titleFromFirstLine: service.data.prefs.titleFromFirstLine,
      titleMaxChars: service.data.prefs.titleMaxChars,
      readOnly: service.data.prefs.readOnly,
      brandIcon: service.data.prefs.brandIcon,
      brandName: service.data.prefs.brandName,
      tagPosition: service.data.prefs.tagPosition,
      // 地点标签位置（2026-10-01 从 tagPosition 拆出）：漏灌会重开后地点标签回默认 meta
      locPosition: service.data.prefs.locPosition,
      // UI 微调三档 / 卡片时间粒度 / 字数开关 / 左上角自定义图标（v0.9.1）：
      // 漏网之鱼——只在设置被改动时经 setPref 同步进 store，重启后回默认值，
      // 用户会以为「自己的设置丢了」。正文字号 / 圆角 v0.9.12 起是连续 px
      cardFontSize: service.data.prefs.cardFontSize,
      cardTitleSize: service.data.prefs.cardTitleSize,
      cardRadius: service.data.prefs.cardRadius,
      cardGap: service.data.prefs.cardGap,
      cardStamp: service.data.prefs.cardStamp,
      showCharCount: service.data.prefs.showCharCount,
      // 卡片右上角操作按钮显隐（v0.9.22）：漏了这一步的症状是「重载后三个按钮
      // 回到默认（全开）」，用户在设置里关掉的开关像丢了一样
      showCardCopy: service.data.prefs.showCardCopy,
      showCardTag: service.data.prefs.showCardTag,
      showCardDelete: service.data.prefs.showCardDelete,
      warmRatio: service.data.prefs.warmRatio,
      lang: service.data.prefs.lang,
      brandIconImage: service.data.prefs.brandIconImage,
      brandIconImages: service.data.prefs.brandIconImages,
      // 用户手填的地点坐标（F7，v0.9.25）：漏了这一步的症状同 densityViews——
      // 重开后手填坐标回空，星球上「家」这类自定义地点像丢了一样
      locCoords: service.data.prefs.locCoords,
      // 用户手填的地点大洲 / 国家与层级档位（v0.9.30）：同一个理由——
      // 漏了它们，重开后「外婆家」的归属与用户选的显示档一起回默认
      locRegions: service.data.prefs.locRegions,
      locLevel: service.data.prefs.locLevel,
      // 侧栏地点树展开方式（v0.9.30）：七步工序漏了「启动回灌」这一公里——
      // 不回灌会让重开面板后 store 回默认 'all'，此后任一偏好落盘还会把它
      // 静默覆盖成默认值，用户的 fold 永久丢失（BUG-50）。
      locTreeExpand: service.data.prefs.locTreeExpand,
      // 星球地球外观（2026-10-05）：同一个理由——不回灌会让重开面板后切到星球视图
      // 看到的还是夜地球，此后任一偏好落盘又会把用户选的日地球静默覆盖回默认。
      globeEarth: service.data.prefs.globeEarth,
      // 语义图标覆写表（v0.9.36）：同一个理由——不回灌会让重开后面板里的
      // 图标全部回 Momo 原形，此后任一偏好落盘还会把用户的覆写静默覆盖掉
      icons: service.data.prefs.icons,
    })
  }

  /**
   * 标签页标题 = 用户设置的品牌名。
   * 注意 Obsidian 只在 leaf 创建 / setViewState 时求值一次 getDisplayText：品牌名
   * 改完之后**已开着**的标签页不会在这里刷新（侧栏与面板内的品牌标会跟 store 变），
   * 关掉面板重开或重启 Obsidian 后才同步——别在注释里承诺「改了名，标签页跟着变」。
   */
  protected get title(): string {
    return this.service.data.prefs.brandName
  }

  protected get iconName(): string {
    return 'notebook-pen'
  }

  /** 标签页右键菜单：把面板搬到另一侧边栏（面板不在侧边栏里就不提供） */
  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source)
    const side = this.host.sideOf(this.leaf)
    if (!side) return
    const other = side === 'left' ? 'right' : 'left'
    menu.addItem((item) =>
      item
        .setTitle(other === 'left' ? copy.commands.moveToLeft : copy.commands.moveToRight)
        .setIcon(other === 'left' ? 'panel-left' : 'panel-right')
        .onClick(() =>
          void this.host.moveViewTo(other).catch((e) => {
            // BUG-133f：moveViewTo 内部已对记忆失败兜底；这里再兜一层叶子操作的异常，
            // 别让点击变成 console 里一条 unhandled rejection。
            console.error('[Momo] 移动面板失败', e)
          }),
        ),
    )
  }

  protected render(): void {
    this.root?.render(<App />)
  }
}
