import { Menu } from 'obsidian'
import type { App, FileView } from 'obsidian'
import { copy } from '../momo/i18n'
import { writeClipboardText } from './clipboard'

// 选区右键 → 存为 Momo / 复制：接管内置 PDF 视图、阅读视图（`.markdown-preview-view`）
// 与 HTML Reader（obsidian-html-plugin 把内容塞进 `#ohpIframe` 的 srcdoc 帧）三个面。
//
// 三个面各有各的坑，三条关键判定（本机 Obsidian 1.14.4 打包代码实测）：
//
// ① **必须挂在 document 捕获阶段**：内置 PDF 视图的右键菜单是它自己 `new Menu()`，
//    处理器绑在 `.pdf-viewer-container` 的 `contextmenu`（冒泡阶段）。它进处理器先
//    `evt.stopPropagation()` + `stopImmediatePropagation()`，之后才 `await` 一个 IPC
//    拿 editFlags、最后才看 `evt.defaultPrevented`。也就是说事件一旦走到冒泡阶段，
//    document 上的冒泡监听根本收不到（被它截断），`preventDefault()` 也晚于它的开关
//    决定——只有捕获阶段先手，才能在它截断之前拿到事件。
// ② **`preventDefault()` 必须配 `stopPropagation()`**：前者只压浏览器默认行为
//    （阅读视图里文字右键落 Electron 原生菜单），拦不住 PDF 视图那个冒泡监听器自己
//    再开一份菜单。`stopPropagation()` 让事件止步于 document 捕获阶段，保证一次右键
//    只出一份菜单。
// ③ **iframe 里只能 `new Menu()` + `showAtPosition()`，严禁 `Menu.forEvent()`**：
//    帧里的 srcdoc 文档同源、可读，但 iframe 是**独立 realm**——Obsidian 打在
//    `UIEvent.prototype` / `Node.prototype` 上的 `win` / `doc` / `targetNode` 补丁只
//    存在于主 realm 的原型链上，帧内事件的原型链上没有它们，`Menu.forEvent(evt)` 会抛。
//    所以帧内这条自己算坐标（frame 的 rect + 帧内 clientX/Y），并把菜单显式挂到
//    **主 document**（菜单 DOM 属于主 realm）。
//
// 编辑器 / Live Preview **不归这里管**：那条路已有 `editor-menu`（main.ts），重复接管
// 会出两份菜单——所以 `.markdown-source-view` 内的目标一律放行。阅读视图则相反：它的
// 文字右键本来只有 Electron 原生菜单、没有 DOM 处理器，我们接管后原生菜单不再出现，
// 「存为」「复制」两项都补在自己的菜单里。
//
// 无选区一律不接管（一个字节都不动原生行为）：只对「选中了文字」的右键负责。

/** 内置 PDF 视图的根（`.pdf-viewer-container > .pdfViewer > .page`，选区是标准 Selection） */
export const PDF_CONTAINER_SELECTOR = '.pdf-viewer-container'

/** 阅读视图（Markdown 预览）的根 */
export const READING_VIEW_SELECTOR = '.markdown-preview-view'

/**
 * 编辑器 / Live Preview 的根：里面的右键归 `editor-menu`，本模块必须放行
 * （重复干预 = 两份菜单）。
 */
const EDITOR_VIEW_SELECTOR = '.markdown-source-view'

/** HTML Reader 认的扩展名（obsidian-html-plugin 的 `.html` / `.htm`） */
const HTML_READER_EXTENSIONS = new Set(['html', 'htm'])

/**
 * 挂载方（main.ts）注入的能力：DOM 监听走 `Plugin.registerDomEvent`（插件卸载时自动
 * 摘掉，本模块不需要自己的 dispose）；品牌名与落库回调由插件入口提供——本模块不
 * import service / store（views 层内部不反向依赖，也便于测试用假 host 驱动）。
 */
