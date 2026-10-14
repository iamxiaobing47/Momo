import { FONT_ROLE_PREFIX, type FontRole, type RetiredFontRole } from '../../momo/types'
import type { FontFaceSpec } from '../../momo/fonts/pack'

// 字体偏好的运行时注入（v0.9.16；2026-10-13 换成 setCssProps，见下）。
//
// 内容是两个 CSS 变量（--momo-sans / --momo-font-card），写在**四类宿主元素的内联样式**上
// （`.momo-app` / `.momo-confirm` / `.momo-settings` / `.momo-set-scheme`，与
// styles.src/00-tokens.css 的令牌块同一张宿主表）。
//
// 为什么必须落到**宿主自身**、不能挂在某个共同祖先上：令牌块在那四个选择器上各自声明了
// `--momo-sans` 本体，元素自己的声明压过从祖先继承来的值——挂 body 只会被宿主自己盖掉。
// 内联样式又压过任何选择器，所以这才是「选了就生效」的写法。
//
// 为什么不再是 `<style>` 注入（2026-10-13，Obsidian 提交评审）：评审的
// `obsidianmd/no-forbidden-elements` 把「运行期创建 / 挂载 style 元素」列为 Error
// ——动态样式表是插件不该走的门（BUG-217）。旧实现往 document.head 塞
// `<style id="momo-fonts">`、内核里按四类宿主选择器写规则；现在改成 `setCssProps()`
// 直接写内联变量，选择器那一层整个不需要了。
//
// 代价（诚实记录）：新挂载的宿主**不会**自动带上变量（旧实现的全局 `<style>` 是
// 一挂就全局生效）。所以每个创建宿主的调用点都要调一次 `applyFontVars(el)`——四处：
// `ui/app/AppShell`（面板根）、`views/caps`（确认 / 补记弹窗）、
// `views/settings/settings`（设置页根）、`views/settings/fields`（配色方案卡）。
// 漏一处 = 那个宿主回落到 00-tokens 的默认字体，症状是「某个弹窗字体不跟设置走」。
//
// v1.0.0：内置开源字体（四套、随插件分发 ~70MB）退役，改用 **Obsidian 自己提供的
// 字体**——界面 / 正文 / 等宽三个角色，对应宿主变量 --font-interface /
// --font-text / --font-monospace（Obsidian「外观」里的三档字体设置写的就是它们）。
// 用户在 Obsidian 里改一次，面板与卡片跟着变。静态 @font-face 注入（旧
// views/fontFaces.ts）随之删除：插件不再自带字体文件。
// 2026-10-13：界面 / 正文两个角色从设置页格子退役（用户要求「就提供默认和等宽
// 两种」），但 ROLE_CSS **仍留着它们的映射**——老 data.json 里的
// obsidian:interface / obsidian:text 要继续生效（退役 ≠ 旧值失效）。
//
// 🔑 2026-10-06 修（用户报障「修改系统字体影响卡片字体」）：旧形状注入的是
// **--momo-font-ui**，其栈尾挂着 var(--momo-sans)；而 00-tokens.css 的
// --momo-sans 第一族又是 var(--momo-font-ui, …)——两个自定义属性
// 挂在**同一批四类宿主**上、互为首尾 = CSS 变量环。Chromium 实测（探针
// tmp/font-probe.mjs，真浏览器读 getComputedStyle）：环内属性 invalid at
// computed-value time，三个变量的计算值全空，后果比报障更宽——
//   ① --momo-sans 失效 → 面板自己的字体选择静默不生效（回落宿主主题字体）；
//   ② --momo-font-card 失效 → .momo-card 的 font-family:
//      var(--momo-font-card, inherit) 走 fallback inherit → **卡片跟着面板字体跑**。
// 只有「一个都没选」时才不发作，所以 v0.9.16 以来只要动过系统字体，卡片字体
// 选择就是哑的。现在的形状：面板字体**整条覆盖 --momo-sans 本体**（选中族 +
// 默认尾栈），卡片栈 = 卡片族 + 面板当前有效栈；两条注入互不引用、也都不引用
// 任何 momo 自定义属性（唯一的外部引用是宿主主题的 --font-* 三个变量），
// 结构上不可能再成环。守卫：scripts/font-vars-cycle.test.mts。

