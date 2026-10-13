// App 的**根壳**（R5 骨架拆分）：`.momo-app` 根节点 + 自定义 CSS 注入。
// 纯展示组件——不订阅 store，一切数据经 props 进来（拆分不改订阅：App 仍持有
// 那 15 个 useUi 调用点里的 12 个，appearance / chrome 两组经 hooks 传下来）。
//
// 类名与内联 var 是**三方契约**（styles.css 选择器 / UI 测试断言 / lint-deadcode
// 文本匹配），逐字不动；prop 顺序也保持原样——DOM 快照（dom-snapshot.test.mts）
// 按 outerHTML 逐字节比对，属性顺序变了照样红。
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react'
import { useEffect } from 'react'
import type { LangPref } from '../../momo/types'
import type { MainMode } from '../store'
import { CustomCss } from '../shell/CustomCss'
import { clearAnchor } from '../shared/viewAnchor'
import { applyFontVars } from '../shared/fontStyle'
import type { AppearancePrefs, SidebarChrome } from '../hooks/useChromePrefs'

export interface AppShellProps {
  /** 根节点 key：语言切换即整树重挂、全部 copy 经 Proxy 重新按新语言读取 */
  lang: LangPref
  appearance: AppearancePrefs
  chrome: SidebarChrome
  mode: MainMode
  selectMode: boolean
  rootRef: RefObject<HTMLDivElement | null>
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

/**
 * 把面板的两个滚动区送回最上（v0.9.4「回全部笔记 = 完整回家」）：
 * - `.momo-sidebar-inner`：侧栏滚动区（速览 / 热力图 / 菜单 / 标签树）；
 * - `.momo-content`：主区滚动区（列表 / 网格 / 回顾 / 统计 / 回收站共用）；
 * - `.momo-focus`：焦点密度的**内层**吸附滚动容器——那一档真正滚的是它，
 *   `.momo-content` 自己不滚，一并送上是兜底（两种密度下主区都回顶）。
 *
 * 两个刻意的选择：
 * 1. **走 appRef 作用域**而不是 `document.querySelector`：面板可以同时开多份
 *    （侧栏各一格 / 主区标签页各一颗），每份 App 只该滚自己那颗。
 * 2. **写 `scrollTop = 0`** 而不是 `scrollTo({ behavior: 'smooth' })`：瞬间归顶、
 *    不受 CSS `scroll-behavior` 影响，也不会和焦点视图正在跑的吸附动画互相抢方向盘。
 *
 * v0.9.15 起多一件事：**清视图锚点**。「回家」之后锚点还指着半年前的某一张，下次
 * 切密度就会把用户送回那儿——回家的意图是顶，不是那一张。锚点机制见 viewAnchor.ts。
 * 调用方是 useAppSession 的 goMode（品牌区按钮与侧栏「全部笔记」两个入口共用）。
 */
export function scrollAppToTop(app: HTMLDivElement | null): void {
  if (!app) return
  clearAnchor(app)
  app.querySelectorAll<HTMLElement>('.momo-sidebar-inner, .momo-content, .momo-focus').forEach((el) => {
    el.scrollTop = 0
  })
}

export function AppShell(props: AppShellProps) {
  const { lang, appearance, chrome, mode, selectMode, rootRef, onKeyDown, children } = props
  const { colorScheme, customCss, cardGap, cardFontSize, cardTitleSize, cardRadius, uiFont, cardFont } = appearance
  const { sidebar, sidebarWidth, sidebarSide } = chrome
  // 字体偏好（--momo-sans / --momo-font-card）是**命令式**写到根节点上的（BUG-217：
  // 旧实现靠往 head 塞一份全局 <style>，换成 setCssProps 后新宿主得自己领）。
  // 必须是 effect 而不是把它并进下面的 style 对象：根 div 带 key={lang}，切语言时
  // 整棵重挂、旧节点连同内联变量一起消失，而 React 只管它自己 style 里那几个键。
  // 依赖三个值：lang（重挂）、两个字体槽位（改设置当场生效）。
  useEffect(() => {
    if (rootRef.current) applyFontVars(rootRef.current)
  }, [lang, uiFont, cardFont, rootRef])
  return (
    <div
      key={lang}
      ref={rootRef}
      className={`momo-app momo-theme-${colorScheme} momo-ui-gap-${cardGap} ${
        sidebarSide === 'right' ? 'momo-side-right' : ''
      } ${sidebar ? '' : 'momo-sidebar-collapsed'} ${mode === 'stats' ? 'momo-mode-stats' : ''} ${selectMode ? 'momo-selecting' : ''}`}
      // 正文字号 / 卡片圆角 v0.9.12 起是连续 px（用户要求「最好是拖拽的」），
      // 走**内联 var** 而不是 class：class 只能表达有限的档位，连续值没有「档」可挂。
      // 与侧栏宽度同一个路子（--momo-sidebar-width 也是内联的）。
      // 标签字号不跟着存：在 styles.src 的 .momo-app 块里用 calc 从正文折算。
      // 标题字号单独一根滑杆（「短首行作为标题」的字号，v0.9.12 用户要求）。
      style={
        {
          '--momo-sidebar-width': `${sidebarWidth}px`,
          '--momo-ui-fs-body': `${cardFontSize}px`,
          '--momo-ui-fs-title': `${cardTitleSize}px`,
          '--momo-ui-r-card': `${cardRadius}px`,
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      {customCss.trim() !== '' && <CustomCss css={customCss} />}
      {children}
    </div>
  )
}
