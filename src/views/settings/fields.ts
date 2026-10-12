import { copy } from '../../momo/i18n'
import { arrowNav, h, iconSvg, stepfunLogoSvg } from './dom'

/** StepFun 方案的 id：色卡名称行右侧带一枚品牌标（见 schemePicker 内） */
const STEPFUN_SCHEME = 'stepfun'

// 设置页控件库：输入框 / 分段 / 方案卡选择器 / 开关 / 滑块 / 步进器。
// 全部是「传 get/set 一对回调，自己重绘」的形状——控件不持有状态，值永远从
// service 现读，所以连点两个开关不会互相覆盖（v0.7.6 修复的根因）。
//
// 外观纪律（v0.9.6 按设计稿重绘）：控件只建 DOM 与交互，**长相全部在
// styles.src/80-settings.css**。全页只有一条选中语言——accent-soft 浅底 +
// 1px accent 描边 + 文字转 accent 加粗（v0.9.12 起方案卡不再带勾：三段预览
// 加名称已说清「选的哪套」，且选中是当前所选而非已确认的动作；全页仅统计页
// chip 还留一枚前缀勾）；分页 tab 是唯一例外（走 accent 下划线，它是导航不是开关）。
// 不在这层写任何色值 / 字号。

/** 把任意值夹回 [min, max] */
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** 输入框 34 / r9 / surface（外观走统一输入语言 .momo-input） */
export function textInput(
  value: string,
  placeholder: string,
  onInput: (v: string) => void,
  cls = '',
): HTMLInputElement {
  const input = h('input', `momo-input momo-set-input ${cls}`.trim())
  input.type = 'text'
  input.value = value
  input.placeholder = placeholder
  input.addEventListener('input', () => onInput(input.value))
  return input
}

/**
 * 分段控件 34 / r8：轨道是 surface 底，段 28 / r6。
 * 选中态 = 全局统一的那一条：**白底 + 1px accent 描边 + accent 加粗字**——
 * 三个信号一起说，且不靠明度差（石白主题里 card 与 surface 只差 3%，
 * 只做「白底浮起」等于没做）。段内**不放勾**：勾会让选中段变宽，
 * 切换时整条控件左右抖一下。
 *
 * 段内文字默认均分轨道宽度、放不下就省略号——所以**档位名一律两字**（见 i18n
 * 的注释）。例外的只有「界面语言」：语言名必须用各语言自己的写法（系统默认 / 中文 /
 * English / 日本語，见 i18n 的 LANG_NAMES），压不成两字，那一行因此传 `hug`：
 * 轨道改为抱内容宽度、段也跟着内容走，并且行本身走 is-wide（标签在上、控件在下）
 * 拿到整卡宽度。别处要加分段先想「能不能压成两字」，能压就别开 hug。
 */
export function segmented<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  get: () => T,
  set: (v: T) => void,
  opts?: { hug?: boolean },
): HTMLElement {
  const wrap = h('div', `momo-set-seg${opts?.hug ? ' is-hug' : ''}`)
  wrap.setAttribute('role', 'radiogroup')
  const items: HTMLButtonElement[] = []
  const paint = () => {
    options.forEach((opt, i) => {
      const on = opt.value === get()
      items[i].classList.toggle('is-on', on)
      items[i].setAttribute('aria-checked', String(on))
      // roving tabindex：Tab 一次进组落在选中段上，其余段用方向键走（见 arrowNav）
      items[i].tabIndex = on ? 0 : -1
    })
  }
  for (const opt of options) {
    const item = h('button', 'momo-set-seg-item')
    item.type = 'button'
    item.setAttribute('role', 'radio')
    item.append(h('span', 'momo-set-seg-text', opt.label))
    item.addEventListener('click', () => {
      set(opt.value)
      paint()
    })
    items.push(item)
    wrap.append(item)
  }
  paint()
  // radio 的箭头即选择：左右 / 上下循环移动并直接触发（WAI-ARIA 推荐自动激活）
  arrowNav(wrap, '.momo-set-seg-item', (el) => el.click())
  return wrap
}