/** 变量挂载的四类宿主：与 00-tokens.css 令牌块的选择器同表（含色卡预览 .momo-set-scheme）。 */
const FONT_HOSTS = '.momo-app, .momo-confirm, .momo-settings, .momo-set-scheme'

/** 运行期注入的两个变量名。撤值 / 重注都只碰这两个，不整条清 `style`。 */
const FONT_VAR_KEYS = ['--momo-sans', '--momo-font-card'] as const
type FontVarKey = (typeof FONT_VAR_KEYS)[number]

/** 默认面板字体栈的尾段：与 00-tokens.css 的 --momo-sans 字面量**逐字一致**
 *  （改这里两边一起改；脚本守卫钉住两边都不含 var(--momo-*) 引用）。选中族缺字
 *  （比如等宽字体没有 CJK）时由这段接住，不会漏出衬线兜底。 */
const FALLBACK_TAIL = 'var(--font-interface, sans-serif)'

/** Obsidian 的字体角色 → 实际 CSS 值。三个都是宿主主题提供的变量（不引用
 *  任何 momo 自定义属性，避免再现 2026-10-06 那个变量环）。
 *  2026-10-13 起界面 / 正文只是**没有设置页格子**（退役），映射必须留着——
 *  盘上旧值走 fontFamilyForPref 时还要靠它们解析。 */
const ROLE_CSS: Record<FontRole | RetiredFontRole, string> = {
  interface: 'var(--font-interface, sans-serif)',
  text: 'var(--font-text, sans-serif)',
  monospace: 'var(--font-monospace, monospace)',
}

/** 当前生效的变量（模块级）。新宿主挂载时靠它立刻穿上同一份值——见 applyFontVars。 */
let currentVars: Partial<Record<FontVarKey, string>> = {}

/** Obsidian 字体角色 → 实际 CSS 值。给设置页预览格用（与运行期 fontVars
 *  同一份映射）。 */
export function fontRoleCss(role: FontRole): string {
  return ROLE_CSS[role]
}

/** 偏好值 → 选中的 CSS 值（角色变量 / 一个带引号的族名）；null = 这个槽位没选（跟随默认）。
 *  · `obsidian:<role>` → Obsidian 字体角色对应的宿主变量；
 *  · 其余非空值 → 历史遗留的手输系统字体名（sanitizeFontPref 已收白名单：无引号 /
 *    分号），这里套引号当**一个族名**用，防止拼进 CSS。 */
export function fontFamilyForPref(value: string): string | null {
  if (value === '') return null
  if (value.startsWith(FONT_ROLE_PREFIX)) {
    // 退役角色（interface / text）也在这张表里：老 data.json 的旧值继续生效
    const role = value.slice(FONT_ROLE_PREFIX.length) as FontRole | RetiredFontRole
    return ROLE_CSS[role] ?? null
  }
  return `"${value}"`
}

/**
 * 两个槽位 → 要写到宿主上的内联变量（空对象 = 两个都没选，一个变量都不注入）。
 * 真源函数：运行期 syncFontStyle 调它，别在两处各拼一遍。
 *
 * 卡片栈把面板的有效栈整条接在后面（卡片族打头）：卡片选了等宽、面板选了界面字体时，
 * 卡片里的汉字由面板那套接住——与 80-settings/040-fonts.css 头注同一意图。
 */
export function fontVars(prefs: { uiFont: string; cardFont: string }): Partial<Record<FontVarKey, string>> {
  const ui = fontFamilyForPref(prefs.uiFont)
  const card = fontFamilyForPref(prefs.cardFont)
  const vars: Partial<Record<FontVarKey, string>> = {}
  if (ui !== null) vars['--momo-sans'] = `${ui}, ${FALLBACK_TAIL}`
  if (card !== null) {
    const tail = ui !== null ? `${ui}, ${FALLBACK_TAIL}` : FALLBACK_TAIL
    vars['--momo-font-card'] = `${card}, ${tail}`
  }
  return vars
}

