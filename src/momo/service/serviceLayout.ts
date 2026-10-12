// Momo 目录布局的**判定**部分（obsidian-free：只碰已归一化的路径字符串）。
// 「路径怎么拼」留在 service（要过 obsidian 的 normalizePath），「这段路径算不算
// Momo / 该不该触发刷新」是纯逻辑，放这里——它是索引与 vault 事件两条路的共同口径。

/** 归一化后的目录布局 */
export interface MomoLayout {
  rootPath: string
  notesPath: string
  attachmentsPath: string
  trashFolderPath: string
  draftPath: string
  /** 云操作索引 sidecar（R9，`<root>/.momo-cloud.json`）：可丢可重建 */
  cloudIndexPath: string
}

/** path 是否直接位于 dir 下（不含更深层级） */
function inDir(path: string, dir: string): boolean {
  // 前缀名不是「位于目录下」：danpen/notes.md、danpen/notesX.md 只是 root 下的
  // 普通文件，目录本身（danpen/notes）更不是。少了这个 startsWith 守卫，
  // slice(dir.length + 1) 拿到的会是「目录名之后」的残片，判定跟着错。
  if (!path.startsWith(dir + '/')) return false
  const rest = path.slice(dir.length + 1)
  return rest.length > 0 && !rest.includes('/')
}

/**
 * 小记 = 直接位于 root 的 md（旧平铺）或 notes 目录下的 md（新布局）。
 * 排除：回收目录、历史 draft.md、root 下的其它子目录。
 */
export function isMomoMdPath(path: string, layout: MomoLayout): boolean {
  if (!path.startsWith(layout.rootPath + '/')) return false
  if (path.startsWith(layout.trashFolderPath + '/')) return false
  if (path === layout.draftPath) return false
  if (path.slice(layout.rootPath.length + 1) === 'draft.md') return false
  return inDir(path, layout.rootPath) || inDir(path, layout.notesPath)
}

/**
 * vault 事件是否与本插件有关：Momo 本身、回收目录、根目录、附件目录、云索引 sidecar。
 * 附件目录变化同样影响附件统计（B09）；sidecar 变化（P4/P5 的写入期）同样要刷新——
 * 一并算「有关」：宁可多刷一次，也不要界面永远显示旧数。
 */
export function affectsPath(path: string, layout: MomoLayout): boolean {
  return (
    isMomoMdPath(path, layout) ||
    path.startsWith(layout.trashFolderPath + '/') ||
    path === layout.rootPath ||
    path.startsWith(layout.attachmentsPath + '/') ||
    path === layout.cloudIndexPath
  )
}
