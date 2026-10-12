import { DICTS, getLocale, type Locale } from '../i18n'
import { rosterCityOf } from './locRoster'
import { BUILTIN_LOC_COUNTRIES, BUILTIN_LOC_COUNTRY_ALIASES, CONTINENT_LIST } from './locRegions'
import type { LocContinent } from './locRegions'

// 地点的**显示名**（2026-10-06 用户裁定「界面语言选英语后地点还是中文」）：
// 大洲 / 国家 / 地名三级都按当前界面语言显示，**但一个字节都不落盘**。
//
// 这是对 2026-09-30 那版口径（「大洲 / 国家名是数据不是界面文案，不随语言翻译」）
// 的推翻。推翻的理由：那条口径把「不本地化**存储**」与「不本地化**显示**」绑在了
// 一起——但这两件事本来就该分开。用户盘上写的是中文，那是他的数据；界面语言是
// 英文时他眼里该看到英文，那是他的界面。绑在一起就把「我在英文界面里看自己的
// 地点」变成了全中文。
//
// 三级各自的名字从哪来（**没有新造任何字典**）：
//   ① 地名：名册 LOC_ROSTER 的 zh / en / ja 三名（543 城，守卫盯着三语齐全）；
//   ② 大洲：`copy.location.continent`（7 个词，`Record<LocContinent, string>`
//      少一块编译不过）；
//   ③ 国家：`BUILTIN_LOC_COUNTRY_ALIASES` **反查**（那张表本来就是「英 / 日国名 →
//      中文国名」，倒过来就是中 → 英 / 日）；个别国家没有外文别名（新加坡 /
//      卢森堡 / 摩纳哥，因为它们本来就以城市身份在名册里）→ 回落到名册城市名；
//      再不行回落中文规范名（中国 / 日本：日文写法与中文同形，本来就无需别名）。
//
// 命中顺序 **地名 → 大洲 → 国家**，与 `regionOfLocation` 的「城市优先于国家」
// 同口径：`突尼斯` / `萨尔瓦多` 这两个既在名册（Tunis / Salvador）又在国家表
// （Tunisia / El Salvador）的名字，裸写时全库各处（归属 / 分组 / 坐标）本来就按
// **城市**理解，显示跟着走才不会出现「分组说巴西、名字说萨尔瓦多共和国」。
//
// 认不出来的（外婆家的自填词、名册没收录的城）**原样返回**——不猜、不音译。
//
// 纯函数 + 纯数据，唯一的输入是 locale：不碰文件、不 import obsidian（momo/ 层红线）。

/** 大洲规范名 → 是不是一块大洲（`CONTINENT_LIST` 的成员判定，别在别处再抄一遍） */
const CONTINENT_SET: ReadonlySet<string> = new Set<string>(CONTINENT_LIST)

/** 类型闸门：`s` 是规范大洲名时才允许去索引 i18n 的 `Record<LocContinent, string>`
 *  （三本字典那一列都是精确键，用 `string` 索引会编译不过——这道闸门就是为它存在的） */
function isLocContinent(s: string): s is LocContinent {
  return CONTINENT_SET.has(s)
}

const LATIN = /[A-Za-z]/

/** 国家 → 英文名 / 日文名：别名表反查，**第一次出现的别名胜**（表里靠前的那个
 *  是常用名：South Korea 而不是 Korea、Myanmar 而不是 Burma、United States
 *  而不是 USA）。日文这一列只收「与中文名不同形」的别名——同形的（中国 / 日本）
 *  本来就是日文写法，不必登记，也不必翻译。 */
const COUNTRY_ALIAS_EN: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [alias, zh] of Object.entries(BUILTIN_LOC_COUNTRY_ALIASES)) {
    if (LATIN.test(alias) && !m.has(zh)) m.set(zh, alias)
  }
  return m
})()

const COUNTRY_ALIAS_JA: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [alias, zh] of Object.entries(BUILTIN_LOC_COUNTRY_ALIASES)) {
    if (!LATIN.test(alias) && alias !== zh && !m.has(zh)) m.set(zh, alias)
  }
  return m
})()

/**
 * 一地名 / 一环节 → 当前界面语言下的显示名。入参可以是**整串地点名**，也可以是
 * 层级路径里的**单段**（大洲 / 国家 / 地名）——三级共用这一个入口。
 *
 * `locale` 缺省 = 当前界面语言（`getLocale()`）。**在渲染期调用**，别在模块级
 * 求值后把结果冻进常量：`copy` 是 Proxy，渲染时读才拿得到切换后的语言。
 */
export function displayLocName(raw: string, locale: Locale = getLocale()): string {
  const s = raw.trim()
  if (s === '') return raw
  const city = rosterCityOf(s)
  if (city) return city[locale]
  // 大洲：7 个词的显示名活在 i18n 三本字典里（`copy.location.continent`），
  // 从 DICTS 现取——不在这里抄第二份，也就不会跟界面语言漂开。
  if (isLocContinent(s)) return DICTS[locale].location.continent[s]
  if (s in BUILTIN_LOC_COUNTRIES) {
    if (locale === 'zh') return s
    const alias = (locale === 'en' ? COUNTRY_ALIAS_EN : COUNTRY_ALIAS_JA).get(s)
    // 别名没有 → 回落规范名。**不必再查一遍名册**：上面那次 `rosterCityOf(s)`
    // 已经做过 `city.zh === s` 的精确比对，能命中的（新加坡 / 卢森堡 / 摩纳哥）
    // 早在城市那一支就返回了，走到这里就说明名册里没有同名的城。
    return alias ?? s
  }
  return s
}
