import { LOC_ROSTER, buildFoldedTiers, rosterCityOf, tieredLookup } from './locRoster'

// 地点的大洲 / 国家（F1 二期「地点名前加大洲和国家」，2026-09-30 用户裁定）：
// 内置离线字典 + 用户手填（prefs.locRegions）的查找。
//
// 与 locCoords.ts（坐标）同一本账、同一个路子，且账本现在就是**同一本**：
//   ① 城市归属 BUILTIN_LOC_REGIONS：从地点名册（locRoster.ts，约 520 城 ×
//      中 / 英 / 日三语名）**派生**——每个名都是键，都指向同一座城的
//      [大洲, 国家]。与坐标字典同源派生，键集天然一致（守卫测试盯着派生的
//      不变量，而不是钉两份手抄键集），离线可用、零网络依赖；
//   ② BUILTIN_LOC_COUNTRIES：国家名 → 大洲（v0.9.32）。城市字典只收得到几百个
//      城市，用户写「中国」「日本」这类**国家名**时原本查不到归属、只能按地名自
//      成一组。**识别层级最低是国家**——最常走的那条路径（`亚洲 · 中国`）反倒要靠
//      用户手填才亮起来，这不行。城市字典优先命中，两张表互斥（守卫盯着）；
//      v1 起另配 BUILTIN_LOC_COUNTRY_ALIASES（英 / 日国名 → 中文国名），
//      写「Japan」「フランス」也能查到归属——三语名册的字在那里就该管到底；
//   ③ prefs.locRegions（data.json）：任意地点都允许手填，「外婆家」就是最典型的
//      用例（设置页「地点」卡里填）。**用户填的压过内置的**——那是明确的一次覆盖，
//      不是缓存；
//   ④ 两边都没有 → 该地点只有地名自己：分组退化成按地名（= 升级前的行为），
//      组头没有前缀、也没有「未知大洲」这类占位——占位符会把「没数据」伪装成
//      「有数据」，用户反而要猜这颗胶囊是什么意思。
//
// 为什么大洲 / 国家与坐标分成两个文件：坐标是**位置**（星球要画），大洲 / 国家
// 是**归属**（分组的层级），消费者不同（星球 vs 分组流 / 跳转 / pill / 弹层），
// 成长节奏也不同。数据本体已经合进名册一本账，两个文件只剩各自的查找口径。
//
// 大洲名**不算地点**（v0.9.32，同一条「最低是国家」）：写「南美洲」时它不是一处
// 地方，而是分组的第一级。收下它会造出 `南美洲 · 南美洲` 这种自己套自己的组头
// （continent 档下更荒唐：这个组的锚点就是它自己）。所以 CONTINENT_NAMES 里的
// 名字在**读侧**被整条滤掉（locations.ts 的 normalizeLocations）：卡片上不显示、
// 不进分组、不进层级树、不上球。盘上用户手写的那一行**不删**（ADR-003：文件是
// 唯一事实源，读侧净化不是删除授权，见 locations.ts 的 locListOf 注释），要清
// 自己改文件。
//
// 大洲 / 国家 / 地名三级都**按界面语言显示**（2026-10-06 用户裁定，推翻了
// 2026-09-30 那版「数据不是界面文案、不翻译」）——但不本地化**存储**：本表里的键
// 恒是中文规范名，frontmatter 里那行字符串一个字节都不动，改的只是「显示成什么」
// （见 locDisplay.ts）。切语言不该让用户盘上的数据跟着变（ADR-003）。
//
// 七块大洲只收前六块（南极洲没有任何常用地点，收进来只会多一条永不命中的分支）。
// 加勒比 / 中美一律归**北美洲**（地理学口径），南美各国归南美洲——不用「拉丁
// 美洲」这种洲际文化区当大洲，分组的第一级要能一把数清。
//
// 这些是纯函数与纯数据：不碰文件、不 import obsidian（momo/ 层红线）。

/** 大洲 / 国家对：`[大洲, 国家]`。任一为空串 = 那一级没填（分组时跳过那一环） */
export type LocRegion = readonly [continent: string, country: string]

/**
 * 标准七块大洲名（v0.9.32）。**它们是分组的级，不是地点**——用户写「南美洲」时
 * 写下的不是一处地方，拿它当地点只会造出 `南美洲 · 南美洲` 的组头。
 *
 * 为什么是七块而归属字典只收六块：本表管「什么不算地点」，南极洲虽然一个常用
 * 地点都没收录，写下来照样是块大洲，照样该滤；`BUILTIN_LOC_REGIONS` 的
 * `[0]` 取值域是另一回事（守卫测试盯死六块，见 loc-regions.test.mts）。
 *
 * 为什么只收标准七块、不收「东南亚」「中美」这类文化区：那些很可能是用户真写下
 * 的行程地名（「东南亚出差」），把它们从卡片上抹掉比显示出来更糟——洲名是
 * **恰好同名于分组级**的那批词，文化区不是。
 */
