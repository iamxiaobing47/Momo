// 级联模拟器：证明一次 CSS 改动「计算样式零变化」。治理方案 §8 的回归门禁，P1 合并 / P2 收令牌 / P3 拆文件都用它兜底。
//
// 思路：把两份 CSS（改前 / 改后）各解析成规则表，对同一组合成元素 × 状态求「每个属性最终由哪条规则赢」，
// 逐项比对。赢家不同 = 视觉可能变了 = 改动不通过。
//
// 覆盖本文件实际用到的选择器结构：
//   逗号组 / 类 / 元素名 / * / 后代 / 子代(>) / 相邻(+) / :not / :where / :has / 属性[aria-*]
//   :hover :focus :focus-visible :focus-within :active :disabled
//   :first-child :last-child :only-child :first-of-type
//   ::before ::after ::placeholder ::-webkit-* ::-moz-*（当作宿主元素匹配，前后一致即可比）
//   @container (max-width: N) / @container stats (…) / @media (hover: hover)
//
// 近似与边界（都是「前后一致」的近似，不影响 old vs new 的比对有效性）：
//   · 伪元素当宿主匹配；:has() 按「自身匹配内部选择器」近似；属性选择器按开 / 关两态都试
//   · 每个布尔维度（hover / disabled / 各断点…）都按「真 / 假」各算一次，任一状态下出现差异即报
import { parseCss, specificityAlts } from './css-model.mjs'

const COMBINATORS = new Set(['>', '+', '~'])
const selCache = new Map()

/** 特异性按**分支**缓存（BUG-191：赢家比输赢要按「命中哪个分支」记账，整条 max 会把
 *  `.momo-app button, .momo-app .momo-chip` 里的 (0,1,1) 分支按 (0,2,0) 比，与宿主
 *  button:not(.clickable-icon)（(0,1,1)）的胜负判反）。
 *  切分支必须与 parseSelector 同款（朴素 split(',')），下标才与 alts 一一对应。 */
const specAltsCache = new Map()
function specAltsCached(text) {
  let hit = specAltsCache.get(text)
  if (!hit) {
    hit = specificityAlts(text)
    specAltsCache.set(text, hit)
  }
  return hit
}

/** 解析结果按选择器文本缓存——逐组合并时要反复编译同一份规则表，不缓存会慢到不可用 */
function parseSelectorCached(text) {
  let hit = selCache.get(text)
  if (!hit) {
    hit = parseSelector(text)
    selCache.set(text, hit)
  }
  return hit
}

/** "a > b.c:hover" → [{tag, classes, pseudos, attrs, star}]
 *  BUG-185：伪类 token 必须**括号配平**——旧正则 `(\([^)]*\))?` 在第一个 `)` 截断，
 *  `:where(:hover:not(:disabled))` 被切成 `:where(:hover:not(:disabled)`（缺尾括号），
 *  内层 `:not` 的 `lastIndexOf(')')` 再截一次，整条规则在模拟器里**恒不匹配**：
 *  check:host / merge-css 的「零变化」证明对这类嵌套规则全是空判据。 */
function parseCompound(text) {
  const out = { tag: null, classes: [], pseudos: [], attrs: [], star: false }
  const rest = text.trim()
  if (rest === '*') { out.star = true; return out }
  const isName = (c) => /[a-zA-Z0-9_-]/.test(c)
  let i = 0
  while (i < rest.length) {
    const c = rest[i]
    if (c === '.') {
      let j = i + 1
      while (j < rest.length && isName(rest[j])) j++
      out.classes.push(rest.slice(i + 1, j))
      i = j
    } else if (c === '[') {
      const end = rest.indexOf(']', i)
      out.attrs.push(rest.slice(i, end < 0 ? rest.length : end + 1))
      i = end < 0 ? rest.length : end + 1
    } else if (c === ':') {
      let j = i + 1
      if (rest[j] === ':') j++ // ::before
      while (j < rest.length && /[a-zA-Z-]/.test(rest[j])) j++
      if (rest[j] === '(') {
        let depth = 0
        let k = j
        for (; k < rest.length; k++) {
          if (rest[k] === '(') depth++
          else if (rest[k] === ')') {
            depth--
            if (depth === 0) break
          }
        }
        j = k < rest.length ? k + 1 : rest.length
      }
      out.pseudos.push(rest.slice(i, j))
      i = j
    } else if (c === '*') {
      out.star = true
      i++
    } else if (/[a-zA-Z]/.test(c)) {
      let j = i
      while (j < rest.length && /[a-zA-Z0-9-]/.test(rest[j])) j++
      if (!out.tag) out.tag = rest.slice(i, j).toLowerCase()
      i = j
    } else {
      i++
    }
  }
  return out
}

