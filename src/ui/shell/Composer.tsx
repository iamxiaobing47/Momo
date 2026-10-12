import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { isRepeatClick } from '../shared/activationGate'

// 发布框（2026-09-11 决定：不再做自建编辑器）
//
// 点一下 = 新建一条空 Momo + 在主区新标签页用 Obsidian 原生编辑器打开；
// 写作 / 渲染（Live Preview）/ 保存 / 撤销全部由 Obsidian 负责——插件不封装第二套编辑器
// （ADR-003 / concept-momo-content），也就不存在「编辑态 ≠ 存储态」和自建渲染的问题。
// 写完关闭标签页，vault 事件把新 Momo 刷进列表；没写就关掉的空文件不进索引
// （见 service.readEntry 的空文件过滤），不会留下空卡片。
//
// v0.5.1 版面：常驻侧栏品牌下方。v0.5.2/0.5.3 按用户反馈两轮改版：伪输入框 →
// 淡古铜按钮 → **描边主按钮**（白卡底 + 古铜描边字，全系统按钮无实心，样式见 styles.css）。
// 快捷键与副文案已按用户要求移除；设计稿右侧的「标签 / 时间」两个图标钮同旧版一样不渲染
// （插件没有行内打标签与定时发布的能力，画上就是假按钮，见工单「刻意偏离」）。
// 2026-10-02：左侧的加号图标也按用户要求移除——按钮只剩一行居中文案。
//
// v0.8.5：面板窄到 620px 以下时 CSS 会强制藏掉整个侧栏（见 styles.css 620 容器块），
// 挂在侧栏里的发布框跟着消失 —— 那一档就再没有任何「新建 Momo」的入口了。
// 于是同一颗按钮在**顶栏首行**再渲染一份（variant='top'）：宽面板下它 display:none，
// 只有侧栏不可见的那一档才翻上来占满首行。两份互斥，同时只会看到一颗。
// 「写点什么」永远出现在**承载它的那一栏的最上边**——侧栏里贴品牌，顶栏里贴面板顶。
//
// BUG-136i：一颗**大按钮**（顶栏那一档还占满整行）本来就容易被连点两下，而
// `openNew` 会真的建两份空 Momo + 开两个编辑器标签页——`service.create` 的
// `reserving` 在途名表是**故意**让两次并发创建各拿一个不撞名的文件（免得第二下
// 报「File already exists」），所以那是「静默成功两份」。这里吞掉同一手势的第二下
// （判据见 shared/activationGate）。两份 DOM 是 CSS 互斥的（同一宽度只会看见一颗），
// 一次手势不会打到两个实例上。

export function Composer({ variant }: { variant?: 'top' } = {}) {
  const caps = useUi((s) => s.caps)
  const brand = useUi((s) => s.brandName)

  return (
    <div className={`momo-composer${variant === 'top' ? ' momo-composer-top' : ''}`}>
      <button
        type="button"
        className="momo-composer-entry"
        aria-label={copy.panel.composer.entry(brand)}
        onClick={(e) => {
          if (isRepeatClick(e.detail)) return
          caps?.openNew()
        }}
      >
        <span className="momo-composer-text">{copy.panel.composer.placeholder}</span>
      </button>
    </div>
  )
}
