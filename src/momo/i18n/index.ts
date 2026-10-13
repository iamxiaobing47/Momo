/**
 * 文案（i18n）唯一入口。
 *
 * 规则（.code/AGENTS.md §文案）：
 * - **界面上一句人话都不许内联**——组件/服务都从 `copy` 读；中文只活在 `zh/` 下的字典里。
 * - 本模块在 `src/momo/` 下，**绝不 import 'obsidian'**（分层约束）。语言探测
 *   （`getLanguage()`）由 views 层注入，见 `main.ts` 的 onload。
 * - 日志（console.*）与落盘默认值（`DEFAULT_BRAND_NAME`）**刻意**留在原地：
 *   前者要稳定可 grep、后者是 data.json 里的数据而非界面文案，理由见 scripts/lint-copy.mjs。
 *
 * 怎么加一门语言（比如英文）：
 *   1. 建 `./en/`，按 `zh/` 的目录形状写字典；
 *   2. 在 `Locale` 联合类型里加 `'en'`，并登记进 `DICTS` 与 `SUPPORTED_LOCALES`；
 *   3. 跑 `npm run typecheck` —— `Record<Locale, Dict>` 会**强制**这门语言每个键都翻到，
 *      缺一个键就编译不过（这就是本地化完整性的守卫，不靠自觉）。
 *   翻译完成前不要登记进 DICTS：宁可整界面回退中文，也不要半中半英。
 */
import { zh, type Dict } from './zh'
import { en } from './en'
import { ja } from './ja'

export type { Dict }

/** 受支持的语言。加成员 = 承诺这门语言的字典 100% 完整。 */
export type Locale = 'zh' | 'en' | 'ja'

/** 已启用的语言（registerLocale 的候选清单） */
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh', 'en', 'ja']

/** 语言 → 字典。`Record<Locale, Dict>` 的 Dict 是**完整**字典类型，缺键编译不过。
 *  （曾导出给截图工具链的 seg 截断守卫取三语言档位名；该工具链 2026-10-13 已移除。） */
export const DICTS: Record<Locale, Dict> = { zh, en, ja }

/** 回退语言：未支持的语种一律用它（绝不半中半英） */
export const FALLBACK_LOCALE: Locale = 'zh'

/**
 * 语言的**自称**（autonym）：中文 / English / 日本語。
 * 刻意不进各语言的字典——语言名一律用这门语言自己的写法（语言选择器里，
 * 用户要在界面语言不对的时候也能认出自己要的那门），所以每门语言下它都一样。
 * `Record<Locale, string>`：Locale 加成员而这里没补自称 → 编译不过。
 */
export const LANG_NAMES: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}

let currentLocale: Locale = FALLBACK_LOCALE
let current: Dict = DICTS[FALLBACK_LOCALE]

/**
 * 当前语言下的文案树——**唯一读取点**。
 *
 * 走 Proxy 而不是直接导出字典对象：语言可以在插件启动后由 `setLocale` 切换，
 * Proxy 保证任何一处 `copy.x.y` 读到的都是当前语言（组件不必重订阅）。
 * 除 `get` 外还代理 `ownKeys` / `getOwnPropertyDescriptor`：让 `{ ...copy }`、
 * `Object.keys(copy)` 这类内省也拿到当前语言的键（i18n 守卫测试与将来的
 * 「翻译覆盖度」脚本都靠它，不必再导出一个 `dictOf`）。
 */
export const copy: Dict = new Proxy({} as Dict, {
  get(_target, prop: string | symbol): unknown {
    if (typeof prop !== 'string') return undefined
    return (current as unknown as Record<string, unknown>)[prop]
  },
  ownKeys: () => Reflect.ownKeys(current),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/** 切换语言；未登记的语言忽略（保持当前语言，不产生混合界面） */
export function setLocale(locale: Locale): void {
  const dict = DICTS[locale]
  if (dict) {
    current = dict
    currentLocale = locale
  }
}

/** 当前语言（诊断用；界面语言跟随 Obsidian，见 main.ts 的 onload） */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * Obsidian `getLanguage()` 的返回值 → 受支持的语言。
 * 取主语言子标签（`zh-TW` / `zh-Hans` → `zh`）；未支持的一律回退，不猜。
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  const primary = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return SUPPORTED_LOCALES.find((l) => l === primary) ?? FALLBACK_LOCALE
}
