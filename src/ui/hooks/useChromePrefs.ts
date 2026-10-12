// App 的**外壳订阅** hooks（R5 骨架拆分）：把根节点 / 布局壳需要的 store 订阅
// 从 App.tsx 收进这里，App 的行数降下来、订阅总数不变（仍是 15 个 useUi 调用点：
// App 12 + 本文件 2 + useListDerivations 的 filters 1）。
//
// 分组口径与原 App.tsx 逐字一致（P06 的 useShallow 浅对象分组）：没变的字段不会
// 触发重渲——拆文件只改代码位置，不改订阅粒度。
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../store'
import type { ColorScheme, UiScale, WarmRatio } from '../../momo/types'

/** 「设完就不变」的外观偏好：根节点主题类 / gap 类 / 内联字号圆角 var / 自定义 CSS。
 *  与原 App.tsx 的 useShallow 组同形状（v0.9.1 起 UI 微调，v0.9.12 起字号 / 圆角
 *  是连续滑杆；warmRatio v0.9.14 正文预热比例，只被 hover 预热读一次）。 */
export interface AppearancePrefs {
  colorScheme: ColorScheme
  customCss: string
  cardFontSize: number
  cardTitleSize: number
  cardRadius: number
  cardGap: UiScale
  uiFont: string
  cardFont: string
  warmRatio: WarmRatio
}

/** 侧栏三件套：根节点类（显隐 / 停靠侧）、内联 var（宽度）与 ResizeHandle 共用一份 */
export interface SidebarChrome {
  sidebar: boolean
  sidebarWidth: number
  sidebarSide: 'left' | 'right'
}

export function useAppearancePrefs(): AppearancePrefs {
  return useUi(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      customCss: s.customCss,
      cardFontSize: s.cardFontSize,
      cardTitleSize: s.cardTitleSize,
      cardRadius: s.cardRadius,
      cardGap: s.cardGap,
      uiFont: s.uiFont,
      cardFont: s.cardFont,
      warmRatio: s.warmRatio,
    })),
  )
}

export function useSidebarChrome(): SidebarChrome {
  return useUi(
    useShallow((s) => ({ sidebar: s.sidebar, sidebarWidth: s.sidebarWidth, sidebarSide: s.sidebarSide })),
  )
}
