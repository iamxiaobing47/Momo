import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { canonicalTagPath, isValidTag, tagKey } from '../../momo/tags'
import { tagNodeMapOf } from '../../momo/tags'
import { PopDialog, PopRow } from '../kit'

// 标签管理弹层（侧栏 chip 右键唤起）：改名 / 合并 / 删除 / 置顶。
// - 改名与合并是同一件事：把 #原（含整棵子树）改成 #新；新名字若已是库里的标签，就是合并。
// - 删除只删**精确匹配**的那一个标签（不连带子标签），因此虚拟父节点（本层无直属 Momo）禁用。
//
// 视觉（v0.9.0 Dialog 视觉系统，设计稿 docs/design/mockups/momo-dialog-v1.png card 03）：
// 与批量标签弹层共用一套骨架（.momo-pop*），补上旧版整个没有的头部——标题
// 「管理标签」+ 右侧当前标签（用户是靠记住「刚才右键的是什么」在操作，现在不用了）。
// 骨架（遮罩 + .momo-pop-free + 头 + 脚）与候选行收敛在 src/ui/kit/ 的
// PopDialog / PopRow，本文件只留：定位夹取、改名输入态、置顶 / 删除动作。
// 底部按钮从三颗同级减成两颗 + 一颗文字钮：破坏性且低频的「删除标签」降级成
// 左下角文字按钮，与主按钮分居底栏两端；「置顶 / 取消置顶」同样放左下角
// （状态类动作，非破坏性但低频）。按钮动词与标题一致：改名，不再叫「应用」。
//
// v0.9.26 密度一刀（用户：「dialog 都很大，空间利用率低」）：
// - 输入框下那行「输入新名字后应用；改成已有标签即合并」整行删除——占位符已经
//   说清「改名为」，合并语义由「合并到已有标签」区标题 + 改名预览句承担；
//   一行 20px 的文言换来的是弹层整体矮一截。现在输入没动时**什么都不提示**。
// - 候选行改 bare（不画 check 圈）：点候选只是把名字填进输入框，没有选中态，
//   那只恒空的圈是纯装饰（见 kit/PopRow）。
//
// 依赖约束：ui/ 不 import obsidian；写文件由 caps.renameTag / caps.deleteTag 负责，
// 汇总提示也在 caps 层（与批量加标签 / 回收同一分工）。

/** 候选最多渲染多少行 */
const MAX_ROWS = 40
/** 弹层估算尺寸：用于把落点夹回视口内（与骨架的容器宽 328 对齐）。
 *  高 = 头 36 + 输入 32 + 预览句 ~22 + 列表上限 300 + 底 44（v0.9.26 骨架）
 *  = 434。BUG-133g：旧值 380 与自己这行账目差 ~54px——落点夹取因此放行了本该
 *  上移的落点，面板矮 / 在树底部右键时弹层底栏被裁到面板外。与 LocEditPop 的
 *  POP_H 是同一把尺（它 376 = 输入 32 + 列表 300 + 底 44，没有头也没有预览句）：
 *  BUG-157 去掉弹层头部后两窗差 58px = 头 36 + 预览句 22，不再是「只差预览句」。 */
const MENU_W = 328
const MENU_H = 434

