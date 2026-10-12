import type { CSSProperties } from 'react'
import { useUi } from '../store'
import { iconPaths, type IconName } from '../../momo/icons'

// 图标渲染组件。形状表与类型住在 momo 层（src/momo/icons.ts：读盘净化要一份运行期
// 名单，momo 不能反向 import ui，所以表整体下沉），这里只留渲染，并按
// `prefs.icons` 覆写取形（v0.9.36 图标可配置化）。
//
// 为什么抽成组件：这组图标在 6 个分区里重复出现（品牌叶 / 面板切换 / 菜单 7 项 /
// 卡片操作 3 项 / 回收站 2 项…），逐处内联会有几十份重复 SVG。抽成一个组件后，
// 「同一语义 = 同一形状」有了唯一出处（形状定义在 momo/icons.ts 的 PATHS）。
//
// 颜色一律走 `currentColor`：设计稿是静态 HTML，stroke 写死了颜色；落到产品里
// 菜单选中态 / hover 态要跟着 CSS 变，写死就没法变。调用方用 CSS 的 color 控制。

// 形状表与名字类型从 momo 层再导出：settings/dom.ts、registry 两处 Record<IconName, …>
// 等既有 import 一处不用改（ui 层对 momo 层的再导出是允许方向）。
export { PATHS, type IconName } from '../../momo/icons'

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  className,
  style,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}) {
  // 覆写取形：有覆写且库里有那枚 → 库形状；否则 → PATHS 原形（解析在 momo/icons.ts
  // 的 iconPaths，带脏值兜底）。selector 返回**模块常量引用**——别的图标换形时
  // 这一颗的选中值引用不变，不会跟着重渲染（zustand 按 Object.is 比）。
  const paths = useUi((s) => iconPaths(name, s.icons))
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/**
 * 侧栏开关专用图标（v0.8.4 重做 / 2026-10-02 换「竖线分隔」形态）：面板框 + 一条分隔线 + 一支箭头。
 *
 * ── 为什么换形态（第三次也是最后一次动它）────────────────────────────────
 * ① 旧版是「框 + 朝左箭头 + 朝右箭头」，两态靠整组 `rotate(180deg)`，三个毛病一眼可见：
 *    一枚图标里放两支**方向相反**的箭头 = 没有指向；180° 旋转让两态近乎镜像、扫一眼分不出；
 *    描边 2.0 三笔实心感，比面板其它图标（24 格 / 1.6）重一号。v0.8.4 因此换成「框 + 一支箭头」。
 * ② 用户嫌小提了两轮（09-28、09-30），处理办法都是「撑满几何 + 加大 render / 盒子」——
 *    到 v0.9.35 已是 19×18 / render 20 / 盒子 40，**尺寸这条路走到了顶**。
 * ③ 2026-10-02 用户改口说「太丑了」—— 那就不是尺寸，是**结构**：旧版是个「大框里关着一支
 *    小箭头」的**空盒子**（闭合外框吃掉绝大部分视觉重量，箭头只占内空一小块），而且它是
 *    顶栏那一排**唯一带闭合外框**的图标（邻居 rows / grid / focus / sort 全是开放笔画），
 *    并排必然显得又笨又沉。rx 2.5 在 20px 下只剩约 2px，也接不上产品的卡片圆角语言。
 *    ⇒ 加一条**分隔线**把「侧栏区 / 内容区」画出来，「面板」第一次立住；框角提到 4.5。
 *
 * ── ★ 位置与方向分离（本轮最关键的一条）──────────────────────────────────
 * 四个状态其实是**两个互相独立的自由度**，旧版把它们捆在一次 `scaleX(-1)` 里，于是
 * 「谁该动」纠缠不清（还得写一条「两者同时成立则抵消」的特例规则）：
 *
 *   | 自由度 | 归谁管 | 挂哪个类 |
 *   |---|---|---|
 *   | **分隔线在哪半边** | `.momo-panel-toggle-glyph`（分隔线 + 箭头整层） | `.momo-side-right` |
 *   | **箭头朝哪边** | `.momo-panel-toggle-arrow`（只绕自身中心掉头） | `.momo-sidebar-collapsed` |
 *
 * 两条规则作用在**不同元素**上 ⇒ 天然独立，不再需要任何「抵消」特例。
 * 四态逐一核对（箭头方向 = 点下去侧栏会去哪）：
 *   左·展开 → 分隔线在左、箭头朝左（朝外 = 收起）｜左·折叠 → 分隔线在左、箭头朝右（朝内 = 展开）
 *   右·展开 → 分隔线在右、箭头朝右（朝外 = 收起）｜右·折叠 → 分隔线在右、箭头朝左（朝内 = 展开）
 *
 * ⚠️ **换边那一层的镜像轴必须取「框心」**：`.momo-panel-toggle-glyph` 的变换用
 * `transform-box: view-box` + `transform-origin: 50% 50%`（= 12,12）。**不能**用 `fill-box` ——
 * 分隔线偏左，这一层自己的 bbox 中心落在约 14.6 处，拿它当轴会把分隔线镜像到 19.25（跑出框外）。
 *
 * ── 几何 ────────────────────────────────────────────────────────────────
 * 框 19×18 / rx **4.5**（外接与 `sort-desc` / `sort-asc` 逐字同尺寸这条不变；rx 由 2.5 提到 4.5）。
 * 分隔线 x=10（左 1/3 处：侧栏窄、内容区宽），y 3.8 → 20.2 两端各留 0.8 不越出内壁。
 * **箭头尺寸一个字没动**（x 7 / y 11，与 ④ 那轮加宽后的值相同），只是整体从「框正中」挪到
 * 「内容区正中」—— 即 x 12.25→19.25、中心 15.75，距分隔线与右内壁各留 0.65，两边等宽。
 * 渲染 `size` 20 / 盒子 40×40 维持 2026-09-30 的决定不变。
 *
 * ⚠️ **不接 `prefs.icons` 覆写**（v0.9.36 边界决定）：它是有状态几何（分隔线可换边、
 * 箭头可掉头，都是 CSS 变换不是形状），库里没有对应物；覆写它 = 覆写不掉任何东西，
 * 却会在设置页「图标」卡里多出一个选了没反应的条目。品牌位 `leaf` 同理不进
 * （品牌有自己的 8 预设 + 上传体系，见 momo/icons.ts 的 CONFIGURABLE_ICON_NAMES 注释）。
 */
export function PanelToggleIcon({ size = 16, strokeWidth = 1.6 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="momo-panel-toggle-icon"
      aria-hidden="true"
      focusable="false"
    >
      {/* 可换边的一层：面板内部（分隔线 + 箭头）。侧栏停靠右侧时整层镜像到右半（轴 = 框心 12） */}
      <g className="momo-panel-toggle-glyph">
        {/* 分隔线：面板分成「侧栏区」（窄）与「内容区」（宽），靠左 1/3 */}
        <path d="M10 3.8v16.4" />
        {/* 箭头：基态指左（侧栏在左且展开 ⇒ 点下去收起）；两态只绕自身中心掉头 */}
        <path className="momo-panel-toggle-arrow" d="M19.25 6.5 12.25 12l7 5.5" />
      </g>
      {/* 面板框：外接 x 2.5–21.5 / y 3–21，对 x=12 与 y=12 都对称 —— 任何状态下逐像素不动。
          画在内部之后：分隔线两端的圆头（半径 0.8）正好落在上下框线里，读作「分隔线接在框上」。 */}
      <rect x="2.5" y="3" width="19" height="18" rx="4.5" />
    </svg>
  )
}
