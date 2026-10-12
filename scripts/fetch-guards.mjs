// 下载前沿的共享闸门（BUG-104）：取件链共用（v1.0.0 起只剩 fetch-icons 一条——
// fetch-fonts 随内置字体退役删除，闸机制本身没动）。
//
// 为什么单独一个模块：两条链此前各写一份「结构自洽就算完整」的校验——那验的是
// **自洽**不是**身份**。摘要固定、重定向白名单、流式字节上限这三件事对两条链
// 是同一姿势，放两份会让修复和守卫各漏一半，所以收敛到这里一份。
import crypto from 'node:crypto'
import fs from 'node:fs'

/** buf → sha256 十六进制（与 scripts/verify-deploy.mjs 的 sha256 同制） */
export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** buf → 'sha512-<base64>'（npm integrity 形制，与 registry 元数据的 dist.integrity 对齐） */
export function integrityOf(buf) {
  return 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64')
}

/**
 * 带白名单的手动重定向跟随：`redirect: 'manual'` 逐跳自己走，每一跳的主机都必须在
 * `hosts` 里，最多 `maxHops` 跳。非 2xx / 非白名单主机 / 无 Location 一律抛。
 * ——`redirect: 'follow'` 会把「跟到哪」交给响应头，等于上游说跳哪就跳哪。
 */
export async function fetchGuarded(url, { hosts, maxHops = 5 } = {}) {
  let target = new URL(url)
  for (let hop = 0; ; hop++) {
    if (!hosts.has(target.host)) throw new Error(`重定向 / 请求落到非白名单主机 ${target.host}`)
    const res = await fetch(target, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`HTTP ${res.status} 但没有 Location`)
      if (hop >= maxHops) throw new Error(`重定向超过 ${maxHops} 跳`)
      target = new URL(loc, target)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  }
}

/**
 * 把响应体流式写进 `file`，累计超过 `capBytes` 立即抛——响应体先整块落盘再校验的
 * 旧写法里，一个超大响应在校验失败前已经占满磁盘。
 */
export async function streamToFile(res, file, capBytes, label = '响应') {
  const sink = fs.createWriteStream(file)
  const reader = res.body.getReader()
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > capBytes) throw new Error(`${label}超过上限（> ${capBytes} B）`)
      await new Promise((resolve, reject) => sink.write(value, (e) => (e ? reject(e) : resolve())))
    }
  } finally {
    sink.end()
    await new Promise((r) => sink.on('close', r))
  }
  return total
}
