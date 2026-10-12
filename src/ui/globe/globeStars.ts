// 星球卡的背景碎星（2026-10-01，用户比稿 planet-view-mock v5 定稿后的落地）。
//
// 纯函数：固定种子的确定性星表（每次进视图是同一片天，测试能逐颗钉）。渲染在
// GlobeView 的卡层 <svg class="momo-globe-stars">（.momo-globe-body 之前），
// **不在** GlobeOverlay 的球面叠层里——2026-10-01 上午删掉的那批「装饰星」正是
// 画在叠层里、坐标按 r=130 的小球排，大半落在球面之内像杂点；这一批画在 canvas
// 的球后面，球盘不透明，星只可能露在球外，旧毛病在结构上不可能复发。
//
// 两层（对应比稿 v5 的景深）：
//   far  — 远层碎星：多而小而暗（r 0.5~0.9 / 透明度 0.18~0.45），铺底色；
//   near — 近层亮星：少而稍大稍亮（r 1.1~1.6 / 透明度 0.55~0.8），带出层次。
// 都刻意压在「素净」档：没有星云、没有彩色、没有大颗十字芒——那是比稿 v1 被否掉的
// 「银河带」的 road，别走回去。色与不透明度的分档只在这一个文件里定，CSS 只给 fill。

/** 一颗背景星：x/y 是卡内的百分比坐标（0~100），r 是像素半径，o 是不透明度 */
export interface GlobeStar {
  x: number
  y: number
  r: number
  o: number
}

/** 远层碎星颗数 */
export const GLOBE_STAR_FAR = 150

/** 近层亮星颗数 */
export const GLOBE_STAR_NEAR = 14

/** 星表生成器的固定种子：换种子 = 换一片天，测试逐颗钉坐标，别随手改 */
const GLOBE_STAR_SEED = 0x5a17b

/** mulberry32：够用、确定性、零依赖——这里只要「同一颗种子出一模一样的天」 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 生成星表：远层铺满卡面，近层叠上去。坐标留 0.5% 边距，别让星被卡沿裁半个 */
export function globeStars(): readonly GlobeStar[] {
  const rand = mulberry32(GLOBE_STAR_SEED)
  const at = (lo: number, hi: number): number => lo + rand() * (hi - lo)
  const far: GlobeStar[] = []
  for (let i = 0; i < GLOBE_STAR_FAR; i++) {
    far.push({ x: at(0.5, 99.5), y: at(0.5, 99.5), r: at(0.5, 0.9), o: at(0.18, 0.45) })
  }
  const near: GlobeStar[] = []
  for (let i = 0; i < GLOBE_STAR_NEAR; i++) {
    near.push({ x: at(0.5, 99.5), y: at(0.5, 99.5), r: at(1.1, 1.6), o: at(0.55, 0.8) })
  }
  return [...far, ...near]
}
