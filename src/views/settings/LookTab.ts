import {
  BRAND_ICONS,
  BRAND_ICON_EXTS,
  BRAND_ICON_MAX,
  BRAND_ICONS_MAX,
  BRAND_NAME_MAX,
  BUNDLED_FONTS,
  CARD_FONT_SIZE,
  CARD_RADIUS,
  CARD_TITLE_SIZE,
  COLOR_SCHEMES,
  DEFAULT_BRAND_NAME,
  LANG_PREFS,
  TITLE_MAX,
  UI_SCALES,
  clampCardFontSize,
  clampCardRadius,
  clampCardTitleSize,
  clampTitleMaxChars,
  sanitizeBrandIcon,
  sanitizeBrandName,
  sanitizeCardStamp,
  sanitizeColorScheme,
  sanitizeFontPref,
  sanitizeLangPref,
  sanitizeLocPosition,
  sanitizeTagPosition,
  sanitizeUiScale,
  sanitizeWarmRatio,
  type BrandIcon,
  type CardStamp,
  type LangPref,
  type MomoData,
  type UiScale,
  type WarmRatio,
} from '../../momo/types'
import { copy, LANG_NAMES, getLocale, resolveLocale, setLocale } from '../../momo/i18n'
import { getLanguage } from 'obsidian'
import { syncFontStyle } from '../../ui/shared/fontStyle'
import { arrowNav, iconSvg, h } from './dom'
import { actionsMock, metaMock, sizeMock, titleMock } from './mock'
import type { SettingsCtx } from './context'
import { PREFS_DEFAULTS } from './sections'

// ② 界面外观：语言 / 配色 / 字体 / 左上角图标与名称 / 卡片解剖面上的五块
// （信息行 → 标题 → 尺寸 → 操作 → 预热，v0.9.33）。
// 卡序 = **卡片自上而下**的解剖面，行序 = 该区域在预览里的阅读顺序：改哪一行，
// 眼睛就落在下面同一块预览上（2026-10-02「一个 mock 展示一个区域的配置效果」）。
// 2026-10-09 起九张里只剩四张解剖面卡（信息行 / 标题 / 尺寸 / 操作）还配预览：
// 语言 / 配色 / 字体（本身就是视觉的）、正文预热（复现不了悬停动作）、头像与名称
// （两行指的就是侧栏左上角那一角本身）先后按用户要求删掉了各自那块，理由见各卡注释。
// （v0.9.1 的「Ribbon 图标」一行已随 Ribbon 自定义能力整块移除：用户反馈
//  「Ribbon图标 -- 去掉」，上传图片的能力搬到下面的「左上角图标」——
//  侧栏那枚 30px 的 mark 才是插件自己的脸，功能区那枚归 Obsidian 管。
//  v0.9.11：「自定义 CSS」输入框整块移除，换成「自建配色」——调色板自建、
//  可建多套；v0.9.16 自建配色又整块移出设置页、转入 roadmap
//  （docs/requirements/roadmap.md §界面外观，用户裁决「后续的开发内容」），
//  配色方案回到只列内置；同轮新增「字体」卡：系统字体与卡片字体分开配。
//  v0.9.33：原来的「排版与间距」（5 行）与「卡片行为」（12 行）两张卡拆成五张
//  区域卡——12 行那张的预览吊在 800px 之外，改第 3 行时根本看不见下面那块预览。）

/** 连续偏好的钳制（键与 clamp 一一对应，加偏好时两边都要添） */
const SLIDER_CLAMP = {
  cardFontSize: clampCardFontSize,
  cardTitleSize: clampCardTitleSize,
  cardRadius: clampCardRadius,
  titleMaxChars: clampTitleMaxChars,
} as const
type SliderKey = keyof typeof SLIDER_CLAMP

/** 哪几根滑杆的读数带 px（标题字数上限论「字」；单位串在字典里，lint:copy 会查） */
const SLIDER_PX: Record<SliderKey, boolean> = {
  cardFontSize: true,
  cardTitleSize: true,
  cardRadius: true,
  titleMaxChars: false,
}

/**
 * 连续值的微调行（正文字号 / 标题字号 / 卡片圆角 / 标题字数上限，v0.9.12 起都是
 * 滑杆）：轨道 + 右侧当前值与单位。`clamp` 在 set 侧再过一遍——滑杆的 min/max
 * 只约束这一条轨道，data.json 里被手改成 999 的值要靠它收口（与侧栏宽度同一套做法）。
 *
 * `field.desc` 可以是**函数**（按当前值生成一句话）：比如「短首行作为标题」的说明
 * 要报「首行 ≤N 字」——N 就是这根滑杆当前的值。函数的话，拖动时那一行跟着重写，
 * 不然用户看着「≤32 字」 debug 一根指向 60 的滑杆（读数是实时的，说明却是旧的）。
 */
function buildSliderRow(
  ctx: SettingsCtx,
  card: HTMLElement,
  key: SliderKey,
  field: { name: string; desc: string | ((v: number) => string) },
  range: { min: number; max: number; step: number },
): void {
  const unit = SLIDER_PX[key] ? copy.settingsPage.look.sliderUnit.px : copy.settingsPage.look.sliderUnit.chars
  const ctrl = ctx.row(card, field.name, typeof field.desc === 'string' ? field.desc : field.desc(ctx.service.data.prefs[key]))
  const slider = ctx.field.buildSlider(
    range.min,
    range.max,
    range.step,
    () => ctx.service.data.prefs[key],
    (v) => ctx.setPrefLive({ [key]: SLIDER_CLAMP[key](v) }),
    (v) => `${v} ${unit}`,
  )
  const descOf = typeof field.desc === 'string' ? null : field.desc
  if (descOf) {
    // buildSlider 的 input 监听先跑（它负责 set + 自己的读数），这一枚后跑：
    // 读到的是刚落盘的值，说明与滑杆不会一旧一新。
    const descEl = ctrl.parentElement?.querySelector('.momo-set-desc')
    slider.querySelector('input')?.addEventListener('input', () => {
      if (descEl) descEl.textContent = descOf(ctx.service.data.prefs[key])
    })
  }
  ctrl.append(slider)
}

