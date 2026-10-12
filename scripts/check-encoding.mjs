// 编码与乱码守卫：把 2026-09 那次「注释被按 cp932 解读又存回 UTF-8」的事故变成可执行检查。
//
// 治的是什么：styles.css 的注释是这份文件唯一的知识载体（设计稿引用、工单号、用户反馈日期），
// 乱码伤的正是它，而且伤得无声无息——文件照样是合法 UTF-8，注释照样在，只是读不出来。
//
// 检查项（任一不过 → exit 1；--report 只报不失败）：
//   1. UTF-8 合法性：不允许出现解码失败字节 / U+FFFD（上一轮事故的直接特征）
//   2. 无 BOM：BOM 会被某些工具链当成内容字节，Obsidian 侧也不需要
//   3. 孤立 \r：\r\r\n 是「按别的编码解读后又存回」的痕迹（本次清掉 742 个）
//   4. 乱码特征字符：半角片假名 U+FF61–U+FF9F / U+30FB（正常中文注释用 · U+00B7）
//   5. 行尾一致：全文统一 LF
//   6. 代码区（注释外）出现 CJK：选择器 / 属性 / 值里不该有中文，出现即可疑
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCss } from './css-model.mjs'
import { projectRoot } from './project-root.mjs'

const projectDir = projectRoot(import.meta.url)
const args = process.argv.slice(2)
const reportOnly = args.includes('--report')
const targets = args.filter((a) => !a.startsWith('-'))
const srcDir = path.join(projectDir, 'styles.src')
/** styles.src 下全部分片（2026-10-03 分包后递归：层包 NN-<组件族>/ 里的组件分片一起查；
    themes/ 由下面的 themeParts 单独查，这里跳过免得重复） */
const topParts = fs.existsSync(srcDir)
  ? fs.readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.css') && !(e.parentPath ?? '').includes('themes'))
    .map((e) => path.join(e.parentPath ?? srcDir, e.name))
    .sort()
  : []
/** 配色方案分片 styles.src/themes/<id>.css（一个方案一个文件，v0.9.7 起） */
const themeParts = fs.existsSync(path.join(srcDir, 'themes'))
  ? fs.readdirSync(path.join(srcDir, 'themes')).filter((f) => f.endsWith('.css')).sort().map((f) => path.join(srcDir, 'themes', f))
  : []
const files = targets.length
  ? targets.map((t) => path.resolve(t))
  : [
      path.join(projectDir, 'styles.css'),
      // 拆分后（治理方案 §5 路线 A）注释随分片搬进 styles.src/，乱码风险面跟着搬家——
      // 默认把分片一起查了，否则「只治产物不治源」等于没治。配色方案分片在 themes/
      // 子目录里，同样要查（行尾约定 LF，Windows 工具写出的 CRLF 靠这条拦住）
      ...topParts,
      ...themeParts,
    ] // 默认只查 Momo；别的项目显式传路径（行尾约定各自不同）

const HALFWIDTH_KANA = /[\uff61-\uff9f]/
const MIDDLE_DOT_30FB = /\u30fb/
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/

let failed = false
const fail = (file, msg) => {
  failed = true
  console.log(`  ${path.relative(projectDir, file).replace(/\\/g, '/')}  ${msg}`)
}

for (const file of files) {
  if (!fs.existsSync(file)) continue
  console.log(`check-encoding ${path.relative(projectDir, file).replace(/\\/g, '/')}`)
  const buf = fs.readFileSync(file)

  // 1. UTF-8 严格解码
  const strict = new TextDecoder('utf-8', { fatal: true })
  let text
  try {
    text = strict.decode(buf)
  } catch {
    fail(file, '不是合法 UTF-8（存在无法解码的字节，疑似被按别的编码存过）')
    text = new TextDecoder('utf-8').decode(buf)
  }
  if (text.includes('\ufffd')) fail(file, '含 U+FFFD 替换字符（UTF-8 解码失败的特征）')

  // 2. BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(file, '带 UTF-8 BOM，应为无 BOM')

  // 3. 孤立 \r
  const lonelyCr = (text.match(/\r(?!\n)/g) || []).length
  if (lonelyCr > 0) fail(file, `孤立 \\r ${lonelyCr} 处（\\r\\r\\n 是编码被解读后存回的痕迹）`)

  // 4. 乱码特征字符（整文件范围，包含注释与代码）
  const suspicious = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (HALFWIDTH_KANA.test(ch) || MIDDLE_DOT_30FB.test(ch)) suspicious.push('U+' + cp.toString(16).toUpperCase().padStart(4, '0'))
  }
  if (suspicious.length) {
    const uniq = [...new Set(suspicious)].join(' ')
    fail(file, `乱码特征字符 ${suspicious.length} 处（${uniq}）`)
  }

  // 5. 行尾一致性
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  if (lf > 0 && crlf > 0) fail(file, `行尾混用：CRLF ${crlf} / LF ${lf}`)
  else if (crlf > 0) fail(file, `行尾为 CRLF ${crlf} 处，本项目约定 LF`)

  // 6. 注释外的 CJK
  let outside = 0
  try {
    const { rules, comments } = parseCss(text)
    const covered = (pos) => comments.some((c) => pos >= c.start && pos < c.end)
    for (const r of rules) {
      for (let p = r.start; p < r.end; p++) {
        if (!covered(p) && CJK.test(text[p])) { outside++; break }
      }
    }
  } catch (e) {
    fail(file, '解析失败：' + e.message)
  }
  if (outside > 0) fail(file, `${outside} 个规则的选择器 / 属性 / 值里出现中文`)
}

if (failed) {
  console.log(reportOnly ? 'check-encoding: 有问题（--report 模式不失败）' : 'check-encoding: 未通过')
  if (!reportOnly) process.exit(1)
} else {
  console.log('check-encoding: 通过')
}
