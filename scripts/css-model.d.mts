// css-model.mjs 的类型面。守卫脚本（host-field-var-guard / settings-host-war /
// settings-mock-css）从 .mjs 直接取数，tsc 看不见它——本文件把那层手抄的形状
// 声明出来。改 css-model.mjs 的返回结构时，同步改这里（tsc 会把用错的下游点红）。
export interface CssComment {
  index: number
  start: number
  end: number
  text: string
  attachedTo: 'rule' | 'decl' | 'standalone'
}

export interface CssRule {
  index: number
  context: string[]
  contextKey: string
  selector: string
  kind: string
  decls: Array<{ prop: string; value: string; raw: string }>
  start: number
  bodyStart: number
  bodyEnd: number
  end: number
}

export interface CssDecl {
  prop: string
  value: string
  raw: string
}

/** 读文件 → { text, eol, bom, hasLonelyCr } */
export function readCss(file: string): {
  text: string
  bom: boolean
  eol: 'CRLF' | 'CR' | 'LF'
  lonelyCr: number
}

/** 解析 CSS。规则与注释的位置字段都是字符下标，供守卫脚本原样 echo。 */
export function parseCss(text: string): { rules: CssRule[]; comments: CssComment[] }

/** 特异性三元组 [id, class+attr+pseudo-class, element]（顶层逗号分支取 max） */
export function specificity(selector: string): [number, number, number]

/** 特异性按顶层逗号分支逐个返回（级联模拟器「命中哪个分支按哪个记账」用，BUG-191） */
export function specificityAlts(selector: string): Array<[number, number, number]>

/** 声明值里的「裸 hex 字面量」（var() 回退值不算） */
export function hexLiterals(value: string): string[]

/** 按 (contextKey, selector) 分组，返回出现多次的组 */
export function duplicateGroups(rules: CssRule[]): Array<[string, CssRule[]]>

export type { CssDecl as CssDeclaration }