export const CONTINENT_LIST = ['亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲', '南极洲'] as const

/** 大洲规范名。三语显示名（`copy.location.continent`）按它做 `Record<LocContinent, string>`，
 *  少写一块大洲编译不过——完整性不靠自觉。 */
export type LocContinent = (typeof CONTINENT_LIST)[number]

export const CONTINENT_NAMES: ReadonlySet<string> = new Set(CONTINENT_LIST)

/** 这个地名是不是一块大洲（= 不算地点，读侧该滤掉；见文件头） */
export function isContinentName(name: string): boolean {
  return CONTINENT_NAMES.has(name)
}

/**
 * 内置大洲 / 国家字典：**由名册派生**——键 = 每座城的中 / 英 / 日名（精确匹配
 * 不做归一——「北京市」与「北京」是两个地点，后者可在设置页手填），值 = 那座城
 * 的 `[大洲, 国家]`。与 `locCoords.ts` 的 BUILTIN_LOC_COORDS 同源派生，键集
 * 逐字一致（守卫测试 loc-roster.test.mts 盯着派生不变量）。本表只收城市与首都
 * （国家名走下面的 `BUILTIN_LOC_COUNTRIES`）。
 *
 * **无原型对象**（BUG-118a）：查询键是 frontmatter 里的外部输入，`Object.fromEntries` 造的表
 * 带 `Object.prototype`，`locations: [constructor]` 会命中原型上的方法对象，谓词对它 `.trim()`
 * 抛 TypeError → 地点树 / 分组流整块白屏。原型清空后任何调用点的 `表[name]` 未命中都是 undefined。
 */
export const BUILTIN_LOC_REGIONS: Readonly<Record<string, LocRegion>> = Object.assign(
  Object.create(null) as Record<string, LocRegion>,
  Object.fromEntries(
    LOC_ROSTER.flatMap((city) => [
      [city.zh, [city.continent, city.country] as const],
      [city.en, [city.continent, city.country] as const],
      [city.ja, [city.continent, city.country] as const],
    ]),
  ),
)

/**
 * 内置国家表：国家名 → 大洲（v0.9.32「识别层级最低是国家」）。
 *
 * 为什么单开一张表、而不是把国家塞进上面那张：那张的键集被名册钉死（坐标只收
 * 得到城市与首都，国家在星球上没有这颗锚点），往里加国家会连带把名册撑破——而
 * 分组要的只是**归属**。
 *
 * 键 = 国家名（中文标准名，精确匹配不做归一：「中华人民共和国」与「中国」两个
 * 地点，后者才收；外文与别写走 `BUILTIN_LOC_COUNTRY_ALIASES`）。值 = 大洲，与
 * 名册同口径（土耳其 / 高加索三国按本库既有的常用口径归亚洲，不按联合国
 * geoscheme）。
 *
 * 与城市表**允许相交**（新加坡 / 卢森堡 / 摩纳哥 / 突尼斯 / 吉布提 既是城市名
 * 也是国家名，两边说的是同一处），相交处必须同洲——守卫测试断言这一点，所以
 * 同一个地点不会有两个会漂的来源；真撞上了，城市那条先命中（见 regionOfLocation）。
 * 唯一的例外是**萨尔瓦多**：它在城市表里是巴西的萨尔瓦多，在本表里是萨尔瓦多
 * 共和国，同名两义、两边洲别本来就不同（守卫测试白名单里就写着它）。查表城市
 * 优先，所以裸写「萨尔瓦多」按巴西那座城算；用户要的是国家就在设置页手填归属，
 * 手填压过一切。
 */
