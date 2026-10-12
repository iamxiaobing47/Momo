// 标签与 frontmatter 解析（contract-momo-storage §标签解析口径）。
// TAG_RE 沿用网页版 frontend/utils/notes.ts 口径：# 后接非空白非 # 字符序列。

// 行内标签：#xxx（行首或空白之后才算，避免撞上 URL 片段 / 颜色码）。
// TAG_RE_HEAD 用在**整篇首段**：段前什么都没有，行首的 # 算。
export const TAG_RE_HEAD = /(^|\s)#([^\s#]+)/g
// TAG_RE_TAIL 用在**切段后的后续段**：`eachTextSegment` / `mapOutsideCode` 按代码段
// 把正文切成若干段、逐段独立跑这条正则，非首段的段前字符必然是代码段的收尾反引号
// （非空白）。此时 `^` 会在「代码段紧贴 #」的位置误判成行首——`use \`helper\`#tag`
// 会凭空多出一个标签，而同属「前面不是空白」的 URL 片段 `x.com/#读书` 却被刻意排除，
// 两处口径自相矛盾。所以后续段只认空白前导，不认行首。
export const TAG_RE_TAIL = /(\s)#([^\s#]+)/g

/** 标签 token 的尾随标点（剥离后才是标签本体） */
export const TAG_TAIL_RE = /[.,;:!?、。！？；：]+$/u

/**
 * 代码段：fenced code block（```…```，允许未闭合到底）与行内代码（`…`，不跨行）。
 * **代码段里的 # 不是标签**（shell/python 注释、`#include`……），标签的解析（parseInlineTags）、
 * 行内改写（rewriteInlineTags）与卡片渲染（Card.removeInlineTags / keepIndent）共用这一套切段口径，
 * 保证「解析出来的标签」与「能被改写 / 被剥离的标签」永远同一套。
 * 供 String.split 使用：带捕获组 → 偶数下标是普通文本、奇数下标是代码段，split/join 无损往返。
 */
const CODE_SEG_RE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g

/** 对「代码段以外的文本」逐段做变换；代码段一个字节不动。
 *  `isFirst` = 该段是否整篇首段（切段前的字符才是真正的行首，见 TAG_RE_TAIL）。 */
export function mapOutsideCode(
  content: string,
  fn: (segment: string, isFirst: boolean) => string,
): string {
  return content
    .split(CODE_SEG_RE)
    .map((seg, i) => (i % 2 === 0 ? fn(seg, i === 0) : seg))
    .join('')
}

/** 遍历代码段以外的文本段（收集用；与 mapOutsideCode 同一切段口径） */
export function eachTextSegment(content: string, fn: (segment: string, isFirst: boolean) => void): void {
  const parts = content.split(CODE_SEG_RE)
  for (let i = 0; i < parts.length; i += 2) fn(parts[i] ?? '', i === 0)
}

/** 取该段该用的行内标签正则（首段认行首，后续段只认空白前导） */
function tagRegexFor(isFirst: boolean): RegExp {
  return isFirst ? TAG_RE_HEAD : TAG_RE_TAIL
}

/**
 * 正文是否含图片：Markdown 图片语法 `![alt](path)` 或裸 `<img>` 标签。
 *
 * 统计页「带图 Momo」（stats/attachments.ts 的 entriesWithImages）与侧栏标签的
 * 「附件」维度（tagFilter.ts）共用这一条正则——两处口径必须同源，否则
 * 「有配图的标签」筛出来的条数与统计页写的数字对不上。
 *
 * 正则提到模块级而不是每次调用新建字面量：建树时它按条目调用，
 * 写在函数体里就是每条目一次 RegExp 分配（同 §性能红线的精神）。
 */
const IMAGE_RE = /!\[[^\]]*\]\([^)]+\)|<img[^>]*>/

export function hasImageMarkdown(content: string): boolean {
  return IMAGE_RE.test(content)
}

