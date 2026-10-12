// data.json 的 schema 迁移链（obsidian-free 纯函数，见
// docs/design/data-schema-evolution.md §2、任务书 P1）。
//
// 读盘：readDiskFile 先过 migrateFromDisk——老版本按链逐级走到 CURRENT_SCHEMA；
// 写盘：persist 永远写 CURRENT_SCHEMA + 最新形状。三条铁律：
// ① 只加字段，不改名不复用（改名走「新旧都读 + 写新 + 退役键清单」三件套）；
// ② 每个迁移步骤 = 一个纯函数 + 一个 fixture 测试（data-migrate.test.mts）；
// ③ 迁移里不许读盘、弹 UI、打日志。

/** 盘上格式的当前版本。v1 = P1 引入版本号时的全体现状基线；v2 = 新增 account 段；
 *  v3 = account 段搬出 data.json、改落 sidecar（data.json 要进 git，token 不能跟着走）。 */
export const CURRENT_SCHEMA = 3

/** 单级迁移：拿到上一版本的整份盘面对象，返回下一版本对象（**不修改入参**） */
export type SchemaMigration = (raw: Record<string, unknown>) => Record<string, unknown>

/**
 * 迁移注册表：键 = 起始版本（v → v+1），值 = 该级的迁移函数。
 * 新版本发布时两件事：CURRENT_SCHEMA +1、在表里登记 [新版本 - 1] 这一级。
 * data-migrate.test.mts 会守「注册表的键全部落在 [1, CURRENT_SCHEMA)」。
 */
export const SCHEMA_MIGRATIONS: Record<number, SchemaMigration> = {
  // v1 → v2：引入 `account` 段（服务器状态的本地缓存，见 serviceDisk.MomoAccount）。
  // 段是**可选新增**，老盘没有它 = 未登录，没有任何老数据要变换——这一级存在的
  // 意义是把「形状变了」记进版本号（data-schema-evolution §2.3 铁律的活标本），
  // 未来 v2 盘面读到这段就按登录态处理。
  1: (raw) => raw,
  // v2 → v3：`account` 段**搬出 data.json**，改落 sidecar
  // （`<configDir>/plugins/<插件 id>/account.json`，vault 仓 .gitignore 排它）——
  // 2026-09-30 起 data.json 恢复 git 跟踪（用户设置要跟着库同步），token 不能
  // 住在会被提交的文件里。搬移本身是 I/O，在 service.init 里做：readDiskFile
  // 报 accountMigrated，init 先写 sidecar 再重写 data.json（两步之间崩了下次
  // init 看到 data.json 里还在，会再搬一次）。这一级因此是 no-op 纯函数，只把
  // 「形状变了」记进版本号；**读盘侧新旧都读**：v2 老盘 / 别的设备旧版写的
  // account 段照常进内存，再被搬走擦掉（serviceDisk.readDiskFile 的注释）。
  2: (raw) => raw,
}

/** 解析盘上版本号：缺失 / 脏值一律视为 v1（最老基线） */
function versionOf(raw: Record<string, unknown>): number {
  const v = raw.schemaVersion
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return 1
  return Math.floor(v)
}

/**
 * 整份盘面按链迁移到 CURRENT_SCHEMA。
 * - 非对象（手改坏档）原样返回，交给下游逐字段 sanitize；
 * - 版本号比当前新（降级安装的插件读到新盘面）也原样返回——**容忍读**：
 *   不做任何改写、不写旧版本号，等用户升级回来还能认；
 * - 迁移完成的盘面盖 `schemaVersion: CURRENT_SCHEMA`（内存态；真正落盘由
 *   persist 统一写，这里盖章只为让读取方不用再猜版本）。
 *
 *  ⚠️ 容忍读只护**读**（BUG-179c 已裁决的写侧边界）：旧版读到新盘面后，prefs 白名单
 *  重写（serviceDisk.prefsFromDisk）会把新键清出内存，旧版第一次 persist 就把内存
 *  形状整份写回——新版 prefs / 用户数据键被静默剪掉、schemaVersion 回落。要做成
 *  「未知键合并写回」必须能区分「未来新键」与「退役残留键」（白名单的存在意义恰是
 *  清掉后者），故认下该边界；裁决与将来形态（版本门控合并）见
 *  docs/design/architecture/data-and-storage.md §6.1。
 */
export function migrateFromDisk(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  let view = raw as Record<string, unknown>
  let v = versionOf(view)
  if (v > CURRENT_SCHEMA) return view
  while (v < CURRENT_SCHEMA) {
    const step = SCHEMA_MIGRATIONS[v]
    view = step ? step(view) : view
    v += 1
  }
  return { ...view, schemaVersion: CURRENT_SCHEMA }
}
