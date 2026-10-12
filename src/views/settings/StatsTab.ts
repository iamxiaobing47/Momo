import { STATS_GROUPS } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { h, iconSvg } from './dom'
import { PREFS_DEFAULTS, statsSectionMeta } from './sections'
import type { SettingsCtx } from './context'

// ⑤ 统计页：区块显隐（按 STATS_GROUPS 分组的 chip）。
// （「年度目标」的数值输入 + 类型下拉、以及「导出格式」配置都已随各自功能整块移除。）
//
// 选中的表达（v0.9.x 用户反馈「配置页里看不出哪个被选中」后的整改）：chip 的
// is-on 由三件事一起说——accent 描边 + accent 字 + **一枚前缀勾**。
// 只靠 accent-soft 底与 surface 底的明度差是不够的：石白主题里两者相差不到 3%，
// 而 chip 是 22px 高的小字药丸，一屏十五个几乎分不出开合。样式在 80-settings.css
// 的 .momo-set-chip，勾的形状走 ui/icons 的 PATHS.check（与批量加标签弹层的
// 行选中同一枚）。

export function buildStatsTab(ctx: SettingsCtx): void {
  const st = copy.settingsPage.stats
  // 区块 chip 散在 STATS_GROUPS 的各组里，一个个点回来不现实：配一颗恢复默认（全开）
  // 卡头说明 2026-10-09 按用户要求整句移除（原先「按 N 组排布 + 核心指标行」那句讲的
  // 页面结构，分组与组计数就在这张卡里，判据同上方「不配预览」），desc 传空串——
  // card() 对空 desc 不建 <p>（head-main 是 flex-column + gap，留空元素就是白留条缝）。
  const c = ctx.card('momo-set-stats', 'momo-set-stats-card', st.title, '', {
    onReset: () => {
      ctx.setPref({ statsSections: { ...PREFS_DEFAULTS.statsSections } })
      ctx.rerender()
    },
  })

  // 区块显隐：按 STATS_GROUPS 分组（types.ts 是唯一真源），组内是 chip
  for (const group of STATS_GROUPS) {
    const g = h('div', 'momo-set-block is-group')
    const head2 = h('div', 'momo-set-block-head')
    const count = h('span', 'momo-set-block-note')
    const chips = h('div', 'momo-set-chips')
    const paintCount = () => {
      const off = group.keys.filter((k) => !ctx.service.data.prefs.statsSections[k])
      const names = off
        .slice(0, 2)
        .map((k) => statsSectionMeta(k).name)
        .join(' / ')
      count.textContent =
        off.length === 0
          ? st.groupAllOn(group.keys.length)
          : st.groupSomeOff({ total: group.keys.length, names, more: off.length > 2 })
    }
    for (const key of group.keys) {
      const meta = statsSectionMeta(key)
      const chip = h('button', 'momo-set-chip')
      chip.type = 'button'
      chip.setAttribute('role', 'switch')
      // 前缀勾：CSS 默认 display:none，只跟着 is-on 现身（见 .momo-set-chip-check）
      const check = iconSvg('check', 11, 2.6)
      check.classList.add('momo-set-chip-check')
      chip.append(check, h('span', 'momo-set-chip-text', meta.name))
      // v0.9.2：不再 chip.title = meta.desc——原生 title 黑底 tooltip 与 v0.9.0
      // 「口径长句不再进 hover」同口径移除。区块名自明，desc 留在字典里备查。
      const paint = () => {
        const on = ctx.service.data.prefs.statsSections[key]
        chip.classList.toggle('is-on', on)
        chip.setAttribute('aria-checked', String(on))
      }
      chip.addEventListener('click', () => {
        ctx.setPref({
          // 同侧栏开关：现读现展开，别用 display() 时的快照（v0.7.6 修复）
          statsSections: {
            ...ctx.service.data.prefs.statsSections,
            [key]: !ctx.service.data.prefs.statsSections[key],
          },
        })
        paint()
        paintCount()
      })
      paint()
      chips.append(chip)
    }
    paintCount()
    head2.append(h('span', 'momo-set-block-title', copy.meta.statsGroup[group.key]), count)
    g.append(head2, chips)
    c.append(g)
  }

  // 统计页卡**刻意不配预览**（2026-10-09 用户要求「配置页面 - 统计页，去掉统计页的
  // 预览」）：原先那块按 STATS_GROUPS 画一排小卡（关掉的留虚线空位），可它讲的十五个
  // chip 指的就是统计页上那十五个区块本身——开着就出现、关掉就消失，真页时时刻刻在
  // 用户眼前，再画一排只是同一件事的第二份表述，而且画出来的只有一排名字，答不出
  // 「这张卡长什么样」「关掉它统计页少什么」。判据同「整块面板」与「正文预热」：
  // 只在重复别处的话的块，不配预览（连带 statsMock / 字典 mock.stats / CSS
  // .momo-set-mock-stat* 整块删除，见 mock.ts 的删除注记）。
  // 分组数那句说明也随之退役（2026-10-09 用户要求「统计页面，去掉这个文字」）：
  // 卡头只剩标题，组计数由每组的 groupAllOn / groupSomeOff 现算。
}