/** 正文行内 #标签 去重集合（剥离尾随标点；代码段里的 # 不算） */
export function parseInlineTags(content: string): string[] {
  const out = new Set<string>()
  eachTextSegment(content, (seg, isFirst) => {
    for (const m of seg.matchAll(tagRegexFor(isFirst))) {
      const raw = m[2] ?? ''
      const tag = raw.replace(TAG_TAIL_RE, '')
      if (tag) out.add(tag)
    }
  })
  return [...out]
}

/**
 * 重写正文里的行内 `#标签`：**只替换命中的标签 token，其余字节原样保留**。
 * `map` 返回新标签 = 替换，返回 `''` = 删除该 token，返回 `null` = 与该标签无关、不动。
 * 口径与 `parseInlineTags` 一致：行首或空白后、剥离尾随标点，**代码段（fenced / 行内代码）
 * 一个字节不动**——因此「解析出来的标签」与「能被改写的标签」永远同一套，不会出现
 * 「明明有这个标签却改不到」，也不会把代码里的注释误改掉。
 */
export function rewriteInlineTags(content: string, map: (tag: string) => string | null): string {
  return mapOutsideCode(content, (seg, isFirst) =>
    seg.replace(tagRegexFor(isFirst), (m: string, pre: string, raw: string) => {
      const tail = raw.match(TAG_TAIL_RE)?.[0] ?? ''
      const core = tail ? raw.slice(0, raw.length - tail.length) : raw
      const next = map(core)
      if (next === null) return m
      // 删除：行内的连同前置空白一起收掉（否则会留下双空格）；换行则保留，避免两行粘连。
      // 尾随标点**不是标签的一部分**，原地留下（BUG-116a：`读了 #读书。` 删标签曾把句号一起吃掉）
      if (next === '') return (pre === '\n' ? '\n' : '') + tail
      return `${pre}#${next}${tail}`
    }),
  )
}

/**
 * 标签路径的「祖先改名」映射（重命名 / 合并共用）：
 * 命中 `from` 自身或其子树（`from/子`）时返回新路径，删除（to 为空）返回 `''`，未命中返回 `null`。
 * `cascade=false` 时只命中**精确相等**的那一个标签（删除语义：删父标签不该连带删掉子标签）。
 * 大小写只影响显示，比较一律走身份键（tagKey）。
 *
 * **suffix 切分口径（契约约束，见 N16-remaptagpath-unicode.md）**：命中判定走身份键
 * （小写后的串），而 `suffix` 直接按 `canon` 的字符位置切——这两者等长才有意义。因此本
 * 函数只保证「小写映射长度不变的脚本」：全部 CJK、拉丁字母、数字、emoji 等常见写法都对。
 * 例外是 Unicode 里小写后长度变化的字符（如土耳其文 `İ` → `i̇`，1 个变 2 个）：身份键比
 * 原串长，`fromKey.length` 会越过真实前缀，suffix 可能吃掉一个 `/` 分隔符。这类标签路径
 * 属于契约外输入，此处只声明不做兼容（改切分算法的风险高于收益：匹配语义依赖整串小写后
 * 的字符串比较，逐段回推会连带改变希腊文结尾 `Σ`→`ς` 这类上下文化小写的判定）。
 */