/** 卡片间距仍是三档：档位名是文案，取字典里的 scale */
function buildScaleRow(
  ctx: SettingsCtx,
  card: HTMLElement,
  field: { name: string; desc: string },
  labels: Record<UiScale, string>,
): void {
  ctx.row(card, field.name, field.desc).append(
    ctx.field.segmented<UiScale>(
      UI_SCALES.map((s) => ({ value: s, label: labels[s] })),
      () => ctx.service.data.prefs.cardGap,
      (v) => ctx.setPref({ cardGap: sanitizeUiScale(v) }),
    ),
  )
}

/**
 * 字体选择行（v0.9.16）：**字体格子**，面板字体与卡片字体各一行。
 *
 * 格子即预览——每个格子里的样字用**那套字体**画（内置字体经 @font-face 可直接用，
 * 见 views/fontFaces.ts），选字靠眼睛不靠名字；「默认」格子用继承的字体，代表
 * 「不注入变量」。这与配色方案卡、图标格子同一形制：下拉会把字体压成一行名字，
 * 而「这套字体长什么样」本来就该用字说。
 *
 * 自定义系统字体名输入框已于 2026-10-06 移除（用户要求「移除自定义字体」）：
 * 四套内置字体已覆盖楷 / 黑 / 宋 / 等宽，手输名字只是给「装了什么冷门字体」留的
 * 口子，用的人少还多一处要 sanitize 的注入面。**盘上旧值继续被读取**——
 * sanitizeFontPref 仍放行系统字体名（老 data.json 不被打回默认），只是界面上
 * 不再有输入入口：旧值不等于任何格子，表现为一行里没有格子亮，roving tabindex
 * 落回「默认」格（BUG-82c 的兜底），点任一格即换成新选择。
 */
/**
 * 字体槽位落库的**唯一出口**：落盘 + 重注 head 里的 `#momo-fonts` 变量（BUG-119b）。
 * head `<style>` 是全局单例，谁改字体谁负责重注——格子点击与卡头「恢复默认」都走这里；
 * 旧实现只有格子点击调了 syncFontStyle，面板关着时恢复默认后整页仍是旧字体。
 */
function applyFonts(ctx: SettingsCtx, patch: { uiFont?: string; cardFont?: string }): void {
  ctx.setPref(patch)
  const p = ctx.service.data.prefs
  syncFontStyle({ uiFont: p.uiFont, cardFont: p.cardFont })
}

function buildFontRow(ctx: SettingsCtx, card: HTMLElement, slot: 'uiFont' | 'cardFont'): void {
  const f = copy.settingsPage.look.fonts
  const field = slot === 'uiFont' ? f.uiFont : f.cardFont
  const ctrl = ctx.row(card, field.name, field.desc, { wide: true })
  const prefs = (): MomoData['prefs'] => ctx.service.data.prefs

  /** 取值 → 界面（落盘 + head 变量 + 重绘）。sanitize 在这条路上再过一遍 */
  const apply = (value: string): void => {
    applyFonts(ctx, { [slot]: sanitizeFontPref(value) })
    paint()
  }

  const wrap = h('div', 'momo-set-font')
  const grid = h('div', 'momo-set-font-grid')
  grid.setAttribute('role', 'radiogroup')
  grid.setAttribute('aria-label', field.name)

  /** 一格：样字用那格自己的字体画（默认格继承当前字体），名字放样字下面 */
  interface Tile { el: HTMLButtonElement; value: string }
  const tiles: Tile[] = []
  const buildTile = (value: string, label: string, family: string | null): void => {
    const tile = h('button', 'momo-set-font-tile')
    tile.type = 'button'
    tile.setAttribute('role', 'radio')
    tile.setAttribute('aria-label', label)
    const sample = h('span', 'momo-set-font-sample', f.sample)
    if (family) sample.style.fontFamily = `"${family}"`
    tile.append(sample, h('span', 'momo-set-font-name', label))
    tile.addEventListener('click', () => apply(value))
    tiles.push({ el: tile, value })
    grid.append(tile)
  }
  buildTile('', f.defaultTile, null)
  for (const font of BUNDLED_FONTS) {
    buildTile(`bundled:${font.id}`, copy.meta.fontName[font.id], font.family)
  }


  const paint = (): void => {
    const value = prefs()[slot]
    for (const t of tiles) {
      const on = t.value === value
      t.el.classList.toggle('is-on', on)
      t.el.setAttribute('aria-checked', String(on))
      // roving tabindex：Tab 进组落在选中格，方向键在格间走（见 arrowNav）。
      // BUG-82c：一格都没选中（自定义系统字体名 ≠ 任何 tile 值）时旧实现全组
      // tabIndex 全为 -1——radiogroup 内零可聚焦元素，键盘用户一旦用了系统字体
      // 就再也回不到「默认 / 内置四字体」的格子。兜底把「默认」格设为 0。
      const isFallback = !tiles.some((t) => t.value === value)
      t.el.tabIndex = on || (isFallback && t.value === '') ? 0 : -1
    }
  }

  wrap.append(grid)
  ctrl.append(wrap)
  paint()
  // radio 的箭头即选择：与配色方案卡 / 图标格子同一套键盘语言（WAI-ARIA 自动激活）
  arrowNav(grid, '.momo-set-font-tile', (el) => el.click())
}