/** 单个复杂选择器 → [{compound, combinator}]，combinator 表示与下一个片段的关系 */
function parseComplex(text) {
  const parts = text.split(/(\s*[>+~]\s*|\s+)/).filter((s) => s !== undefined && s.trim() !== '')
  const seq = []
  let pendingCombinator = null
  for (const part of parts) {
    if (COMBINATORS.has(part.trim())) { pendingCombinator = part.trim(); continue }
    if (part.trim() === '') continue
    seq.push({ compound: parseCompound(part), combinator: pendingCombinator })
    pendingCombinator = null
  }
  return seq
}

function parseSelector(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean).map(parseComplex)
}

const STATE_FLAGS = [
  'hover', 'focus', 'focusVisible', 'focusWithin', 'active', 'disabled', 'enabled',
  'firstChild', 'lastChild', 'onlyChild', 'firstOfType', 'ariaPressed', 'hasInner', 'dark',
  'c380', 'c480', 'c520', 'c560', 'c620', 'c720', 'c880', 'c900', 'hoverHover',
]

function baseState() {
  const s = {}
  for (const f of STATE_FLAGS) s[f] = false
  return s
}

/**
 * 基态与「单标志为真」的 23 个状态**各建一次**，热循环里只读复用（2026-10-13 性能修）。
 *
 * 原实现在 diffWinners 的候选收集里 `baseState()` 按「每条规则」new 一次、
 * `baseState() + st[f] = true` 按「每条规则 × 每个标志」new 一次——元素以万计、
 * 规则近千条，于是同一个 23 字段的空壳被 new 上千万次，profile 里 32% 的自身时间
 * 都耗在这个函数上（css-cascade 的 Q10 两条用例 18.5s / 19.7s 就是这么来的）。
 *
 * 复用的前提是**这些状态对象只被读、不被写**：complexMatches / compoundMatches /
 * contextOk 对 state 一律只读（state[...] = 的写法在本文件一处都没有）。谁要改
 * 状态就自己 new，别往共享对象上写——否则一次静默污染会让整张赢家表失真。
 */
const BASE_STATE = baseState()
const STATE_ONE = {}
for (const f of STATE_FLAGS) STATE_ONE[f] = { ...BASE_STATE, [f]: true }

/** 规则在给定状态下是否适用：@container / @media 的条件必须被状态满足 */
function contextOk(ctx, state) {
  for (const k in ctx) if (ctx[k] && !state[k]) return false
  return true
}

/**
 * 复杂选择器是否匹配：最后一段对**元素自身**（类 / 标签 / 伪类），
 * 前面的段对**祖先类集**（近似为「祖先身上有这些类」，不做层级先后校验；
 * old / new 用同一套近似，比对仍有效）。
 */
function complexMatches(seq, el, state) {
  const last = seq[seq.length - 1]
  if (!compoundMatches(last.compound, el, state, 'own')) return false
  for (let i = seq.length - 2; i >= 0; i--) {
    if (!compoundMatches(seq[i].compound, el, state, 'ancestors')) return false
  }
  return true
}

