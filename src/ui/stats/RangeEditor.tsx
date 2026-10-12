import { useState } from 'react'
import { copy } from '../../momo/i18n'
import { dayWindowStart } from '../../momo/dates'
import { useUi } from '../store'

/**
 * 自定义范围编辑条（v0.5.4）：顶栏「自定义」翻开 / 当前就是 custom 时常驻。
 * 两个原生 date input（Electron 里就是系统日历，零依赖）+ 快捷档；
 * **点了「应用」才落盘**——中间态只是本地 state，不打扰 store 与 data.json。
 */
export function RangeEditor() {
  // 快捷档（L7）：标成 tuple，解构出来就不再是 `string | number` 联合——旧写法在 JSX 里
  // 到处 `label as string` / `days as number`，加第四档时会把三个 cast 一起复制过去。
  // **必须留在组件里**：模块级读 copy 会被 BUG-101 的守卫拦下（快照恒冻 zh，setLocale 追不回来）。
  const presets: ReadonlyArray<readonly [string, number]> = [
    [copy.statsPage.range.preset(7), 7],
    [copy.statsPage.range.preset(30), 30],
    [copy.statsPage.range.preset(90), 90],
  ]
  const statsCustomFrom = useUi((s) => s.statsCustomFrom)
  const statsCustomTo = useUi((s) => s.statsCustomTo)
  const setStatsCustom = useUi((s) => s.setStatsCustom)
  const setStatsRange = useUi((s) => s.setStatsRange)
  const [from, setFrom] = useState(statsCustomFrom ?? '')
  const [to, setTo] = useState(statsCustomTo ?? '')
  const valid = from !== '' && to !== '' && from <= to

  const applyPreset = (days: number) => {
    const end = new Date()
    // T5：窗口起点走 dayWindowStart（它回的就是本地日期的 YYYY-MM-DD 串，
    // 不再需要本地 iso 助手）；DST 下的「日历日回退」口径只在那一处。
    setFrom(dayWindowStart(end, days - 1))
    setTo(dayWindowStart(end, 0))
  }

  return (
    <div className="momo-range-editor">
      <input
        type="date"
        className="momo-range-date momo-input"
        aria-label={copy.statsPage.range.from}
        value={from}
        max={to || undefined}
        onChange={(e) => setFrom(e.target.value)}
      />
      <span className="momo-range-sep">{copy.statsPage.range.sep}</span>
      <input
        type="date"
        className="momo-range-date momo-input"
        aria-label={copy.statsPage.range.to}
        value={to}
        min={from || undefined}
        onChange={(e) => setTo(e.target.value)}
      />
      <div className="momo-range-presets">
        {presets.map(([label, days]) => (
          <button key={label} className="momo-range-preset" onClick={() => applyPreset(days)}>
            {label}
          </button>
        ))}
      </div>
      <button
        className="momo-primary-btn momo-primary-btn-sm momo-primary-btn-solid"
        disabled={!valid}
        onClick={() => valid && setStatsCustom(from, to)}
      >
        {copy.statsPage.range.apply}
      </button>
      <button
        className="momo-range-close"
        aria-label={copy.common.close}
        onClick={() => {
          // BUG-78a：custom 档下编辑条常驻（statsRange === 'custom'），此时
          // statsRangeEditing 已是 false——旧实现 ✕ 只把已是 false 的旗标再置
          // 一次，点了纹丝不动，像一颗坏按钮。✕ 的语义 = 退出自定义范围回「全部」。
          setStatsRange('all')
        }}
      >
        ✕
      </button>
    </div>
  )
}