/**
 * 左上角图标行（v0.9.3 重做 · v0.9.12 多图重做）：**形状格子 + 图片格子 + 上传格子**
 * ——八枚预设形状（icons.tsx 白名单）一格，用户上传的每张图一格（点哪张用哪张，
 * 每格角上一枚 × 移除），最后一格上传新图（上限 BRAND_ICONS_MAX 张）。
 *
 * 为什么不再是原生 `<select>`：下拉把八个形状压成一行文字，选中了什么全靠
 * 猜；而且它与本页其它选择 UI（分段 / 开关卡）不同语言，是「每个选择 UI 都很丑」
 * 里最刺眼的一个。现在与配色方案同一形制：格子即预览，选中即所见。
 *
 * 上传走**隐藏的 file input**（不引 electron 的原生对话框）：Obsidian 桌面与
 * 移动端都弹得出来，读到的 File 用 arrayBuffer() 交给 service.saveBrandIconImage
 * 落 `<root>/icons/`，data.json 里只留路径（跟着 vault 同步、重装不丢）。
 *
 * v0.9.12 之前这里只有「一张自定义图盖过形状」：换图 = 覆盖写同一个文件，点任一
 * 形状 = 清掉 pref。用户传了图再点别的形状，那张图就找不回来了——「上传图片后，
 * 如果点击其他图标，图片就消失了，这个不好」。现在三件事分开：
 *   · 每张上传的图是**独立文件**（时间戳命名，见 service.saveBrandIconImage），
 *     `prefs.brandIconImages` 记清单、`brandIconImage` 记当前生效那一张；
 *   · 点形状只是把生效位切回形状，**清单不动**——想换回来点那张图的格子即可；
 *   · 移除走格子角上的 ×：文件一并删，删的是当前生效那张时回退到清单里最新的
 *     一张（没有就回形状）。**恢复默认同样不动清单**（BUG-88）：上传的图是 vault
 *     里的用户文件，清掉引用之后界面上再无入口把它们加回来，等于替用户删了图标。
 *
 * 2026-10-09 用户四条：「去掉这段文字」×2——行说明（复述控件）与格区下方那条
 * keepNote 注记（裁决没变，只是不再占屏幕上的一行）整句移除；「去掉预览」——卡尾
 * 那块侧栏左上角缩略整块移除（见 buildLookTab ④ 的注释）；「danpen/icons/….jpg」
 * 那行盘上路径（自定义生效时的状态行）整行移除——每张格子的 title 已有全路径。
 * 同轮按用户「外层容器更大一点」把格子从 36×36 / 3 列放大到 40×40 / 5 列
 * （5×40 + 4×8 = 232px，仍收在 260px 控件列内）：8 枚形状 + 上传格从三层缩成一屏两行。
 */