/**
 * 把当前变量穿到**一个**宿主上。两件必做的事：
 *
 * 1. 没选的键要**显式撤掉**——用户把字体改回「跟随默认」时，旧的 inline 值不清掉，
 *    00-tokens 的默认本体就再也压不回来（字体改不回去）。
 * 2. 新挂载的宿主必须**主动调一次**（全局 `<style>` 时代不需要，这也是那次改动的
 *    唯一代价，四个调用点在文件头列齐了）。
 */
export function applyFontVars(el: HTMLElement): void {
  for (const key of FONT_VAR_KEYS) {
    if (currentVars[key] === undefined) el.style.removeProperty(key)
  }
  el.setCssProps({ ...currentVars })
}

/**
 * 同步字体变量（幂等）：记下当前值，再穿到**文档里已存在的**四类宿主上。
 *
 * 调用点：面板（App 挂载时与字体 prefs 变化时，usePanelUpkeep）与设置页（字体落库的
 * 唯一出口 LookTab 的 applyFonts：格子点击 + 卡头恢复默认，BUG-119b）都调它，
 * 两个宿主改动的是同一份全局值，谁后调都一样。
 */
export function syncFontStyle(prefs: { uiFont: string; cardFont: string }): void {
  currentVars = fontVars(prefs)
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLElement>(FONT_HOSTS).forEach((el) => applyFontVars(el))
}

/** 卸载时撤掉运行期注入的字体变量（四类宿主上的两个内联自定义属性）；styles.css 那份由 Obsidian 撤。 */
export function removeFontVars(): void {
  currentVars = {}
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLElement>(FONT_HOSTS).forEach((el) => {
    for (const key of FONT_VAR_KEYS) el.style.removeProperty(key)
  })
}

/** 已注册的 FontFace（`family@weight`）：同一套字体包重复注册毫无意义 */
const registeredFaces = new Set<string>()

/**
 * 把下载下来的字体包注册成 **FontFace**（2026-10-13，开源字体按需下载）。
 *
 * 为什么不是 `@font-face` 规则：运行期建 `<style>` 是 Obsidian 评审的 Error
 * （BUG-217 同一条判据），而下载来的 ttf 在构建期不存在、静态规则引用不到。
 * `document.fonts.add(new FontFace(...))` 是剩下的正路——它往文档的 FontFaceSet
 * 里塞一枚字体，`font-family: "Noto Sans SC"` 立刻能解析，不碰任何样式元素。
 *
 * 幂等按 `family@weight` 记（霞鹩文楷的 Regular / Medium 同家族不同字重，是两枚）；
 * 单个字重加载失败（字节损坏 / 内核不接受）只跳过它——字体栈逐级回落，面板与
 * 卡片回到默认那套字，不牵连其它字重与其它包。
 *
 * 调用点两处：设置页字体格子（下载完成 / 打开页面时，保证样字画得出来）与面板
 * 挂载（偏好引用了某套字体包时懒注册，见 usePanelUpkeep）。
 */
export async function registerFontFaces(faces: readonly FontFaceSpec[]): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return
  // lib.dom 的 FontFaceSet 还没有 add() 的声明（TS 版本偏旧），这里按标准 API 收窄
  const fonts = document.fonts as FontFaceSet & { add(face: FontFace): FontFace }
  for (const f of faces) {
    const key = `${f.family}@${f.weight}`
    if (registeredFaces.has(key)) continue
    try {
      const face = new FontFace(f.family, f.buffer, { weight: f.weight })
      fonts.add(face)
      await face.load()
      registeredFaces.add(key)
    } catch {
      // 见上方注释：单个字重失败不牵连其它
    }
  }
}

/**
 * 这套字（任一字重）注册过没有——调用方据此避免把几十 MB 字节重复读回来
 * （2026-10-14：设置页点「已下载」格子时补注册用；注册记忆是模块级的，换个
 * Obsidian 会话就空了，那时才真需要读一次盘）。
 */
export function fontPackRegistered(family: string): boolean {
  const prefix = `${family}@`
  for (const key of registeredFaces) if (key.startsWith(prefix)) return true
  return false
}