export const BUILTIN_LOC_COUNTRIES: Readonly<Record<string, string>> = {
  // ---- 亚洲 ----
  中国: '亚洲',
  日本: '亚洲',
  韩国: '亚洲',
  朝鲜: '亚洲',
  蒙古: '亚洲',
  印度: '亚洲',
  巴基斯坦: '亚洲',
  阿富汗: '亚洲',
  孟加拉国: '亚洲',
  斯里兰卡: '亚洲',
  尼泊尔: '亚洲',
  不丹: '亚洲',
  马尔代夫: '亚洲',
  缅甸: '亚洲',
  泰国: '亚洲',
  越南: '亚洲',
  老挝: '亚洲',
  柬埔寨: '亚洲',
  马来西亚: '亚洲',
  新加坡: '亚洲',
  印度尼西亚: '亚洲',
  菲律宾: '亚洲',
  文莱: '亚洲',
  东帝汶: '亚洲',
  沙特阿拉伯: '亚洲',
  也门: '亚洲',
  阿曼: '亚洲',
  阿联酋: '亚洲',
  卡塔尔: '亚洲',
  巴林: '亚洲',
  科威特: '亚洲',
  伊拉克: '亚洲',
  伊朗: '亚洲',
  土耳其: '亚洲',
  塞浦路斯: '亚洲',
  叙利亚: '亚洲',
  黎巴嫩: '亚洲',
  以色列: '亚洲',
  巴勒斯坦: '亚洲',
  约旦: '亚洲',
  格鲁吉亚: '亚洲',
  亚美尼亚: '亚洲',
  阿塞拜疆: '亚洲',
  哈萨克斯坦: '亚洲',
  乌兹别克斯坦: '亚洲',
  土库曼斯坦: '亚洲',
  吉尔吉斯斯坦: '亚洲',
  塔吉克斯坦: '亚洲',

  // ---- 欧洲 ----
  俄罗斯: '欧洲',
  乌克兰: '欧洲',
  白俄罗斯: '欧洲',
  波兰: '欧洲',
  德国: '欧洲',
  奥地利: '欧洲',
  瑞士: '欧洲',
  列支敦士登: '欧洲',
  法国: '欧洲',
  比利时: '欧洲',
  荷兰: '欧洲',
  卢森堡: '欧洲',
  摩纳哥: '欧洲',
  英国: '欧洲',
  爱尔兰: '欧洲',
  冰岛: '欧洲',
  丹麦: '欧洲',
  挪威: '欧洲',
  瑞典: '欧洲',
  芬兰: '欧洲',
  爱沙尼亚: '欧洲',
  拉脱维亚: '欧洲',
  立陶宛: '欧洲',
  西班牙: '欧洲',
  葡萄牙: '欧洲',
  意大利: '欧洲',
  圣马力诺: '欧洲',
  梵蒂冈: '欧洲',
  马耳他: '欧洲',
  希腊: '欧洲',
  斯洛伐克: '欧洲',
  捷克: '欧洲',
  匈牙利: '欧洲',
  斯洛文尼亚: '欧洲',
  克罗地亚: '欧洲',
  波黑: '欧洲',
  塞尔维亚: '欧洲',
  黑山: '欧洲',
  北马其顿: '欧洲',
  阿尔巴尼亚: '欧洲',
  保加利亚: '欧洲',
  罗马尼亚: '欧洲',
  摩尔多瓦: '欧洲',
  安道尔: '欧洲',

  // ---- 非洲 ----
  埃及: '非洲',
  利比亚: '非洲',
  突尼斯: '非洲',
  阿尔及利亚: '非洲',
  摩洛哥: '非洲',
  毛里塔尼亚: '非洲',
  塞内加尔: '非洲',
  冈比亚: '非洲',
  几内亚比绍: '非洲',
  几内亚: '非洲',
  塞拉利昂: '非洲',
  利比里亚: '非洲',
  科特迪瓦: '非洲',
  布基纳法索: '非洲',
  马里: '非洲',
  佛得角: '非洲',
  加纳: '非洲',
  多哥: '非洲',
  贝宁: '非洲',
  尼日利亚: '非洲',
  尼日尔: '非洲',
  乍得: '非洲',
  喀麦隆: '非洲',
  中非: '非洲',
  '刚果（布）': '非洲',
  '刚果（金）': '非洲',
  加蓬: '非洲',
  赤道几内亚: '非洲',
  圣多美和普林西比: '非洲',
  安哥拉: '非洲',
  赞比亚: '非洲',
  马拉维: '非洲',
  莫桑比克: '非洲',
  津巴布韦: '非洲',
  博茨瓦纳: '非洲',
  纳米比亚: '非洲',
  南非: '非洲',
  莱索托: '非洲',
  斯威士兰: '非洲',
  马达加斯加: '非洲',
  毛里求斯: '非洲',
  塞舌尔: '非洲',
  乌干达: '非洲',
  卢旺达: '非洲',
  布隆迪: '非洲',
  肯尼亚: '非洲',
  坦桑尼亚: '非洲',
  索马里: '非洲',
  吉布提: '非洲',
  埃塞俄比亚: '非洲',
  厄立特里亚: '非洲',
  苏丹: '非洲',
  南苏丹: '非洲',

  // ---- 北美洲（中美与加勒比按地理学口径归本洲，见文件头）----
  美国: '北美洲',
  加拿大: '北美洲',
  墨西哥: '北美洲',
  伯利兹: '北美洲',
  危地马拉: '北美洲',
  萨尔瓦多: '北美洲',
  洪都拉斯: '北美洲',
  尼加拉瓜: '北美洲',
  哥斯达黎加: '北美洲',
  巴拿马: '北美洲',
  古巴: '北美洲',
  牙买加: '北美洲',
  海地: '北美洲',
  多米尼加: '北美洲',
  多米尼克: '北美洲',
  巴哈马: '北美洲',
  巴巴多斯: '北美洲',
  圣卢西亚: '北美洲',
  圣文森特和格林纳丁斯: '北美洲',
  格林纳达: '北美洲',
  圣基茨和尼维斯: '北美洲',
  安提瓜和巴布达: '北美洲',
  波多黎各: '北美洲',

  // ---- 南美洲 ----
  哥伦比亚: '南美洲',
  委内瑞拉: '南美洲',
  圭亚那: '南美洲',
  苏里南: '南美洲',
  厄瓜多尔: '南美洲',
  秘鲁: '南美洲',
  玻利维亚: '南美洲',
  巴西: '南美洲',
  阿根廷: '南美洲',
  智利: '南美洲',
  巴拉圭: '南美洲',
  乌拉圭: '南美洲',

  // ---- 大洋洲 ----
  澳大利亚: '大洋洲',
  新西兰: '大洋洲',
  巴布亚新几内亚: '大洋洲',
  斐济: '大洋洲',
  所罗门群岛: '大洋洲',
  瓦努阿图: '大洋洲',
  萨摩亚: '大洋洲',
  汤加: '大洋洲',
  基里巴斯: '大洋洲',
  密克罗尼西亚: '大洋洲',
  马绍尔群岛: '大洋洲',
  帕劳: '大洋洲',
  瑙鲁: '大洋洲',
}

