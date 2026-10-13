import { useCallback, useMemo } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { locGroupOf } from '../../momo/locations'
import { Icon } from '../shared/icons'
import { useLocGroup } from './locGroup'

// 卡片上的**地点标签**（F6 §pill 的升级形态）：展示本篇 frontmatter locations
// 对应的地点（按当前层级视角折算成组名），点一颗即把它加进地点筛选。视觉稿
// location-view F1：sage-soft 底 + sage 字 + mappin 12，高 20、圆角 9。
//
// 规则（2026-10-01 起）：
// ① 位置由 prefs.locPosition 决定：'meta' = 元信息行、标签之前（默认）；'bottom'
//    = 卡片底部单独一行。**不再**固定 meta 行——用户要求把「标签位置」拆成
//    「标签位置（正常 #标签）」与「地点位置（地点标签）」两档；
// ② 当前组不显示自己的 pill（渲染在 LocationFlow 里时才有「当前组」，
//    列表模式没有 → 显示全部）；
// ③ 只要有地点就显示（单地点也显示）——2026-10-01 用户要求「卡片显示 locations」，
//    旧版「单地点不显 pill」的交叉引用早退已删；
// ④ **全部**显示，一个都不收纳——2026-10-09 用户要求去掉「超过 3 个折成 +N」：
//    那一颗只是摆着，点不开也没有浮层，用户要的是把每个地点都看见（装不下由
//    `.momo-loc-pills` 的 flex-wrap 换行，与 #标签 同一套排布）。
//
// v0.9.30 起 pill 文字与筛选目标都跟着**层级视角**走：文字 = 那个地点在当前
// 档位下的组名（`亚洲 · 中国 · 上海`；档位选到「国家」时同国的地点与本组同键，
// 自然被 ② 剔掉），点击目标 = 那个地点的组键。所以本组件要读 locLevel + locRegions
// 两个偏好——它们与分组流同源，改档位时 pill 与组头一起换。
//
// 点击 = `toggleLocation`（2026-10-01：地点从「一个模式」变成「一个筛选条件」，
// 这里不再 setMode —— pill 在任何模式都渲染，点一颗就在**当前**列表上筛出那个
// 地方；再点同一颗 = 取消那个筛选，与侧栏树行的开关语义逐字相同）。序号 +1 让
// 地点分组流的滚动 effect 一定重跑（在分组档里点 pill = 跳过去，见 store/location.ts）。

// `locations` 缺省空数组：entry.ts 记着「老文件没有这个字段 = 空数组」——盘上来的
// 条目都被 service 归一过，唯独绕过 service 直灌 store 的路径（测试夹具、将来的
//  store 种子数据）可能没有。渲染层按文档口径兜空，别为这个抛整个卡片流。
//
// 2026-10-01 用户要求「卡片上显示 tags 和 locations」+「标签位置拆成标签位置 /
// 地点位置」：本组件从「只在 ≥2 个不同组时出现的交叉引用」升级为「本篇地点标签的
// 一等展示」——只要有地点就渲染（单地点也显示），排布由 prefs.locPosition 决定
// （meta 行右侧 / 卡片底部），与正常 #标签的 tagPosition 完全独立。
export function LocationPills({
  locations = [],
  bottom,
  selectMode,
  locked,
}: {
  locations?: readonly string[]
  /** 排布在卡片底部（prefs.locPosition === 'bottom'） */
  bottom?: boolean
  /** 多选模式：pill 不筛地点，点击冒泡到卡片根节点完成勾选（与 CardTags 同口径） */
  selectMode?: boolean
  /**
   * 筛选锁着（回顾档，BUG-123b）：与 `CardTags` 同一条理由——回顾批次是进档那一刻
   * `matched()` 的快照，点一颗地点胶囊既筛不动这批、还会改掉用户回头看到的那份
   * 筛选，所以渲染成不吃指针的 span（`momo-loc-pill-locked`）。
   */
  locked?: boolean
}): React.JSX.Element | null {
  const curGroup = useLocGroup()
  const toggleLocation = useUi((s) => s.toggleLocation)
  const locLevel = useUi((s) => s.locLevel)
  const locRegions = useUi((s) => s.locRegions)
  // 界面语言（2026-10-06）：pill 文字 = locGroupOf 的 label（本地化三级），
  // memo 住它就得把语言列进依赖（locations.ts 的 locGroupOf 文件头）
  const lang = useUi((s) => s.lang)

  const jump = useCallback(
    (key: string) => {
      toggleLocation(key)
    },
    [toggleLocation],
  )

  // 每个「别处」算一次组键 / 组名（层级视角）；同一路径键只留第一次出现——
  // 两个地点在「国家」档会同组（北京 / 上海 → 同一颗 pill 说两遍没意义）。
  const all = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ key: string; label: string }> = []
    for (const loc of locations) {
      const g = locGroupOf(loc, { level: locLevel, regions: locRegions })
      if (seen.has(g.key)) continue
      seen.add(g.key)
      out.push(g)
    }
    return out
  }, [locations, locLevel, locRegions, lang])

  // ② 剔掉「本组」；全剔完（本篇的地点全在本组）同理不显。
  //    旧版还有一条「③ 只有一个组不显」的早退（交叉引用的老语义）；2026-10-01
  //    起地点是卡片上的一等标签，单地点也要显示——所以只剩「剔本组」这一条。
  const others = all.filter((g) => g.key !== curGroup)
  if (others.length === 0) return null

  return (
    <span className={`momo-loc-pills${bottom ? ' momo-loc-pills-bottom' : ''}`}>
      {others.map((g) => {
        const label = <span>{g.label}</span>
        const icon = <Icon name="mappin" size={12} />
        // 展示态（回顾档筛选锁着）：与真按钮同一个 class 串，只是不再是 button——
        // 指针与 hover 反色由 `.momo-loc-pill-locked` / `button.momo-loc-pill:hover`
        // 两条收口，文字仍是它自己的可读名（所以这里不挂 aria-label）。
        if (locked) {
          return (
            <span key={g.key} className="momo-loc-pill momo-loc-pill-locked">
              {icon}
              {label}
            </span>
          )
        }
        return (
          <button
            key={g.key}
            type="button"
            className="momo-loc-pill"
            aria-label={copy.location.pillAria(g.label)}
            // 多选态整张卡是勾选热区：pill 是操作不是勾选，别冒泡上去（与 CardTags 同口径）
            onClick={(e) => {
              if (selectMode) return
              e.stopPropagation()
              jump(g.key)
            }}
          >
            {icon}
            {label}
          </button>
        )
      })}
    </span>
  )
}
