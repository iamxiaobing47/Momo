import { EditorView } from '@codemirror/view'
// `Extension` 由 @codemirror/state 定义、@codemirror/view 只做再导出之外的使用，
// 从 state 取原始定义（两个包都要 external，见 esbuild.config.mjs 的注释）。
import type { Extension } from '@codemirror/state'
import { Notice, TFile, editorInfoField } from 'obsidian'
import type { MomoService } from '../momo/service'
import { imageEmbed, relativeLinkPath } from '../momo/service/serviceLinks'
import { attachmentNameFor, isImageFile, stemOf } from '../momo/service/serviceImages'
import { errMsg } from '../momo/core'
import { copy } from '../momo/i18n'

// 粘贴 / 拖放图片 → 存进 Momo 的附件目录 → 正文里写一段标准 md 图片引用。
//
// 这件事以前**根本没人做**：正文是用 Obsidian 原生编辑器写的（ADR-003，插件不封装
// 第二套编辑器），粘贴走的是 Obsidian 核心，落点只认它自己的 `attachmentFolderPath`。
// 于是设置页那句「正文里粘贴的图片会复制到这个目录」是一句没人兑现的承诺——
// `attachImage` 全仓零调用方，设置改了也不影响任何落点。本扩展把这条链接补上，
// 设置页的契约才成立。
//
// 作用域**只限 Momo 笔记**（`service.isMomoFile`）：别的笔记一个字节都不动，
// 用户在 vault 其它地方粘贴仍旧走 Obsidian 默认行为。Momo 不劫持全库设置。
//
// 占位符纪律：存盘是异步的（真·磁盘 I/O），等它回来时用户可能已经又敲了几个字，
// 按旧 offset 替换会把图插到错地方。所以**同步**先插一段 HTML 注释占位、钉住
// 位置，落盘完成再按标记原地替换——用户后续输入永远排在占位后面，位置不会漂。

/** 占位标记的会话内序号：撤销重粘也不会撞上旧标记 */
let placeholderSeq = 0

/**
 * `DataTransferItemList`（粘贴）与 `FileList`（拖放）统一成图片 `File[]`。
 * 粘贴那条拿的是 items，必须 `getAsFile()` 才拿得到 File；`instanceof File`
 * 分的正是这两种来源（拖放的 FileList 直接就是 File）。
 */
function imageFilesOf(source: DataTransferItemList | FileList | null | undefined): File[] {
  if (!source) return []
  const out: File[] = []
  for (let i = 0; i < source.length; i++) {
    const entry = source[i]
    if (!entry) continue
    const file = entry instanceof File ? entry : entry.getAsFile()
    if (file && isImageFile(file)) out.push(file)
  }
  return out
}

/** 一批图片落盘 → 引用串；失败记空串（占位会被抹掉），并带回第一条错误 */
async function saveAll(
  service: MomoService,
  files: File[],
  notePath: string,
): Promise<{ texts: string[]; firstError: unknown }> {
  let firstError: unknown = null
  const texts = await Promise.all(
    files.map(async (file) => {
      try {
        const saved = await service.attachImage(attachmentNameFor(file), await file.arrayBuffer())
        return relativeLinkPath(notePath, saved)
      } catch (e) {
        firstError ??= e
        console.error('[Momo] 图片保存失败', e)
        return ''
      }
    }),
  )
  return { texts, firstError }
}

/**
 * 把占位整批换成真正的图片引用。
 *
 * 标记是挨着插进去的，所以范围 = 首个标记起点 → 末个标记终点，整批一次
 * dispatch——每张各替换一次会在中间态里露出「一张图 + 一段注释」的半成品。
 * 任一标记找不到（用户在这几百毫秒里删掉或撤销了那段）就整批放弃：宁可少插
 * 一张图，也不把链接塞进用户已经改过的正文里。
 */
function replacePlaceholders(view: EditorView, marks: string[], texts: string[], alts: string[]): void {
  const firstAt = view.state.doc.toString().indexOf(marks[0] ?? '')
  if (firstAt === -1) return
  const lastMark = marks[marks.length - 1] ?? ''
  const lastAt = view.state.doc.toString().lastIndexOf(lastMark)
  if (lastAt < firstAt) return
  const insert = texts
    .map((link, i) => (link === '' ? '' : imageEmbed(link, alts[i] ?? '')))
    .filter((t) => t !== '')
    .join('\n')
  view.dispatch({
    changes: { from: firstAt, to: lastAt + lastMark.length, insert },
    selection: { anchor: firstAt + insert.length },
  })
}

/**
 * 事件处理器本体。**同步**返回 true/false（CodeMirror 靠这个决定要不要
 * preventDefault），存盘那部分在返回之后异步跑。
 *
 * false = 不关我们的事，事件原样交给 Obsidian 原生行为。三个不接管的场合：
 * 不是 Momo 笔记 / 这一批里没有图片（普通文字粘贴）/ 编辑器状态拿不到文件。
 *
 * 一处已知的取舍：剪贴板里**图文都有**时（少数来源会给 image + text/html 两项）
 * 我们只取图片、整批接管，那份文字不会一起粘进来。选图片是因为设置页承诺的是
 * 「粘贴的图片进附件目录」；反过来把文字也补进去就得改写选区、还要判断光标该
 * 落在图前还是图后，复杂度远大于这个边缘场景的收益。
 */
function handleImageTransfer(
  service: MomoService,
  source: DataTransferItemList | FileList | null | undefined,
  view: EditorView,
): boolean {
  const note = view.state.field(editorInfoField, false)?.file
  if (!(note instanceof TFile) || !service.isMomoFile(note)) return false
  const files = imageFilesOf(source)
  if (files.length === 0) return false

  // 接管：同步插占位、钉住位置。下面的异步保存有了稳定的替换目标。
  // 光标显式落到占位之后——不写的话它靠 change 的位置映射推导，映射策略变了
  // （CodeMirror 升级常改）就会变成「粘完图后光标莫名其妙跳回插入点之前」。
  const marks = files.map(() => `<!--momo-att:${++placeholderSeq}-->`)
  const alts = files.map((f) => stemOf(f.name || '') || 'image')
  const { from, to } = view.state.selection.main
  const placeholder = marks.join('\n')
  view.dispatch({ changes: { from, to, insert: placeholder }, selection: { anchor: from + placeholder.length } })

  void saveAll(service, files, note.path)
    .then(({ texts, firstError }) => {
      // 用户可能已经关掉标签页：这份 view 不再挂在文档上，别往里 dispatch。
      if (!view.dom.isConnected) return
      replacePlaceholders(view, marks, texts, alts)
      if (firstError !== null) new Notice(copy.errors.writeFailed(errMsg(firstError)))
    })
    .catch((e: unknown) => {
      console.error('[Momo] 粘贴图片处理失败', e)
    })
  return true
}

/** 主入口：给 `plugin.registerEditorExtension` 的那段扩展 */
export function attachmentPasteExtension(service: MomoService): Extension {
  return EditorView.domEventHandlers({
    paste: (event: ClipboardEvent, view: EditorView) =>
      handleImageTransfer(service, event.clipboardData?.items ?? null, view),
    drop: (event: DragEvent, view: EditorView) =>
      handleImageTransfer(service, event.dataTransfer?.files ?? null, view),
  })
}
