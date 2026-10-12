import { BRAND_ICON_EXTS } from '../types'

// 图片的**分类与命名**纯逻辑（obsidian-free：只碰文件名与 MIME 串）。
//
// 为什么从 views/attachmentPaste.ts 里搬出来：那边 import 了 @codemirror/view，
// node 测试环境加载不了，于是这几条判据就永远测不到——而它们恰恰是最容易写错
// 的两条（白名单越界、MIME 与后缀打架）。规矩与旁边三个 service 辅模块一致：
// 纯逻辑住 src/momo/，views/ 只留 CodeMirror 的接线。

/** MIME 主类型是 image（`image/png`、`image/svg+xml` …） */
const MIME_IMAGE = /^image\//i

/** 去掉 `image/` 前缀与 `+xml` 之类参数：`image/svg+xml` → `svg` */
function mimeSubtype(type: string): string {
  return type.replace(MIME_IMAGE, '').split('+')[0]?.toLowerCase() ?? ''
}

/** 小写扩展名（不含点）；无点、或点在前导位（`.gitignore`）时返回空串 */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** 去掉扩展名的基名 */
export function stemOf(name: string): string {
  const i = name.lastIndexOf('.')
  return (i <= 0 ? name : name.slice(0, i)).trim()
}

/**
 * 这次转移里算不算图片。**与 attachImage 的白名单同一份**，但这里多一道过滤：
 * attachImage 对越界扩展名是「回落 png」（文件存进去了，名字却在骗人），所以
 * 非图片必须**在进 attachImage 之前**挡掉——粘一段文本不该产生一个 .png。
 *
 * MIME 与后缀任一命中即算：剪贴板里的图片常常没有可用的 name（Chromium 给
 * `image.png`，别的平台可能是空串），而从别的程序拖进来的文件有时 type 是空的。
 */
export function isImageFile(file: { name?: string; type?: string }): boolean {
  if (file.type && MIME_IMAGE.test(file.type)) return true
  const ext = extOf(file.name ?? '')
  return ext !== '' && BRAND_ICON_EXTS.includes(ext)
}

/**
 * 交给 attachImage 的文件名：扩展名必须落在白名单内，否则它会回落 png。
 * 剪贴板里的图片常常叫 `image.png`，拖放则保留原文件名；两者都取不到可用后缀时
 * 按 MIME 子类型补（拖 `.svg` 进来而系统没给 name 的场合）。
 */
export function attachmentNameFor(file: { name?: string; type?: string }): string {
  const name = file.name ?? ''
  const ext = extOf(name)
  if (ext !== '' && BRAND_ICON_EXTS.includes(ext)) return name
  const subtype = mimeSubtype(file.type ?? '')
  const safe = BRAND_ICON_EXTS.includes(subtype) ? subtype : 'png'
  return `${stemOf(name) || 'image'}.${safe}`
}