function compoundMatches(compound, el, state, side) {
  const classes = side === 'own' ? el.classes : el.ancestors
  const tag = side === 'own' ? el.tag : null
  // 祖先段不认标签（近似：`.a div` 只看 .a），只看类与通配
  if (side === 'own') {
    if (!compound.star && compound.tag && el.tag !== compound.tag) return false
  } else if (compound.tag && side === 'ancestors') {
    // 祖先段的标签也校验不了，保守放过（前后一致即可比）
  }
  for (const c of compound.classes) if (!classes.has(c)) return false
  for (const attr of compound.attrs) {
    if (/aria-pressed/.test(attr) && !state.ariaPressed) return false
  }
  if (side === 'own') {
    for (const p of compound.pseudos) {
      // 函数型伪类要把参数从名字里剥掉：:not(.x) 的名字是 not，不是 not(.x)。
      // 不剥的后果：所有函数型伪类落入下方「未识别 → 不匹配」，:not/:is/:where/:has
      // 规则对门禁完全不可见——两边一致时比对还有效，一给它们增删参数就幻影差异
      // 满屏、真差异反被埋掉（2026-09-25 P3 去 :not 时踩实，最小复现见 tmp-p3）。
      const name = p.replace(/^::?/, '').replace(/\(.*\)$/, '').toLowerCase()
      if (name.startsWith('-webkit') || name.startsWith('-moz')) continue
      if (['before', 'after', 'placeholder', 'first-line', 'selection', 'backdrop', 'part'].includes(name)) continue
      if (name === 'hover') { if (!state.hover) return false; continue }
      if (name === 'focus' || name === 'focus-visible') { if (!(state.focusVisible || state.focus)) return false; continue }
      if (name === 'focus-within') { if (!(state.focusWithin || state.focus)) return false; continue }
      if (name === 'active') { if (!state.active) return false; continue }
      if (name === 'disabled') { if (!state.disabled) return false; continue }
      if (name === 'enabled') { if (state.disabled) return false; continue }
      if (name === 'first-child') { if (!state.firstChild) return false; continue }
      if (name === 'last-child') { if (!state.lastChild) return false; continue }
      if (name === 'only-child') { if (!state.onlyChild) return false; continue }
      if (name === 'first-of-type') { if (!state.firstOfType) return false; continue }
      if (name === 'not' || name === 'is' || name === 'where') {
        const inner = p.slice(p.indexOf('(') + 1, p.lastIndexOf(')'))
        const innerMatch = parseSelectorCached(inner).some((alt) => complexMatches(alt, el, state))
        if (name === 'not' ? innerMatch : !innerMatch) return false
        continue
      }
      if (name === 'has') {
        const inner = p.slice(p.indexOf('(') + 1, p.lastIndexOf(')'))
        const innerMatch = parseSelectorCached(inner).some((alt) => complexMatches(alt, el, state))
        if (!innerMatch && !state.hasInner) return false
        continue
      }
      // 未识别的伪类：保守当作不匹配（前后一致，不影响比对）
      return false
    }
  } else {
    // 祖先段上的伪类（如 `.a:hover .b`）按「该祖先也处于同状态」近似
    for (const p of compound.pseudos) {
      // 函数型伪类要把参数从名字里剥掉：:not(.x) 的名字是 not，不是 not(.x)。
      // 不剥的后果：所有函数型伪类落入下方「未识别 → 不匹配」，:not/:is/:where/:has
      // 规则对门禁完全不可见——两边一致时比对还有效，一给它们增删参数就幻影差异
      // 满屏、真差异反被埋掉（2026-09-25 P3 去 :not 时踩实，最小复现见 tmp-p3）。
      const name = p.replace(/^::?/, '').replace(/\(.*\)$/, '').toLowerCase()
      if (name.startsWith('-webkit') || name.startsWith('-moz')) continue
      if (['before', 'after', 'placeholder', 'first-line', 'selection', 'backdrop', 'part'].includes(name)) continue
      if (name === 'hover' && !state.hover) return false
      if ((name === 'focus' || name === 'focus-visible') && !(state.focusVisible || state.focus)) return false
      if (name === 'focus-within' && !(state.focusWithin || state.focus)) return false
      if (name === 'active' && !state.active) return false
      if (name === 'disabled' && !state.disabled) return false
      if (name === 'first-child' && !state.firstChild) return false
      if (name === 'last-child' && !state.lastChild) return false
      if (name === 'only-child' && !state.onlyChild) return false
      if (name === 'first-of-type' && !state.firstOfType) return false
      if (name === 'not' || name === 'is' || name === 'where') {
        const inner = p.slice(p.indexOf('(') + 1, p.lastIndexOf(')'))
        const innerMatch = parseSelectorCached(inner).some((alt) => complexMatches(alt, el, state))
        if (name === 'not' ? innerMatch : !innerMatch) return false
      }
    }
  }
  return true
}

