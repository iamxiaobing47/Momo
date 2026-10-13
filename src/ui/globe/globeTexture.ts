// 星球贴图的取用：解码 **cube map 六面**（F7）。
//
// 2026-10-04 起从「一张 2048×1024 等距圆柱」换成 **cube map**（与 globe.html
// 同一套：NASA Black Marble 夜灯，6 面 ×1024²，由 equirect_to_cubemap.py 转过）。
// 为什么非换不可：等距圆柱在极点有几何奇异——一整行像素要代表整个极冠，任何缝都
// 会变成放射状辐条，且没有任何软化能同时躲开「星芒」与「灰斑」；cube map 里极点
// 落在 **+Y/-Y 面正中**（采样最密处），天然无奇异。这是根上的解法。
//
// 这是 globe 这一族里**唯一碰 DOM 的一环**（Image / canvas / getImageData），
// 所以单独成文件：globeMath（投影）· globeRender（建表 / 采样）· globeSurface
// （表缓存）都能在 node 里跑，只有这里必须真浏览器。
//
// **贴图不进 main.js**（2026-10-02 性能 + 2026-10-04 换 cube）：六面合计不小，
// 内联会把插件 onload 的解析+执行抬一大截，而贴图只在切到星球档时才用得上。
// 现在是**独立部署产物**（vault-targets 的 GLOBE_TEXTURE，与内置字体同一条路），
// 运行期经 caps.globeCubeUrls() 拿六个 app:// URL 再解码。换贴图照常 `npm run build`。

/** cube 六面的像素数据（与 Globe3DTextureData 同形）：六面同边长 */
export interface GlobeCubeData {
  /** 每面边长（px）。六面必须同尺寸 */
  size: number
  /** 面顺序固定 px/nx/py/ny/pz/nz（three.js CubeTexture 构造顺序） */
  faces: Uint8ClampedArray<ArrayBuffer>[]
}

/**
 * 贴图解码的模块级单例 Promise：切进星球视图 → 拖拽 → 切走再回来都只解码一次。
 *
 * 按 URL 组合缓存（同一会话里插件目录不变，实际就是一套）：调用方传空数组时
 * 根本不建 Promise——没有 caps 的环境（jsdom 测试）直接走
 * 「解不出就不画球」那条老路，不重试。
 *
 * 只缓存**成功**：任一解码失败（onerror / 污染画布 / 分配失败）时把这一格清掉，
 * 允许下次挂载重试。这套贴图虽是随包静态资源，失败却多是「文件没部署到位 /
 * 临时权限」，用一次失败锁死整个会话只会表现为「静默无球」——重试反而救得回。
 */
let cached: { key: string; promise: Promise<GlobeCubeData> } | null = null

function decodeOne(url: string): Promise<Uint8ClampedArray<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // onload 里任何一步抛错（getImageData 污染画布的 SecurityError / 分配失败等）
      // 都必须转成 reject：事件回调里抛出的异常不会让这个 Promise settle，外面
      // `.then` 永远等不到、`.catch` 也永远不跑 = 静默无球。
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) throw new Error('globe cube: zero size')
        if (w !== h) throw new Error(`globe cube: face not square (${w}x${h})`)
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const cx = cv.getContext('2d')
        if (!cx) throw new Error('globe cube: no 2d context')
        cx.drawImage(img, 0, 0)
        resolve(cx.getImageData(0, 0, w, h).data)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('globe cube: decode failed'))
    img.src = url
  })
}

export function loadGlobeCube(urls: string[]): Promise<GlobeCubeData> {
  if (urls.length !== 6 || urls.some((u) => u === '')) {
    return Promise.reject(new Error('globe cube: need 6 urls'))
  }
  const key = urls.join('\n')
  if (cached !== null && cached.key === key) return cached.promise
  const promise = Promise.all(urls.map(decodeOne)).then((faces) => {
    // 六面同尺寸是 CubeTexture 的硬要求，运行时是 GL 异步报错难追；这里直接判
    const size = Math.sqrt(faces[0].length / 4)
    for (const f of faces) {
      if (Math.sqrt(f.length / 4) !== size) {
        throw new Error('globe cube: faces not same size')
      }
    }
    return { size, faces }
  })
  cached = { key, promise }
  // 失败不留下死 Promise：reject 后清掉这一格，下一次 loadGlobeCube 重新发起
  // 装载（只有成功才值得缓存）。内部挂一个 catch 只做清理；原 Promise 仍向调用方
  // reject，错误不会被吞掉。
  void promise.catch(() => {
    if (cached !== null && cached.promise === promise) cached = null
  })
  return promise
}