export interface SelectionCaptureHost {
  app: App
  registerDomEvent(
    el: Document | Window | HTMLElement,
    type: string,
    callback: (evt: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  brandName(): string
  save(content: string): Promise<void>
}

/**
 * realm 无关的元素判定：只认 `closest` 这个能力，不用 `instanceof Element`——
 * 同源 iframe 里的节点与主 realm 的 Element 构造函数不同构，`instanceof` 会把真实
 * 元素判掉；而 contextmenu 落在 document / window 上时也确实没有 `closest`。
 */
function asElement(target: EventTarget | null): Element | null {
  if (target === null || !('closest' in target)) return null
  return target as Element
}

/**
 * 右键目标 → 需要接管的选区根（PDF 容器优先，其次阅读视图）；两个都不是 = 不归我们管。
 * 只用捕获阶段的 target：不依赖选区实际落在哪，避免「菜单接管了、选区却不在范围内」。
 */
export function captureRootOf(target: EventTarget | null): HTMLElement | null {
  const el = asElement(target)
  if (!el) return null
  const root = el.closest(PDF_CONTAINER_SELECTOR) ?? el.closest(READING_VIEW_SELECTOR)
  return root as HTMLElement | null
}

/**
 * 选区文本（去首尾空白）。四道闸按序：没有 Selection / 已折叠 / 没有 Range /
 * Range 不在 root 内 → 空串（调用方据此放行原生行为）。`commonAncestorContainer`
 * 不在 root 内 = 选区其实在别的容器里（比如同一窗口里选中了别处），别接错。
 */
export function selectionTextIn(win: Window, root: Element): string {
  const sel = win.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return ''
  return sel.toString().trim()
}

/**
 * 两项菜单（存为 <brand> / 复制）；主文档与 iframe 两条路共用同一份条目定义，
 * 唯一差别只有菜单摆在哪里。
 */
function fillCaptureMenu(menu: Menu, host: SelectionCaptureHost, text: string): void {
  menu.addItem((item) =>
    item
      .setTitle(copy.commands.saveSelection(host.brandName()))
      .setIcon('notebook-pen')
      .onClick(() => {
        // 与编辑器右键同口径的失败静默：写盘失败不弹提醒，也不留 unhandled rejection
        void host.save(text).catch(() => {
          // 静默（同上）
        })
      }),
  )
  menu.addItem((item) =>
    item
      .setTitle(copy.commands.copySelection)
      .setIcon('copy')
      .onClick(() => {
        // 剪贴板写失败（文档失焦 / 权限拒绝）：同样静默——原生复制已被菜单接管，
        // 再弹一条错误只会打断浏览
        void writeClipboardText(text).catch(() => {
          // 静默
        })
      }),
  )
}

/**
 * 主文档的 contextmenu（捕获阶段）：编辑器放行 → 找接管根 → 有选区才接管。
 * 接管时 `preventDefault()` + `stopPropagation()`，一次右键只出我们这一份菜单。
 */
function onDocumentContextMenu(host: SelectionCaptureHost, evt: Event): void {
  const el = asElement(evt.target)
  if (!el) return
  // 编辑器 / Live Preview：editor-menu 已经管了，这里放行（否则两份菜单）
  if (el.closest(EDITOR_VIEW_SELECTOR)) return
  const root = captureRootOf(evt.target)
  if (!root) return
  const text = selectionTextIn(window, root)
  if (text === '') return
  evt.preventDefault()
  evt.stopPropagation()
  const menu = new Menu()
  fillCaptureMenu(menu, host, text)
  menu.showAtMouseEvent(evt as MouseEvent)
}

/**
 * 帧内 contextmenu（捕获阶段）：选区文本从帧自己的 window 取；坐标是**帧内**坐标，
 * 菜单挂在主 document 上，所以要用 frame 的 rect 换算一次。
 */
function onFrameContextMenu(host: SelectionCaptureHost, frame: HTMLIFrameElement, evt: Event): void {
  const text = frame.contentWindow?.getSelection()?.toString().trim() ?? ''
  if (text === '') return
  evt.preventDefault()
  const rect = frame.getBoundingClientRect()
  const mouse = evt as MouseEvent
  const menu = new Menu()
  fillCaptureMenu(menu, host, text)
  // 理由见文件头 ③：不能 Menu.forEvent，只能自己摆位置 + 显式指定主 document
  menu.showAtPosition({ x: rect.left + mouse.clientX, y: rect.top + mouse.clientY }, document)
}

/**
 * 这个 iframe 是不是 HTML Reader 的正文帧：沿 workspace 的 leaf 找「谁把帧装在自己
 * 的 containerEl 里」，再看那个 view 的文件扩展名。HTML Reader 的帧是插件视图自己
 * 创建的 srcdoc iframe，没有稳定的 DOM 标记可认（`#ohpIframe` 只是它内部 id），
 * 文件扩展名才是它和「网页嵌入 / PDF 嵌入」的可靠区别。
 */
function isHtmlReaderView(app: App, frame: HTMLIFrameElement): boolean {
  let hit = false
  app.workspace.iterateAllLeaves((leaf) => {
    if (hit) return
    const view = leaf.view
    if (!view.containerEl.contains(frame)) return
    const file = (view as FileView).file
    if (file && HTML_READER_EXTENSIONS.has(file.extension)) hit = true
  })
  return hit
}

/** 已经挂过监听的帧文档（WeakSet：帧被移除 / 重载后自然回收，不必逐个手动摘） */
const hookedFrames = new WeakSet<Document>()

/**
 * 给一个 iframe 补挂帧内监听（幂等）。
 * - 跨源帧读 `contentDocument` 会抛 SecurityError：捕获后放弃，别让一次右键打挂插件；
 * - 只认 HTML Reader 的帧：阅读器之外（网页嵌入等）的帧不接管；
 * - 同一份帧文档只挂一次（load 可能重复触发，重复挂会出多份菜单）。
 */
function hookFrame(host: SelectionCaptureHost, frame: HTMLIFrameElement): void {
  let doc: Document | null
  try {
    doc = frame.contentDocument
  } catch {
    return
  }
  if (!doc || hookedFrames.has(doc)) return
  if (!isHtmlReaderView(host.app, frame)) return
  hookedFrames.add(doc)
  host.registerDomEvent(doc, 'contextmenu', (evt) => onFrameContextMenu(host, frame, evt), true)
}

/**
 * 挂载（main.ts 的 onload 调一次）。所有监听都走 host.registerDomEvent：
 * 插件卸载 / 热重载时 Obsidian 统一摘掉，不需要自己的 dispose。
 */
export function installSelectionCapture(host: SelectionCaptureHost): void {
  // 主文档：必须捕获阶段（理由见文件头 ①、②）
  host.registerDomEvent(document, 'contextmenu', (evt) => onDocumentContextMenu(host, evt), true)

  // 帧内监听不能回填到已经就绪的帧上，只能等 load：load 不冒泡，但捕获阶段可达。
  host.registerDomEvent(
    document,
    'load',
    (evt) => {
      if (evt.target instanceof HTMLIFrameElement) hookFrame(host, evt.target)
    },
    true,
  )

  // 挂载之前就已经存在的帧（插件启用 / 重载时 HTML Reader 正开着）：启动扫一遍补挂
  for (const frame of Array.from(document.querySelectorAll('iframe'))) hookFrame(host, frame)
}