function contextFlags(contextKey) {
  const q = (px) => contextKey.includes(`max-width: ${px}px`)
  return {
    c380: q(380), c480: q(480), c520: q(520), c560: q(560),
    c620: q(620), c720: q(720), c880: q(880), c900: q(900),
    hoverHover: contextKey.includes('hover: hover'),
  }
}

/**
 * 领域知识：这三个是**互斥的根类**——`momo-app` 挂在面板根（App.tsx）、
 * `momo-settings` 挂在设置页根（settings.ts containerEl.addClass）、
 * `momo-confirm` 挂在确认弹窗（Obsidian Modal）。三者是不同的容器元素，
 * 同一元素上不会同时出现两个。
 *
 * 模拟器据此不生成「同时带两个根类」的合成元素：否则 `.momo-settings` 的
 * `display: block` 会被当成 `.momo-app` 的 `display: flex` 的拦路规则，
 * 把一个现实里不存在的冲突算成阻塞，重复定义就永远合并不掉。
 */
/**
 * 容器宽度标志的真实约束：max-width: 380px 命中 ⇒ 480 / 560 / … 全部命中，
 * 所以宽度标志的真值集合必须是阈值序的**后缀**（存在某个真实宽度 W 使
 * {cX : X ≥ W} 恰好等于它）。独立枚举布尔会造出「≤380 但不 ≤480」这种
 * 物理不可能的状态，把不可能状态里的层叠差算成改动——容器规则搬个家
 * 就被一批假差异挡住（2026-09-25 响应式归并时踩到）。
 * 返回：状态对象数组（只覆盖传入 flagList 里出现的标志）。
 */
const WIDTH_FLAGS = ['c380', 'c480', 'c520', 'c560', 'c620', 'c720', 'c880', 'c900']
function enumerateStates(flagList) {
  const widths = flagList.filter((f) => WIDTH_FLAGS.includes(f))
  const others = flagList.filter((f) => !WIDTH_FLAGS.includes(f))
  // 真实宽度模式：无容器 + 每个阈值处的后缀；与 flagList 求交后去重
  const combos = new Map()
  const add = (set) => { const k = [...set].sort().join(','); if (!combos.has(k)) combos.set(k, new Set(set)) }
  add([])
  for (const w of WIDTH_FLAGS) {
    add(WIDTH_FLAGS.slice(WIDTH_FLAGS.indexOf(w)).filter((f) => widths.includes(f)))
  }
  const states = []
  for (let mask = 0; mask < 2 ** others.length; mask++) {
    const base = baseState()
    others.forEach((f, i) => { base[f] = Boolean(mask & (1 << i)) })
    for (const ws of combos.values()) {
      const st = { ...base }
      for (const f of ws) st[f] = true
      states.push(st)
    }
  }
  return states
}

const EXCLUSIVE_ROOTS = ['momo-app', 'momo-settings', 'momo-confirm']
const hasExclusiveRootClash = (classes) => EXCLUSIVE_ROOTS.filter((c) => classes.has(c)).length > 1

/**
 * 元素集。**自身类集与祖先类集分开建模**——`.momo-app button { !important }`
 * 这类规则的真实语义是「按钮在 .momo-app 里面」，不是「按钮自己带 momo-app 类」。
 * 早期版本把两者混为一个类集，造出了 `.momo-app` + `.momo-composer-entry` 这种
 * 真实 DOM 里不可能存在的元素，还让 `.momo-app input` 匹配不上，
 * 结果是合并被一批假差异挡住（`.momo-app` 的 font-family 就是被这么冤住的）。
 *
 * 标签-类共现只从真实规则里取（`.momo-app input` → tag=input），不拍脑袋枚举；
 * opts.tags（调用方按 JSX 声明「这个类会落在 button/input 上」）也是显式声明，工具不猜。
 */