/** 方案卡选择器的一览项（结构元数据；名字是文案，由调用方从字典取） */
export interface SchemeCardOption {
  value: string
  /** 方案名：卡内名称行的文字 */
  label: string
}

/**
 * 配色方案卡（v0.9.6 重做：一格一方案，**预览条 = 该方案自己的三色**）——
 * 取代「色块 + 全名 + 一句话说明」那一版：说明塞进卡里会让卡片高矮不一，
 * 而「这套配色长什么样」本来就该用颜色说，不是用文字说。说明改到卡下方的
 * 「当前取值」一行里，只显示选中的那一条。
 *
 * 预览三段（底色 / 卡片色 / 强调色）**不在这里抄色值**：卡自己挂上
 * `momo-theme-<id>`（令牌在 styles.src/themes/<id>.css），所以三段读到的正是
 * 这张卡所代表方案的 --momo-page / --momo-card / --momo-accent。换句话说，每张卡
 * 各自穿自己那套衣服，新增 / 切换方案时不需要在 TS 里动一根手指（id 清单见
 * COLOR_SCHEMES）。
 *
 * 选中态 = 全局统一的那一条：accent-soft 底 + 1px accent 描边 + 名称转 accent
 * 加粗。名称右侧**不放勾**（v0.9.12 用户反馈去掉）：分段控件本就不带勾，
 * 且预览三段 + 名称已经说清「这套长什么样、选中的是哪套」，一枚勾反而让
 * 选中卡看起来像「已确认」的动作而不是「当前所选」。
 *
 * （v0.9.16 自建配色整块移出设置页、转入 roadmap，`custom` / `new` 卡与编辑钮
 * 一并退场——选择器回到只列内置方案。）
 *
 * 2026-10-09 起 StepFun 那张卡的名称行右侧多一枚**品牌标**（黑圆 + 白色阶梯像素，
 * 官方标见 `stepfunLogoSvg` 的注释）——它是这套方案的「脸」，与苔绿 / 雾蓝那几套
 * 并排时一眼认得出是谁。只此一枚、只此一处：`STEPFUN_SCHEME` 对上了才挂，
 * 别的方案卡一个字都不多。
 */
export function schemePicker(
  options: ReadonlyArray<SchemeCardOption>,
  get: () => string,
  set: (v: string) => void,
): HTMLElement {
  const wrap = h('div', 'momo-set-schemes')
  wrap.setAttribute('role', 'radiogroup')
  const cards: HTMLButtonElement[] = []
  const paint = () => {
    for (const card of cards) {
      const on = (card.dataset.schemeValue ?? '') === get()
      card.classList.toggle('is-on', on)
      card.setAttribute('aria-checked', String(on))
      // roving tabindex：同分段——Tab 进组落在选中卡，方向键在卡间走
      card.tabIndex = on ? 0 : -1
    }
  }
  for (const opt of options) {
    const card = h('button', 'momo-set-scheme')
    card.type = 'button'
    card.setAttribute('role', 'radio')
    card.dataset.schemeValue = opt.value
    card.classList.add(`momo-theme-${opt.value}`)
    const preview = h('span', 'momo-set-scheme-preview')
    preview.append(
      h('span', 'momo-set-scheme-chip is-page'),
      h('span', 'momo-set-scheme-chip is-card'),
      h('span', 'momo-set-scheme-chip is-accent'),
    )
    const nameRow = h('span', 'momo-set-scheme-name')
    nameRow.append(h('span', 'momo-set-scheme-label', opt.label))
    // StepFun 方案的品牌标（官方标：黑圆 + 白色阶梯像素）。只此一枚、只此一处——
    // 它是这套方案的「脸」，不是图标库的一员（理由见 dom.ts 的注释）。
    if (opt.value === STEPFUN_SCHEME) nameRow.append(stepfunLogoSvg())
    card.append(preview, nameRow)
    card.addEventListener('click', () => {
      set(opt.value)
      paint()
    })
    cards.push(card)
    wrap.append(card)
  }
  paint()
  arrowNav(wrap, '.momo-set-scheme', (el) => el.click())
  return wrap
}

