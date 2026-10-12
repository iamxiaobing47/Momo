import type { StoreActions } from './slice'
import type { PrefsPatch, UiState } from './types'

// 偏好写入与两套「置顶」。这里所有改动都走 `setPrefs` 一条路：乐观更新 + 落盘
// （caps.savePrefs）。N08：落盘失败时 caps 层已弹 Notice，本层 catch 只为不让它
// 变成 unhandled rejection——回滚会和界面状态打架。

/** 偏好类的动作（含 init：caps 注入 + 首轮刷新）与两个置顶表 */
export type PrefsSlice = Pick<
  UiState,
  | 'init'
  | 'setPrefs'
  | 'setSortMode'
  | 'setTagSort'
  | 'setStatsRange'
  | 'setStatsCustom'
  | 'setStatsRangeEditing'
  | 'pin'
  | 'unpin'
  | 'toggleNotePin'
>

export function createPrefsSlice({ set, get }: StoreActions): PrefsSlice {
  return {
    init(caps) {
      set({ caps })
      void get().refresh()
    },

    setPrefs(prefs: PrefsPatch) {
      const next = {
        density: get().density,
        densityViews: get().densityViews,
        sidebar: get().sidebar,
        pinned: get().pinned,
        pinnedNotes: get().pinnedNotes,
        reviewSeen: get().reviewSeen,
        sortMode: get().sortMode,
        tagSort: get().tagSort,
        sidebarWidth: get().sidebarWidth,
        sidebarSide: get().sidebarSide,
        sections: get().sections,
        statsSections: get().statsSections,
        reviewCount: get().reviewCount,
        heatmapMonths: get().heatmapMonths,
        statsRange: get().statsRange,
        statsCustomFrom: get().statsCustomFrom,
        statsCustomTo: get().statsCustomTo,
        colorScheme: get().colorScheme,
        customCss: get().customCss,
        uiFont: get().uiFont,
        cardFont: get().cardFont,
        titleFromFirstLine: get().titleFromFirstLine,
        titleMaxChars: get().titleMaxChars,
        readOnly: get().readOnly,
        brandIcon: get().brandIcon,
        brandName: get().brandName,
        tagPosition: get().tagPosition,
        locPosition: get().locPosition,
        cardFontSize: get().cardFontSize,
        cardTitleSize: get().cardTitleSize,
        cardRadius: get().cardRadius,
        cardGap: get().cardGap,
        cardStamp: get().cardStamp,
        showCharCount: get().showCharCount,
        showCardCopy: get().showCardCopy,
        showCardTag: get().showCardTag,
        showCardDelete: get().showCardDelete,
        warmRatio: get().warmRatio,
        lang: get().lang,
        brandIconImage: get().brandIconImage,
        brandIconImages: get().brandIconImages,
        locCoords: get().locCoords,
        locRegions: get().locRegions,
        locLevel: get().locLevel,
        locTreeExpand: get().locTreeExpand,
        globeEarth: get().globeEarth,
        icons: get().icons,
        ...prefs,
      }
      set(next)
      // N08：caps.savePrefs 现在返回 Promise<void>。失败时 caps 层已弹 Notice，
      // 这里 catch 只为不让它变成 unhandled rejection——偏好已按乐观更新显示，
      // store 层回滚会与界面状态打架。
      void get().caps?.savePrefs({
        density: next.density,
        densityViews: next.densityViews,
        sidebar: next.sidebar,
        pinned: next.pinned,
        pinnedNotes: next.pinnedNotes,
        reviewSeen: next.reviewSeen,
        sortMode: next.sortMode,
        tagSort: next.tagSort,
        sidebarWidth: next.sidebarWidth,
        sidebarSide: next.sidebarSide,
        sections: next.sections,
        statsSections: next.statsSections,
        reviewCount: next.reviewCount,
        heatmapMonths: next.heatmapMonths,
        statsRange: next.statsRange,
        statsCustomFrom: next.statsCustomFrom,
        statsCustomTo: next.statsCustomTo,
        colorScheme: next.colorScheme,
        customCss: next.customCss,
        uiFont: next.uiFont,
        cardFont: next.cardFont,
        titleFromFirstLine: next.titleFromFirstLine,
        titleMaxChars: next.titleMaxChars,
        readOnly: next.readOnly,
        brandIcon: next.brandIcon,
        brandName: next.brandName,
        tagPosition: next.tagPosition,
        locPosition: next.locPosition,
        cardFontSize: next.cardFontSize,
        cardTitleSize: next.cardTitleSize,
        cardRadius: next.cardRadius,
        cardGap: next.cardGap,
        cardStamp: next.cardStamp,
        showCharCount: next.showCharCount,
        showCardCopy: next.showCardCopy,
        showCardTag: next.showCardTag,
        showCardDelete: next.showCardDelete,
        warmRatio: next.warmRatio,
        lang: next.lang,
        brandIconImage: next.brandIconImage,
        brandIconImages: next.brandIconImages,
        locCoords: next.locCoords,
        locRegions: next.locRegions,
        locLevel: next.locLevel,
        locTreeExpand: next.locTreeExpand,
        globeEarth: next.globeEarth,
        icons: next.icons,
      })?.catch(() => {})
    },

    setSortMode(mode) {
      get().setPrefs({ sortMode: mode })
    },

    /**
     * 侧栏标签区排序（v0.9.18）：与笔记列表的 setSortMode 一样走 setPrefs ——
     * 排序是**视图偏好**（ADR-003），落盘、关面板不丢；两组筛选才是会话内 transient。
     */
    setTagSort(key) {
      get().setPrefs({ tagSort: key })
    },

    setStatsRange(range) {
      get().setPrefs({ statsRange: range })
      set({ statsRangeEditing: false })
    },

    setStatsCustom(from, to) {
      get().setPrefs({ statsRange: 'custom', statsCustomFrom: from, statsCustomTo: to })
      set({ statsRangeEditing: false })
    },

    setStatsRangeEditing(editing) {
      set({ statsRangeEditing: editing })
    },

    unpin(key) {
      get().setPrefs({ pinned: get().pinned.filter((k) => k !== key) })
    },

    pin(key, index) {
      const rest = get().pinned.filter((k) => k !== key)
      const at =
        index === undefined || Number.isNaN(index) ? rest.length : Math.max(0, Math.min(index, rest.length))
      get().setPrefs({ pinned: [...rest.slice(0, at), key, ...rest.slice(at)] })
    },

    /**
     * 置顶 / 取消置顶一条 Momo（v0.8.3，卡片上的图钉按钮）。
     * 置顶一律**追加到末尾**——与标签置顶同一口径（先置顶的排在「置顶」组前面）。
     * 不提供组内重排：想调序就「取消再置顶」，与标签那边「取消拖拽、只留右键置顶」的
     * 用户裁决（2026-09-19）保持一致，不为一个次要功能引入拖拽这类重交互。
     */
    toggleNotePin(path) {
      const cur = get().pinnedNotes
      get().setPrefs({ pinnedNotes: cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path] })
    },
  }
}