export function remapTagPath(raw: string, from: string, to: string, cascade = true): string | null {
  const fromKey = tagKey(from)
  if (!fromKey) return null
  // raw 侧与读侧 normalizeTags 同口径剥前导 `#`（BUG-116c：frontmatter 手写 `"#读书"` 显示成
  // `读书`，改名却命中不到）；NFC 与 tagKey 同口径，保证下面按身份键长度切 suffix 仍成立（116d）
  const canon = canonicalTagPath(raw.trim().replace(/^#+/, '')).normalize('NFC')
  const key = canon.toLowerCase()
  if (key !== fromKey && !(cascade && key.startsWith(fromKey + '/'))) return null
  // 见上方契约注释：身份键与原串等长是本行的前提；常见路径上 `canon.slice(fromKey.length)`
  // 即「原串里 from 之后的部分」（大小写差异不影响字符数，只影响显示）。
  const suffix = canon.slice(fromKey.length)
  const toPath = canonicalTagPath(to.trim().replace(/^#+/, ''))
  const next = toPath ? toPath + suffix : ''
  return next === canon ? null : next
}

// ---- 层级标签归一（ADR-004 / contract-momo-storage §标签解析口径）----
// `/` 是层级分隔符（Obsidian 原生嵌套标签语法）；祖先不物化，只在派生层解释。
// 这些函数是纯函数：只做字符串归一，不碰文件、不 import obsidian。

/** 规范路径：切段后丢弃空段（`#/读书/` ≡ `#读书`、`#读书//小说` ≡ `#读书/小说`） */
export function canonicalTagPath(raw: string): string {
  return raw.split('/').filter((s) => s !== '').join('/')
}

/** 身份键：规范路径的 NFC 小写形式，用于去重 / 建树 / 匹配 / 统计（Obsidian 标签大小写不敏感）。
 *  NFC（BUG-116d）：macOS 文件名 / 复制粘贴 / 部分输入法产出的分解形（`e` + U+0301）与组合形
 *  `é` 是同一个标签，不正规化就是树里两行肉眼无差别、互相改不到的记录。只作用于身份键，
 *  显示串与盘上写法保留原样（同「归一结果不写回」纪律）。 */
export function tagKey(raw: string): string {
  return canonicalTagPath(raw).normalize('NFC').toLowerCase()
}

/**
 * 是否 Obsidian 认可的标签：至少含一个非数字字符——
 * `#1984` 不是标签，`#y1984` 是；规范化后为空（如 `#/`）同样不是。
 */
export function isValidTag(raw: string): boolean {
  const path = canonicalTagPath(raw)
  return path !== '' && /[^0-9]/.test(path)
}

/**
 * 标签归一：剥前导 `#`、过滤非法候选、按身份键去重（保留首次出现的原样写法）。
 * 统一作用于**所有入口**——索引期的「行内 ∪ frontmatter」并集，以及
 * 「存为 Momo」写 frontmatter 的路径——避免「写进 frontmatter 但插件与 Obsidian
 * 都不认」的僵尸标签。文件里保留用户原样写法，归一结果不写回。
 */
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    // 存**规范路径**（丢空段、保留原样大小写），保证卡片 chip 与侧栏树显示同一形态
    const tag = canonicalTagPath(item.trim().replace(/^#+/, ''))
    if (!isValidTag(tag)) continue
    const key = tagKey(tag)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * frontmatter `tags` 的**写侧**改写（改名 / 合并 / 删除共用，BUG-116b）：只动被 `map` 点名的项，
 * 其余项**原样搬运**——非法项（`2024`）、大小写重复项（`Note`/`note`）、带 `#` 的写法都不碰。
 * `map` 契约同 `rewriteInlineTags`：新值 = 替换，`''` = 删除，`null` = 无关。
 * 替换值若与列表里已有的身份键撞上（改名并入既有标签），丢掉这一项——合并只留一份；
 * 撞的只看「替换出来的新值」，从不因此删掉没被点名的项。
 */
export function remapFmTags(cur: readonly string[], map: (raw: string) => string | null): string[] {
  const nexts = cur.map((t) => map(t))
  // 未被点名的项占着的身份键：替换值撞上它们就是并入
  const taken = new Set<string>()
  cur.forEach((t, i) => {
    if (nexts[i] === null) taken.add(tagKey(t.trim().replace(/^#+/, '')))
  })
  const out: string[] = []
  cur.forEach((t, i) => {
    const next = nexts[i]
    if (next === null || next === undefined) {
      out.push(t)
      return
    }
    if (next === '' || !isValidTag(next)) return
    const key = tagKey(next)
    if (taken.has(key)) return
    taken.add(key)
    out.push(next)
  })
  return out
}

/** a 是否是 b 的祖先路径（按身份键比较） */
export function isTagAncestor(a: string, b: string): boolean {
  const ka = tagKey(a)
  const kb = tagKey(b)
  return ka !== '' && kb !== ka && kb.startsWith(ka + '/')
}

export interface ParsedFile {
  frontmatter: Record<string, unknown>
  content: string
  /** 正文之前的前缀（含 frontmatter 围栏；无 frontmatter 时是空串）。
   *  写侧换正文按它拼（`prefix + 新正文`），**不靠 `raw.length - content.length` 尾切片**：
   *  文件以 `---` 收尾且无尾随换行时 `content` 是空串，尾切片会把闭合围栏与正文粘成
   *  `---新正文`——整块 frontmatter 不再被识别，`tags` / `createdAt` 全丢（BUG-130e）。
   *  对正常文件（围栏后有换行）`prefix + content` 与尾切片逐字节一致。 */
  prefix: string
}

/**
 * 极简 frontmatter 切分：只按 `---` 围栏取首块，YAML 解析交给 Obsidian
 * 的 parseYaml（本模块只做文本切分，不引依赖）。
 * B04：先剥 BOM（`\ufeff---` 曾被整体当正文，Windows 编辑器/同步工具常见）——
 * 剥完再判围栏；写侧不产 BOM，读侧剥除即可（prefix 按原串算，BOM 一个字节不丢）。
 */
export function splitFrontmatter(raw: string): ParsedFile {
  const bom = raw.startsWith('\ufeff') ? 1 : 0
  const body = bom ? raw.slice(1) : raw
  if (!body.startsWith('---')) return { frontmatter: {}, content: raw, prefix: '' }
  const end = body.search(/\n---\s*(\r?\n|$)/)
  if (end < 0) return { frontmatter: {}, content: raw, prefix: '' }
  const fmText = body.slice(3, end).replace(/^\r?\n/, '')
  // B05：闭合围栏后没有换行（文件以 `---` 结尾）时 indexOf 返回 -1，
  // 旧实现 slice(0) 把整份文件（含 frontmatter 文本）当正文；此时正文为空。
  const nl = body.indexOf('\n', end + 1)
  // BUG-130e：前缀按「围栏闭合处」算。围栏后没有换行时补一个 `\n` 再拼正文——
  // 否则闭合围栏与新正文粘成 `---新正文`（正常文件多一分字节都不许多）。
  const prefix = nl < 0 ? `${raw}\n` : raw.slice(0, bom + nl + 1)
  const content = nl < 0 ? '' : body.slice(nl + 1)
  return { frontmatter: parseSimpleYaml(fmText), content, prefix }
}

/** 只覆盖本插件用到的形态：tags（数组/单值）、createdAt、sourceId 等标量 */
/** 剥掉行内 ` # …` 注释（BUG-25）：# 在行首、或前一个字符是空白，且不在引号内。
 *  值与注释之间必须有空白（`[话题 # 生活]` 里 # 也是注释，与 YAML 同口径）；
 *  引号内的 # 是值（`title: "带 # 的标题"`）。逐字符扫、不在引号内判定——正则
 *  没法表达「# 前面没有引号」。
 *  引号只在**值起始处**（或流式数组 `[...]` 里）才开局：裸标量里的撇号是内容不是
 *  引号（`- Bob's 书房 # 3` 的注释必须剥掉），YAML 的 plain scalar 同样这么认。 */
function stripInlineComment(line: string): string {
  // 值从哪里开始：`- ` / `key: ` 两种前缀都跳过（与 parseSimpleYaml 的两个分支同形）
  const prefix = line.match(/^(\s*(?:-\s*)?(?:[A-Za-z_][\w-]*\s*:\s*)?)/)
  const valueStart = prefix ? prefix[1]!.length : 0
  let quote: string | null = null
  let bracket = 0
  // BUG-161a：流式数组里「下一项标量的起始位」（`[` 之后与每个 `,` 之后，跳过项前
  // 空白）。只有落在**起始位**上的引号才是引号标量开局；plain scalar 中间的撇号是
  // 内容（`[咖啡, Bob's 咖啡] # 备注` 的注释必须剥掉——旧实现把数组内任意位置的
  // 引号字符都当开局，奇数个撇号的项让 `#` 永远扫不到，tags 退化成单个脏串）。
  // 与 PyYAML 同口径：流式上下文里引号只在标量首字符位置生效。
  let atItemStart = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quote) {
      // BUG-180a：引号内的转义不消引号——双引号认 `\"`、单引号认 `''`（YAML 的四款引号
      // 转义里与切分相关的一对）。旧实现见到 `\` 原样放过，`"a \" # b"` 会在 `\"` 处
      // 提前闭合引号、后面的 ` # b` 被当注释裁掉，整行退化成残串。
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (quote === "'" && ch === "'" && line[i + 1] === "'") {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (atItemStart) {
      // 项前空白（`, 'a'` 的那个空格）不消起始位——引号要认的是标量首字符
      if (/\s/.test(ch)) continue
      atItemStart = false
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
    } else if (i === valueStart && (ch === '"' || ch === "'")) {
      // 值起始处的引号 = 引号标量开局（`title: "带 # 的标题"`）
      quote = ch
      continue
    }
    if (ch === '[') {
      bracket++
      atItemStart = true
    } else if (ch === ']' && bracket > 0) {
      bracket--
      atItemStart = false
    } else if (ch === ',' && bracket > 0) atItemStart = true
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i).replace(/\s+$/, '')
  }
  return line
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {}
  let currentKey: string | null = null
  // BUG-180a：多行流式数组的收集态（`tags: [` 换行逐项再 `]`，合法 YAML）
  let flow: { key: string; depth: number; parts: string[] } | null = null
  // splitFrontmatter 取到围栏前的最后一个 `\n` 为止，CRLF 文件会在末行留下一个孤立 `\r`；
  // JS 的 `.` 不匹配 `\r`、`$` 也不会落在 `\r` 之前，不剥掉的话**最后一个 frontmatter 字段 /
  // 标签项会被静默丢弃**（如末位标签 #AI对人类的思考 在插件里彻底看不见）。
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    if (flow) {
      const cont = stripInlineComment(line)
      // 防呆（BUG-180a）：行首出现新的 `key:` 且本行没有 `]`，说明前面那个 `[` 其实
      // 没有闭合（手写残缺 / 引号没收住）。与其把后续所有字段吞进数组，不如就地收尾
      // 成空数组、本行按普通行继续解析（真 YAML 这里直接是语法错）。
      if (/^[A-Za-z_][\w-]*\s*:/.test(cont.trim()) && !cont.includes(']')) {
        fm[flow.key] = []
        flow = null
      } else if (cont.trim() !== '' && !cont.trim().startsWith('#')) {
        // 收集期：空行 / 纯注释行跳过（多行流里允许出现），其余行按原样继续拼。
        flow.parts.push(cont)
        flow.depth += flowDepth(cont)
        if (flow.depth <= 0) {
          const inner = flow.parts
            .join(' ')
            .replace(/^\s*\[/, '')
            .replace(/\]\s*$/, '')
            .trim()
          fm[flow.key] = inner ? splitFlowItems(inner) : []
          flow = null
        }
        continue
      } else {
        continue
      }
    }
    if (!line.trim() || line.trim().startsWith('#')) continue
    // 标准 YAML 行为：` #` 起（引号外、且 # 前是空白或行首）算行内注释，截断掉
    // （BUG-25）。手改 frontmatter 的人常写 `createdAt: … # 早上的`，不剥的话时间戳
    // 无效让整条从时段图 / 星期分布 / 周对比里消失；`backfilled: true # 补` 不等于 'true'
    // 让标记丢失；`tags: [a, b] # x` 不以 ] 结尾，流式数组分支不走、tags 退化成
    // 一个脏字符串。先剥行内注释再匹配 kv / 列表项。
    const line2 = stripInlineComment(line)
    const listItem = line2.match(/^\s*-\s*(.+)$/)
    if (listItem && currentKey) {
      const arr = Array.isArray(fm[currentKey]) ? (fm[currentKey] as unknown[]) : []
      arr.push(unquote(listItem[1]!.trim()))
      fm[currentKey] = arr
      continue
    }
    const kv = line2.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) {
      currentKey = kv[1]!
      const value = kv[2]!.trim()
      if (value === '') {
        fm[currentKey] = []
      } else if (value.startsWith('[') && flowDepth(value) > 0) {
        // BUG-180a：多行流式数组——首行只开了个头（还有未闭合的 `[`），
        // 收集到括号闭合再统一切分（旧实现把它当标量，`tags` 变成「[」一颗脏标签、
        // 该文件所有真标签从索引消失——BUG-161a 同款症状）。
        flow = { key: currentKey, depth: flowDepth(value), parts: [value] }
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // 流式数组：[] / [a, b]，与 buildFrontmatter 的空数组输出对称（按引号切项）
        const inner = value.slice(1, -1).trim()
        fm[currentKey] = inner ? splitFlowItems(inner) : []
      } else {
        fm[currentKey] = unquote(value)
      }
      continue
    }
    // BUG-161b：既不是键也不是列表项的孤立行（手滑写进的文本）——清掉 currentKey。
    // 旧实现从不重置它，紧随其后的 `- 音乐` 会被追加进**上一个键**的数组，
    // 索引里凭空多一个用户没在该键下写过的值（真实 YAML 里这种输入直接是语法错）。
    // 空行 / 注释行在上面就已 continue，不影响块列表里的合法空行。
    currentKey = null
  }
  return fm
}

/**
 * 流式上下文里扫一遍括号深度（引号内的括号不计）：双引号认 `\` 转义、单引号认 `''` 转义。
 * **引号只在项起始位开局**（与 `stripInlineComment` 同一纪律，PyYAML 同口径）——
 * `Bob's` 这种 plain scalar 中段的撇号不是引号，否则 `[咖啡, Bob's 咖啡]` 会被误判成
 * 「引号未闭合、还有未闭合的 `[`」而进入多行收集。
 */
function flowDepth(s: string): number {
  let depth = 0
  let quote: string | null = null
  let atItemStart = true
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (quote === "'" && ch === "'" && s[i + 1] === "'") {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (atItemStart) {
      if (/\s/.test(ch)) continue
      atItemStart = false
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
    }
    if (ch === '[' || ch === '{') {
      depth++
      atItemStart = true
    } else if (ch === ']' || ch === '}') {
      depth--
    } else if (ch === ',' && depth >= 1) {
      atItemStart = true
    }
  }
  return depth
}

/**
 * 流式数组的项切分：只切**顶层逗号**——引号内（含转义）与嵌套 `[] {}` 里的逗号是内容。
 * 引号同样只在项起始位开局（`Bob's` 不是引号开局）。BUG-180a：旧实现裸
 * `inner.split(',')`，`tags: ['a, b', c]` 会被拆成 `'a` / `b'` / `c` 三颗脏标签、
 * 真的 `a, b` 从索引消失；`["a \" # b", c]` 更早一步被 stripInlineComment
 * 截断（那一半已由 BUG-161 收紧引号开局、本轮补转义，切分这半到此才对齐）。
 */
function splitFlowItems(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  let atItemStart = true
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (quote) {
      cur += ch
      if (quote === '"' && ch === '\\' && i + 1 < inner.length) {
        cur += inner[i + 1]!
        i++
        continue
      }
      if (quote === "'" && ch === "'" && inner[i + 1] === "'") {
        cur += "'"
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (atItemStart) {
      if (/\s/.test(ch)) {
        cur += ch
        continue
      }
      atItemStart = false
      if (ch === '"' || ch === "'") {
        quote = ch
        cur += ch
        continue
      }
    }
    if (ch === '[' || ch === '{') {
      depth++
      atItemStart = true
    } else if (ch === ']' || ch === '}') {
      depth--
    } else if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      atItemStart = true
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => unquote(s.trim())).filter(Boolean)
}

/** 双引号 YAML 转义表（只认常用集；未知转义原样保留） */
const UNESCAPE: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    // BUG-180a：双引号串还要求值——`\"` 是引号本体（旧实现只剥外引号、转义原样漏出）
    return s.slice(1, -1).replace(/\\(["\\/bfnrt])/g, (_, c: string) => UNESCAPE[c] ?? c)
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    // 单引号串的 YAML 转义是 `''`（成对书写）
    return s.slice(1, -1).replace(/''/g, "'")
  }
  return s
}

/** 序列化 frontmatter（保持字段稳定顺序，便于 diff） */
export function buildFrontmatter(fields: Record<string, string | string[]>): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of value) lines.push(`  - ${item}`)
      }
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}
