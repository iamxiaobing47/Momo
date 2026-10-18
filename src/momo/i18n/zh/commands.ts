/**
 * 命令面板 / Ribbon / 编辑器与 PDF / HTML / 阅读视图右键菜单的文案。
 *
 * 品牌词（默认「Momo」）**不能写死**：`prefs.brandName` 是用户可改的（设置 §界面外观），
 * 改了之后命令名里还写「打开 Momo」就是撒谎。所以这里全部按 `brand` 入参拼。
 */
export const commands = {
  /** 编辑器右键菜单：选中一段 Markdown → 存为 Momo */
  saveSelection: (brand: string): string => `存为${brand}`,
  /**
   * PDF 视图 / HTML Reader / 阅读视图选区右键里的「复制」，与「存为<brand>」并列——
   * 那一格的原生菜单被我们接管了，复制要自己补回来。
   */
  copySelection: '复制',
  /** Ribbon 图标 tooltip */
  ribbon: (brand: string): string => brand,
  openPanel: (brand: string): string => `打开${brand}`,
  newEntry: (brand: string): string => `新建${brand}`,
  /** 补记：命令面板选一天，把一条 Momo 补到过去某天 */
  backfill: '补记到过去…',
  /** 预写：命令面板选一天，把一条 Momo 写到未来某天（与补记对称） */
  future: '写到未来…',
  /** 标签页右键菜单（短一点，不带「面板」前缀） */
  moveToLeft: '移到左侧边栏',
  moveToRight: '移到右侧边栏',
}