function buildIconRow(ctx: SettingsCtx, card: HTMLElement): void {
  const bi = copy.settingsPage.look.brandIcon
  const up = copy.settingsPage.look.brandIconUpload
  // 行说明已于 2026-10-09 按用户要求「去掉这段文字」整句移除：点一枚形状就是切换本身、
  // 上传走末尾那颗上传格，那句话是复述控件；格式 / 体积 / 张数留在 note 补充行里。
  const ctrl = ctx.row(card, bi.name, '', {
    note: up.formats({ maxMB: BRAND_ICON_MAX / 1_000_000, max: BRAND_ICONS_MAX }),
  })
  const wrap = h('div', 'momo-set-icons')
  const grid = h('div', 'momo-set-icons-grid')
  grid.setAttribute('role', 'radiogroup')
  grid.setAttribute('aria-label', bi.name)
  const err = h('div', 'momo-set-icons-err')
  err.style.display = 'none'
  const file = h('input', 'momo-set-icons-file')
  file.type = 'file'
  file.accept = BRAND_ICON_EXTS.map((ext) => `.${ext}`).join(',')

  const showErr = (msg: string): void => {
    err.textContent = msg
    err.style.display = msg === '' ? 'none' : ''
  }
  const prefs = (): MomoData['prefs'] => ctx.service.data.prefs

  /** 预设格子：id 同时是 ui/icons PATHS 的键（同一语义 = 同一形状） */
  const presetTiles: Array<{ el: HTMLButtonElement; glyph: HTMLElement; id: BrandIcon }> = []
  for (const opt of BRAND_ICONS) {
    const tile = h('button', 'momo-set-icon')
    tile.type = 'button'
    tile.setAttribute('role', 'radio')
    const glyph = h('span', 'momo-set-icon-glyph')
    glyph.append(iconSvg(opt.id, 20))
    // 格子只有 40×40，名字放进去会挤掉形状；名字改到 aria-label 与 title 之外——
    // 选中哪一枚看形状就够，读屏靠 aria-label。
    tile.setAttribute('aria-label', copy.meta.brandIcon[opt.id])
    tile.append(glyph)
    tile.addEventListener('click', () => {
      // 选形状 = 只把生效位切回预设。**不清 brandIconImages**：上传的图留在
      // 清单里，点回哪张格子就切回哪张——「点一下图就没了」正是要修的反馈。
      ctx.setPref({ brandIcon: sanitizeBrandIcon(opt.id), brandIconImage: '' })
      showErr('')
      paint()
    })
    presetTiles.push({ el: tile, glyph, id: opt.id })
    grid.append(tile)
  }

  // 上传格子：一行收尾的动作格（不是单选格，所以没有 role=radio）。到顶后变暗、
  // 点了只给一句人话——比「弹了文件框却存不下」诚实。
  const uploadTile = h('button', 'momo-set-icon is-upload')
  uploadTile.type = 'button'
  const uploadGlyph = h('span', 'momo-set-icon-glyph')
  uploadTile.setAttribute('aria-label', up.tile)
  uploadTile.append(uploadGlyph)
  uploadTile.addEventListener('click', () => {
    if (prefs().brandIconImages.length >= BRAND_ICONS_MAX) {
      showErr(up.maxed(BRAND_ICONS_MAX))
      return
    }
    file.click()
  })
  grid.append(uploadTile)

  /** 图片格子：清单变动（上传 / 移除）时增删，`imageTiles` 与 DOM 同步 */
  interface ImageTile { path: string; cell: HTMLElement; el: HTMLButtonElement }
  const imageTiles: ImageTile[] = []

  const buildImageTile = (path: string): ImageTile => {
    // 格子 + 角上 × 分两枚按钮、以单元格兄弟相处：嵌进格子会按钮套按钮
    // （无效 HTML，点 × 还会冒泡成「选中这张」）。
    const cell = h('div', 'momo-set-icon-cell')
    const tile = h('button', 'momo-set-icon')
    tile.type = 'button'
    tile.setAttribute('role', 'radio')
    const glyph = h('span', 'momo-set-icon-glyph')
    const img = h('img', 'momo-set-icon-img')
    img.alt = ''
    img.src = ctx.service.app.vault.adapter.getResourcePath(path)
    // 文件被挪走 / 删掉：格子退回上传形状并标 is-broken（虚线 + 暗一档）。
    // **不悄悄改 pref**——「移除」是用户点 × 的事，与侧栏 mark 的口径一致。
    img.addEventListener('error', () => {
      glyph.empty()
      glyph.append(iconSvg('upload', 20))
      tile.classList.add('is-broken')
      tile.title = up.missing
    })
    glyph.append(img)
    tile.append(glyph)
    tile.setAttribute('aria-label', up.tileAt(imageTiles.length + 1))
    tile.title = path
    tile.addEventListener('click', () => {
      ctx.setPref({ brandIconImage: path })
      showErr('')
      paint()
    })
    const del = h('button', 'momo-set-icon-del')
    del.type = 'button'
    del.setAttribute('aria-label', up.delTile)
    del.title = up.delTile
    del.append(iconSvg('close', 10))
    del.addEventListener('click', (ev: MouseEvent) => {
      // 别让这一下冒泡成「选中这张」：刚删掉的图不该抢一次选中
      ev.stopPropagation()
      // BUG-80d：先把盘上的文件删掉，**删成功才**收窄清单 / 抽格子——旧实现
      // 先改 pref 再删文件，删失败被 service 吞掉，「点 ✕ 说删了其实还在」
      // 零反馈。删失败：清单 / 格子原样保留，行内红字说明（与上传错误同一槽）。
      void ctx.service.removeBrandIconImage(path).then((removed) => {
        if (!removed) {
          showErr(up.removeFailed)
          return
        }
        const list = prefs().brandIconImages.filter((p) => p !== path)
        const active = prefs().brandIconImage
        // 删的正是当前生效那张 → 退回清单里最新的（没有就回形状）
        const next = active === path ? (list[list.length - 1] ?? '') : active
        ctx.setPref({ brandIconImages: list, brandIconImage: next })
        const idx = imageTiles.findIndex((t) => t.path === path)
        if (idx >= 0) imageTiles.splice(idx, 1)
        cell.remove()
        // 「第 N 张」是读屏名字：抽掉中间一张后重新编号，别留两个「第 2 张」
        imageTiles.forEach((t, i) => t.el.setAttribute('aria-label', up.tileAt(i + 1)))
        showErr('')
        paint()
        // 焦点别落在被删掉的格子上：回最近一张图，没有就回上传格
        const last = imageTiles[imageTiles.length - 1]
        ;(last ? last.el : uploadTile).focus()
      })
    })
    // 方向键从 × 上起按 = 接着在格子间走（× 不属于格子组，箭头停在它上面
    // 会把键盘用户困住）。把键盘事件转回格子再照常走 arrowNav 的循环。
    del.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' && ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
      ev.preventDefault()
      tile.focus()
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, bubbles: true }))
    })
    cell.append(tile, del)
    return { path, cell, el: tile }
  }

  /** 预览与选中态一律从 service 现读（display() 时的 prefs 快照会指向上一次的设置） */
  const paint = (): void => {
    const imagePath = prefs().brandIconImage
    const preset = prefs().brandIcon
    for (const t of presetTiles) {
      const on = imagePath === '' && t.id === preset
      t.el.classList.toggle('is-on', on)
      t.el.setAttribute('aria-checked', String(on))
      // BUG-82c：同上——自定义图片生效时预设组一格都不选中（aria-checked 全
      // false），Tab 会跳过整组。兜底把第一枚（leaf）设 0，方向键仍可走遍全组。
      const isFallback = imagePath !== ''
      t.el.tabIndex = on || (isFallback && t.id === BRAND_ICONS[0]!.id) ? 0 : -1
    }
    for (const t of imageTiles) {
      const on = t.path === imagePath
      t.el.classList.toggle('is-on', on)
      t.el.setAttribute('aria-checked', String(on))
      t.el.tabIndex = on ? 0 : -1
    }
    // 上传格跟着到顶与否换观感：暗一档 + 不可点的光标，title 说明原因
    const full = prefs().brandIconImages.length >= BRAND_ICONS_MAX
    uploadTile.classList.toggle('is-full', full)
    uploadTile.title = full ? up.maxed(BRAND_ICONS_MAX) : up.tile
    uploadGlyph.empty()
    uploadGlyph.append(iconSvg('upload', 20))
    // Tab 进组只该落在选中格上（roving tabindex），上传格由方向键到达
    uploadTile.tabIndex = -1
  }

  file.addEventListener('change', () => {
    const picked = file.files?.[0]
    // 清掉 value：不清的话第二次选同一个文件不触发 change
    file.value = ''
    if (!picked) return
    const ext = (picked.name.includes('.') ? picked.name.split('.').pop() ?? '' : '').toLowerCase()
    if (!BRAND_ICON_EXTS.includes(ext)) {
      showErr(up.badType)
      return
    }
    if (picked.size > BRAND_ICON_MAX) {
      // v0.9.13：按 MB 说话（老写法把 1_000_000 除 1000 报成「1000KB」，
      // 实际值还带一格小数变成「1400.0KB」）。文案在字典里，这里只给两个数。
      showErr(up.tooBig(BRAND_ICON_MAX / 1_000_000, Number((picked.size / 1_000_000).toFixed(2))))
      return
    }
    if (prefs().brandIconImages.length >= BRAND_ICONS_MAX) {
      showErr(up.maxed(BRAND_ICONS_MAX))
      return
    }
    showErr('')
    void (async () => {
      try {
        const path = await ctx.service.saveBrandIconImage(await picked.arrayBuffer(), ext)
        ctx.setPref({ brandIconImages: [...prefs().brandIconImages, path], brandIconImage: path })
        const tile = buildImageTile(path)
        imageTiles.push(tile)
        // 新图插在上传格之前（上传格是这行的收尾），焦点跟着新格子走：
        // 连着传几张时键盘用户停在新图上，不用重新 Tab 进组。
        grid.insertBefore(tile.cell, uploadTile)
        tile.el.focus()
        paint()
      } catch {
        // 写盘失败（只读分区 / 磁盘满）：图标不动，行内给一句人话
        showErr(up.failed)
      }
    })()
  })

  // 盘上已上传的图标照清单顺序补格子：一律插在上传格之前——上传格是这行的
  // 收尾，图片格永远排在它前面（append 会把它们甩到上传格后面去）。
  for (const path of prefs().brandIconImages) {
    const tile = buildImageTile(path)
    imageTiles.push(tile)
    grid.insertBefore(tile.cell, uploadTile)
  }

  wrap.append(grid, err)
  // 上传 input 必须**挂在文档里**（样式上用 1px 透明占位而不是 display:none）：
  // 游离元素（createElement 后从未 append）调 .click() 不会弹出文件选择框——
  // 桌面端点上传格毫无反应，就是这个原因。历史上这里只建了 input 没 append。
  ctrl.append(file)
  ctrl.append(wrap)
  paint()
  // radio 的箭头即选择：格子组与配色方案卡同一套键盘语言（WAI-ARIA 自动激活）。
  // BUG-176a：但上传格是动作格（弹文件框 / 报满额）——方向键「到达 = 激活」对它
  // 是误伤（用户只想移焦点却弹出系统文件框）。选择器排除 is-upload；上传格没有
  // role=radio、保持独立可聚焦钮，Tab 照常到达。
  arrowNav(grid, '.momo-set-icon:not(.is-upload)', (el) => el.click())
}

