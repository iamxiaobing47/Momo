// 项目根定位的唯一真源：从调用方位置向上找 package.json。
// 兼容两种宿主：scripts/ 下直接运行（node scripts/xxx.mjs），以及被测试打包进
// tmp/test/<name>.mjs 后运行——两种深度不同，写死层数（dirname²）会在换临时区
// 层级时全体静默指错，所以一律向上探测。
// start 可传 import.meta.url（file:// URL）或文件路径，两者都会被归一化。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function projectRoot(start = import.meta.url) {
  if (start.startsWith('file:')) start = fileURLToPath(start)
  let dir = path.dirname(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('向上找不到 package.json，无法定位项目根')
    dir = parent
  }
}
