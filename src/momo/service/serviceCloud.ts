// 云操作索引 sidecar（`<root>/.momo-cloud.json`）的**形状与净化**（R9，obsidian-free）。
// 对应 commercialization.md §4 的三层数据划分：操作索引（哪条分享过、备份到第几版）
// 是**派生物**——落 sidecar，可丢可重建（从服务器重拉），禁用 / 退订 / 卸载时能安全
// 整文件删除。I/O 只进 service.ts；本文件只做「盘上杂形 → 内存干净形」的纯函数。
//
// 本期（R9）**恒为空内容**——只建机制不写云数据：P4 备份 / P5 广场的功能期再把
// backup / shares 的内容填进来，形状已经在那儿，接入方不用再改存储。

/** 空索引（未登录 / 从未备份 / 从未分享的基线） */
export interface MomoCloudIndex {
  /** P4 备份：上次成功备份的全库内容指纹 + 时间；null = 从未备份 */
  backup: { contentHash: string | null; at: string | null }
  /** P5 广场：分享索引，本地路径 → 服务端发的 shareId（与 vault 路径解耦） */
  shares: Record<string, string>
}

export const EMPTY_CLOUD_INDEX: MomoCloudIndex = {
  backup: { contentHash: null, at: null },
  shares: {},
}

/** 空索引的**新实例**（EMPTY_CLOUD_INDEX 是共享常量，直接 spread 会把 shares 引用
 *  带出去；service 每次要一份自己的，免得将来写入时污染常量） */
export function emptyCloudIndex(): MomoCloudIndex {
  return { backup: { contentHash: null, at: null }, shares: {} }
}

/** sidecar 的合法顶层键。盘上出现表外键 = 退役残留 / 手改——探测后由写入擦掉 */
export const CLOUD_INDEX_KEYS = ['backup', 'shares'] as const

/**
 * 顶层残留键探测（prefs 的 STRAY_PREFS_KEYS 同款思路）。sidecar 的键集小且封闭，
 * 直接算差集即可，不需要维护一张退役清单——将来加了新段，往 CLOUD_INDEX_KEYS 补。
 */
export function cloudStrayKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.keys(raw as Record<string, unknown>).filter(
    (k) => !(CLOUD_INDEX_KEYS as readonly string[]).includes(k),
  )
}

/**
 * 净化：白名单式收敛——盘上杂形一律回退到空机制，绝不让脏值进内存。
 * 非对象 / 半截段 / 类型不对都按「没有这个段」处理（与 accountFromDisk 同口径）。
 */
export function sanitizeCloudIndex(raw: unknown): MomoCloudIndex {
  const view =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const backup =
    view.backup && typeof view.backup === 'object' && !Array.isArray(view.backup)
      ? (view.backup as Record<string, unknown>)
      : {}
  const rawShares =
    view.shares && typeof view.shares === 'object' && !Array.isArray(view.shares)
      ? (view.shares as Record<string, unknown>)
      : {}
  const shares: Record<string, string> = {}
  for (const [path, shareId] of Object.entries(rawShares)) {
    // __proto__ 显式跳过：JSON.parse 会把它解析成自有键，赋值会静默命中 setter
    // （sanitizeEntitlements / sanitizeTrash 同注）。
    if (path === '__proto__') continue
    if (typeof shareId === 'string' && shareId !== '') shares[path] = shareId
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  return {
    backup: { contentHash: str(backup.contentHash), at: str(backup.at) },
    shares,
  }
}

/** 写盘形状（与 EMPTY_CLOUD_INDEX 同集合；JSON.stringify 前过一遍，保证键序稳定） */
export function serializeCloudIndex(index: MomoCloudIndex): string {
  return JSON.stringify({
    backup: { contentHash: index.backup.contentHash, at: index.backup.at },
    shares: index.shares,
  })
}