/**
 * 国家名的英 / 日别名：别名 → **中文国名**（BUILTIN_LOC_COUNTRIES 的键）。
 * 名册是三语的，国名那级也要跟到底——写「Japan」「フランス」「韩国」（日文
 * 韩字）都能查到归属，组头仍按中文国名拼（`亚洲 · 日本 · Japan`，大洲 / 国家
 * 名是数据不是文案，见文件头）。
 *
 * 与中文国名相同的写法（日本、蒙古……）不收——那是国家表自己的键，重复登记
 * 只会让守卫白喊。与城市名撞写的城邦（Singapore / Luxembourg / Monaco /
 * Djibouti）两边说的是同一处，城市那条先命中，结果同洲同国，无害且被守卫盯住。
 */
export const BUILTIN_LOC_COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  // ---- 亚洲 ----
  China: '中国',
  Japan: '日本',
  'South Korea': '韩国',
  Korea: '韩国',
  'North Korea': '朝鲜',
  Mongolia: '蒙古',
  India: '印度',
  Pakistan: '巴基斯坦',
  Afghanistan: '阿富汗',
  Bangladesh: '孟加拉国',
  'Sri Lanka': '斯里兰卡',
  Nepal: '尼泊尔',
  Bhutan: '不丹',
  Maldives: '马尔代夫',
  Myanmar: '缅甸',
  Burma: '缅甸',
  Thailand: '泰国',
  Vietnam: '越南',
  Laos: '老挝',
  Cambodia: '柬埔寨',
  Malaysia: '马来西亚',
  Indonesia: '印度尼西亚',
  Philippines: '菲律宾',
  Brunei: '文莱',
  'East Timor': '东帝汶',
  'Timor-Leste': '东帝汶',
  'Saudi Arabia': '沙特阿拉伯',
  Yemen: '也门',
  Oman: '阿曼',
  'United Arab Emirates': '阿联酋',
  UAE: '阿联酋',
  Qatar: '卡塔尔',
  Bahrain: '巴林',
  Kuwait: '科威特',
  Iraq: '伊拉克',
  Iran: '伊朗',
  Turkey: '土耳其',
  Türkiye: '土耳其',
  Cyprus: '塞浦路斯',
  Syria: '叙利亚',
  Lebanon: '黎巴嫩',
  Israel: '以色列',
  Palestine: '巴勒斯坦',
  Jordan: '约旦',
  Georgia: '格鲁吉亚',
  Armenia: '亚美尼亚',
  Azerbaijan: '阿塞拜疆',
  Kazakhstan: '哈萨克斯坦',
  Uzbekistan: '乌兹别克斯坦',
  Turkmenistan: '土库曼斯坦',
  Kyrgyzstan: '吉尔吉斯斯坦',
  Tajikistan: '塔吉克斯坦',
  韓国: '韩国',
  北朝鮮: '朝鲜',
  モンゴル: '蒙古',
  インド: '印度',
  パキスタン: '巴基斯坦',
  アフガニスタン: '阿富汗',
  バングラデシュ: '孟加拉国',
  スリランカ: '斯里兰卡',
  ネパール: '尼泊尔',
  ブータン: '不丹',
  モルディブ: '马尔代夫',
  ミャンマー: '缅甸',
  タイ: '泰国',
  ベトナム: '越南',
  ラオス: '老挝',
  カンボジア: '柬埔寨',
  マレーシア: '马来西亚',
  シンガポール: '新加坡',
  インドネシア: '印度尼西亚',
  フィリピン: '菲律宾',
  ブルネイ: '文莱',
  東ティモール: '东帝汶',
  サウジアラビア: '沙特阿拉伯',
  イエメン: '也门',
  オマーン: '阿曼',
  アラブ首長国連邦: '阿联酋',
  カタール: '卡塔尔',
  バーレーン: '巴林',
  クウェート: '科威特',
  イラク: '伊拉克',
  イラン: '伊朗',
  トルコ: '土耳其',
  キプロス: '塞浦路斯',
  シリア: '叙利亚',
  レバノン: '黎巴嫩',
  イスラエル: '以色列',
  パレスチナ: '巴勒斯坦',
  ヨルダン: '约旦',
  ジョージア: '格鲁吉亚',
  アルメニア: '亚美尼亚',
  アゼルバイジャン: '阿塞拜疆',
  カザフスタン: '哈萨克斯坦',
  ウズベキスタン: '乌兹别克斯坦',
  トルクメニスタン: '土库曼斯坦',
  キルギス: '吉尔吉斯斯坦',
  タジキスタン: '塔吉克斯坦',

  // ---- 欧洲 ----
  Russia: '俄罗斯',
  Ukraine: '乌克兰',
  Belarus: '白俄罗斯',
  Poland: '波兰',
  Germany: '德国',
  Austria: '奥地利',
  Switzerland: '瑞士',
  Liechtenstein: '列支敦士登',
  France: '法国',
  Belgium: '比利时',
  Netherlands: '荷兰',
  Holland: '荷兰',
  'United Kingdom': '英国',
  UK: '英国',
  Ireland: '爱尔兰',
  Iceland: '冰岛',
  Denmark: '丹麦',
  Norway: '挪威',
  Sweden: '瑞典',
  Finland: '芬兰',
  Estonia: '爱沙尼亚',
  Latvia: '拉脱维亚',
  Lithuania: '立陶宛',
  Spain: '西班牙',
  Portugal: '葡萄牙',
  Italy: '意大利',
  'San Marino': '圣马力诺',
  Vatican: '梵蒂冈',
  'Vatican City': '梵蒂冈',
  Malta: '马耳他',
  Greece: '希腊',
  Slovakia: '斯洛伐克',
  Czechia: '捷克',
  'Czech Republic': '捷克',
  Hungary: '匈牙利',
  Slovenia: '斯洛文尼亚',
  Croatia: '克罗地亚',
  'Bosnia and Herzegovina': '波黑',
  Serbia: '塞尔维亚',
  Montenegro: '黑山',
  'North Macedonia': '北马其顿',
  Albania: '阿尔巴尼亚',
  Bulgaria: '保加利亚',
  Romania: '罗马尼亚',
  Moldova: '摩尔多瓦',
  Andorra: '安道尔',
  ロシア: '俄罗斯',
  ウクライナ: '乌克兰',
  ベラルーシ: '白俄罗斯',
  ポーランド: '波兰',
  ドイツ: '德国',
  オーストリア: '奥地利',
  スイス: '瑞士',
  リヒテンシュタイン: '列支敦士登',
  フランス: '法国',
  ベルギー: '比利时',
  オランダ: '荷兰',
  イギリス: '英国',
  アイルランド: '爱尔兰',
  アイスランド: '冰岛',
  デンマーク: '丹麦',
  ノルウェー: '挪威',
  スウェーデン: '瑞典',
  フィンランド: '芬兰',
  エストニア: '爱沙尼亚',
  ラトビア: '拉脱维亚',
  リトアニア: '立陶宛',
  スペイン: '西班牙',
  ポルトガル: '葡萄牙',
  イタリア: '意大利',
  サンマリノ: '圣马力诺',
  バチカン: '梵蒂冈',
  マルタ: '马耳他',
  ギリシャ: '希腊',
  スロバキア: '斯洛伐克',
  チェコ: '捷克',
  ハンガリー: '匈牙利',
  スロベニア: '斯洛文尼亚',
  クロアチア: '克罗地亚',
  'ボスニア・ヘルツェゴビナ': '波黑',
  セルビア: '塞尔维亚',
  モンテネグロ: '黑山',
  北マケドニア: '北马其顿',
  アルバニア: '阿尔巴尼亚',
  ブルガリア: '保加利亚',
  ルーマニア: '罗马尼亚',
  モルドバ: '摩尔多瓦',
  アンドラ: '安道尔',

  // ---- 非洲 ----
  Egypt: '埃及',
  Libya: '利比亚',
  Tunisia: '突尼斯',
  Algeria: '阿尔及利亚',
  Morocco: '摩洛哥',
  Mauritania: '毛里塔尼亚',
  Senegal: '塞内加尔',
  Gambia: '冈比亚',
  'Guinea-Bissau': '几内亚比绍',
  Guinea: '几内亚',
  'Sierra Leone': '塞拉利昂',
  Liberia: '利比里亚',
  'Ivory Coast': '科特迪瓦',
  "Côte d'Ivoire": '科特迪瓦',
  'Burkina Faso': '布基纳法索',
  Mali: '马里',
  'Cape Verde': '佛得角',
  Ghana: '加纳',
  Togo: '多哥',
  Benin: '贝宁',
  Nigeria: '尼日利亚',
  Niger: '尼日尔',
  Chad: '乍得',
  Cameroon: '喀麦隆',
  'Central African Republic': '中非',
  Congo: '刚果（布）',
  'Democratic Republic of the Congo': '刚果（金）',
  Gabon: '加蓬',
  'Equatorial Guinea': '赤道几内亚',
  'São Tomé and Príncipe': '圣多美和普林西比',
  Angola: '安哥拉',
  Zambia: '赞比亚',
  Malawi: '马拉维',
  Mozambique: '莫桑比克',
  Zimbabwe: '津巴布韦',
  Botswana: '博茨瓦纳',
  Namibia: '纳米比亚',
  'South Africa': '南非',
  Lesotho: '莱索托',
  Eswatini: '斯威士兰',
  Swaziland: '斯威士兰',
  Madagascar: '马达加斯加',
  Mauritius: '毛里求斯',
  Seychelles: '塞舌尔',
  Uganda: '乌干达',
  Rwanda: '卢旺达',
  Burundi: '布隆迪',
  Kenya: '肯尼亚',
  Tanzania: '坦桑尼亚',
  Somalia: '索马里',
  Djibouti: '吉布提',
  Ethiopia: '埃塞俄比亚',
  Eritrea: '厄立特里亚',
  Sudan: '苏丹',
  'South Sudan': '南苏丹',
  エジプト: '埃及',
  リビア: '利比亚',
  チュニジア: '突尼斯',
  アルジェリア: '阿尔及利亚',
  モロッコ: '摩洛哥',
  モーリタニア: '毛里塔尼亚',
  セネガル: '塞内加尔',
  ガンビア: '冈比亚',
  ギニアビサウ: '几内亚比绍',
  ギニア: '几内亚',
  シエラレオネ: '塞拉利昂',
  リベリア: '利比里亚',
  コートジボワール: '科特迪瓦',
  ブルキナファソ: '布基纳法索',
  マリ: '马里',
  カーボベルデ: '佛得角',
  ガーナ: '加纳',
  トーゴ: '多哥',
  ベナン: '贝宁',
  ナイジェリア: '尼日利亚',
  ニジェール: '尼日尔',
  チャド: '乍得',
  カメルーン: '喀麦隆',
  中央アフリカ: '中非',
  コンゴ共和国: '刚果（布）',
  コンゴ民主共和国: '刚果（金）',
  ガボン: '加蓬',
  赤道ギニア: '赤道几内亚',
  'サントメ・プリンシペ': '圣多美和普林西比',
  アンゴラ: '安哥拉',
  ザンビア: '赞比亚',
  マラウイ: '马拉维',
  モザンビーク: '莫桑比克',
  ジンバブエ: '津巴布韦',
  ボツワナ: '博茨瓦纳',
  ナミビア: '纳米比亚',
  南アフリカ: '南非',
  レソト: '莱索托',
  エスワティニ: '斯威士兰',
  マダガスカル: '马达加斯加',
  モーリシャス: '毛里求斯',
  セーシェル: '塞舌尔',
  ウガンダ: '乌干达',
  ルワンダ: '卢旺达',
  ブルンジ: '布隆迪',
  ケニア: '肯尼亚',
  タンザニア: '坦桑尼亚',
  ソマリア: '索马里',
  ジブチ: '吉布提',
  エチオピア: '埃塞俄比亚',
  エリトリア: '厄立特里亚',
  スーダン: '苏丹',
  南スーダン: '南苏丹',

  // ---- 北美洲 ----
  'United States': '美国',
  USA: '美国',
  America: '美国',
  Canada: '加拿大',
  Mexico: '墨西哥',
  Belize: '伯利兹',
  Guatemala: '危地马拉',
  'El Salvador': '萨尔瓦多',
  Honduras: '洪都拉斯',
  Nicaragua: '尼加拉瓜',
  'Costa Rica': '哥斯达黎加',
  Panama: '巴拿马',
  Cuba: '古巴',
  Jamaica: '牙买加',
  Haiti: '海地',
  'Dominican Republic': '多米尼加',
  Dominica: '多米尼克',
  Bahamas: '巴哈马',
  Barbados: '巴巴多斯',
  'Saint Lucia': '圣卢西亚',
  'Saint Vincent and the Grenadines': '圣文森特和格林纳丁斯',
  Grenada: '格林纳达',
  'Saint Kitts and Nevis': '圣基茨和尼维斯',
  'Antigua and Barbuda': '安提瓜和巴布达',
  'Puerto Rico': '波多黎各',
  アメリカ: '美国',
  米国: '美国',
  カナダ: '加拿大',
  メキシコ: '墨西哥',
  ベリーズ: '伯利兹',
  グアテマラ: '危地马拉',
  エルサルバドル: '萨尔瓦多',
  ホンジュラス: '洪都拉斯',
  ニカラグア: '尼加拉瓜',
  コスタリカ: '哥斯达黎加',
  パナマ: '巴拿马',
  キューバ: '古巴',
  ジャマイカ: '牙买加',
  ハイチ: '海地',
  ドミニカ共和国: '多米尼加',
  ドミニカ国: '多米尼克',
  バハマ: '巴哈马',
  バルバドス: '巴巴多斯',
  セントルシア: '圣卢西亚',
  'セントビンセント・グレナディーン': '圣文森特和格林纳丁斯',
  グレナダ: '格林纳达',
  'セントクリストファー・ネイビス': '圣基茨和尼维斯',
  'アンティグア・バーブーダ': '安提瓜和巴布达',
  プエルトリコ: '波多黎各',

  // ---- 南美洲 ----
  Colombia: '哥伦比亚',
  Venezuela: '委内瑞拉',
  Guyana: '圭亚那',
  Suriname: '苏里南',
  Ecuador: '厄瓜多尔',
  Peru: '秘鲁',
  Bolivia: '玻利维亚',
  Brazil: '巴西',
  Argentina: '阿根廷',
  Chile: '智利',
  Paraguay: '巴拉圭',
  Uruguay: '乌拉圭',
  コロンビア: '哥伦比亚',
  ベネズエラ: '委内瑞拉',
  ガイアナ: '圭亚那',
  スリナム: '苏里南',
  エクアドル: '厄瓜多尔',
  ペルー: '秘鲁',
  ボリビア: '玻利维亚',
  ブラジル: '巴西',
  アルゼンチン: '阿根廷',
  チリ: '智利',
  パラグアイ: '巴拉圭',
  ウルグアイ: '乌拉圭',

  // ---- 大洋洲 ----
  Australia: '澳大利亚',
  'New Zealand': '新西兰',
  'Papua New Guinea': '巴布亚新几内亚',
  Fiji: '斐济',
  'Solomon Islands': '所罗门群岛',
  Vanuatu: '瓦努阿图',
  Samoa: '萨摩亚',
  Tonga: '汤加',
  Kiribati: '基里巴斯',
  Micronesia: '密克罗尼西亚',
  'Marshall Islands': '马绍尔群岛',
  Palau: '帕劳',
  Nauru: '瑙鲁',
  オーストラリア: '澳大利亚',
  'ニュージーランド': '新西兰',
  'パプアニューギニア': '巴布亚新几内亚',
  フィジー: '斐济',
  'ソロモン諸島': '所罗门群岛',
  バヌアツ: '瓦努阿图',
  サモア: '萨摩亚',
  トンガ: '汤加',
  キリバス: '基里巴斯',
  ミクロネシア: '密克罗尼西亚',
  'マーシャル諸島': '马绍尔群岛',
  パラオ: '帕劳',
  ナウル: '瑙鲁',
}