export function TagEditMenu({
  tag,
  virtual,
  x,
  y,
  onClose,
  returnFocus,
}: {
  tag: string
  /** 该节点没有直属 Momo（仅因后代存在）：删除对它没有意义 */
  virtual: boolean
  x: number
  y: number
  onClose: () => void
  /** BUG-82d：焦点归还落点（右键的那一行），见 PopDialog.returnFocus */
  returnFocus?: () => HTMLElement | null
}) {
  const entries = useUi((s) => s.entries)
  const pinned = useUi((s) => s.pinned)
  const pin = useUi((s) => s.pin)
  const unpin = useUi((s) => s.unpin)
  const brandName = useUi((s) => s.brandName)
  const [value, setValue] = useState(tag)
  const [busy, setBusy] = useState(false)

  const tree = useMemo(() => tagNodeMapOf(entries), [entries])
  const typed = canonicalTagPath(value.trim().replace(/^#+/, ''))
  const valid = isValidTag(typed)
  const unchanged = tagKey(typed) === tagKey(tag)

  // 置顶状态（ADR-004 §2.7）：复用 store 既有 action，不新增写入逻辑。
  // 2026-09-19 用户裁决：**取消拖拽**，置顶/取消置顶一律走这个右键菜单（不再上移 / 下移）。
  const key = tagKey(tag)
  const isPinned = pinned.includes(key)

  /** 输入框下方的预览句：紧跟输入框，不再压在底部（设计稿 card 03）。
   *  v0.9.26 起**只在有事发生时出声**：输入没动时不再挂一行「输入新名字后应用」
   *  的说明（占位符已经说清「改名为」）——没动就是没动，没有什么要提示的。
   *  非法标签那句与 service.renameTag 抛的错**同一句**（copy.errors.invalidTag），
   *  别在这里另写一份措辞。 */
  const preview = !valid
    ? copy.errors.invalidTag(value.trim())
    : unchanged
      ? null
      : copy.tags.previewRename(tag, typed)

  // 候选 = 库里已有的其它标签（点一下填进输入框 = 合并目标），输入按身份键子串过滤
  const rows = useMemo(() => {
    const q = typed.toLowerCase()
    return [...tree.values()]
      .filter((n) => n.key !== tagKey(tag))
      .filter((n) => !q || n.key.includes(q))
      .sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS)
  }, [tree, typed, tag])

  const apply = async () => {
    const caps = useUi.getState().caps
    if (!caps || busy || !valid || unchanged) return
    setBusy(true)
    try {
      await caps.renameTag(tag, typed)
      onClose()
    } catch {
      // caps 已发 Notice：保留弹层，用户可改后重试
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const caps = useUi.getState().caps
    if (!caps || busy || virtual) return
    // 二次确认走 caps.confirmDialog（Obsidian Modal，与浮层同一骨架）：
    // 删除是不可逆操作，confirm 用危险实底红；批量「移除标签」那种可逆操作不报红。
    const ok = await caps.confirmDialog({
      message: copy.tags.deleteMessage(tag, brandName),
      confirmText: copy.tags.deleteConfirm,
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await caps.deleteTag(tag)
      onClose()
    } catch {
      // caps 已发 Notice
    } finally {
      setBusy(false)
    }
  }

  // x / y 已由调用方换算成「相对 .momo-app」的偏移；这里再按面板尺寸夹回可视区内。
  // 用面板（.momo-app）而不是窗口尺寸——弹层是 absolute 定位，坐标基准就是它。
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const host = menuRef.current?.closest('.momo-app') as HTMLElement | null
    const w = host?.clientWidth ?? window.innerWidth
    const h = host?.clientHeight ?? window.innerHeight
    setPos({
      left: Math.max(8, Math.min(x, Math.max(8, w - MENU_W - 8))),
      top: Math.max(8, Math.min(y, Math.max(8, h - MENU_H - 8))),
    })
  }, [x, y])

  return (
    <PopDialog
      variant="free"
      meta={`#${tag}`}
      ariaLabel={copy.tags.manageAria}
      style={{ left: pos.left, top: pos.top }}
      dialogRef={menuRef}
      onKeyDown={(e) => {
        // BUG-176f：输入法组词中按 Esc 不许整颗关掉弹层（与 Enter 的 isComposing 闸同纪律）
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onClose()
        }
      }}
      onMaskClick={onClose}
      returnFocus={returnFocus}
      footerLeft={
        <div className="momo-pop-footleft">
          <button
            className={`momo-pop-textbtn ${isPinned ? 'momo-pop-textbtn-on' : ''}`}
            disabled={busy}
            onClick={() => (isPinned ? unpin(key) : pin(key))}
          >
            {isPinned ? copy.panel.unpin : copy.panel.pin}
          </button>
          <button
            className="momo-pop-textbtn momo-pop-textbtn-danger"
            disabled={busy || virtual}
            onClick={() => void remove()}
          >
            {copy.tags.deleteConfirm}
          </button>
        </div>
      }
      footerActions={
        <div className="momo-pop-acts">
          <button className="momo-pop-btn" onClick={onClose}>
            {copy.common.cancel}
          </button>
          <button
            className="momo-pop-btn momo-pop-btn-primary"
            disabled={busy || !valid || unchanged}
            onClick={() => void apply()}
          >
            {busy ? copy.tags.writing : copy.tags.rename}
          </button>
        </div>
      }
    >
      <input
        autoFocus
        className="momo-input momo-pop-input"
        type="text"
        placeholder={copy.tags.renamePlaceholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // 中文 / 日文输入法用回车确认候选词的那次 keydown（isComposing=true）
            // 不提交：受控值此刻还是拼音串，而纯 ASCII 拼音是合法标签名，不拦
            // 就会把标签改名成拼音（与 BatchTagPicker / 两个地点弹层同一道守卫）
            if (e.nativeEvent.isComposing) return
            e.preventDefault()
            void apply()
          }
        }}
      />

      {preview !== null && (
        <div className={valid ? 'momo-pop-note' : 'momo-pop-note momo-pop-note-bad'}>{preview}</div>
      )}

      {rows.length > 0 && <div className="momo-pop-seclabel">{copy.tags.mergeSection}</div>}

      <div className="momo-pop-list">
        {rows.length === 0 ? (
          <div className="momo-pop-empty">{copy.tags.noMatch}</div>
        ) : (
          rows.map((n) => (
            <PopRow
              key={n.key}
              bare
              virtual={n.isVirtual}
              label={`#${n.displayPath}`}
              stat={copy.tags.total(n.totalCount)}
              onClick={() => setValue(n.displayPath)}
            />
          ))
        )}
      </div>
    </PopDialog>
  )
}