function buildElements(rulesList, extra = [], tags = {}) {
  // momo-theme-* 全列：每套方案都是真 class（App.tsx 按 id 挂，不因为谁是默认就省掉）
  const classUniverse = new Set(['momo-app', 'momo-settings', 'momo-confirm', 'momo-side-right', 'momo-sidebar-collapsed', 'momo-selecting', 'momo-mode-stats', 'momo-theme-moss-green', 'momo-theme-mist-blue', 'momo-theme-clam-white', 'momo-theme-stepfun', 'momo-theme-ink-night', 'is-active'])
  const tagClass = new Set()
  for (const rules of rulesList) {
    for (const r of rules) {
      if (r.kind !== 'style') continue
      for (const alt of parseSelectorCached(r.selector)) {
        const altClasses = new Set()
        for (const seg of alt) for (const c of seg.compound.classes) altClasses.add(c)
        for (const c of altClasses) classUniverse.add(c)
        for (const seg of alt) if (seg.compound.tag) for (const c of altClasses) tagClass.add(seg.compound.tag + '|' + c)
      }
    }
  }

  const elements = []
  const push = (tag, own, ancestors, label) => elements.push({ tag, classes: new Set(own), ancestors: new Set(ancestors), label })

  for (const c of classUniverse) {
    push(null, [c], [], c)                                    // 裸元素
    push(null, [c], ['momo-app'], c + '@app')               // 在面板里
    push(null, [c], ['momo-app', 'momo-settings'], c + '@set') // 在设置页里
  }
  for (const key of tagClass) {
    const [tag, cls] = key.split('|')
    push(tag, [cls], [], tag + '.' + cls)
    push(tag, [cls], ['momo-app'], tag + '.' + cls + '@app')
  }
  // 调用方按 JSX 声明的「类 × 标签」共现（宿主 app.css 的 button 规则要能命中
  // 面板里的 <button class="momo-btn">，只有 tag=null 的元素是看不见宿主的）。
  for (const [tag, classes] of Object.entries(tags)) {
    for (const cls of classes) {
      push(tag, [cls], ['momo-app'], tag + '.' + cls + '@app')
    }
  }
  // 三层及以上选择器的真实 DOM 组合：own = 末端复合选择器的类，ancestors = 前面各段的类。
  // 旧宇宙只造「own={c} + ancestors={momo-app}」，于是 `.a .b .c` 这类选择器
  // （`.momo-app .momo-segmented .momo-seg-on`）压根匹配不到自己的元素，
  // 与它对等的 (0,3,0) 规则反而赢——报出来的「视觉变化」是假阳性。
  // （2026-09-25 P3 踩到：元素宇宙缺 .momo-segmented 这个祖先，seg-on 的
  //   color 被冤报一次翻转；真实 DOM 里 seg-on 永远在 segmented 里，Topbar.tsx。）
  const deepSeen = new Set()
  for (const rules of rulesList) {
    for (const r of rules) {
      if (r.kind !== 'style') continue
      for (const alt of parseSelectorCached(r.selector)) {
        if (alt.length < 3) continue
        const own = [...alt[alt.length - 1].compound.classes]
        if (!own.length) continue
        const anc = []
        for (const seg of alt.slice(0, -1)) anc.push(...seg.compound.classes)
        if (!anc.length) continue
        const key = [...own].sort().join(',') + '<' + [...anc].sort().join(',')
        if (deepSeen.has(key)) continue
        deepSeen.add(key)
        push(null, own, anc, 'deep:' + key)
        push(null, own, [...anc, 'momo-app'], 'deepA:' + key)
      }
    }
  }
  // 额外组合不再「附会」momo-app 自身类：真实 DOM 里只有 App.tsx 的面板根带
  // momo-app（App.tsx:364），它不会再带卡片 / 标签这类组件类。附会出来的元素让
  // .momo-card 与 .momo-app 等永不共现的选择器互相拦路，制造假阳性——
  // .momo-app 组合并的 background 翻转就是这么来的。「面板内的组件元素」
  // 由 combos 的 'A' 变体（自身类 = 组合、祖先带 momo-app）建模，已覆盖。
  for (const combo of extra) {
    push(null, combo, [], 'x:' + combo.join('+'))
  }
  const combos = [
    ['momo-card', 'momo-card-checked'], ['momo-card', 'momo-card-select'],
    ['momo-card', 'momo-card-readonly'], ['momo-card-tags', 'momo-card-tags-bottom'],
    ['momo-loc-pills', 'momo-loc-pills-bottom'],
    ['momo-card-tag', 'momo-card-tag-on'], ['momo-tag-pill', 'momo-tag-pill-open'],
    ['momo-chip', 'momo-chip-on'], ['momo-seg', 'momo-seg-on'],
    ['momo-pop-row', 'momo-pop-row-on'], ['momo-tag-caret', 'momo-tag-caret-open'],
    ['momo-focus-item', 'momo-focus-on'], ['momo-group', 'momo-group-pinned'],
    ['momo-composer', 'momo-composer-top'], ['momo-main', 'momo-mode-stats'],
    ['momo-pop-check', 'momo-pop-row-on'], ['momo-fab-btn', 'momo-fab-danger'],
    ['momo-ov-sub', 'momo-ov-sub-up'], ['momo-sidebar', 'momo-sidebar-collapsed'],
    ['momo-card-act', 'momo-card-actions-on'],
  ]
  combos.forEach((combo, i) => {
    push(null, combo, [], 'combo' + i)
    push(null, combo, ['momo-app'], 'combo' + i + 'A')
  })

  const seen = new Set()
  return elements.filter((el) => {
    const key = (el.tag || '') + '|' + [...el.classes].sort().join(',') + '|' + [...el.ancestors].sort().join(',')
    if (seen.has(key)) return false
    seen.add(key)
    // 互斥根类的组合不生成（见 EXCLUSIVE_ROOTS 的说明）：自身与祖先合起来算
    const all = new Set([...el.classes, ...el.ancestors])
    return !hasExclusiveRootClash(all)
  })
}