/** 国名查找的合并索引：中文国名指自己，别名指目标（值永远是 BUILTIN_LOC_COUNTRIES 的键） */
const COUNTRY_KEY: ReadonlyMap<string, string> = new Map([
  ...Object.keys(BUILTIN_LOC_COUNTRIES).map((k) => [k, k] as const),
  ...Object.entries(BUILTIN_LOC_COUNTRY_ALIASES).map(([alias, target]) => [alias, target] as const),
])

/** 同一张索引的宽比对两级（折叠 + 紧写），与城市名册共用一台 builder：
 *  「JAPAN」走折叠、「UnitedStates」走紧写，宽容级别两边一致 */
const COUNTRY_TIERS = buildFoldedTiers(COUNTRY_KEY)

/**
 * 地点**身份**的规范形（BUG-110a，2026-10-07 用户裁定「纽约 / New York 两种写法
 * 算同一地点身份」）：
 *   ① trim；
 *   ② 名册城市认得（三语名 + 折叠 + 紧写）→ 落**中文规范名** `city.zh`；
 *   ③ 国家表认得（中文国名 + 英日别名 + 折叠 + 紧写）→ 落那个中文国名；
 *   ④ 都不认（外婆家 / 名册外的城）→ 落 trim 后的自己（身份不折叠——「外婆家」与
 *      「Grandma House」仍是两个地点，我们不猜）；
 *   ⑤ 空串 → 空串（归一里本来就滤掉，这里是防御）。
 *
 * 用途：**读侧身份**。entries 的 locations 经它归一（locations.ts 的 locationsOf），
 * 树 / 分组 / pill / 星球 / 弹层全按同一身份走，两种写法不会再各长一个节点；
 * 写侧的去重与摘除判定也按它算（addLocationsTo / removeLocationsFrom），**但盘上
 * 已有的字符串一个字不改**（ADR-003：文件是内容唯一事实源）。
 */
