import { BUNDLED_FONTS } from '../../momo/types'

// 字体偏好的运行时注入（v0.9.16）：一份 <style> 挂 document.head，内容只有
// 四类宿主上的两个 CSS 变量（--momo-sans / --momo-font-card）。谁挂类谁生效，
// 与此前自建配色的注入同一套手法（那个已随功能移除，机制说明还在
// docs/howto/styling.md）。
//
// 为什么挂 head 而不是面板根节点的内联 var：确认弹窗（.momo-confirm）与设置页
// （.momo-settings）都在面板 DOM 之外，够不着 .momo-app 上的内联变量；四类宿主
// 的规则写在同一段 CSS 里，跟 styles.src/00-tokens.css 的令牌块同一张宿主表。
// 层叠：本元素是运行期 append 的，排在插件 styles.css 之后，同特异性后来者胜。
//
// @font-face 本体（内置字体的 src/url）不在这一层——资源 URL 要经 Obsidian 的
// adapter，归 views/fontFaces.ts（ui/ 不 import obsidian）。这里只管「选了哪套」。
//
// 🔑 2026-10-06 修（用户报障「修改系统字体影响卡片字体」）：旧形状注入的是
// **--momo-font-ui**，其栈尾挂着 var(--momo-sans)；而 00-tokens.css 的
// --momo-sans 第一族又是 var(--momo-font-ui, "Noto Sans SC")——两个自定义属性
// 挂在**同一批四类宿主**上、互为首尾 = CSS 变量环。Chromium 实测（探针
// tmp/font-probe.mjs，真浏览器读 getComputedStyle）：环内属性 invalid at
// computed-value time，三个变量的计算值全空，后果比报障更宽——
//   ① --momo-sans 失效 → 面板自己的字体选择静默不生效（回落宿主主题字体）；
//   ② --momo-font-card 失效 → .momo-card 的 font-family:
//      var(--momo-font-card, inherit) 走 fallback inherit → **卡片跟着面板字体跑**。
// 只有「一个都没选」时才不发作，所以 v0.9.16 以来只要动过系统字体，卡片字体
// 选择就是哑的。现在的形状：面板字体**整条覆盖 --momo-sans 本体**（选中族 +
// 默认尾栈），卡片栈 = 卡片族 + 面板当前有效栈；两条注入互不引用、也都不引用
// 任何 momo 自定义属性（唯一的外部引用是宿主主题的 --font-interface），
// 结构上不可能再成环。守卫：scripts/font-vars-cycle.test.mts。
let styleEl: HTMLStyleElement | null = null

/** 变量挂载的四类宿主：与 00-tokens.css 令牌块的选择器同表（含色卡预览 .momo-set-scheme）。
 *  export 是给截图脚手架用的（scripts/shots/harness.ts 要按同一张表注入字体变量，
 *  否则截出来的「真截图」缺字体、跟真 Obsidian 对不上）——改这里两边一起变。 */
export const FONT_HOSTS = '.momo-app, .momo-confirm, .momo-settings, .momo-set-scheme'

/** 默认面板字体栈的尾段：与 00-tokens.css 的 --momo-sans 字面量**逐字一致**
 *  （改这里两边一起改；脚本守卫钉住两边都不含 var(--momo-*) 引用）。选中的族缺字
 *  （等宽字体没有 CJK）时由这段接住，不会漏出宋体衬线兜底。 */
const FALLBACK_TAIL = '"Noto Sans SC", var(--font-interface, sans-serif)'

/** 偏好值 → 选中族（一个带引号的族名）；null = 这个槽位没选（跟随默认）。
 *  系统字体名在 sanitizeFontPref 里收过白名单（无引号 / 分号），这里套引号当
 *  **一个族名**用，防止拼进 CSS。 */
export function fontFamilyForPref(value: string): string | null {
  if (value === '') return null
  if (value.startsWith('bundled:')) {
    const font = BUNDLED_FONTS.find((f) => `bundled:${f.id}` === value)
    return font ? `"${font.family}"` : null
  }
  return `"${value}"`
}

/**
 * 两个槽位 → head <style> 的全部内容（'' = 两个都没选，不注入任何变量）。
 * 真源函数：运行期 syncFontStyle 与截图脚手架（scripts/shots/harness.ts）
 * 都调它，别在两处各拼一遍——v0.9.35 起脚手架的字体注入必须与运行期逐字一致。
 *
 * 卡片栈把面板的有效栈整条接在后面（卡片族打头）：卡片选了等宽、面板选了楷体时，
 * 卡片里的汉字由面板那套接住——与 80-settings/040-fonts.css 头注同一意图。
 */
export function fontVarsBlock(prefs: { uiFont: string; cardFont: string }): string {
  const ui = fontFamilyForPref(prefs.uiFont)
  const card = fontFamilyForPref(prefs.cardFont)
  if (ui === null && card === null) return ''
  const lines: string[] = []
  if (ui !== null) lines.push(`  --momo-sans: ${ui}, ${FALLBACK_TAIL};`)
  if (card !== null) {
    const tail = ui !== null ? `${ui}, ${FALLBACK_TAIL}` : FALLBACK_TAIL
    lines.push(`  --momo-font-card: ${card}, ${tail};`)
  }
  return `${FONT_HOSTS} {\n${lines.join('\n')}\n}`
}

/**
 * 同步 head 里的字体变量（幂等；两个槽位都空 = 清空内容但保留元素，
 * 免得反复建删）。面板（App 挂载时与字体 prefs 变化时，usePanelUpkeep）与设置页（字体落库的
 * 唯一出口 LookTab 的 applyFonts：格子点击 + 卡头恢复默认，BUG-119b）都调它，
 * 两个宿主改动的是同一份全局规则，谁后调都一样。
 */
export function syncFontStyle(prefs: { uiFont: string; cardFont: string }): void {
  if (typeof document === 'undefined') return
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'momo-fonts'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = fontVarsBlock(prefs)
}
