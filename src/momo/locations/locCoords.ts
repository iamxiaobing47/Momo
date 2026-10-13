import { LOC_ROSTER, rosterCityOf } from './locRoster'
import { userKeyOf } from './locRegions'

// 地点坐标（F7 星球视图的地基）：内置离线字典 + 用户手填（prefs.locCoords）的查找。
//
// 坐标从哪来（设计稿 F7b §坐标数据规则）——一句话：**内置离线字典命中即上球，
// 未命中不丢**：
//   ① 本文件的 BUILTIN_LOC_COORDS：从地点名册（locRoster.ts，约 520 城 × 中 / 英 /
//      日三语名）**派生**的查找表——每个名都是键，都指向同一座城的坐标。随插件
//      内置、离线可用、零网络依赖（联网 geocoding 本期不做：网络依赖 + key，与
//      「本地优先」的产品哲学相悖）。派生而不是手抄：键集与归属字典同源同构，
//      「坐标有、归属无」的漂移在构造上不可能（守卫测试 loc-roster.test.mts）；
//   ② prefs.locCoords（data.json）：任意地点都允许手填，「家」就是最典型的用例
//      （设置页「地点」卡里填）。**用户填的压过内置的**——那是明确的一次覆盖。
//   ③ 两边都没有 → 该地点不出现在星球上（2026-10-01 版式重裁定：星球只管实际
//      地址，右侧列表已撤），在球下分组流里仍可正常浏览、编辑。
//
// 键的宽容度：精确键之外还有两级**兜底**（都在 rosterCityOf 里，越往后越宽）——
// ASCII 大小写 + 变音符折叠（「tokyo」「krakow」命中正形），以及再剥一层分隔符的
// **紧写折叠**（「NewYork」「SanFrancisco」「Xian」命中正形，2026-10-06 补：名册
// 里约 60 座城的英文名是分词的，连写是最常见的手打形态）。
// 这两级只放宽「查数据」：地点**身份**是另一件东西——BUG-110a 起由 locationsOf 的
// canonicalLocName 合并（纽约 / New York 是同一处），本文件的查表宽容只负责
// 「哪个写法都查得到同一份坐标」。
//
// 坐标数据纯本地存储，不上传、不出 vault（locations 本身也只在 frontmatter）。
//
// 精度口径：两位小数 ≈ 1km 级，星球锚点足够；不搞秒级——手填的输入成本会涨。
// 这些是纯函数与纯数据：不碰文件、不 import obsidian（momo/ 层红线）。

/** 经纬度对：[纬度, 经度]，单位度。纬度 −90~90（北正），经度 −180~180（东正） */
export type LatLon = readonly [number, number]

/**
 * 内置坐标字典：由名册派生（键 = 每座城的中 / 英 / 日名，值 = 同一座城的坐标）。
 * 既有 299 城的 zh 键与坐标逐字保留（老用户盘上的地名一个不失效）。
 * 无原型对象：查询键是外部输入（frontmatter），同 BUILTIN_LOC_REGIONS 的 BUG-118a 注释。
 */
export const BUILTIN_LOC_COORDS: Readonly<Record<string, LatLon>> = Object.assign(
  Object.create(null) as Record<string, LatLon>,
  Object.fromEntries(
    LOC_ROSTER.flatMap((city) => [
      [city.zh, city.coord],
      [city.en, city.coord],
      [city.ja, city.coord],
    ]),
  ),
)

/** 一个坐标是否在合法区间内（两位小数、NaN、越界都算脏） */
export function isValidLatLon(v: unknown): v is LatLon {
  if (!Array.isArray(v) || v.length !== 2) return false
  // 解构前先把两项接到 unknown 上（BUG-224）：`Array.isArray` 只收窄到 any[]，
  // 直接解构得到 any——下面的 typeof 判定才是真正的收窄点。
  const lat: unknown = v[0]
  const lon: unknown = v[1]
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

/**
 * 地点 → 坐标：**用户手填的压过内置字典**，两边都没有 → null（无坐标兜底）。
 * 读取侧（星球 / 设置页）都用这一个入口，别各处各查一遍。
 *
 * 用户表按**身份**找键（userKeyOf）：旧盘上手填的键可能是「New York」这种写法，
 * 读侧身份合并后查询串变成「纽约」，只做精确匹配会让用户填过的坐标「失效」——
 * 按身份找回、就地读，键本身不搬家。
 * 内置这一级：精确键未中再试宽比对（rosterCityOf 的折叠 + 紧写路径）——「tokyo」
 * 「NewYork」都命中正形的坐标。
 */
export function coordOfLocation(
  name: string,
  userCoords?: Readonly<Record<string, LatLon>> | null,
): LatLon | null {
  const key = userKeyOf(userCoords, name)
  const user = key === null ? undefined : userCoords?.[key]
  if (isValidLatLon(user)) return user
  const builtin = BUILTIN_LOC_COORDS[name]
  if (isValidLatLon(builtin)) return builtin
  const city = rosterCityOf(name)
  return city !== null ? city.coord : null
}

/** 坐标的展示形态（设置页行内 + 读屏）：`39.90, 116.40`（北正东正，两位小数） */
export function formatLatLon(coord: LatLon): string {
  return `${coord[0].toFixed(2)}, ${coord[1].toFixed(2)}`
}