export function canonicalLocName(raw: string): string {
  const s = raw.trim()
  if (s === '') return ''
  const city = rosterCityOf(s)
  if (city !== null) return city.zh
  const country = tieredLookup(COUNTRY_KEY, COUNTRY_TIERS, s)
  if (country !== null) return country
  return s
}

/**
 * 在用户手填表（locCoords / locRegions 的 prefs 账）里按**身份**找键：精确键优先，
 * 再逐个键比 `canonicalLocName`。找不到返回 null。
 *
 * 为什么需要：这两张表是**用户落盘的数据**，键是当时输入的写法（旧盘上可能是
 * 「New York」）。读侧身份合并后查询串变成「纽约」，若只做精确匹配，用户填过的
 * 坐标 / 归属会一夜之间「失效」——按身份找回去，旧盘无感。命中后**在找回来的
 * 那个键上就地读写**，键本身不搬家（改写 = 用户数据搬家，得用户自己来）。
 *
 * 键的存在性用自有属性判断（不能用 `in`：原型链上的 'constructor' / 'toString'
 * 会命中 Object.prototype，见 sanitize.ts 的 legacyTableHas 注释）。
 */
export function userKeyOf(
  table: Readonly<Record<string, unknown>> | null | undefined,
  name: string,
): string | null {
  if (!table) return null
  if (Object.prototype.hasOwnProperty.call(table, name)) return name
  const id = canonicalLocName(name)
  if (id === '') return null
  for (const k of Object.keys(table)) {
    if (canonicalLocName(k) === id) return k
  }
  return null
}

