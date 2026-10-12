import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { Icon } from '../shared/icons'
import { EmptyState, TextButton } from '../kit'

// 主区的三个空态。都在「没有可显示的卡片」时出现，但原因不同、给的动作也不同：
// 还在读盘 / 库里真的一条都没有 / 有内容但被筛空了。

/** 首屏加载中：还没读出索引。与「空库」必须分开——用户看到的是两件不同的事。
 *  形状（Icon + 裸文字）与另外两个不同，保持原样不进 EmptyState */
export function LoadingEmpty() {
  return (
    <div className="momo-empty">
      <Icon name="clock" size={36} />
      {copy.panel.empty.loading}
    </div>
  )
}

/** 库里真的一条都没有 */
export function NoNotesEmpty() {
  // 发布框不是输入框（点了会新建并跳到原生编辑器），文案别把它说成输入框
  const hint = copy.panel.empty.hint(copy.panel.composer.placeholder)
  return (
    <EmptyState
      icon={
        <div className="momo-empty-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
          </svg>
        </div>
      }
      title={copy.panel.empty.title}
      sub={hint}
    />
  )
}

/** 有内容，但当前筛选一条都没命中：给一个「清除筛选」的出口 */
export function NoMatchEmpty({ onClearFilters }: { onClearFilters: () => void }) {
  const brandName = useUi((s) => s.brandName)
  return (
    <EmptyState
      title={copy.panel.empty.filtered(brandName)}
      action={
        <TextButton onClick={onClearFilters}>{copy.panel.empty.clearFilters}</TextButton>
      }
    />
  )
}

/**
 * 地点视图专属空态（F5a）：**全库一条地点都没有**时出现——地点从「页面」降级成
 * 「全部笔记的两档视图 + 一个筛选维度」之后，它是那两档视图（星球 / 地点分组）
 * 的空态。
 * 与「筛空了」分开——后者给「清除筛选」，这里给的是「怎么开始用」：
 * 主按钮进多选（面板内建地点），次按钮回常规卡片流（先去看看笔记），底下再附一段
 * frontmatter 手写示例（第三条路：文件里写一行，插件不拦）。
 */
export function LocationEmpty({
  onEnterSelectMode,
  onBackToAll,
}: {
  onEnterSelectMode: () => void
  onBackToAll: () => void
}) {
  const l = copy.location
  return (
    <EmptyState
      icon={
        <div className="momo-empty-icon">
          <Icon name="mappin" size={36} />
        </div>
      }
      title={l.emptyTitle}
      sub={l.emptySub}
      action={
        <div className="momo-loc-empty-acts">
          <button className="momo-loc-empty-cta" onClick={onEnterSelectMode}>
            {l.emptyCta}
          </button>
          <button className="momo-loc-empty-back" onClick={onBackToAll}>
            {l.emptyBack}
          </button>
          <div className="momo-loc-empty-fm">
            <div className="momo-loc-empty-fmhint">{l.emptyFmHint}</div>
            <div className="momo-loc-empty-fmcode">{l.emptyFmKey}</div>
            {/* 两空格缩进与 Obsidian 的 YAML 序列化逐字同形（processFrontMatter
                写出来就是这样，docs/design/architecture 的存储口径注释亦同）——用户照抄不会错 */}
            <div className="momo-loc-empty-fmcode momo-loc-empty-fmitem">{'  - '}{l.emptyFmItem}</div>
          </div>
        </div>
      }
    />
  )
}
