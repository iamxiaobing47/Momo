import { HEATMAP_MONTHS, REVIEW_COUNT, clampHeatmapMonths, clampReviewCount } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { h } from './dom'
import type { SettingsCtx } from './context'

// ④ 回顾与活跃度：每批条数（步进器）+ 热力图滚动窗口（滑块）。
//
// 本页**刻意不配**卡片级「恢复默认」（v0.9.12）：只有两个数控行，而卡片级恢复默认
// 按规矩只配给复杂配置卡（规矩详见 context.ts 的 card 注释）；两行拖回默认也只是一步。
// 2026-10-11 两行的行说明整句删去后，默认值不再写在这页面上——钮仍不挂，照「复杂卡
// 才有」这条规矩走。
//
// v0.9.32 起尾随过一块预览（一批抽多少条画几张卡、窗口铺几个月画几列格子）已于
// 2026-10-09 按用户要求「配置页面 - 回顾与活跃度，去掉回顾与活跃度的预览」整块
// 移除：它讲的两行指的就是回顾页与侧栏热力图本身——进回顾档那一刻用户就看见这
// 一批有多厚，侧栏热力图时时刻刻铺在眼前，设置页里再画一份只是同一件事的第二份
// 表述（与 BUG-140「整块面板」同一条判据：只在重复别处的话的块，不配预览）。
// 删的是整块：reviewMock / heatLevel / 字典 mock.review / CSS .momo-set-mock-{review,
// sub,batch,batch-card,batch-more,heat,heat-month,heat-month-label,heat-cols,heat-col,
// heat-cell}。两行偏好一行未动，照旧落盘。
//
// 卡头说明也已于 2026-10-09 按用户要求「回顾与活跃度页面，去掉这个文字」整句移除：
// 它一句话点了两行控件各管什么——同一条判据。随后 2026-10-11 用户要求「去掉这段
// 文字」，两行的行说明（reviewCountDesc / heatmapMonthsDesc）也整句删去：卡头与两行
// 说明的 desc 都传空串，card() / row() 对空 desc 不建 <p>。

export function buildReviewTab(ctx: SettingsCtx): void {
  const rv = copy.settingsPage.review
  const c = ctx.card('momo-set-review', 'momo-set-review-card', rv.title, '')

  {
    const ctrl = ctx.row(
      c,
      rv.reviewCount.name,
      // 行说明 2026-10-11 按用户要求整句删去（desc 传空串 = row() 不建 .momo-set-desc）
      '',
    )
    const wrap = h('div', 'momo-set-field')
    wrap.append(
      ctx.field.buildStepper(
        REVIEW_COUNT.min,
        REVIEW_COUNT.max,
        1,
        () => ctx.service.data.prefs.reviewCount,
        (v) => ctx.setPrefLive({ reviewCount: clampReviewCount(v) }),
      ),
      h('span', 'momo-set-hint', rv.reviewCountHint({ min: REVIEW_COUNT.min, max: REVIEW_COUNT.max })),
    )
    ctrl.append(wrap)
  }

  ctx.row(
    c,
    rv.heatmapMonths.name,
    // 行说明 2026-10-11 按用户要求整句删去（同上一行）
    '',
  ).append(
    ctx.field.buildSlider(
      HEATMAP_MONTHS.min,
      HEATMAP_MONTHS.max,
      1,
      () => ctx.service.data.prefs.heatmapMonths,
      (v) => ctx.setPrefLive({ heatmapMonths: clampHeatmapMonths(v) }),
      (v) => rv.heatmapMonthsValue(v),
    ),
  )

  // 刻意不配预览（2026-10-09 用户要求「去掉回顾与活跃度的预览」）：理由见文件头。
}
