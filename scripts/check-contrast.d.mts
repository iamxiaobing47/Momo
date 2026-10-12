// check-contrast.mjs 的类型面。对比度守卫的测试用临时目录构造「故意不过」的方案
// 来钉死守卫本身（themesDir 默认指项目真源，测试不能拿它当试验田）。
export function checkContrast(opts?: {
  /** 静默：不往 stdout 打报告，只返回结果 */
  quiet?: boolean
  /** 读方案文件的目录，默认 styles.src/themes */
  dir?: string
}): { ok: boolean; problems: string[]; lines: string[] }
