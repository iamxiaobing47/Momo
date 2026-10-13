// 星球资产的**意图期预装载**（P0，2026-10-09）：治「首次进星球档黑卡一拍」。
//
// 病灶在 GlobeStage：挂载时才并行装载六面 cube 贴图与 globe3d.js（three.js），
// **第一帧要等两边都就绪**——未决期间 paint 是空操作（2d 与 webgl2 上下文
// 互斥，回退判定只有一次机会，见 GlobeStage 的 backend3dRef 注释），用户看到
// 的是「碎星 + 光点的黑卡」。贴图解码 ~40ms、脚本几百 ms（慢盘 / 首装更久），
// 是一拍可感的延迟；而 BUG-122 记着最坏能到 15s 死线。
//
// 这里把装载提前到**意图期**（悬停 / 键盘聚焦顶栏视图分段的星球图标，早于
// 点击）：两个装载器都有模块级缓存（loadGlobeCube 按 URL 组合、loadGlobe3D
// 只存成功），重复调用返回同一个 Promise——预热幂等，GlobeStage 挂载时直接
// 命中缓存，首帧不再等资产。
//
// 三条纪律：
// ① **只在意图期调**（DensitySegmented → App 的 onDensityIntent），不挂面板
//    打开时的空闲预拉：cube 六面解码后是 6×1024²×4 ≈ 25MB 常驻，用户没想
//    看星球就不该付这笔（贴图与三维库本来就是「只在切到星球档才用得上」
//    才拆成独立产物的，见 AGENTS.md §5 的部署清单）；
// ② **按当前档位取 URL**（prefs.globeEarth）：换档是另一套贴图，预热错档
//    白解一遍；
// ③ 失败只 catch 不吞错：loadGlobeCube 失败会清掉自己那格缓存，真正挂载时
//    照常重试（贴图文件的「没部署到位」靠重试救得回），这里 catch 只为
//    不冒未接 rejection。

import { loadGlobe3D } from './globe3dLoader'
import { loadGlobeCube } from './globeTexture'
import { useUi } from '../store'

/** 预装载当前档位（`prefs.globeEarth`）的贴图六面与三维库。无 caps 的环境
 *  （jsdom 测试）直接跳过——那种环境本来也不画球。 */
export function warmGlobeAssets(): void {
  const s = useUi.getState()
  const caps = s.caps
  if (!caps) return
  // 六面 URL 是**异步**的（caps 读字节包 blob: URL）。预热只负责「把 promise 先跑起来」：
  // 拿不满六面 / 读盘失败都只 catch，真正挂载时 loadGlobeCube 会重试（它只缓存成功）。
  const urlsP = caps.globeCubeUrls?.(s.globeEarth)
  if (urlsP) {
    void urlsP
      .then((urls) => {
        if (urls.length === 6) return loadGlobeCube(urls)
      })
      .catch(() => {})
  }
  void loadGlobe3D(caps.globe3dUrl?.() ?? '')
}