/** 大洲 / 国家对是否结构合法（两项都得是字符串；都空 = 没有归属，调用方按 null 处理） */
export function isValidLocRegion(v: unknown): v is LocRegion {
  if (!Array.isArray(v) || v.length !== 2) return false
  return typeof v[0] === 'string' && typeof v[1] === 'string'
}

/** 一对大洲 / 国家是否真的说了点什么（两项全空 = 没填，等价于查不到）。
 *  结构不合法的一律当「没说」：它是外部输入的第一道闸，别信入参类型（BUG-118a）。 */
export function isBlankLocRegion(r: LocRegion | null | undefined): boolean {
  return !isValidLocRegion(r) || (r[0].trim() === '' && r[1].trim() === '')
}

/**
 * 地点 → 大洲 / 国家：**用户手填的压过内置字典**，两边都没有（或全空）→ null
 * （无归属兜底：分组退化成按地名，与升级前一致）。读取侧（分组流 / 跳转 /
 * pill / 弹层 / 星球 / 层级树 / 设置页）共用这一个入口，别各处各查一遍。
 *
 * 五级查表（v0.9.32 加了国家表；名册化补了 ASCII 折叠与英 / 日别名；BUG-110a 起
 * 用户手填按身份命中旧写法；BUG-110b 起国家名补紧写兜底）：
 * 用户手填 → 城市表 `BUILTIN_LOC_REGIONS`（名册三语名都是键）→ 城市宽比对
 * （折叠 + 紧写，「tokyo」「NewYork」都命中）→ 国家表（中文国名 + 英日别名 +
 * 折叠 + 紧写，「JAPAN」「UnitedStates」都命中）。
 * 城市在国家前面是因为两张表相交处说的是同一处（守卫测试盯着同洲），真撞上了
 * 城市那条才是用户更可能写的那个地方（「萨尔瓦多」按巴西那座城算）。**大洲名
 * 不在任何一张表里**——它们不算地点，读侧先一步滤掉（locations.ts 的
 * normalizeLocations），到这里时手上永远是一个地名。
 */
export function regionOfLocation(
  name: string,
  userRegions?: Readonly<Record<string, LocRegion>> | null,
): LocRegion | null {
  const userKey = userKeyOf(userRegions, name)
  const user = userKey === null ? undefined : userRegions?.[userKey]
  if (isValidLocRegion(user) && !isBlankLocRegion(user)) return user
  const builtin = BUILTIN_LOC_REGIONS[name]
  if (builtin !== undefined && !isBlankLocRegion(builtin)) return builtin
  const city = rosterCityOf(name)
  if (city !== null) return [city.continent, city.country]
  const country = tieredLookup(COUNTRY_KEY, COUNTRY_TIERS, name)
  if (country !== null) return [BUILTIN_LOC_COUNTRIES[country], country]
  return null
}
