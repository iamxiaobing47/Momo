import { useEffect, useMemo, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { coordOfLocation } from '../../momo/locations'
import { locGroupOf, type LocCount } from '../../momo/locations'
import { GlobeStage } from './GlobeStage'
import { globeStars } from './globeStars'
import { TextButton } from '../kit'
import type { GlobePackFailure } from '../../momo/globe/pack'
import type { GlobeAnchorItem } from './globeGesture'

// 星球视图（F7；2026-10-01 晚起是「全部笔记」视图分段里的一档，不再是地点模式的
// 第三种呈现——地点页面撤除，这颗球仍然是「专为地点准备的视图」）。
//
// 版式（2026-10-01 两次裁定叠加）：
// ① 右侧地点列表**整块撤掉**，球独占上方一张卡；**星球 = 筛选条件**——点球上光点
//    （GlobeStage 接线 toggleLocation）加 / 减一个地点筛选，下方就是当前筛选的结果；
// ② 球下方从「地点分组流」改成**常规卡片流**（按密度渲染、按日期分组，吃当前全部
//    筛选）——分组流另有自己的一档视图，球这一档只管「在球上挑地方，在下方读笔记」。
//    那份列表**不由本组件渲染**：CardFlow 返回 fragment，球与列表是同级两块，
//    所以列宽 / 居中那些 `.momo-content > …` 的规则照旧生效（缝由 CSS 的
//    `.momo-globe + …` 补）。无坐标的地点不上球（星球只管实际地址），下方列表里照常有它。
//
// 锚点源 = **全库地点计数表**（`locationTallies(entries)`，useListDerivations）：
// 球是筛选输入面不是筛选结果——筛了北京之后球上别的地点还得在原位，否则
// 「筛了北京就再也没法点上海」。这条裁决从地点模式时代延续下来，只是锚点源从
// 「未过地点筛选的那份分组」推到了全库（见 useListDerivations 的注释）。
//
// 切走再回来：位姿与选中项都在（store 的 locGlobe* / filterLocations 是会话态，不清空）。
//
// 宽窄双档：≥560px 球居中；<560px 球缩到列宽（95-responsive.css 的 @container
// globe）。两侧同一个数——CSS 侧由 .momo-globe-card 当命名容器（globe）查询
// .momo-globe-body，JS 侧 ResizeObserver 量的正是 .momo-globe-body 的宽度（= 卡片
// 内容宽，与容器查询同源），唯一管不了的是「滚轮要不要 preventDefault」——
// 那件事只有 JS 知道。

/**
 * 窄档的宽度上界（px）：**逐字镜像** 95-responsive.css 的 `@container globe (max-width: 559px)`，
 * 改一处改两处（守卫 globe-css.test.mts 比对两边的数）。
 *
 * 判据也逐字镜像：窄 ⇔ 宽度 ≤ 559，量的是**分数**宽（getBoundingClientRect）。BUG-122d：旧实现
 * `clientWidth >= 560`——clientWidth 取整，而容器查询按分数比；内容宽落在 559~560 之间（系统缩放
 * 125% 下分数宽是常态）时 CSS 判宽档、JS 判窄档，宽布局里滚轮缩放被关掉。
 */
const GLOBE_NARROW_MAX_PX = 559

// 背景碎星（比稿 planet-view-mock v5 定稿）：确定性星表（globeStars.ts 固定种子），
// 模块级算一次终身复用。渲染在卡层、球**后面**——canvas 的球盘不透明，星只露在球外；
// 与 2026-10-01 上午删掉的那批「球面装饰星」的区别见 globeStars.ts 文件头，也见
// GlobeOverlay 文件头（那一层里仍然一颗星都没有，别加回来）。
const GLOBE_STARS = globeStars()

export function GlobeView({
  anchors: tallies,
  active,
}: {
  /** 全库地点计数表：星球锚点源（球是挑选面，见文件头） */
  anchors: readonly LocCount[]
  /** 当前是否在星球视图里；false = 常驻但隐藏（见 AppLayout） */
  active: boolean
}): React.JSX.Element {
  const locCoords = useUi((s) => s.locCoords)
  const locLevel = useUi((s) => s.locLevel)
  const locRegions = useUi((s) => s.locRegions)
  // 界面语言（2026-10-06）：列进依赖，切语言后这一份也跟着换——AppShell 的
  // key={lang} 重挂兜底之外的第二道保险（见 locations.ts locGroupOf 文件头）。
  // 球上悬停浮出的地名**不走 `label`**：GlobeOverlay 渲染时对 `a.location`
  // 现调 displayLocName，只取地名这一段——光点旁边放得下一段、放不下整条路径
  // （globeGesture 的 GlobeAnchorItem.label 写明了这条分工）。
  // `label` 本身是完整路径、三级都过 displayLocName，所以它仍是语言敏感字段；
  // 2026-10-01 右侧地点行撤掉之后还没有第二个消费者，lang 这道依赖是给它保鲜的。
  const lang = useUi((s) => s.lang)

  const rootRef = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  /** 星球贴图解码失败（GlobeStage 报上来，见下方说明条） */
  const [texFailed, setTexFailed] = useState(false)
  /** 说明条里的下载入口（v1.0.0）：贴图缺失多半就是没装「星球资源包」 */
  const caps = useUi((s) => s.caps)
  /** 下载成功后 +1：重挂 GlobeStage，贴图与三维后端重新装载（见 runPackDownload） */
  const [stageKey, setStageKey] = useState(0)
  const [pack, setPack] = useState<{
    phase: 'idle' | 'busy' | 'failed'
    done: number
    total: number
    failed: number
    /** 失败口径：missing = 这一版还没发资源包（不是网络问题） */
    reason: GlobePackFailure
  }>({ phase: 'idle', done: 0, total: 0, failed: 0, reason: 'network' })
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const compute = () => setWide(el.getBoundingClientRect().width > GLOBE_NARROW_MAX_PX)
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 锚点：全库每个有坐标的地点一枚。坐标按地名查字典（用户手填压内置字典）；
  // 查不到坐标的不上球。
  //
  // v0.9.30 层级适配：星球是**地点级**视图（球上画的是城市，不是行政区），
  // 锚点逐地点拆；选中态与筛选目标走**组键**——档位选到「大洲 / 国家」时，
  // 点北京那枚点要把用户送到「中国」那一档的筛选键。
  //
  // v0.9.32 键口径：每枚锚点带一个 `full`（name 档完整路径键）——粗档下同一
  // 组的多枚锚点 key 相同，只有 full 分得出「点的是哪一枚」，转向目标与点亮
  // 判定都靠它（locKeyActive，见 GlobeStage / GlobeOverlay）。
  // BUG-69d：锚点只在源数据或层级变了才重算。解析每个地点要跑两次 locGroupOf，
  // 而 GlobeStage 是 memo 的——锚点数组引用一变，整层 SVG 就要重 diff；不 memo
  // 的话任何与球无关的 store 变化（搜索键入、entries 刷新经 CardFlow 传导）都会
  // 把这份账重算一遍。
  const anchors = useMemo<GlobeAnchorItem[]>(() => {
    // lang 只作「label 换语言要重算」的信号（atName.label 走 displayLocName，语言
    // 切换时 copy 字典换引用、label 得跟着换），body 里不直接读它 → 显式读一次，
    // 规则才认它是真依赖（BUG-221 口径）。
    void lang
    const out: GlobeAnchorItem[] = []
    for (const t of tallies) {
      const coord = coordOfLocation(t.location, locCoords)
      if (!coord) continue // 无坐标不上球（下方列表里照常读得到这篇笔记）
      const atLevel = locGroupOf(t.location, { level: locLevel, regions: locRegions })
      const atName = locGroupOf(t.location, { level: 'name', regions: locRegions })
      out.push({
        location: t.location,
        key: atLevel.key,
        full: atName.key,
        label: atName.label,
        count: t.count,
        lat: coord[0],
        lon: coord[1],
      })
    }
    return out
  }, [tallies, locCoords, locLevel, locRegions, lang])

  /**
   * 下载星球资源包（v1.0.0）：插件唯一的联网动作，**只在用户点这颗钮时**发生。
   * 成功 → 重挂 GlobeStage（`stageKey` +1）让贴图与三维后端重新装载；失败 → 把原因
   * （件数）直接写在按钮上——不跳页、不弹窗。
   */
  const runPackDownload = async (): Promise<void> => {
    // ⚠️ 调用点上**不把方法摘出来**（旧写法 `const fn = caps?.downloadGlobePack`）：
    // 那正是 @typescript-eslint/unbound-method 的形状（BUG-223 的第 78 处）。这里
    // 直接挂在 caps 上调，判定与调用都不离开宿主对象。
    if (!caps?.downloadGlobePack) return
    setPack({ phase: 'busy', done: 0, total: 0, failed: 0, reason: 'network' })
    try {
      const res = await caps.downloadGlobePack((done, total) => setPack({ phase: 'busy', done, total, failed: 0, reason: 'network' }))
      if (!res.ok) {
        setPack({ phase: 'failed', done: 0, total: 0, failed: res.failed.length, reason: res.reason })
        return
      }
      setPack({ phase: 'idle', done: 0, total: 0, failed: 0, reason: 'network' })
      setTexFailed(false)
      setStageKey((k) => k + 1)
    } catch (e) {
      console.error('[Momo] 星球资源包下载失败', e)
      setPack({ phase: 'failed', done: 0, total: 0, failed: 1, reason: 'network' })
    }
  }

  return (
    <div className="momo-globe" hidden={!active}>
      <div className="momo-globe-card">
        {/* 背景碎星：纯装饰，aria-hidden + pointer-events:none，画在 body 之前 = 球后面。
            位置用百分比、r 用 px（无 viewBox 的 SVG user unit = px，星不会随卡的
            宽高比拉成椭圆） */}
        <svg className="momo-globe-stars" aria-hidden="true" focusable="false">
          {GLOBE_STARS.map((s, i) => (
            <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} opacity={s.o} />
          ))}
        </svg>
        <div className="momo-globe-body" ref={rootRef}>
          <GlobeStage key={stageKey} anchors={anchors} zoomable={wide} active={active} onTextureFailed={setTexFailed} />
        </div>
      </div>
      {/* BUG-122b：贴图解码失败、手上一颗球都没有——黑卡 + 一圈光点与「功能坏了」分不开。
          v1.0.0 起**就地给按钮**（用户要求）：贴图缺失多半就是没装「星球资源包」（商店 /
          BRAT 只下发三件套），这一页点一下就能补上，不必再去设置里找。 */}
      {texFailed && (
        <div className="momo-notice">
          <span className="momo-notice-text">{copy.location.globe.textureFailed}</span>
          {caps?.downloadGlobePack !== undefined && (
            <TextButton type="button" disabled={pack.phase === 'busy'} onClick={() => void runPackDownload()}>
              {pack.phase === 'busy'
                ? copy.location.globe.packDownloading(pack.done, pack.total)
                : pack.phase === 'failed'
                  ? pack.reason === 'missing'
                    ? copy.location.globe.packFailedMissing
                    : pack.reason === 'corrupt'
                      ? copy.location.globe.packFailedCorrupt(pack.failed)
                      : copy.location.globe.packFailed(pack.failed)
                  : copy.location.globe.packDownload}
            </TextButton>
          )}
        </div>
      )}
      {/* BUG-81a：地点在、坐标全缺（手填地名不在字典也没填经纬度）→ 黑球零光点
          零解释，像功能性故障。「一条地点都没有」的入门空态在 CardFlow 的
          LocationEmpty，这里是它的另一半。复用回收站说明条的 .momo-notice，
          只指路不给按钮（设置入口在 ui/ 够不着 Obsidian）。快照种子（北京 /
          上海是内置坐标）不触发这一支，globe 模式基线零变化。 */}
      {tallies.length > 0 && anchors.length === 0 && (
        <div className="momo-notice">
          <span className="momo-notice-text">{copy.location.globe.noCoordsHint}</span>
        </div>
      )}
      {/* 卡外交互提示（copy.location.globe.hint）2026-10-01 按用户意见整条删了——
          球下直接就是结果；拖 / 缩 / 点的手感试一次就知道，不占版面。
          球下方的常规列表由 CardFlow 作为**同级**块渲染（见文件头）。 */}
    </div>
  )
}
