/** 回收站（Trash.tsx）*/
export const trash = {
  /** 2026-10-10 起没有 title（BUG-160：所有 dialog 左上角都不放标题）——「彻底删除」
   *  与主动作按钮是同一句话，问句由 message 说清 */
  purgeOne: {
    message: (name: string): string => `彻底删除「${name}」？此操作不可恢复。`,
    confirm: '彻底删除',
  },
  /** 空态：`删掉的 Momo 会先来这里待着，直到你彻底删除`（品牌词走入参）。
   *  BUG-126b：老文案「会先来这里待 30 天」承诺了不存在的自动清理——全仓没有按年龄
   *  清理的代码（purge 只由用户点击触发），软删文件会永久留在 vault 里，措辞改说实话。 */
  emptyTitle: '回收站是空的',
  emptySub: (brand: string): string => `删掉的${brand}会先来这里待着，直到你在回收站里彻底删除`,
  /** 列表顶部的保留期说明条 */
  retention: '删除的笔记会一直留在这里，直到你在回收站里彻底删除。',
  /** 卡片正文位置：这一行读盘失败（降级占位），卡片上要可见——空白卡与真空条目分不清（BUG-95） */
  readFailed: '读不到正文，稍后自动重试',
  restore: '恢复',
  purge: '彻底删除',
  /** 顶栏：全部恢复 */
  restoreAll: '全部恢复',
  /** 顶栏：全部恢复（二次确认，BUG-83）。一次把全部条目涌回各笔记，与「清空」
   *  同属全局动作——确认报条数，误触成本才对得上影响面。
   *  2026-10-10 起没有 title（BUG-160）：「全部恢复」与主动作按钮是同一句话 */
  restoreAllConfirm: {
    message: (d: { count: number; brand: string }): string =>
      `把回收站里的 ${d.count} 条${d.brand}全部恢复到原位置？`,
    confirm: '全部恢复',
  },
  /** 顶栏：清空回收站（二次确认）。「无法恢复」由弹窗底栏的「不可撤销」与红色主动作说。
   *  2026-10-10 起没有 title（BUG-160）：「清空回收站」与顶栏那颗按钮是同一句话 */
  purgeAll: {
    message: (d: { count: number; brand: string }): string =>
      `彻底删除回收站里的 ${d.count} 条${d.brand}？`,
    confirm: '清空',
    button: '清空回收站',
  },
}
