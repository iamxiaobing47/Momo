import { BUNDLED_FONTS } from '../momo/types'
import type { App } from 'obsidian'

// 内置开源字体的 @font-face 注入（v0.9.16）：插件 onload 时一次注入 document.head，
// 面板 / 设置页 / 确认弹窗共用。「选了哪套」的变量注入在 ui/shared/fontStyle.ts——那层
// 不 import obsidian，这里的全部职责就是「文件 → app:// 资源 URL」。
//
// 路径按插件在 vault 里的标准位置拼（<configDir>/plugins/<id>/fonts/）：getResourcePath
// 收 vault 相对路径，manifest.dir 是绝对路径反而拼不进去。**base 必须走
// vault.configDir**——「Override config folder」的 vault（如 .obsidian-desktop）
// 里写死 `.obsidian` 会让四套内置字体静默 404（BUG-184e；同仓星球贴图 / globe3d /
// account sidecar 都按 configDir 定位）。字体文件缺失（fonts/ 没部署）时 URL 404，
// Chromium 按栈落到下一族——静默回退，不白屏。
//
// 文件名带 [wght]（可变字体）经 getResourcePath 编码后原样可用；font-display:
// swap 让大字体文件加载期间先画默认字，不白屏等待。

export function injectFontFaces(app: App, pluginId: string): void {
  if (typeof document === 'undefined') return
  const el = document.createElement('style')
  el.id = 'momo-font-faces'
  const base = `${app.vault.configDir}/plugins/${pluginId}/fonts`
  const rules: string[] = []
  for (const font of BUNDLED_FONTS) {
    for (const face of font.faces) {
      const url = app.vault.adapter.getResourcePath(`${base}/${face.file}`)
      rules.push(
        [
          '@font-face {',
          `  font-family: "${font.family}";`,
          `  src: url("${url}") format("truetype");`,
          `  font-weight: ${face.weight};`,
          '  font-display: swap;',
          '}',
        ].join('\n'),
      )
    }
  }
  el.textContent = rules.join('\n\n')
  document.head.appendChild(el)
}

/** 卸载时撤掉运行时注入的两份 <style>（@font-face 与字体变量） */
export function removeFontStyles(): void {
  document.getElementById('momo-font-faces')?.remove()
  document.getElementById('momo-fonts')?.remove()
}
