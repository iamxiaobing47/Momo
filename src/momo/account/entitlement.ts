// entitlement / 配额的纯函数层（P3 数据层，obsidian-free、可单独测）。
// 对应 commercialization.md §6 的口径：
//   - 身份（你是谁）= token；权益（你付过什么）= 服务端每次请求说了算；
//   - 这里只有**服务器权威数据的本地缓存**的净化与判定，不做任何网络请求。
// 宽限期：断网时按缓存的 entitlement 照常放行（免费路径零影响），超过宽限
// 仍未验证成功则回落锁死——数字是保守初值，正式口径随 §10 拍板。

import { PREMIUM_FEATURES, type PremiumFeature } from '../core'
import { sanitizeTable } from '../types/sanitizeKit'

/** 单项权益：有效到 `until`（ISO），来源标记（lemonsqueezy / trial / grant…） */
export interface EntitlementEntry {
  until: string
  source: string
}

/** `account.entitlements` 的内存形状：只含已获得的付费功能 */
export type Entitlements = Partial<Record<PremiumFeature, EntitlementEntry>>

/** `account.quota` 的单项：已用 / 上限 / 重置时间（服务器权威的本地缓存） */
export interface QuotaEntry {
  used: number
  limit: number
  resetAt: string
}

/** 断网宽限期（毫秒）。初值 72h——正式口径见 commercialization.md §10 待拍板清单 */
export const ACCOUNT_GRACE_MS = 72 * 60 * 60 * 1000

/**
 * ISO 字符串判定（**严格**：形状合法 + 日期真实存在 + Date 能解析）。
 *
 * BUG-132a：旧实现只有 `!Number.isNaN(Date.parse(v))`，于是 `'2027'`（→2027-01-01）、
 * `'01/02/2027'`（按美式解释成 2/1）、`'March 3 2027'`、`'2027-02-30'`（滚到 3/2）
 * 全都原样进内存并参与 `until > now` 判定。现在要求 `YYYY-MM-DD[THH:MM[:SS[.mmm]][Z|±HH:MM]]`
 * 的形状，并对日期部分做 round-trip（滚动的日期被挡在外面）。与 stats/window.ts 的
 * fallbackDay 同一手法；serviceDisk 的 cachedAt 复用本谓词（唯一真源）。
 */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/
export function isIso(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  const m = ISO_RE.exec(value)
  if (!m) return false
  const [, y, mo, d, hh, mm, ss] = m
  // 日期部分必须真实存在：2027-02-30 Date.parse 会滚到 3/2，round-trip 对不上即拒
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (
    probe.getUTCFullYear() !== Number(y) ||
    probe.getUTCMonth() !== Number(mo) - 1 ||
    probe.getUTCDate() !== Number(d)
  ) {
    return false
  }
  // 时间部分（若有）逐段夹取；闰秒 60 允许
  if (hh !== undefined) {
    if (Number(hh) > 23 || Number(mm) > 59 || (ss !== undefined && Number(ss) > 60)) return false
  }
  return !Number.isNaN(Date.parse(value))
}

/** 上限常量：token / id 都是服务端发的长随机串，给足余量但封顶（防手改盘面塞爆）。account 字段净化（serviceDisk）与这里共用 */
export const TOKEN_MAX = 2048
export const ID_MAX = 128
const SOURCE_MAX = 64

/** 单项权益的净化：until 必须是合法 ISO，source 截断；脏项整条丢弃 */
export function sanitizeEntitlementEntry(raw: unknown): EntitlementEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const view = raw as Record<string, unknown>
  if (!isIso(view.until)) return null
  // source 是服务端发的机器标签（lemonsqueezy / trial / grant 那一类），不是用户可见
  // 文本，所以按码元 slice 就够——不与 core/text.ts 的 truncateChars（码点口径，
  // 给地点名 / 品牌名那种界面会渲染的值）并制。
  const source = typeof view.source === 'string' ? view.source.slice(0, SOURCE_MAX) : 'unknown'
  return { until: view.until, source }
}

/**
 * entitlements 的净化：**白名单**——只认 PREMIUM_FEATURES 里的 id，未知 id
 * （手改 / 服务端多发的未来功能）一律不进内存；`__proto__` 显式跳过
 * （JSON.parse 会把它解析成自有键，赋值会静默命中 setter，见 sanitizeTrash 同注）。
 */
export function sanitizeEntitlements(raw: unknown): Entitlements {
  return sanitizeTable<EntitlementEntry>(raw, (id, entry) => {
    if (!(PREMIUM_FEATURES as readonly string[]).includes(id)) return null
    const clean = sanitizeEntitlementEntry(entry)
    return clean ? [id, clean] : null
  }) as Entitlements
}

/** 配额单项的净化：used / limit 夹到非负数，resetAt 必须合法 ISO */
export function sanitizeQuotaEntry(raw: unknown): QuotaEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const view = raw as Record<string, unknown>
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
  const used = num(view.used)
  const limit = num(view.limit)
  if (used === null || limit === null || !isIso(view.resetAt)) return null
  return { used, limit, resetAt: view.resetAt }
}

/** 配额缓存的净化：同样白名单，脏项整条丢 */
export function sanitizeQuotas(raw: unknown): Partial<Record<PremiumFeature, QuotaEntry>> {
  return sanitizeTable<QuotaEntry>(raw, (id, entry) => {
    if (!(PREMIUM_FEATURES as readonly string[]).includes(id)) return null
    const clean = sanitizeQuotaEntry(entry)
    return clean ? [id, clean] : null
  }) as Partial<Record<PremiumFeature, QuotaEntry>>
}

/**
 * 单项权益在 `now` 是否有效：until 是未来。只判这一条，不含宽限——
 * 宽限是「缓存整体多旧」的事，见 entitlementActive。
 */
export function isEntitlementActive(entry: EntitlementEntry | undefined, now: Date): boolean {
  if (!entry) return false
  const until = Date.parse(entry.until)
  return !Number.isNaN(until) && until > now.getTime()
}

/**
 * 权益判定（离线宽限口径）：缓存足够新鲜 → 按条目照常放行；
 * 缓存超过宽限期（断网太久 / 长期未验证成功）→ 回落锁死。
 * `cachedAt` 缺失 = 从来没有验证成功过 → 直接 false。
 */
export function entitlementActive(
  feature: PremiumFeature,
  entitlements: Entitlements,
  cachedAt: string | null,
  now: Date,
): boolean {
  if (!isEntitlementActive(entitlements[feature], now)) return false
  if (!cachedAt || !isIso(cachedAt)) return false
  // BUG-132b：`|now − cachedAt|` 取绝对值。旧实现只有上界，cachedAt 在未来时差值为负 →
  // 离线宽限永不过期（配合宽松 until 即可在无网络、无服务端校验下长期放行付费功能）。
  return Math.abs(now.getTime() - Date.parse(cachedAt)) <= ACCOUNT_GRACE_MS
}