export function buildLookTab(ctx: SettingsCtx): void {
  const lk = copy.settingsPage.look

  // ======================= ① 界面语言 =======================
  // 单行卡（一行分段配不上一颗「恢复默认」；页头那把「全部恢复默认」已于
  // 2026-10-04 移除，原先它会连带把 lang 退回 auto）。切换三步连动：
  //   ① ctx.setPref —— data.json 落盘 + useUi.setState（App 根节点以 lang 为 key，
  //      面板整树重挂，memo 化的卡片也全部按新语言重读 copy）；
  //   ② setLocale —— copy 的 Proxy 立即指向新字典；「系统默认」= 撤销手动固定，
  //      回到跟随 Obsidian（getLanguage 只能在 views 这层调，分层约束同 main.ts）；
  //   ③ ctx.rerender —— 设置页自身按新语言重建，行说明里的「当前生效」同步刷新。
  const lg = copy.settingsPage.language
  // 卡头说明已按用户要求整句移除（2026-10-09）：行名与「当前生效」就在卡里，
  // 这句复述「系统默认」怎么跟随、切换何时生效。card() 对空 desc 不建 <p>。
  const cLang = ctx.card('momo-set-look', 'momo-set-look-lang', lg.title, '')
  // is-wide + hug：语言名必须用各语言自己的写法（系统默认 / 中文 / English / 日本語），
  // 压不成「两字段名」那条纪律，260px 的控件列均分四段会把 English / 日本語
  // 切成省略号——所以行走宽行（标签在上、控件在下）拿整卡宽度，分段抱内容。
  ctx.row(cLang, lg.name, lg.current(LANG_NAMES[getLocale()]), { wide: true }).append(
    ctx.field.segmented<LangPref>(
      LANG_PREFS.map((l) => ({ value: l, label: l === 'auto' ? lg.auto : LANG_NAMES[l] })),
      () => ctx.service.data.prefs.lang,
      (v) => {
        const lang = sanitizeLangPref(v)
        ctx.setPref({ lang })
        setLocale(lang === 'auto' ? resolveLocale(getLanguage()) : lang)
        ctx.rerender()
      },
      { hug: true },
    ),
  )

  // ======================= ② 配色方案 =======================
  // 五套内置（2026-10-04 由十套收编为四套，2026-10-09 加 stepfun「StepFun」成五套），
  // 点卡即换（自建配色 v0.9.16 整块移出设置页、转入 roadmap，这张卡仍是恢复默认的
  // 主战场：手动退回去不现实）。恢复 = 只回内置
  // 默认配色；盘上 customCss 遗留片段**不清**（BUG-119a：它无编辑入口，清了补不回来，
  // 见 sections.ts PREFS_DEFAULTS 的注释）。随后的 rerender 让 display() 重挂 theme 类。
  // 本页各卡的默认值都从这把取（唯一真源，不另抄一份）
  const D = PREFS_DEFAULTS
  // 卡头说明已按用户要求整句移除（2026-10-09）：原先那句复述「几套 + 点一张就换色」，
  // 而色卡就在这张卡里、点一张整页立刻变色。card() 对空 desc 不建 <p>。
  const cScheme = ctx.card('momo-set-look', 'momo-set-look-scheme', lk.cards.scheme.title, '', {
    onReset: () => {
      ctx.setPref({ colorScheme: D.colorScheme })
      ctx.rerender()
    },
  })

  const prefsNow = (): MomoData['prefs'] => ctx.service.data.prefs
  const cs = lk.colorScheme

  // 行说明「点一张卡片即切换」与色卡组下方那行「当前：…」已按用户要求整句移除
  // （2026-10-09）：前者是复述控件（点一下就是切换本身），后者的前缀 + 名字与
  // 说明同样是废话——选中的色卡自己穿着那套配色。row() 对空 desc 不建 <p>，
  // current 元素与 paintCurrent 随之删除。
  const ctrl = ctx.row(cScheme, cs.name, '', { wide: true })
  ctrl.append(
    ctx.field.schemePicker(
      COLOR_SCHEMES.map((s) => ({ value: s.id, label: copy.meta.colorScheme[s.id].name })),
      () => prefsNow().colorScheme,
      (v) => {
        const scheme = sanitizeColorScheme(v)
        ctx.setPref({ colorScheme: scheme })
        ctx.applyScheme(scheme)
      },
    ),
  )

  // ======================= ③ 字体 =======================
  // 系统字体（面板界面文字）与卡片字体分开配（v0.9.16 用户要求「用户可以分别
  // 配置系统字体和卡片字体」）。四套开源字体随插件分发（fonts/ 目录 + views/
  // fontFaces.ts 的 @font-face），离线可用；选值即改即生效（head 变量同步），
  // 恢复 = 两格都回空串（面板走 --momo-sans 原栈，卡片从面板继承）。
  // 卡头说明整句移除（2026-10-11 用户要求「去掉这段文字」）：原先那句讲「面板与
  // 卡片各用哪套字、内置四套开源字体」，而下面两行的字面标题（面板字体 / 卡片
  // 字体）加各自的预览格子就是它的图解，desc 只是复述。card() 对空 desc 不建 <p>。
  const cFont = ctx.card('momo-set-look', 'momo-set-look-font', lk.fonts.title, '', {
    onReset: () => {
      applyFonts(ctx, { uiFont: D.uiFont, cardFont: D.cardFont })
      ctx.rerender()
    },
  })
  buildFontRow(ctx, cFont, 'uiFont')
  buildFontRow(ctx, cFont, 'cardFont')

  // ======================= ④ 头像与名称 =======================
  // 恢复 = 叶子形状 + 默认名 + 生效位回空串。**上传的图片清单不动**（BUG-88）：
  // 那些图是 vault 里的普通文件、用户数据，与 locCoords / pinnedNotes 同一类
  // curation；旧实现连清单一起清——盘上文件虽然留着，界面上却再无入口把它们加
  // 回来，等于替用户删了图标（用户原话「恢复默认时，不要删掉用户上传的图标啊！」）。
  // 想彻底删得在格子上逐张点 ×，见 buildIconRow。
  //
  // 2026-10-09 用户两条：「去掉这段文字」（卡头说明整句移除——原先那句讲「露哪张脸、
  // 叫什么、上传多张点一下就切换」，而行名与行说明就在卡里摆着，格子本身就是预览）
  // 与「去掉预览」（原先卡尾那块「侧栏左上角」预览：mark 跟着图标格子走、名称跟着
  // 输入框走——它讲的两行指的就是侧栏左上角那一角本身，时时刻刻在用户眼前，再画
  // 一枚小 mark 只是同一件事的第二份表述，与面板 / 回顾 / 统计页三块同一条判据）。
  // card() 对空 desc 不建 <p>。
  const cBrand = ctx.card('momo-set-look', 'momo-set-look-brand', lk.cards.brand.title, '', {
    onReset: () => {
      ctx.setPref({
        brandIcon: D.brandIcon,
        brandIconImage: D.brandIconImage,
        brandName: D.brandName,
      })
      ctx.rerender()
    },
  })
  buildIconRow(ctx, cBrand)

  {
    const ctrl = ctx.row(
      cBrand,
      lk.brandName.name,
      lk.brandNameDesc({ max: BRAND_NAME_MAX, fallback: DEFAULT_BRAND_NAME }),
    )
    // sanitizeBrandName 会 trim 并截到 BRAND_NAME_MAX：不回写的话用户在这儿看到的
    // 是原样输入，重开设置页才发现那几个字没进去。失焦即结算（flush）。
    // BUG-76：结算时**焦点还在输入框里**就不回写——旧实现在 600ms 停顿时把
    // sanitize 值写回 input：尾部空格被删、全选清空后「Momo」自动长回、超长
    // 中途截断跳光标，全是「打字中途被程序改写」。回写留给 blur 的 flush
    // （那时 activeElement 已离开，写回的是 sanitize 后的真实值）。
    const save = ctx.deferral(600, (v: string) => {
      const next = sanitizeBrandName(v)
      ctx.setPref({ brandName: next })
      if (document.activeElement === input) return
      if (next === v) return
      input.value = next
    })
    const input = ctx.field.textInput(ctx.prefs.brandName, DEFAULT_BRAND_NAME, save.push)
    input.addEventListener('blur', () => save.flush())
    ctrl.append(input)
  }

  // 刻意不配预览（2026-10-09 用户要求「去掉预览」）：原先卡尾那块「侧栏左上角」预览
  // （brandMock：mark 跟着图标格子走、名称跟着上面那行走）已整块移除，连带字典
  // mock.brand 与 CSS .momo-set-mock-{brand,mark,mark-img,name}——它讲的两行指的就
  // 是侧栏左上角那一角本身，时时刻刻在用户眼前，再画一枚只是同一件事的第二份表述
  // （与面板 / 回顾 / 统计页三块同一条判据）。两行偏好一行未动，照旧落盘。

  // ======================= ⑤ 卡片信息行 =======================
  // 卡片最上面那一行：时间粒度 / 字数 / #标签排哪一行 / 地点排哪一行。四行的落点
  // 都在下面那块预览的**同一段**里——标签与地点拨到「卡片底部」时，预览里底部那两
  // 行也是跟着亮的那一块（mock.ts 把两者算作同一个 focus 区域）。
  // 恢复默认只收这四行：原来它与字号 / 圆角 / 间距共用一颗，想退回时间粒度得把
  // 另外三行一起赔进去。
  const cMeta = ctx.card('momo-set-look', 'momo-set-look-meta', lk.cards.meta.title, lk.cards.meta.desc, {
    onReset: () => {
      ctx.setPref({
        cardStamp: D.cardStamp,
        showCharCount: D.showCharCount,
        tagPosition: D.tagPosition,
        locPosition: D.locPosition,
      })
      ctx.rerender()
    },
  })

  // 卡内四行的行说明整句移除（2026-10-11 用户要求「去掉这段文字」：卡片时间显示 /
  // 显示字数 / 标签位置 / 地点位置）——行名 + 段内档位已经把「哪个开关、带哪一档」
  // 说完，改哪一行眼睛落在卡片预览里对应的那枚 chip 或那个时刻上。row() 对空
  // desc 不建 <p>（head-main 是 flex-column + gap，留空元素就是白留条缝）。
  ctx.row(cMeta, lk.cardStamp.name, '').append(
    ctx.field.segmented<CardStamp>(
      [
        { value: 'auto', label: lk.cardStamp.auto },
        { value: 'day', label: lk.cardStamp.day },
        { value: 'full', label: lk.cardStamp.full },
      ],
      () => ctx.service.data.prefs.cardStamp,
      (v) => ctx.setPref({ cardStamp: sanitizeCardStamp(v) }),
    ),
  )

  ctx.row(cMeta, lk.showCharCount.name, '').append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.showCharCount,
      (v) => ctx.setPref({ showCharCount: v }),
    ),
  )

  // 正常 #标签 的位置（v0.9.22 起只管 tagPosition）
  ctx.row(cMeta, lk.tagPosition.name, '').append(
    ctx.field.segmented(
      [
        { value: 'meta' as const, label: lk.tagPosition.meta },
        { value: 'bottom' as const, label: lk.tagPosition.bottom },
      ],
      () => ctx.service.data.prefs.tagPosition,
      (v) => ctx.setPref({ tagPosition: sanitizeTagPosition(v) }),
    ),
  )

  // 地点标签的位置（2026-10-01 用户要求把「标签位置」拆成两家：标签 vs 地点标签）。
  // 与上一行同形、紧挨着——两档各自独立，改哪一行眼睛落在预览里对应的那枚 chip 上。
  ctx.row(cMeta, lk.locPosition.name, '').append(
    ctx.field.segmented(
      [
        { value: 'meta' as const, label: lk.locPosition.meta },
        { value: 'bottom' as const, label: lk.locPosition.bottom },
      ],
      () => ctx.service.data.prefs.locPosition,
      (v) => ctx.setPref({ locPosition: sanitizeLocPosition(v) }),
    ),
  )

  // 预览：同一张卡，只有信息行那一段是亮的（标签排到底部时，底部那两行一起亮）
  cMeta.append(metaMock(ctx))

  // ======================= ⑥ 卡片标题 =======================
  // 「短首行作为标题」三件套：开关 + 字数上限 + 标题字号。三行说的是同一件事——
  // 这个开关开着时，首行多短才升格、升格后多大。上限与字号排在小开关**下面**
  // 而不是并到「尺寸」卡的字号里去：它们只在开关开着时才有东西可缩，跟着开关
  // 才找得到（摆在别处，关着开关的人根本不知道它们在等什么）。
  const cTitle = ctx.card('momo-set-look', 'momo-set-look-title', lk.cards.title.title, lk.cards.title.desc, {
    onReset: () => {
      ctx.setPref({
        titleFromFirstLine: D.titleFromFirstLine,
        titleMaxChars: D.titleMaxChars,
        cardTitleSize: D.cardTitleSize,
      })
      ctx.rerender()
    },
  })

  // 说明里**不写数字**（上限可配，写死一个数只会变成假的）：数字住下面那行的
  // 实时读数里，两边各说各的才不会一旧一新。2026-10-11 用户要求「去掉这段文字」
  // 里的那句「多短算短看『标题字数上限』」也一并删了——指路指到同一张卡的下一行，
  // 而那个滑杆就在眼前。
  ctx.row(cTitle, lk.titleFromFirstLine.name, lk.titleFromFirstLine.desc).append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.titleFromFirstLine,
      (v) => ctx.setPref({ titleFromFirstLine: v }),
    ),
  )

  // 「短首行作为标题」的字数上限（v0.9.12 用户要求「允许自定义字数」；此前写死 32）
  // 与标题字号（同年用户要求「这个标题字号大小的选项」）。
  // 拖动即重切标题：Card / ReviewCard 的 memo 依赖里都有 titleMaxChars，
  // store 一改就重新 split，不用重建整页。
  buildSliderRow(ctx, cTitle, 'titleMaxChars', lk.titleMaxChars, TITLE_MAX)
  buildSliderRow(ctx, cTitle, 'cardTitleSize', lk.cardTitleSize, CARD_TITLE_SIZE)

  // 预览：标题那一行亮着，拖字号滑杆它实时变大变小
  cTitle.append(titleMock(ctx))

  // ======================= ⑦ 卡片尺寸 =======================
  // 正文多大、卡片多圆、两张之间留多少空——都是整张卡的形状，与「卡上写什么」
  // 无关，所以单独一张。间距仍是三档（紧凑 / 标准 / 宽松是名字不是尺寸，且它一次
  // 影响四种密度的卡片流）；字号与圆角 v0.9.12 起是滑杆（用户反馈「最好是拖拽的」：
  // 三档里总有一档嫌大、一档嫌小）。滑杆的 live 落盘与侧栏宽度同一档
  // （setPrefLive：每帧合并、persist 兜底，不刷全库）。
  const cSize = ctx.card('momo-set-look', 'momo-set-look-size', lk.cards.size.title, lk.cards.size.desc, {
    onReset: () => {
      ctx.setPref({
        cardFontSize: D.cardFontSize,
        cardRadius: D.cardRadius,
        cardGap: D.cardGap,
      })
      ctx.rerender()
    },
  })
  buildSliderRow(ctx, cSize, 'cardFontSize', lk.cardFontSize, CARD_FONT_SIZE)
  buildSliderRow(ctx, cSize, 'cardRadius', lk.cardRadius, CARD_RADIUS)
  buildScaleRow(ctx, cSize, lk.cardGap, lk.cardGap.scale)

  // 预览：两张挨在一起的卡——间距只有两张挨在一起才看得出来，字号与圆角也一起显形
  cSize.append(sizeMock(ctx))

  // ======================= ⑧ 卡片操作 =======================
  // 悬停卡片时右上角那排按钮出谁不出谁（v0.9.22，用户要求「加标签、复制正文、
  // 删除都可以在配置页面开启和关闭」）+ 只读浏览。四行说的是同一块区域：操作行。
  // 恢复默认 = 回到「非只读 / 三枚按钮全开」。
  // 卡头说明已按用户要求整句移除（2026-10-09）：原先那句复述「悬停时右上角出现哪几枚
  // 按钮、只读浏览的样子」，四行加预览自己就说清了。card() 对空 desc 不建 <p>。
  const cActions = ctx.card('momo-set-look', 'momo-set-look-actions', lk.cards.actions.title, '', {
    onReset: () => {
      ctx.setPref({
        readOnly: D.readOnly,
        showCardCopy: D.showCardCopy,
        showCardTag: D.showCardTag,
        showCardDelete: D.showCardDelete,
      })
      ctx.rerender()
    },
  })

  // 只读浏览排在操作行三枚**之前**是刻意的（v0.9.22 起的那条规矩）——只读态那枚
  // 「在 Obsidian 中打开」不受下面三个开关管（readOnly 开启后它是唯一打开入口），
  // 两段开关摆一起容易让人以为铅笔也能关。
  ctx.row(cActions, lk.readOnly.name, lk.readOnly.desc).append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.readOnly,
      (v) => ctx.setPref({ readOnly: v }),
    ),
  )

  // ---- 右上角操作按钮的显隐：三枚一排开关。行说明已按用户要求整句移除
  // （2026-10-09）：原先写「关掉后的替代入口」（加标签 / 删除有多选批量条；复制
  // 没有，只能去文件里手动选），行名已经说出是哪一枚。row() 对空 desc 不建 <p>。
  ctx.row(cActions, lk.showCardCopy.name, '').append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.showCardCopy,
      (v) => ctx.setPref({ showCardCopy: v }),
    ),
  )
  ctx.row(cActions, lk.showCardTag.name, '').append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.showCardTag,
      (v) => ctx.setPref({ showCardTag: v }),
    ),
  )
  ctx.row(cActions, lk.showCardDelete.name, '').append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.showCardDelete,
      (v) => ctx.setPref({ showCardDelete: v }),
    ),
  )

  // 预览：同一张卡，只有右上角那排按钮是亮的——关掉哪一档，那一枚连同它的位置一起
  // 消失；开着只读时卡片下面多一句「点正文不打开 Obsidian」的提示。
  cActions.append(actionsMock(ctx))

  // ======================= ⑨ 正文预热 =======================
  // 正文预热比例（v0.9.14 用户要求可配）：悬停顶栏视图分段时提前渲染可见列表前
  // 这么多比例的正文。换算口径在 momo/types 的 warmRatioValue。
  // 这张卡刻意**不配**「恢复默认」：只有一行四档分段，默认档写在说明里（「默认一半」），
  // 拨回去是一步的事。
  // 也刻意**不配**预览（2026-10-06 用户要求「正文预热，不需要显示 preview」）：
  // preview 里那一块画的是悬停那一下的渲染节奏（正文切一刀 + 一根切点线），而这个
  // 动作在设置页里复现不了；四档档位名已经把「预热多少」说清了。连带删除
  // mock.ts 的 warmMock、字典 mock.warm 与 CSS .momo-set-mock-warm*。
  const cWarm = ctx.card('momo-set-look', 'momo-set-look-warm', lk.cards.warm.title, lk.cards.warm.desc)
  ctx.row(cWarm, lk.warmRatio.name, lk.warmRatio.desc).append(
    ctx.field.segmented<WarmRatio>(
      [
        { value: 'off', label: lk.warmRatio.options.off },
        { value: 'quarter', label: lk.warmRatio.options.quarter },
        { value: 'half', label: lk.warmRatio.options.half },
        { value: 'full', label: lk.warmRatio.options.full },
      ],
      () => ctx.service.data.prefs.warmRatio,
      (v) => ctx.setPref({ warmRatio: sanitizeWarmRatio(v) }),
    ),
  )
}

