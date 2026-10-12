/**
 * 二次确认弹窗的文案（views/caps.ts 的 `openConfirmModal` 与它的调用方）。
 *
 * 弹窗标题/正文里带品牌词的地方用 `brand` 入参，别写死「Momo」——
 * `prefs.brandName` 用户可改（设置 §界面外观）。
 *
 * （导出相关的两条确认文案随导出整块移除：导出笔记汇总 / 导出统计。）
 */
export const dialog = {
  /** 危险确认底栏左侧的提示 */
  irreversible: '不可撤销',
  /** 补记弹窗（views/caps 的 pickBackfillDay）：说明 / 主动作。
   *  2026-10-10 起没有标题（BUG-160：所有 dialog 左上角都不放标题）——「补记到过去」
   *  与主动作按钮「补记」是同一句话，方向由入口与 min/max 夹子说清。 */
  backfill: {
    hint: (brand: string): string => `新建一条空白 ${brand} 归到那天，并在编辑器里打开。`,
    confirm: '补记',
  },
  /** 预写弹窗（views/caps 的 pickFutureDay）：与补记对称，只把日期夹子翻过来 */
  future: {
    hint: (brand: string): string => `新建一条空白 ${brand} 归到那天，并在编辑器里打开。`,
    confirm: '写到未来',
  },
  /**
   * 改笔记路径前的迁移询问（设置页 → 文件路径；实现见
   * views/settings/notesMigration.ts）：root / 卡片存放路径每一次改动，只要还有笔记
   * 会留在老位置，就先弹这个框问清楚——旧行为是静默改路径，笔记从面板里消失，
   * 用户还以为丢了。
   *
   * 三条路对应三种答复，措辞都按「用户已经打了新路径」这个前提写：
   * - `migrate`（主动作）：把笔记与回收站登记一起搬到新目录，再落盘新路径；
   * - `keep`：只落盘新路径，文件原地不动（用户打算自己搬）；
   * - Esc / 遮罩 / `cancel`：当什么都没发生，输入框还回旧值。
   *
   * 2026-10-10 起没有标题（BUG-160）：问句由提示句与三颗按钮自己说清。
   */
  notesMigrate: {
    hint: (d: { from: string; to: string; count: number }): string =>
      `卡片存放路径要从「${d.from}」改成「${d.to}」，还有 ${d.count} 条笔记留在老位置。搬过去的话，文件和回收站记录一起走；不搬的话这些笔记会从面板里消失，得你手动把它们移过来。`,
    migrate: '搬过去',
    keep: '只改路径',
  },
  /**
   * 文件路径的改动确认（设置页 → 文件路径；实现见 views/settings/notesMigration.ts
   * 的 askDirChange）：这一页改的是 Momo 文件落在哪，影响面大，所以任何一次改动
   * 落盘前都先弹这个框——点「确认修改」才继续往下走（该问迁移的接着再问一次），
   * 取消则输入框与预览树一起还回旧值。
   *
   * `row` 每一次调用画一行「行名：旧值 → 新值」；rows 是这次真正变了值的行，
   * 一个都没有时（绕回原值、当前正是默认值时的「恢复默认」）不弹这个框。
   *
   * 2026-10-10 起没有标题（BUG-160）：问句由提示句 + 那几行改动 + 「确认修改」说清。
   */
  dirChange: {
    hint: '确认后立即生效。已经存在的文件不会自动搬动；改卡片存放路径时若还有笔记留在老位置，下一步会再问你要不要搬过去。',
    confirm: '确认修改',
    row: (name: string, from: string, to: string): string => `${name}：${from} → ${to}`,
  },
}
