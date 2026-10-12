import { copy } from '../../momo/i18n'

// 色阶图例（less → l0..l4 → more）：统计页日历脚注那一条。
export function HeatLegend() {
  return (
    <div className="momo-cal-legend">
      <span>{copy.heatmap.less}</span>
      <i className="momo-heat-cell momo-heat-l0" />
      <i className="momo-heat-cell momo-heat-l1" />
      <i className="momo-heat-cell momo-heat-l2" />
      <i className="momo-heat-cell momo-heat-l3" />
      <i className="momo-heat-cell momo-heat-l4" />
      <span>{copy.heatmap.more}</span>
    </div>
  )
}
