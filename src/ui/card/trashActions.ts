import { useUi } from '../store'
import { copy } from '../../momo/i18n'

// 回收站两颗**条目级**动作（恢复 / 彻底删除）的共享实现。
//
// 消费方是卡片操作注册表（registry/cardActions.tsx）：回收站行按正常卡片渲染后，
// 卡片操作行在 trash 模式换成这两颗（原来的行式列表 TrashRow 已退役）。 caps 与
// 二次确认都从 store 现取——与 CardTags 的 `useUi.getState().toggleTag` 同一种
// 「读时现取、不入订阅」的路数（动作引用恒定，不会带重渲）。
//
// 放在 card/ 而不是 shell/：消费方在卡片这一层。

/** entry.path → 回收站文件名（`trashPath(name)` 的逆运算：name 就是 basename） */
export function trashNameOf(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf('/') + 1)
}

/** 恢复：N08 分工——caps.restore 失败已在 caps 层提示，catch 只为不当 unhandled rejection */
export function restoreTrashItem(name: string): void {
  void useUi.getState().caps?.restore(name)?.catch(() => {})
}

/** 彻底删除：先过 caps.confirmDialog（danger 样式），用户确认才递 caps.purge */
export async function purgeTrashItem(name: string): Promise<void> {
  const caps = useUi.getState().caps
  if (!caps) return
  const ok = await caps.confirmDialog({
    message: copy.trash.purgeOne.message(name),
    confirmText: copy.trash.purgeOne.confirm,
    danger: true,
  })
  // 取消 = 不删（不可逆操作的闸）
  if (!ok) return
  // N08：caps.purge 失败已弹 Notice 并 rethrow，这里 catch 住不当 unhandled rejection
  try {
    await caps.purge(name)
  } catch {
    // 已提示，无需再处理
  }
}