/**
 * 行内 / 块内的一颗动作钮（次级 / 文字两档，外观走 `.momo-set-btn` 按钮族）。
 *
 * 原来只有 LocTab 自带一份同名小helper——写死在那页里，第二个要用同样形状的页面
 * （标签页的逐行「修复」）就得再抄一遍，而这类按钮的 class 组合（`momo-set-btn` +
 * 可选 `is-ghost` + 文字包一层 `.momo-set-btn-text`）抄歪一处就是两套按钮长相。
 * 提到控件库，两页共用一份；DOM 逐字不变（LocTab 的用例仍全绿）。
 */
export function actionButton(
  label: string,
  variant: '' | 'is-ghost' | 'is-primary',
  onClick: () => void,
): HTMLButtonElement {
  const b = h('button', `momo-set-btn ${variant}`.trim())
  b.type = 'button'
  b.append(h('span', 'momo-set-btn-text', label))
  b.addEventListener('click', onClick)
  return b
}

/** 开关 40×22 / r999（开 = accent，关 = ink-6），滑块 18 */
export function buildSwitch(get: () => boolean, set: (v: boolean) => void): HTMLButtonElement {
  const btn = h('button', 'momo-set-switch')
  btn.type = 'button'
  btn.setAttribute('role', 'switch')
  btn.append(h('span', 'momo-set-switch-knob'))
  const paint = () => {
    const on = get()
    btn.classList.toggle('is-on', on)
    btn.setAttribute('aria-checked', String(on))
  }
  btn.addEventListener('click', () => {
    set(!get())
    paint()
  })
  paint()
  return btn
}

/** 滑块行 260×34：轨道 4 / r999，滑块 14，右侧当前值 */
export function buildSlider(
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  format: (v: number) => string,
): HTMLElement {
  const wrap = h('div', 'momo-set-slider')
  const input = h('input', 'momo-set-range')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  const value = h('span', 'momo-set-slider-val')
  const paint = () => {
    const v = get()
    input.value = String(v)
    value.textContent = format(v)
    input.style.setProperty('--momo-fill', `${((v - min) / (max - min)) * 100}%`)
  }
  input.addEventListener('input', () => {
    set(Number(input.value))
    paint()
  })
  paint()
  wrap.append(input, value)
  return wrap
}

/** 步进器 34 / r9 / surface：减 28 + 数值 46 + 加 28 */
export function buildStepper(
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
): HTMLElement {
  const wrap = h('div', 'momo-set-stepper')
  const value = h('span', 'momo-set-stepper-val')
  // S5：两颗按钮先声明、paint 后定义——旧写法 paint 写在前却引用后面的 minus / plus，
  // 只因为真正调用在末尾才不踩 TDZ（同文件的 segmented / schemePicker 都是先声明后定义）。
  const minus = h('button', 'momo-set-stepper-btn')
  minus.type = 'button'
  minus.setAttribute('aria-label', copy.settingsPage.stepper.decrease)
  minus.append(iconSvg('minus', 14))
  minus.addEventListener('click', () => {
    set(clamp(get() - step, min, max))
    paint()
  })
  const plus = h('button', 'momo-set-stepper-btn')
  plus.type = 'button'
  plus.setAttribute('aria-label', copy.settingsPage.stepper.increase)
  plus.append(iconSvg('plus', 14))
  plus.addEventListener('click', () => {
    set(clamp(get() + step, min, max))
    paint()
  })
  const paint = () => {
    const v = get()
    value.textContent = String(v)
    minus.disabled = v <= min
    plus.disabled = v >= max
  }
  paint()
  wrap.append(minus, value, plus)
  return wrap
}

/** 控件库的一揽子引用：各分页只拿自己要用的那几个，不用个个 import */
export interface SettingsFields {
  textInput: typeof textInput
  segmented: typeof segmented
  schemePicker: typeof schemePicker
  buildSwitch: typeof buildSwitch
  buildSlider: typeof buildSlider
  buildStepper: typeof buildStepper
  actionButton: typeof actionButton
}
