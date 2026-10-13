// 星球贴图（夜色地形 + 城市灯光）：`import x from './*.png'` 的类型声明。
// esbuild 侧的同款开关在 esbuild.config.mjs 的 `loader: { '.png': 'dataurl' }`。
//
// ⚠️ 本贴图**不再被 import**（2026-10-02）：它 base64 后有 1.95MB，内联进 main.js
// 会把 bundle 抬到 2.7MB——插件 onload 的 parse+eval 实测 ~50ms 里它占大头，而它
// 只在切到星球档时才用得上。现在它是**独立部署产物**（scripts/vault-targets.mjs
// 的 GLOBE_TEXTURE，随 npm run build 同步进 vault 插件目录），运行期由
// caps.globeCubeUrls() 读字节包成六个 `blob:` URL 装载（globeTexture.ts；2026-10-13
// 起——旧实现给的是跨源的资源 URL，画进 canvas 会被判跨源污染）。这条声明留给将来
// 真正需要内联的小图片；globe-projection.test.mts 的合成贴图不走这里。
// 谁把它改回 import，tmp/scratch/globe-probe 量得出的启动账就白修了。
//
// 来源（2026-09-30 v3 合成，2048×1024）：NASA GIBS（epsg4326/best）两张 4096×2048
// 经 WMS GetMap 一次拿全（FORMAT=image/png，绕开 WMTS 瓦片只有 image/jpeg 的坑）：
//   ① `BlueMarble_ShadedRelief_Bathymetry`（静态图层，地形晕渲 + 海底）×0.35 压暗为夜色
//   ② `VIIRS_Black_Marble`（Time=2016-01-01，实为 2012 一期）扣底噪（luma−45）×1.15
//      ×暖色 (1/0.93/0.8) 加法叠加成城市灯光
// 冰盖在两层里都压黑：南极 lat −56..−64、北极 77..83 纬度渐变，格陵兰框压 0.25。
// v4（2026-09-30，当前贴图）：在 v3 之上按像素比例压暗其他地区地形 ×0.35→×0.30
// （氛围更深），澳大利亚/新西兰豁免保持 ×0.35 不变（小饼 2026-09-30 拍板「其他地区比
// 0.35 暗一点，澳洲是 0.35，新西兰先这样」）。比例式 new = v3 × (terr×k' + lights) /
// (terr×0.35 + lights) 逐位保留 v3 的城市灯光与冰盖；澳/新区比例恒 1、字节级不变。
// 烘焙与校验脚本 tmp/scratch/bake-v4.mts（存档对比 docs/design/mockups/location-view/
// 15-globe-earth-v4.png）。
// 合成参数与管线见 `.workbuddy/skills/danpen-feature-delivery` §6.3 / §6.6。
// 尺寸从 1024×512 升到 2048×1024：画布 560px 的正半球需要 ≥1120 texel 才不丢细节，
// 1024 宽的正半球只有 512 texel（一直在丢）；2048 宽给 1024 texel，超采样。
// ⚠️ 两层数据都是 NASA 卫星客观影像/地形晕渲，**不含任何政治国界**（全球用户合规底线）。
// GIBS 的矩阵不是 2 的幂（level2 = 5×3）：最早的图按 4×2 拼漏过东经 108° 以东与
// 南纬 30° 以南——澳大利亚正好落在缺口交叉处。换贴图必须重新 `npm run build`。

declare module '*.png' {
  const src: string
  export default src
}
