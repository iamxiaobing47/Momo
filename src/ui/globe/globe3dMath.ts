// 星球三维档的位姿映射（three.js 渲染）：store 的位姿 (rotLat, rotLng) → 着色器 uniform。
// 纯数学、node 可测；与锚点叠层（globeMath.projectLatLon）的逐点对齐钉在
// scripts/globe3d-orientation.test.mts。
//
// 口径（与 globeMath.ts 文件头同一套符号）：λ = lon + rotLng（东正）、rotLat = φ₀
// 观测倾角。锚点叠层按 projectLatLon 摆位，球必须把同一个贴图点画到同一屏幕位置。
//
// 推导（每一步都可从真源复算）：
//   ① cube 内在映射（烘焙脚本 outputs/polefix_v2/equirect_to_cubemap.py 实证：
//      lon = arctan2(dx, dz)、lat = arcsin(dy)）——地理点 (φ, L) 的贴图方向是
//        w(L, φ) = (cosφ·sinL, sinφ, cosφ·cosL)   （lon 0 → +Z、90°E → +X、北极 → +Y）
//   ② 叠层（锚点）期望的世界变换：projectLatLon 三条式子因式分解即
//        n(G) = Rx(φ₀)·Ry(r)·w(G)   ，r = rotLng
//      （正交相机沿 −Z 看单位球：屏幕 x = n.x、屏幕 y = n.y、n.z > 0 = 正面）
//   ③ 渲染侧要的是**逆**：屏幕方向 n 该采哪个贴图方向？答案是 M⁻¹·n——
//        d(n) = Ry(−r)·Rx(−φ₀)·n
//      这就是「位姿进 uniform 的两步旋转」：**先绕 X 倾角、后绕 Y 自转，两个角都取负**。
//      软渲染 renderFrame 与 GPU shader 走同一条式子（二者必须逐像素一致）。
//
// ⚠️ 两个已删掉的旧约定，谁「看着像」搬回来谁重犯 2026-10-05 的 bug：
//   ① yawRad 里的 −90° 偏移：那是 SphereGeometry 等距圆柱 uv 参数化
//      （u=0 ↔ 经度 −180°，顶点 = (cosL·cosφ, sinφ, −sinL·cosφ)）的残骸。
//      cube map 按**方向**采样，与顶点参数化无关，偏移必须为 0。
//   ② 正号与「先 Ry 后 Rx」的顺序：那套属于「转几何」的嵌套 Object3D 设计
//      （已删）——球是球对称的，转几何与转采样方向恒等抵消（见 globe3dStage
//      VERT 注释）。现在位姿只进采样方向，而采样是叠层世界变换的**逆**，
//      所以两个角都取负、顺序是先 Rx 后 Ry。

/** 采样自转角（弧度）= −rotLng：叠层世界变换 M = Rx(φ₀)·Ry(r) 的逆（文件头 ③） */
export function yawRad(lng: number): number {
  return (-lng * Math.PI) / 180
}

/** 采样倾角（弧度）= −rotLat：同上，逆变换（rad = −deg·π/180） */
export function tiltRad(lat: number): number {
  return (-lat * Math.PI) / 180
}