/** 统一编译规则表（选择器 / 特异性 / 上下文），idx 即源码序。
 *  specs 与 alts 一一对应（同款 split(',')）：赢家比输赢按「命中哪个分支」取那份特异性（BUG-191）。 */
function compile(rules) {
  return rules.filter((r) => r.kind === 'style').map((r, idx) => ({
    idx,
    rule: r,
    alts: parseSelectorCached(r.selector),
    specs: specAltsCached(r.selector),
    ctx: contextFlags(r.contextKey),
  }))
}

/** 第一个在当前状态下命中的分支下标（无命中返回 -1） */
function matchAlt(r, el, state) {
  for (let i = 0; i < r.alts.length; i++) {
    if (complexMatches(r.alts[i], el, state)) return i
  }
  return -1
}

/**
 * 某一状态下的赢家表：每个属性按 (!important, 特异性, 源码序) 取赢家。
 *
 * !important 按**声明级**建模（重要性挂在声明上，同一规则里可以混着写）：
 * 它无视源码序、恒赢同特异性的普通声明。不建模的后果是双向的——
 *   · 假阳性：容器里的 display:none !important 与顶层的 display:flex 都按
 *     源码序比，把一次其实安全的合并误判成视觉变化（.momo-sidebar 就这么被挡住的）；
 *   · 假阴性：反过来也会漏掉真变化。
 */
function winnersFor(compiled, el, state, cands) {
  const matched = cands
    .filter((r) => compiled.includes(r))
    .map((r) => ({ r, alt: contextOk(r.ctx, state) ? matchAlt(r, el, state) : -1 }))
    .filter(({ alt }) => alt >= 0)
  // 单遍扫描 + 逐属性留强：O(声明总数)，与旧实现同阶。
  // （曾经写成「逐属性 × 逐规则」两重循环，全量比对慢了约 50 倍——元素 × 状态
  //   组合以万计，每次多扫几百条规则就足以让 at-rule 合并从几分钟变成几十分钟。）
  // 特异性按**命中分支**取（BUG-191）：多分支规则里哪个 alt 命中就按哪份 spec 比，
  // 整条按 max 记账会让 (0,1,1) 分支扛着 (0,2,0) 的分值跟宿主抢输赢。
  const better = (r, cur) => {
    const s = r.r.specs[r.alt]
    const c = cur.r.specs[cur.alt]
    for (let i = 0; i < 3; i++) {
      if (s[i] !== c[i]) return s[i] > c[i]
    }
    return r.r.idx > cur.r.idx
  }
  const map = {}
  // 值落表时剥掉 !important 标记：重要性只在比输赢时参与（上面的 better 已经用了），
  // 落表的 value 是「计算值」。不剥的后果：old/new 一改 importance 就满屏假差异
  // （同一批规则、同一个值，只差一个标记），真正该看的翻转被埋掉。
  const plain = (v) => v.replace(/\s*!important/, '')
  for (const { r, alt } of matched) {
    for (const d of r.rule.decls) {
      const imp = /!important/.test(d.value)
      const cur = map[d.prop]
      if (!cur) { map[d.prop] = { value: plain(d.value), ruleIndex: r.idx, sel: r.rule.selector, imp, r, alt }; continue }
      if (imp !== cur.imp) { if (imp) map[d.prop] = { value: plain(d.value), ruleIndex: r.idx, sel: r.rule.selector, imp, r, alt }; continue }
      if (better({ r, alt }, cur)) map[d.prop] = { value: plain(d.value), ruleIndex: r.idx, sel: r.rule.selector, imp, r, alt }
    }
  }
  const out = {}
  for (const p in map) out[p] = { value: map[p].value, ruleIndex: map[p].ruleIndex, sel: map[p].sel }
  return out
}

