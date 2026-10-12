import { useShallow } from 'zustand/react/shallow'
import { useUi } from '../../store'
import { copy } from '../../../momo/i18n'
import { Icon } from '../../shared/icons'
import { TextButton } from '../../kit'

// 回收站模式的顶栏控件：搜索 + 全部恢复 + 清空（都要二次确认，确认弹窗由 caps 层给）。
// 从 shell/Topbar.tsx 拆出（自管订阅：只订 trash 列表与品牌名）。
// 两颗按钮走 kit 的 TextButton（无图标 → 不带内联样式，与原来逐字一致）。
//
// 搜索框（v0.9.26）与 ListControls 那一份同形：回收站行按正常
// 卡片渲染后要能就地过滤（搜索词进 store.search，与列表同一套 matchEntries 口径消费（trash/Trash.tsx））。

export interface TrashControlsProps {
  searchInput: string
  searchRef: React.RefObject<HTMLInputElement | null>
  onSearchInput: (value: string) => void
}

export function TrashControls({ searchInput, searchRef, onSearchInput }: TrashControlsProps): React.JSX.Element {
  const { trash, brandName } = useUi(useShallow((s) => ({ trash: s.trash, brandName: s.brandName })))
  return (
    <>
      <div className="momo-search-wrap">
        <Icon name="search" size={15} />
        <input
          ref={searchRef}
          className="momo-search momo-input"
          type="text"
          placeholder={copy.panel.searchPlaceholder}
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
        />
      </div>
      <TextButton
        // BUG-133a：回收站为空时按钮不可点。旧实现无条件渲染且永不 disabled——
        // 处理器里 `trash.length === 0` 静默早退，按下去界面一句话不说。
        disabled={trash.length === 0}
        onClick={async () => {
          // N08：restoreAll 失败已在 caps 层提示；catch 只为不当 unhandled rejection
          // BUG-83：一次性把全部条目涌回各笔记，与「清空回收站」同属全局动作——
          // 误触成本必须对上影响面，所以同走 confirmDialog（报条数）。
          const caps = useUi.getState().caps
          if (!caps || trash.length === 0) return
          const ok = await caps.confirmDialog({
            message: copy.trash.restoreAllConfirm.message({ count: trash.length, brand: brandName }),
            confirmText: copy.trash.restoreAllConfirm.confirm,
          })
          if (!ok) return
          void caps.restoreAll()?.catch(() => {})
        }}
      >
        {copy.trash.restoreAll}
      </TextButton>
      <TextButton
        danger
        disabled={trash.length === 0}
        onClick={async () => {
          const caps = useUi.getState().caps
          if (!caps || trash.length === 0) return
          const ok = await caps.confirmDialog({
            message: copy.trash.purgeAll.message({ count: trash.length, brand: brandName }),
            confirmText: copy.trash.purgeAll.confirm,
            danger: true,
          })
          if (ok) {
            // N08：同上——失败已在 caps 层提示
            try {
              await caps.purgeAll()
            } catch {
              // 已提示，无需再处理
            }
          }
        }}
      >
        {copy.trash.purgeAll.button}
      </TextButton>
    </>
  )
}
