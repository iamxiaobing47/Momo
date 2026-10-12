/**
 * 抛给用户看的错误文案（`throw new Error(...)` → 上层 Notice）。
 *
 * 只放**会到用户眼前**的那些；`console.error('[Momo] …失败')` 这类开发者日志留在原地
 * （日志要稳定可 grep，不该随语言变，见 scripts/lint-copy.mjs 的白名单说明）。
 */
export const errors = {
  /** 编辑中途文件被外部删除 / 改名（B 系列复查：静默 return 会让调用方误以为保存成功） */
  fileGone: (path: string): string => `文件不存在（可能已被删除或改名）：${path}`,
  /** 标签名校验（至少要有一个非数字字符） */
  invalidTag: (tag: string): string => `「${tag}」不能作标签（至少要有一个非数字字符）`,
  /** 批量软删中途失败（带已成功条数，避免「报失败其实删了」的误导） */
  deletePartial: (d: { done: number; reason: string }): string =>
    `已删除 ${d.done} 条，第 ${d.done + 1} 条失败：${d.reason}`,
  /** 批量恢复中途失败 */
  restorePartial: (d: { done: number; reason: string }): string =>
    `已恢复 ${d.done} 条，第 ${d.done + 1} 条失败：${d.reason}`,
  /** 清空回收站中途失败 */
  purgePartial: (d: { done: number; reason: string }): string =>
    `已清除 ${d.done} 条，出错：${d.reason}`,
  /** 通用写盘失败（B 系列四处注释承诺的「caps 层 Notice」兜底文案） */
  writeFailed: (detail: string): string => `写入失败：${detail}`,
  /**
   * 批量回收登记未能落盘（B08：data.json 写失败，重载后这些条目的原路径元数据
   * 会丢）。写失败只能提示、不覆盖主错误；同一会话只弹一次，避免反复骚扰。
   */
  trashRegisterSaveFailed: (detail: string): string =>
    `回收登记未能保存：${detail}。重载后这些条目的原路径可能丢失。`,
  /** 偏好/设置写盘失败（N08：data.json 写失败不能再静默丢偏好） */
  prefsSaveFailed: (detail: string): string => `偏好保存失败：${detail}`,
  /** 单条恢复失败（批量失败走上面的 restorePartial） */
  restoreFailed: (detail: string): string => `恢复失败：${detail}`,
  /** 单条彻底删除失败（批量失败走上面的 purgePartial） */
  purgeFailed: (detail: string): string => `清除失败：${detail}`,
  /**
   * 列表读盘失败：用户看到的是旧数据，只有控制台知道——常驻提示条上的那一行。
   * 写侧是一次性结果弹窗（writeFailed 那批），读侧是持续态，所以常驻不弹。
   * 后半句不能省：不说清楚「现在显示的是旧内容」，用户会把旧列表当成最新。
   */
  refreshFailed: (detail: string): string =>
    `列表刷新失败：${detail}。当前显示的是上次读到的内容。`,
  /**
   * 插件初始化失败（BUG-130a）：读/写盘失败曾让 init reject → 插件加载失败、
   * 界面零提示。现在降级加载并弹这一条，让用户知道「面板能开但数据可能不全」。
   */
  initFailed: (detail: string): string =>
    `初始化失败：${detail}。插件已降级加载，部分数据可能不完整。`,
  /**
   * 笔记迁移失败（设置页改 root / 卡片存放路径时用户选「搬过去」；
   * service.migrateNotes）。**已搬走的文件都搬回原处、目录设置没有改动**——
   * 这句话必须留在文案里：迁移中途失败最怕「文件在新目录、设置还是旧目录」
   * 的两头不着，回滚之后用户看到的是迁移前的完整现场。
   */
  notesMigrateFailed: (detail: string): string => `笔记迁移失败：${detail}。已搬动的文件都搬回了原处，目录设置没有改动。`,
}
