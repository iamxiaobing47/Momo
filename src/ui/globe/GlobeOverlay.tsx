import { memo } from 'react'
import { GLOBE_VIEW, labelPlacement, projectLatLon, type GlobePose } from './globeMath'
import { HIT_RADIUS, type GlobeAnchorItem } from './globeGesture'
import { displayLocName, locKeyActive } from '../../momo/locations'

// 球面上的 SVG 叠层（F7a）：地点锚点。
//
// 这一层是**纯展示**：给定「锚点 + 位姿 + 选中项 + 球在不在动」就画出该有的样子，
// 不看 store、不接手势、不碰 canvas。位置全走 projectLatLon（唯一真源，见 globeMath
// 文件头），与 canvas 里那颗球共用同一个半径——两者一旦不一致，锚点就会离开它标的那块地。
//
// 设计稿 F7a 原本还有 12 颗装饰星，2026-10-01 按用户意见整批删了（「进入星球视图，
// 应该默认只有地球」）：canvas 的球是满框的（r=150 占满 300 见方的 viewBox），而星位
// 是按设计稿里 r=130 的小球排的，大半落在球面**之内**——画出来像地球上凭空多出的
// 杂点，与地点光点混淆。要留就得连星位一起按满框球重排，不值当：夜空底色本身够了。

function GlobeOverlayInner({
  anchors,
  pose,
  selected,
  moving,
}: {
  anchors: readonly GlobeAnchorItem[]
  pose: GlobePose
  /** 地点筛选集合（多选，2026-10-01）：锚点被其中**任一个**节点覆盖即点亮 */
  selected: readonly string[]
  /** 球在动（拖拽 / 转向）：地名标签不渲染，见下面那处注释 */
  moving: boolean
}): React.JSX.Element {
  const points = anchors.map((a) => ({
    a,
    p: projectLatLon(a.lat, a.lon, pose.lat, pose.lng),
    // 点亮 = 筛选集合里**任一个**节点覆盖锚点的完整路径（2026-10-01 从右侧行搬上球：
    // 行删了之后球是唯一的点亮面）。树上选「亚洲」这类粗节点时键与城市锚点
    // 不等值，等值比较一枚都点不亮——与旧 momo-globe-row.is-on 同一套判定，
    // 多选化之后换成 locKeyActive（与分组流组头点亮同一把尺子）。
    on: locKeyActive(selected, a.full),
  }))
  return (
    <svg
      className="momo-globe-overlay"
      viewBox={`0 0 ${GLOBE_VIEW} ${GLOBE_VIEW}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* 装饰星与「大气两圈」都已删（理由见文件头 / 下面那条注释） */}
      {/* 设计稿 F7a 这里还有「大气两圈」（glow r=134 / rim 131.5）。删掉的理由有两条：
          ① 小饼明确不要那圈蓝环；② 它本来就画错了——那两颗圆是按设计稿里 r=130 的
          球画的，而 canvas 的球其实满框（r=150），于是环落在球面内侧，看着像球里
          套了个蓝圈。要留就必须连球一起收到 130（球会小一圈），不留最干净。 */}
      {points.map(({ a, p, on }) => {
        if (!p.visible) return null
        const label = displayLocName(a.location)
        // 落点走 labelPlacement（BUG-108b）：靠球缘的锚点，旧口径 `p.x ± 12`
        // 会把文字写到 viewBox 外被裁——这里做宽度上界 + 夹取（估宽宁可多估，
        // 见 globeMath「地名标签几何」）。不贴边时与旧口径逐值一致。
        const g = labelPlacement(p.x, p.y, label)
        return (
          <g key={a.location} className={on ? 'is-on' : undefined}>
            {on ? (
              <>
                <circle className="momo-globe-halo" cx={p.x} cy={p.y} r={15.5} />
                <circle className="momo-globe-halo2" cx={p.x} cy={p.y} r={9} />
                <circle className="momo-globe-ring" cx={p.x} cy={p.y} r={11} />
                <circle className="momo-globe-mid" cx={p.x} cy={p.y} r={4.6} />
                <circle className="momo-globe-dot" cx={p.x} cy={p.y} r={3.4} />
              </>
            ) : (
              <>
                <circle className="momo-globe-halo" cx={p.x} cy={p.y} r={8} />
                <circle className="momo-globe-mid" cx={p.x} cy={p.y} r={4.6} />
                <circle className="momo-globe-dot" cx={p.x} cy={p.y} r={2.6} />
              </>
            )}
            {/* 地名标签（v0.9.26 按小饼要求改的）：球上不再常驻地名，
                **悬停到这颗点才浮出来**（.momo-globe-label 默认 opacity 0，
                `.momo-globe-overlay g:hover …` 亮起来）。
                **写 `displayLocName(a.location)` 不写 `a.label`**（2026-10-06
                「界面语言选英语后地点还是中文」）：光点附近只放得下一个地名，完整
                路径会撞到别的点（globeGesture 的 GlobeAnchorItem.label 写明了这条），
                所以三级本地化只取**地名这一级**——`a.location` 是盘上的原始字符串，
                直接上屏等于把本地化绕过去，过一遍 displayLocName 才是该语言的那份。
                完整路径住在 `a.label`（侧栏行的口径），球上不用它。
               而「转动时没有字」这件事由**不渲染**保证，不靠样式：拖拽时指针常常正压在
                某颗点上，而 CSS 的 :hover 在指针捕获期间不一定会被清掉——样式压不住的事别交给样式。
                顺带拖拽每帧重挂的 DOM 也少一批文字节点。 */}
            {!moving ? (
              <text className="momo-globe-label" x={g.x} y={g.y} textAnchor={g.anchor}>
                {label}
              </text>
            ) : null}
            {/* 悬停圈：不可见（fill:none），只负责给「悬停」一个明确范围。半径就用
                轻点选中的 HIT_RADIUS —— 于是「看得到名字」与「点得中」是同一个圈；
                否则光点本身只有 2.6~8（视盒单位），鼠标很难精确压上去。
                放最后 = 压在最上层，整个圈里的事件都落在它身上（照样冒泡到舞台）。 */}
            <circle className="momo-globe-hit" cx={p.x} cy={p.y} r={HIT_RADIUS} />
          </g>
        )
      })}
    </svg>
  )
}

/** BUG-69d：位姿由 GlobeStage useMemo 钉住引用后，memo 才拦得住与球无关的父级
 * 重渲；拖拽 / 转向期 pose 每帧换引用，照旧逐帧重渲（内容所需）。 */
export const GlobeOverlay = memo(GlobeOverlayInner)