/**
 * 比对两份 CSS 的赢家表。元素集由两份规则表的并集建一次，两边共用（否则状态键不可比）。
 * opts.extra：额外合成元素类组合。
 * opts.required：只保留类集包含这些类的元素（逐组合并时做聚焦验证，快且不降有效性）。
 * opts.hostCss：宿主样式（Obsidian app.css 摘录）——两份表各自**前面缀同一份**宿主规则
 *   （宿主先加载，源码序在前），于是「插件规则还压不压得住宿主」也被算进差异。
 *   用于 !important 收敛这类「与宿主抢优先级」的改动：只比表内层叠会漏掉整场战争。
 * opts.tags：{ button: ['momo-btn', …] } 真实 DOM 里「类 × 标签」的共现（按 JSX 声明），
 *   否则宿主 button 规则命中不到 <button class="momo-btn"> 这类元素。
 */
export function diffWinners(oldRules, newRules, opts = {}) {
  const { extra = [], required = null, hostCss = '', tags = {} } = opts
  const hostRules = hostCss ? parseCss(hostCss).rules : []
  let spec = buildElements(hostRules.length ? [hostRules, oldRules, newRules] : [oldRules, newRules], extra, tags)
  if (required && required.length) spec = spec.filter((el) => required.every((c) => el.classes.has(c)))

  const a = compile([...hostRules, ...oldRules])
  const b = compile([...hostRules, ...newRules])
  const diffs = []

  for (const el of spec) {
    const cands = []
    for (const r of [...a, ...b]) {
      if (r.alts.some((alt) => complexMatches(alt, el, BASE_STATE))) { cands.push(r); continue }
      let hit = false
      for (const f of STATE_FLAGS) {
        const st = STATE_ONE[f]
        if (contextOk(r.ctx, st) && r.alts.some((alt) => complexMatches(alt, el, st))) { hit = true; break }
      }
      if (hit) cands.push(r)
    }
    if (!cands.length) continue

    const flags = new Set()
    for (const r of cands) {
      for (const k in r.ctx) if (r.ctx[k]) flags.add(k)
      for (const f of STATE_FLAGS) {
        const st = STATE_ONE[f]
        if (r.alts.some((alt) => complexMatches(alt, el, st))) { flags.add(f); break }
      }
    }
    const flagList = [...flags].slice(0, 14) // 上限 14 个维度，防爆
    for (const state of enumerateStates(flagList)) {
      const key = el.label + '|' + flagList.map((f) => (state[f] ? f[0] : '-')).join('')
      const mapA = winnersFor(a, el, state, cands)
      const mapB = winnersFor(b, el, state, cands)
      for (const p of new Set([...Object.keys(mapA), ...Object.keys(mapB)])) {
        const va = mapA[p], vb = mapB[p]
        if (!va || !vb) {
          if (String(va && va.value) !== String(vb && vb.value)) diffs.push({ key, prop: p, from: va ? va.value : '(unset)', to: vb ? vb.value : '(unset)' })
          continue
        }
        if (va.value !== vb.value) diffs.push({ key, prop: p, from: va.value, to: vb.value })
      }
    }
  }
  return diffs
}

export { parseCss }

/** 对外暴露的解析入口（带缓存）；消费方用它取右端类集 */
export { parseSelectorCached as parseSelector }
