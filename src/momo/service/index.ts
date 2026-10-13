import { FileView, MarkdownView, Notice, Plugin, TAbstractFile, TFile, TFolder, WorkspaceLeaf, normalizePath, requestUrl } from 'obsidian'
import { buildFrontmatter, canonicalTagPath, isValidTag, normalizeTags, remapFmTags, remapTagPath, rewriteInlineTags, splitFrontmatter, tagKey } from '../tags'
import { compareTimeKey, dayKey, localDay } from '../dates'
import {
  MomoData,
  MomoEntry,
  MomoSettings,
  DEFAULT_SETTINGS,
  BRAND_ICON_EXTS,
  TrashItem,
  TrashRecord,
  VIEW_TYPE_MOMO,
  type AddLocationsResult,
  type AddTagsResult,
  type GlobeEarth,
  type RemoveLocationsResult,
  type RemoveTagsResult,
} from '../types'
import { sanitizeBrandIconImage, sanitizeSettings } from '../types/sanitize'
import { copy } from '../i18n'
import { createInflightGate, errMsg } from '../core'
import { MomoDiskFile, accountFromDisk, prefsFromDisk, readDiskFile, serializeAccount, type MomoAccount } from './serviceDisk'
import { CURRENT_SCHEMA } from '../types/migrations'
import { affectsPath, isMomoMdPath, type MomoLayout } from './serviceLayout'
import { createdAtOf, emptyTrashEntry, fileStamp, fmTagList, isBlankEntry, projectEntry, tagsOf } from './serviceFiles'
import { hasTagSpace, squeezeTagSpace } from '../tags'
import {
  addLocationsTo,
  canonicalLocName,
  LOCATIONS_MAX,
  locationsOf,
  normalizeLocations,
  removeLocationsFrom,
} from '../locations'
import {
  emptyCloudIndex,
  cloudStrayKeys,
  sanitizeCloudIndex,
  serializeCloudIndex,
  type MomoCloudIndex,
} from './serviceCloud'
import {
  GLOBE_PACK_MANIFEST_FILE,
  globePackCubeNames,
  globePackFileNames,
  globePackUrl,
  isGlobePackFileValid,
  type GlobePackFailure,
} from '../globe/pack'

// Momo 服务（contract-momo-storage / concept-momo-trash）：
// 索引随 vault 事件重建，不缓存正文；插件私有状态只有 data.json。
// 编辑器 = Obsidian 原生编辑器（ADR-003 / concept-momo-content）：插件不封装
// 第二套编辑器，本服务只负责文件读写与「打开文件」。
//
// 拆模块（AGENTS.md §3.1「I/O 只进 service.ts」）：本文件是**唯一** import
// obsidian 的 momo/ 模块，纯逻辑全部落到旁边几个 obsidian-free 模块里——
//   serviceDisk.ts    data.json 形状 + 读盘 sanitize
//   serviceLayout.ts  目录判定（算不算 Momo / 事件要不要理）
//   serviceFiles.ts   文件名 / 空白判定 / 预览文本
//   serviceLinks.ts   图片引用路径（相对链接怎么算）
//   serviceImages.ts  图片分类与命名（什么算图片 / 叫什么）
// 所以本文件剩下的就是「把那些函数接上 vault 的读写」。

/** 编辑器内容加载轮询的步长与上限（openInEditor 落光标用；总上限 2s） */
const CURSOR_POLL_MS = 50
const CURSOR_POLL_MAX = 40

/** 云操作索引 sidecar 的文件名（R9；落在 <root>/ 下，Obsidian 不当笔记索引） */
const CLOUD_INDEX_FILE = '.momo-cloud.json'

/**
 * 账号段 sidecar 的文件名（v3；落在 `<configDir>/plugins/<插件 id>/` 下，与
 * data.json 同目录）。与 CLOUD_INDEX_FILE 的分工：cloud 索引是 vault 内容
 * （跟着库走的派生物），账号段是**设备本地**状态（token 每台设备一份，
 * 绝不进 git——vault 仓的 .gitignore 排它）。
 */
const ACCOUNT_SIDECAR_FILE = 'account.json'

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

/** YAML 的显式假值（parseSimpleYaml 给字符串 / 布尔 / 空数组，都按不当真处理） */
const FALSEISH = new Set<string>(['', 'false', 'no', 'off', '0'])

/**
 * frontmatter 的 `draft` 标记算不算数：写真值才算草稿。
 *
 * 旧口径是「键有值即草稿」（`!== undefined`），于是 `draft: false`（用户显式声明
 * 「不是草稿」）和 `draft:`（冒号后空值，parseSimpleYaml 给 `[]`）的条目被**整条
 * 藏出面板**——文件明明在 vault 里，却哪儿都看不见，也没有任何提示。旁边的
 * backfilled / scheduled 早就只认 `=== true || === 'true'`，只有 draft 这一把尺子
 * 是「有值就算」，三种痕迹标记三套口径。
 */
function isDraftFlag(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === 0) return false
  if (typeof v === 'string') return !FALSEISH.has(v.trim().toLowerCase())
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** 标签改名 / 删除的结果计数（service → caps → 调用方汇总提示） */
export interface RetagResult {
  /** 实际改写并落盘的文件数 */
  updated: number
  /** 读取 / 写入失败的文件数 */
  failed: number
}

/** 改笔记路径的「影响面」（service.notesRelocation 的返回值，设置页弹窗的数据源） */
export interface NotesRelocation {
  /** 会被甩在老位置、从此不进索引的笔记条数（0 = 这次改动不动笔记，不必问） */
  count: number
  /** 老正文目录（vault 相对路径）——弹窗里的「从哪」 */
  from: string
  /** 新正文目录（vault 相对路径）——弹窗里的「到哪」 */
  to: string
}

/** 笔记迁移的结果（service.migrateNotes 的返回值） */
export interface NotesMigrationResult {
  /** 实际搬过去的文件数 */
  moved: number
  /** 旧路径 → 新路径（含重名加序号的落点）。调用方拿它把置顶笔记一起改路 */
  renamed: ReadonlyMap<string, string>
}

export class MomoService {
  settings: MomoSettings = { ...DEFAULT_SETTINGS }
  // 每实例一份：trash 会被就地增删键（`this.data.trash[name] = ...`），prefs 会被
  // 整体替换（savePrefs）——两个都不能与 DEFAULT_DATA 共享引用。
  // BUG-146：prefs 走 prefsFromDisk({})（逐项新建）而不是 `{ ...DEFAULT_DATA.prefs }`
  // （只拷一层，densityViews / sections / reviewSeen 等嵌套字段仍共享引用）——
  // 首次安装与重置两条路径从此都与「盘上缺省」同一来源。
  data: MomoData = { trash: {}, prefs: prefsFromDisk({}) }
  /**
   * 服务器状态的本地缓存（P3 数据层）：登录态 / entitlement / 配额。
   * null = 未登录。它**不是 prefs**：整体替换、退出登录 = 置 null（sidecar 删文件）。
   *
   * v3（2026-09-30）起它**不落 data.json**，落 sidecar
   * `<configDir>/plugins/<插件 id>/account.json`（见 accountSidecarPath）——
   * data.json 恢复 git 跟踪（用户的视图偏好要跟着库同步），token 不能住在会被
   * 提交的文件里。读盘侧新旧都读：v2 老盘 data.json 里的 account 段由 init
   * 搬来 sidecar（readDiskFile 报 accountMigrated）。判定逻辑在
   * account/entitlement.ts；store 的 premiumActive 消费它（P3 只接存储，无 UI）。
   */
  account: MomoAccount | null = null

  /**
   * 云操作索引（R9）：分享过哪条 / 备份到第几版的**本地缓存**（sidecar，
   * `<root>/.momo-cloud.json`）。派生物——删了能重建（从服务器重拉），与
   * this.account 一样不落 data.json。本期恒为空内容（只建机制不写云数据），
   * P4 备份 / P5 广场接上内容。形状与净化在 serviceCloud.ts（obsidian-free）。
   */
  cloud: MomoCloudIndex = emptyCloudIndex()
  /** sidecar 盘上撞见残留键 → 下一次写入擦掉（与 data.json 的 strayPrefsCleaned 同模式） */
  private cloudStrayCleaned = false

  private listeners = new Set<() => void>()

  /** 空白草稿清扫的延时 timer（N07）：卸载时撤掉，onunload 之后不再动 vault */
  private sweepTimer: number | null = null

  /**
   * 索引缓存（增量刷新）：path → 上次解析结果 + 当时的 mtime/size。
   * 只有 mtime/size 变了的文件才重读；未变的条目返回**同一个对象**，
   * 让 React 侧（memo 过的 Card）不重渲染、MarkdownRenderer 不重挂。
   * entry 为 null = 已读但按口径应被过滤（空 Momo / 草稿），缓存它可避免每次都重读。
   * 目录设置变化（saveSettings）时整表清空。
   */
  private index = new Map<string, { mtime: number; size: number; entry: MomoEntry | null }>()

  /**
   * 回收站条目缓存（v0.9.26 起替代原预览缓存）：name → 上次的**完整索引投影**
   * + 当时的 mtime/size。回收站行要按正常卡片渲染（正文 / 标签 / 日期都读盘），
   * 预览文本那套「截 80 字」的折中已随 TrashRow 一起退役。
   * 与 `index` 同一套失效口径（mtime/size 都没变才复用）；目录设置变化
   * （saveSettings）时整表清空——键只是文件名，换了回收目录就同名不同物了。
   * 它同时是 store 侧引用守卫（N02）的地基：文件没变时 entry 对象身份不变，
   * 引擎才不会把整份回收站列表判成「变了」而白重渲。
   */
  private trashCache = new Map<string, { mtime: number; size: number; entry: MomoEntry }>()

  /**
   * listEntries 的在途合并（N17）：两处面板 / 启动加载并发首次拉列表时，
   * 扫描 + 读盘只跑一轮；本轮结束即清槽，刻意不缓存结果（引用守卫归 store）。
   */
  private listGate = createInflightGate<MomoEntry[]>()

  /** D-07：这一秒已被在途 create 占用的文件名。create 之间是「算名 → await 落盘」，
   *  窗口里第二个调用看到的还是空 vault，只查已落盘文件会算出同一个名字。 */
  private reserving = new Set<string>()

  constructor(private plugin: Plugin) {}

  get app() {
    return this.plugin.app
  }

  get vault() {
    return this.app.vault
  }

  /** 插件 id（manifest.id）。「按插件目录定位」的地方（账号 sidecar、星球贴图的
   *  app:// URL、caps 组装）都用它——路径拼在 caps.ts，id 的真源在这里。 */
  get pluginId(): string {
    return this.plugin.manifest.id
  }

  /** 插件版本（manifest.version）：星球资源包的记账与下载 tag（release 的 tag = 版本号） */
  get pluginVersion(): string {
    return this.plugin.manifest.version
  }

  /** 插件目录（`<configDir>/plugins/<id>/`）：星球资源包与账号 sidecar 都落这里 */
  private pluginDir(): string {
    return normalizePath(`${this.vault.configDir}/plugins/${this.pluginId}`)
  }

  /** 卸载收尾（N07）：撤掉还没跑的空白草稿清扫。
   *  旧实现把 timer id 丢掉，热重载 / 关插件后 3s 内它照样执行：全库读一遍、
   *  把用户刚打开的空文件移进系统回收站、再弹一条通知。 */
  dispose(): void {
    if (this.sweepTimer !== null) {
      window.clearTimeout(this.sweepTimer)
      this.sweepTimer = null
    }
    // BUG-68c：emitTimer 与 sweepTimer 同形状——卸载落在 vault 事件后 150ms
    // 窗口内时，它仍会 emit → listeners → refresh()，卸载后的 service 继续读盘、
    // 更新全局 store。照 sweepTimer 同款在 dispose 里撤掉。
    if (this.emitTimer !== null) {
      window.clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    // BUG-51：卸载后不许自愈定时器再跑（会读盘 / 更新全局 store）
    if (this.trashHealTimer !== null) {
      window.clearTimeout(this.trashHealTimer)
      this.trashHealTimer = null
    }
    this.trashHealArmed = false
  }

  async init(): Promise<void> {
    // 读盘 + 逐字段兜底全在 serviceDisk.ts（obsidian-free，可单独测）；
    // 这里只做「读完之后必须动 vault 才知道答案」的那几步。
    const loaded = (await this.plugin.loadData()) as MomoDiskFile | null
    const disk = readDiskFile(loaded)
    this.data = disk.data
    // BUG-151：读盘路径也要裁决 notesDir / trashDir 重叠。磁盘 settings 只过
    // sanitizeSettings（逐字段归一、不跨字段裁决），读到脏盘面（手改 / Sync 合并 /
    // 旧版残留）时 notesDir == trashDir → isMomoMdPath 把笔记目录整块判成回收目录 →
    // 笔记列表静默全空，且「清空回收站」按该目录实际文件删时会误删笔记。这里读盘后
    // 立刻过一遍与写路径同一个 resolveSettings（宁可少一个自定义目录，也不要空面板），
    // 发生回退时 best-effort 落盘自愈。
    this.settings = disk.settings
    const resolved = this.resolveSettings({})
    const settingsReverted =
      resolved.notesDir !== disk.settings.notesDir || resolved.trashDir !== disk.settings.trashDir
    this.settings = resolved
    // v3 账号段搬迁（2026-09-30：data.json 恢复 git 跟踪，token 搬去 sidecar）。
    // **必须赶在下面任何一次 persist 之前**：v3 起 persist 的 snapshot 不带
    // account，先落了 data.json 就等于把 token 从盘上抹掉——而 sidecar 还没写。
    // 谁是真源：sidecar（v3+ 写的）优先；data.json 的 account 段只当 v2 遗留读
    // （老盘 / 别的设备旧版写的，读进内存再搬走）。
    const sidecar = await this.readAccount()
    const sidecarAccount = sidecar.account
    this.account = sidecarAccount ?? disk.account
    if (disk.accountMigrated && !sidecar.unreadable) {
      // sidecar 里已有有效账号就不重写（内容相同，别白顶一次 mtime）；缺 sidecar /
      // sidecar 是脏内容 / 账号最终为空，都以搬移后的终态为准写一次（空 = 删文件）。
      // BUG-130a：搬迁写盘失败只记日志、不阻断 init——否则 data.json 只读 + 退役键
      // 会让 init reject、registerVaultEvents 不执行、插件加载失败且界面零提示。
      try {
        if (!sidecarAccount) await this.persistAccount()
        // 顺序：先 sidecar 后 data.json。反过来的话两步之间崩了 token 两头空；
        // 这个顺序崩了，下次 init 看到 data.json 里还在，会再搬一次。
        await this.persist()
      } catch (e) {
        console.error('[Momo] 账号段搬迁写盘失败，本次跳过（不影响插件加载）', e)
      }
    } else if (disk.accountMigrated && sidecar.unreadable) {
      // BUG-147：sidecar 存在但读 IO 失败 ≠ 未登录。照旧搬迁会因 sidecarAccount=null
      // 触发 persistAccount 的「null=删文件」把真实 token 删掉，并把 data.json 的
      // account 段一并擦除。这里保留两处、跳过搬迁，下次 init 重试。
      console.error('[Momo] 账号 sidecar 不可读，跳过 v3 搬迁并保留 token（本次可能显示为未登录）')
    }

    await this.migrateHiddenTrashDir()
    // 自愈：登记指向的文件已不存在 → 清登记（concept-momo-trash）。
    // 以回收目录里实际存在的文件为准，避免 trashDir 设置变化导致误清登记。
    //
    // D-05：**目录取不到时一律不清**。`getAbstractFileByPath` 返回 null 有两种
    // 完全不同的原因，旧代码当成一种处理：目录真的没了（登记全是悬空键，清掉合理）
    // / 目录只是这会儿读不到（Obsidian Sync 还没把 danpen/trash/ 下载下来、
    // 隐藏目录不被索引、权限问题）。后者一旦被当成前者，全部登记的 originalPath
    // 会被删掉并 persist()——文件都还在，只是「原来在哪」永久丢了，恢复只能回退
    // notes/。宁可留着几条悬空登记（列表/恢复都按实际文件走，多余键是无害的，
    // reviewSeen 那种只增不减的映射才会成为问题），也不能因为这个把用户的元数据吞了。
    const folder = this.vault.getAbstractFileByPath(this.trashFolderPath())
    if (folder instanceof TFolder) {
      const present = new Set(
        folder.children.filter((c): c is TFile => c instanceof TFile).map((c) => c.name),
      )
      // BUG-21：目录读到了也**不代表同步完了**。两台设备用 Obsidian Sync 时
      // data.json 先到、vault 文件后到是常见顺序——冷启动那一下 present 是残缺
      // 集合，此时清登记会永久删掉「原来在哪」，正是 D-05 要拦的那类元数据丢失。
      // BUG-51：旧守卫只在「目录整空」时观察；部分同步（先到了 1 个文件）会走
      // else 当场删掉其余还没到的登记并落盘——守卫缺口。现在只要任一登记的文件
      // 此刻不在目录里，就一律进宽限期、不当场清，到点再按实际文件重判
      // （见 armTrashHeal）：Sync 补齐的不会误清，真被手动删的仍会在宽限后清掉。
      const trashNames = Object.keys(this.data.trash)
      if (trashNames.some((name) => !present.has(name))) {
        if (present.size === 0 && trashNames.length > 0) {
          console.debug(
            `[momo] 回收站目录为空但 data.json 有 ${trashNames.length} 条登记：` +
              '多半是 Sync 未同步完，本次启动只观察不清理',
          )
        }
        this.armTrashHeal()
      }
    }
    // 游离键 / 目录重叠自愈落盘（一次性；与上面的登记自愈同一模式）。
    // BUG-130a：自愈写盘失败只记日志、不阻断 init。
    if (disk.strayPrefsCleaned || settingsReverted) {
      try {
        await this.persist()
      } catch (e) {
        console.error('[Momo] 启动自愈写盘失败（不影响插件加载）', e)
      }
    }

    // 云操作索引（R9）：读 sidecar（缺文件 = 空机制，不创建）；有残留键则顺手擦掉
    this.cloud = await this.readCloudIndex()
    await this.persistCloudIfStray()

    // 空草稿清扫是「全库读一遍」，延后执行，不阻塞 onload（工单 WO-8）
    // N07：id 存字段，dispose() 能撤；promise 上挂 catch——读盘失败的
    // rejection 没人接会变成 unhandled rejection（与 N5 同源）。
    this.sweepTimer = window.setTimeout(() => {
      this.sweepTimer = null
      void this.sweepEmptyDrafts().catch((e) => {
        console.error('[Momo] 空白草稿清扫失败', e)
      })
    }, 3000)
  }

  /**
   * 历史设置兼容：回收目录以「.」开头时 Obsidian 不索引隐藏目录，
   * 回收站列表/登记校验都会扫不到文件 → 自动迁移到非隐藏目录并改写设置。
   */
  private async migrateHiddenTrashDir(): Promise<void> {
    if (!this.settings.trashDir.startsWith('.')) return
    const legacyPath = normalizePath(`${this.settings.root}/${this.settings.trashDir}`)
    const legacyTrashDir = this.settings.trashDir
    this.settings.trashDir = DEFAULT_SETTINGS.trashDir
    const targetPath = this.trashFolderPath()
    // D-05：已经搬过去的文件逐个记账。迁移中途失败（权限 / 磁盘满 / 只读 /
    // 目标目录里有同名文件之外的任何中断）时必须把它们搬回原处——旧实现只回滚
    // settings.trashDir，文件却留在了新目录：下次 init 的自愈以新目录为准还能跑，
    // 可一旦 rmdir 失败导致设置回退到已不存在的隐藏目录，folder 取不到，
    // 全部登记的 originalPath 都会被清掉（D-05 的另一半）。
    const moved: Array<{ from: string; to: string }> = []
    try {
      if (await this.vault.adapter.exists(legacyPath)) {
        if (!(await this.vault.adapter.exists(targetPath))) await this.vault.adapter.mkdir(targetPath)
        const listed = await this.vault.adapter.list(legacyPath)
        for (const file of listed.files) {
          if (!file.endsWith('.md')) continue
          const name = file.split('/').pop()!
          const target = normalizePath(`${targetPath}/${name}`)
          if (await this.vault.adapter.exists(target)) continue
          await this.vault.adapter.rename(file, target)
          moved.push({ from: file, to: target })
        }
        // BUG-66：循环**刻意只搬 .md**（非 md / 子目录 / 目标已有同名的 md 都留在
        // 旧目录里），而 rmdir(_, true) 是递归强删——照旧收尾会把它们静默销毁，
        // 这是全插件唯一一条「主动删用户文件」的路径。只有旧目录确实空了才删；
        // 还剩任何文件 / 子目录就保留它，并记一条开发者日志（§2.4 白名单）。
        const remaining = await this.vault.adapter.list(legacyPath)
        if (remaining.files.length === 0 && remaining.folders.length === 0) {
          await this.vault.adapter.rmdir(legacyPath, true)
        } else {
          console.error(
            `[Momo] 回收目录迁移：旧目录仍含未搬迁内容，已保留不删：${legacyPath}` +
              `（${remaining.files.length} 个文件 / ${remaining.folders.length} 个子目录）`,
          )
        }
      }
    } catch (e) {
      // B07：迁移失败时回滚设置值且**不落盘**——否则 data.json 写下新 trashDir，
      // 而文件还留在旧隐藏目录：下次 init 的登记自愈以新目录实际文件为准，
      // 没迁过来的登记被全部清掉，文件两头不着。
      this.settings.trashDir = legacyTrashDir
      // 把已经搬过去的搬回去（best-effort：恢复失败也不能把原始错误吞掉，
      // 这里只 console.error，流程照旧 return）
      for (const m of moved.reverse()) {
        try {
          await this.vault.adapter.rename(m.to, m.from)
        } catch (restoreErr) {
          console.error(`[Momo] 迁移回滚失败，请手工把 ${m.to} 移回 ${m.from}`, restoreErr)
        }
      }
      console.error('[Momo] 回收目录迁移失败，已回滚设置', e)
      return
    }
    await this.persist()
  }

  async saveSettings(next: Partial<MomoSettings>): Promise<void> {
    // D-06：写盘侧也过 sanitize。旧实现只在这里裸 merge，而 sanitizeSettings 只在
    // readDiskFile 读盘时跑——用户在「存放路径」把 root 输成 `..` / 空串能一路写进
    // data.json：rootPath() 跟着坏 → isMomoMdPath 全部落空 → 面板**静默全空**、
    // 没有任何报错；重载后读盘 sanitize 又把它退回默认值，设置「自己变回去」。
    // 读盘与写盘用同一把尺子，输入当场被夹回合法值。
    // （合并 + 净化 + 冲突裁决抽去 resolveSettings：notesRelocation 要拿**落盘后**
    //   的布局数「会被甩下多少条笔记」，migrateNotes 又要搬去同一个地方，三处各算
    //   一遍必然漂移——迁到 A、设置落在 B，正是迁移类 bug 的经典长相。）
    this.settings = this.resolveSettings(next)
    // 目录路径可能变了：索引缓存全部失效（键是 vault 路径，旧布局的键不再有意义）
    this.index.clear()
    // 回收站缓存的键只是文件名：换了回收目录后同名文件就是另一份内容，一并清
    this.trashCache.clear()
    await this.persist()
    await this.reindex()
  }

  /**
   * 合并 patch 后的**最终**设置：sanitize + notesDir / trashDir 冲突裁决。
   * saveSettings / notesRelocation / migrateNotes 共用（理由见 saveSettings 注释）。
   */
  private resolveSettings(next: Partial<MomoSettings>): MomoSettings {
    const merged = sanitizeSettings({ ...this.settings, ...next })
    // notesDir 与 trashDir 写成同一个目录：isMomoMdPath 会把笔记目录整块判成回收
    // 目录 → 列表静默全空。以用户这次明确要改的那一维为准（传了哪个保哪个），
    // 另一个退回默认——宁可少一个自定义目录，也不要一个空面板。
    // 一次只传一维（设置页逐个键发 patch）时方向很明确；两维同传且相等无从判断
    // 用户要哪一个，那就保 trashDir（notesDir 退回默认）。
    // 每个分支落下后**复判一次**：让位目标恰好正是冲突值（用户把 trashDir 填成
    // 了 notesDir 的默认值 'notes'）时，让位让不开，改成撤回用户这一维——两个目录
    // 必须真的不相等，否则面板空不空全看运气。两个键都没传而盘上已是相等状态
    // （手改 / 同步合并 / 旧版漏洞）时只请 trashDir 让位：笔记位置一根毛都不动。
    if (merged.notesDir === merged.trashDir) {
      const same = merged.notesDir
      const touchedNotes = next.notesDir !== undefined
      const touchedTrash = next.trashDir !== undefined
      if (touchedTrash && !touchedNotes) {
        merged.notesDir = DEFAULT_SETTINGS.notesDir
        if (merged.notesDir === same) merged.trashDir = DEFAULT_SETTINGS.trashDir
      } else if (touchedNotes && !touchedTrash) {
        merged.trashDir = DEFAULT_SETTINGS.trashDir
        if (merged.trashDir === same) merged.notesDir = DEFAULT_SETTINGS.notesDir
      } else if (touchedNotes && touchedTrash) {
        merged.notesDir = DEFAULT_SETTINGS.notesDir
        if (merged.notesDir === same) merged.trashDir = DEFAULT_SETTINGS.trashDir
      } else {
        merged.trashDir = DEFAULT_SETTINGS.trashDir
        if (merged.trashDir === same) merged.notesDir = DEFAULT_SETTINGS.notesDir
      }
    }
    return merged
  }

  /**
   * 改笔记路径前先问一声的依据（v0.9.26，设置页「存放路径」调它）：这次 patch
   * 会把多少条笔记甩在老位置——旧布局下是 Momo、新布局下不再是的文件数。
   * `count === 0` = 不动笔记的位置，调用方不必弹窗、直接落盘。
   *
   * 为什么按「新旧两份布局」数而不是按目录名比：root 与 notesDir 两维都可能挪，
   * 而直接铺在 root 下的老 Momo（历史平铺）只在 root 变时才失所。真正该问的
   * 是「改完之后哪些文件读不到了」，不是「哪个字符串变了」。
   */
  notesRelocation(next: Partial<MomoSettings>): NotesRelocation {
    const before = this.layout()
    const after = this.layoutOf(this.resolveSettings(next))
    let count = 0
    for (const f of this.vault.getMarkdownFiles()) {
      if (f.extension !== 'md') continue
      if (!isMomoMdPath(f.path, before)) continue // 本来就不是 Momo（别处的文件，不归我们管）
      if (isMomoMdPath(f.path, after)) continue // 改了也还是 Momo（留在原地也读得到）
      count++
    }
    return { count, from: before.notesPath, to: after.notesPath }
  }

  /**
   * 把老布局下的笔记搬到新正文目录，再落盘这次的目录 patch（设置页弹窗里
   * 「搬过去」那一票，v0.9.26）。三件事一起做，缺一件就是半成品：
   * ① 搬文件——`vault.rename`（Obsidian 原生通道：跟随打开的标签页、更新反链）；
   * ② 改 trash 登记的 `originalPath`——不改的话「恢复」会把文件放回老目录
   *    （空壳目录还在，restoreOne 的目录检查发现得了它），恢复即再次消失；
   * ③ 改 `prefs.pinnedNotes`——不改的话下一轮 refresh 的自愈会把这些路径当
   *    「已消失」静默剔出置顶组，用户置的顶就这样丢了。
   *
   * **全有或全无**（B07 同款纪律）：任一步失败，已搬的文件搬回原处、登记与
   * 置顶还原、`settings` 整体还原且不落盘。半途而废最糟的形态是「文件在新目录、
   * 设置还是旧目录」——两头不着，且下次 init 的登记自愈会把没迁走的登记抹掉。
   */
  async migrateNotes(next: Partial<MomoSettings>): Promise<NotesMigrationResult> {
    const before = this.settings // 旧对象引用留着：saveSettings 整体替换引用，这个还指向旧盘面
    const final = this.resolveSettings(next)
    const oldLayout = this.layout()
    const newLayout = this.layoutOf(final)
    const targetDir = newLayout.notesPath
    /** 旧路径 → 新路径（含重名加序号的落点）：登记 / 置顶改路都按它来 */
    const movedTo = new Map<string, string>()
    const movers = this.vault
      .getMarkdownFiles()
      .filter((f) => f.extension === 'md' && isMomoMdPath(f.path, oldLayout) && !isMomoMdPath(f.path, newLayout))
    // BUG-130b/c：账面改路（trash 登记 / pinnedNotes / reviewSeen）**无论有没有文件要搬
    // 都要跑**——判据是「root / notesDir 变了」不是「movers 非空」。旧实现在
    // `movers.length === 0` 时直接 return 只 saveSettings：弹窗后文件被外部删掉的场景里
    // 回收登记仍指着旧目录（恢复即放回已空空壳、从此不进索引），reviewSeen 也被自愈清掉。
    // 路径其实没动的场景由 remapOriginalPath 自然短路（旧布局命中 → null）。
    // 目标目录可能从没存在过（新 root / 新正文目录）→ 有文件要搬时才先建，容错口径同 ensureRoot
    if (movers.length > 0 && !this.vault.getAbstractFileByPath(targetDir)) {
      try {
        await this.vault.createFolder(targetDir)
      } catch {
        // ignore：已存在 / 并发创建都算成功，下面的 rename 才是判据
      }
    }
    const pinnedBefore = this.data.prefs.pinnedNotes
    /** 回顾展示记录（BUG-130c）：与 pinnedNotes 一样以 vault 路径为键，迁移要改路 */
    const seenBefore = this.data.prefs.reviewSeen
    /** name → 改路前的 originalPath（回滚用；键是回收目录里的文件名） */
    const trashBefore = new Map<string, string>()
    this.beginQuiet()
    try {
      for (const f of movers) {
        // 旧路径必须在 rename **之前**取住：真件的 rename 就地更新 f.path
        // （rename 事件把 oldPath 单独递出来正是这个原因），await 之后再读
        // 读到的已是 target，搬迁表会记成 target→target——回滚 / 置顶改路 /
        // 回收登记改路全部落空（BUG-94）。
        const from = f.path
        const target = this.uniqueNotesPath(targetDir, f.name)
        await this.vault.rename(f, target)
        movedTo.set(from, target)
      }
      for (const [name, record] of Object.entries(this.data.trash)) {
        const to = this.remapOriginalPath(record.originalPath, oldLayout, newLayout, movedTo)
        if (to !== null && to !== record.originalPath) {
          trashBefore.set(name, record.originalPath)
          record.originalPath = to
        }
      }
      if (pinnedBefore.length > 0) {
        this.data.prefs.pinnedNotes = pinnedBefore.map(
          (p) => this.remapOriginalPath(p, oldLayout, newLayout, movedTo) ?? p,
        )
      }
      // BUG-130c：reviewSeen 与 pinnedNotes 同以 vault 路径为键，同样改路；不改的话
      // refresh 的自愈会把「路径已消失」的记录删掉并落盘——统计页「已回顾 / 覆盖率」
      // 当场回落，「很久没看」档把它们当从未看过。
      const seenNext: Record<string, string> = {}
      for (const [path, when] of Object.entries(seenBefore)) {
        seenNext[this.remapOriginalPath(path, oldLayout, newLayout, movedTo) ?? path] = when
      }
      this.data.prefs.reviewSeen = seenNext
      await this.saveSettings(next)
    } catch (e) {
      // B07 同款回滚：settings 整体还原（引用换回旧对象）+ 登记 / 置顶还原 +
      // 已搬文件搬回原处。只回滚 settings 的话，data.json 记旧目录而文件已在新
      // 目录——下次 init 的登记自愈以新目录实际文件为准，没迁走的登记全被抹掉。
      this.settings = before
      this.data.prefs.pinnedNotes = pinnedBefore
      this.data.prefs.reviewSeen = seenBefore
      for (const [name, originalPath] of trashBefore) {
        const record = this.data.trash[name]
        if (record) record.originalPath = originalPath
      }
      for (const [from, to] of [...movedTo.entries()].reverse()) {
        try {
          const file = this.vault.getAbstractFileByPath(to)
          if (file instanceof TFile) await this.vault.rename(file, from)
        } catch (restoreErr) {
          console.error(`[Momo] 迁移回滚失败，请手工把 ${to} 移回 ${from}`, restoreErr)
        }
      }
      throw new Error(copy.errors.notesMigrateFailed(errMsg(e)))
    } finally {
      this.endQuiet()
    }
    return { moved: movedTo.size, renamed: movedTo }
  }

  /**
   * trash 登记 `originalPath` 的新布局落点；不需要改则 null。
   * 已搬走的文件查搬迁表（重名可能带了序号）；已删进回收站的文件按「新正文
   * 目录 + 同名」推——恢复时把它放回新目录正是想要的（老目录已是空壳）。
   */
  private remapOriginalPath(
    originalPath: string,
    oldLayout: MomoLayout,
    newLayout: MomoLayout,
    movedTo: ReadonlyMap<string, string>,
  ): string | null {
    if (!originalPath || !isMomoMdPath(originalPath, oldLayout)) return null
    if (isMomoMdPath(originalPath, newLayout)) return null
    return movedTo.get(originalPath) ?? normalizePath(`${newLayout.notesPath}/${originalPath.split('/').pop()}`)
  }

  /** 新正文目录里可用的落点：重名追加 -1/-2…（与 uniqueTrashName 同一把尺子）。
   *  历史平铺在 root 下的文件与 notes/ 新文件可以同名，直接 rename 会报错。 */
  private uniqueNotesPath(dir: string, name: string): string {
    const first = normalizePath(`${dir}/${name}`)
    if (!this.vault.getAbstractFileByPath(first)) return first
    const base = name.replace(/\.md$/, '')
    let i = 1
    while (this.vault.getAbstractFileByPath(normalizePath(`${dir}/${base}-${i}.md`))) i++
    return normalizePath(`${dir}/${base}-${i}.md`)
  }

  /**
   * 面板停靠侧只是「面板开在哪一侧」，不影响索引内容 —— 不走 saveSettings（那会整库 reindex），
   * 直接落盘 data.json。用户拖动面板时会被频繁调用，值没变就不写盘。
   */
  async savePanelSide(side: 'left' | 'right'): Promise<void> {
    if (this.settings.panelSide === side) return
    this.settings.panelSide = side
    await this.persist()
  }

  /** 落盘的写链：串起所有 saveData，保证提交顺序 = 调用顺序。
   *
   *  为什么必须串：`savePrefs` / `savePanelSide` 改的是 `this.data.prefs`（同一引用，
   *  晚开始的写还能沾到最新值），但 `saveSettings` 会**整体替换** `this.settings`
   *  引用——先启动的那次 persist 容器里握着旧 settings 对象，若它的写盘晚于新
   *  persist 完成，旧设置后落盘，用户刚改的设置被静默回退（重载后「设置丢了一个」）。
   *  回收站批量操作的 persistBestEffort 与「拖动面板停靠侧」随时可能叠上，
   *  所以这里不能靠调用方自觉地不并发。 */
  private writeChain: Promise<unknown> = Promise.resolve()

  /** BUG-65：「回收登记未能保存」的 Notice 同一会话只弹一次（写失败反复骚扰比不提示更糟） */
  private persistWarned = false

  /**
   * 登记写盘失败 → 置位；下次**任一** persist 成功后顺手补写一次（本会话内自愈）。
   *
   * 为什么需要：B08 契约写的是「登记不落盘 = 重载后原路径元数据永久丢失」。
   * BUG-65 给静默失败补了一次性 Notice，但**本会话零重试**——提示完就等死，
   * 用户什么都不做的话结局与静默失败完全一样，只是多看过一句话。而写失败常见
   * 成因（文件锁冲突、磁盘瞬时不可用）本来就是下一轮就会好的那种。
   */
  private trashPersistDirty = false
  /** 补写进行中（卫防 `persist()` 递归补写把自己再拉进来） */
  private trashPersistRetrying = false

  async persist(): Promise<void> {
    // 快照必须在**同步段**里取：链上等多久都不影响「取的是这一刻的 data/settings」，
    // 而它也保证了排在后面的写入一定用更新的引用。
    // schemaVersion 统一在这里盖当前版本号（P1）——读盘侧的迁移链只补旧，
    // 版本号的唯一真源是写盘这一处。
    // v3 起 snapshot **不带 account**：它住 sidecar（accountSidecarPath），
    // data.json 恢复 git 跟踪后 token 不能出现在会被提交快照的字段里。
    const snapshot = {
      schemaVersion: CURRENT_SCHEMA,
      data: this.data,
      settings: this.settings,
    } satisfies MomoDiskFile
    // 链节上的拒绝必须就地恢复：writeChain 若停在 rejected 态，后续所有 .then 都不再执行，
    // 本会话内每一次落盘都会以第一个错误失败（saveData 一次短暂锁冲突 = 永久毒化）。
    // 本次失败仍经 link 抛给调用方（persistBestEffort 在自己那层吞），只是不传染给后面的写。
    const link = this.writeChain.then(() => this.plugin.saveData(snapshot))
    this.writeChain = link.catch((e) => {
      console.debug('[momo] persist 写盘失败，写链已恢复，后续写入照常排队', e)
    })
    await link

    // M5：这一轮写成功了 → 若之前有登记写失败，趁着「数据是最新且写盘活着」的
    // 窗口补写一次（本会话内自愈）。快照是同步段现取的，所以补写的正是此刻的
    // data —— 失败那次的快照不会重演。
    //
    // 边界三条：不新增 Notice（BUG-65 的一次性口径不回退，失败只留日志）；
    // 补写走的是同一条 writeChain（不会与当前这次并发）；`retrying` 卫防递归——
    // 补写内部的 persist() 会再走到这里，没有它就会无限自我调用。
    if (this.trashPersistDirty && !this.trashPersistRetrying) {
      this.trashPersistRetrying = true
      try {
        await this.persist()
        this.trashPersistDirty = false
      } catch (e) {
        console.error('[Momo] 回收登记补写仍失败，保持待重试', e)
      } finally {
        this.trashPersistRetrying = false
      }
    }
  }

  /**
   * B08：批量回收操作（trashMany / restoreMany / purge / purgeAll）收尾用的落盘——
   * 登记不落盘 = 重载后原路径元数据永久丢失，所以必须写；但写失败只能提示，
   * 绝不能覆盖主错误（「已删除 X 条，第 Y 条失败」才是用户要看的）。
   */
  private async persistBestEffort(): Promise<void> {
    try {
      await this.persist()
    } catch (e) {
      // BUG-65：B08 契约写的是「必须写；但写失败**只能提示**」——此前的空 catch
      // 把提示也砍了，实际故障序列（rename 全成功 → data.json 写失败 → 零反馈 →
      // 重载后登记全丢）对用户完全不可见。这里不改抛错语义（主错误仍由
      // trashMany / restoreMany / purgeAll 抛给 caps 弹），只补两件事：
      //   1. console.error 开发者日志（§2.4 白名单：日志不随语言变、需 grep）；
      //   2. 一次性 Notice——同一会话只弹一次，重复失败只留日志，避免黑底白字轰炸。
      console.error('[Momo] 回收登记未能保存（重载后原路径元数据可能丢失）', e)
      // M5：置位待补写。下一轮任一 persist 成功后会顺手重写一次（本会话内自愈），
      // 重载前不用靠用户做什么——B08 禁止的结局只剩「整个会话都没写成功」这一种。
      this.trashPersistDirty = true
      if (!this.persistWarned) {
        this.persistWarned = true
        new Notice(copy.errors.trashRegisterSaveFailed(errMsg(e)))
      }
    }
  }

  /**
   * BUG-51：启动时把回收登记自愈「挂起」，等一个安静期后再判。
   * 期间每有文件落进回收目录就顺延（nudgeTrashHeal），Sync 逐文件补齐不会
   * 在中途把「还没到的」当悬空登记清掉。
   */
  private armTrashHeal(): void {
    this.trashHealArmed = true
    this.scheduleTrashHeal()
  }

  /** 回收目录有新文件到达 → 顺延宽限（未挂起时是空操作） */
  private nudgeTrashHeal(): void {
    if (this.trashHealArmed) this.scheduleTrashHeal()
  }

  private scheduleTrashHeal(): void {
    if (this.trashHealTimer !== null) window.clearTimeout(this.trashHealTimer)
    this.trashHealTimer = window.setTimeout(() => {
      this.trashHealTimer = null
      this.trashHealArmed = false
      void this.healTrashRegistrations().catch((e) => {
        console.error('[Momo] 回收登记自愈失败', e)
      })
    }, MomoService.TRASH_HEAL_GRACE_MS)
  }

  /**
   * 宽限期到点后的实际自愈：以**此刻**回收目录里的文件为准，清掉确实不在了的
   * 登记。目录读不到（D-05）或整空（BUG-21）时一律不清——那两种都还可能是
   * Sync 未完成，宁可留悬空键（列表 / 恢复都按实际文件走，多余键无害）。
   */
  private async healTrashRegistrations(): Promise<void> {
    const folder = this.vault.getAbstractFileByPath(this.trashFolderPath())
    if (!(folder instanceof TFolder)) return
    const present = new Set(
      folder.children.filter((c): c is TFile => c instanceof TFile).map((c) => c.name),
    )
    const names = Object.keys(this.data.trash)
    if (present.size === 0 && names.length > 0) {
      console.debug(`[momo] 回收站目录仍为空但有 ${names.length} 条登记：继续观察不清理`)
      return
    }
    let changed = false
    for (const name of names) {
      if (!present.has(name)) {
        delete this.data.trash[name]
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  /** 路径是否落进回收目录（BUG-51 的宽限顺延只看回收目录内的到达事件） */
  private isInTrash(path: string): boolean {
    return path.startsWith(`${this.trashFolderPath()}/`)
  }

  async savePrefs(prefs: Partial<MomoData['prefs']>): Promise<void> {
    this.data.prefs = { ...this.data.prefs, ...prefs }
    await this.persist()
  }

  /** MarkdownRenderer 等需要 app/plugin 的场景由 views 层经此取宿主 */
  pluginOf(): Plugin {
    return this.plugin
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    // Momo 面板一个都没开时整轮跳过：面板关闭期间 vault 事件照常来（用户在编辑器里改 Momo），
    // 但索引刷新与 store 更新只服务面板渲染——没人看就不读盘；面板重开时构造函数里的
    // init() 会主动读一轮，不依赖这些事件。
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_MOMO).length === 0) return
    for (const fn of this.listeners) fn()
  }

  /** >0 时抑制事件刷新：批量文件操作（trashMany / restoreAll / purgeAll）每一步
   *  rename/delete 都会触发 vault 事件，逐事件全量刷新（重读全部 Momo + 整列表
   *  重渲 Markdown）会把面板卡死；批量结束后由 caps 层显式 refresh 一次。 */
  private quiet = 0

  private emitTimer: number | null = null

  /**
   * BUG-51：启动回收登记自愈的宽限期（毫秒）。测试可调小以驱动定时器。
   *
   * 「登记数 > 目录里实际文件数」既可能是 Sync 只到了一部分，也可能是用户
   * 手动删了回收文件——启动那一刻无法区分，而其中一条会永久丢 originalPath。
   * 所以不在 init 当场清，改为等一段安静期再按实际文件重判：期间每有文件落进
   * 回收目录就顺延（nudgeTrashHeal），Sync 逐文件补齐时不会中途清。
   */
  static TRASH_HEAL_GRACE_MS = 10_000

  /** BUG-51：自愈宽限定时器 / 是否已进入待判状态 */
  private trashHealTimer: number | null = null
  private trashHealArmed = false

  /** vault 事件 → 刷新的防抖：同一波操作产生的一串事件合并成一次 emit；
   *  单条改动最多延迟约 150ms 才反映到面板，感知不到。 */
  private emitSoon(): void {
    if (this.quiet > 0 || this.emitTimer !== null) return
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = null
      this.emit()
    }, 150)
  }

  /**
   * 进入「批量写」：抑制 vault 事件刷新，**并清掉已经排上、还没响的 emit 定时器**
   * （否则那一次会在批量中途照响、读到中间态；工单 WO-7）。支持嵌套。
   */
  private beginQuiet(): void {
    this.quiet++
    if (this.emitTimer !== null) {
      window.clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
  }

  private endQuiet(): void {
    this.quiet--
  }

  // ---- 路径 ----
  // 目录布局（均可设置页自定义）：root 下分 notes / attachments / trash。
  // （export 目录随导出功能整块移除，不再是布局的一部分；历史 `danpen/export/`
  // 里的文件不在索引范围内，不会冒进列表。）
  // 兼容旧数据：历史小记平铺在 root 下，索引照常收录（直接位于 root 的 md），
  // 新建的小记一律落到 notesDir。
  //
  // 路径**拼装**在这里（要过 obsidian 的 normalizePath，所以本文件免不了 import
  // obsidian）；「这段路径算不算 Momo / 事件要不要理」的判定在 serviceLayout.ts。

  rootPath(): string {
    return normalizePath(this.settings.root)
  }

  notesPath(): string {
    return normalizePath(`${this.settings.root}/${this.settings.notesDir}`)
  }

  attachmentsPath(): string {
    return normalizePath(`${this.settings.root}/${this.settings.attachmentsDir}`)
  }

  trashFolderPath(): string {
    return normalizePath(`${this.settings.root}/${this.settings.trashDir}`)
  }

  /** 自定义图标目录（root 下 icons/；用户上传的左上角图标落这里，只此一个用处） */
  iconsPath(): string {
    return normalizePath(`${this.settings.root}/icons`)
  }

  private trashPath(name: string): string {
    return normalizePath(`${this.trashFolderPath()}/${name}`)
  }

  /** 历史草稿文件路径（列表/索引中过滤；不再新建草稿） */
  draftPath(): string {
    return normalizePath(`${this.settings.root}/draft.md`)
  }

  /** 云操作索引 sidecar 路径（`<root>/.momo-cloud.json`，R9） */
  cloudIndexPath(): string {
    return normalizePath(`${this.settings.root}/${CLOUD_INDEX_FILE}`)
  }

  /**
   * 读云操作索引（R9）：缺文件 / 读坏 / 脏盘一律收敛到空机制——**不创建、不报错、
   * 不阻塞 onload**。撞见顶层残留键只记 cloudStrayCleaned，由 persistCloudIfStray
   * 在本次 init 收尾时顺手擦掉（与 data.json 的自愈同一模式）。
   */
  private async readCloudIndex(): Promise<MomoCloudIndex> {
    const path = this.cloudIndexPath()
    try {
      if (!(await this.vault.adapter.exists(path))) return emptyCloudIndex()
      const raw = JSON.parse(await this.vault.adapter.read(path)) as unknown
      if (cloudStrayKeys(raw).length > 0) this.cloudStrayCleaned = true
      return sanitizeCloudIndex(raw)
    } catch (e) {
      // JSON 坏 / 权限：按空索引处理，日志走 console.debug（AGENTS.md §8：构建时消失）
      console.debug('[Momo] 云索引读取失败，按空索引处理', e)
      return emptyCloudIndex()
    }
  }

  /** 写云操作索引（R9 只有自愈路径会调；P4/P5 的功能写入随后接上） */
  async writeCloudIndex(): Promise<void> {
    await this.vault.adapter.write(this.cloudIndexPath(), serializeCloudIndex(this.cloud))
  }

  /** 残留键自愈落盘（一次性；与 strayPrefsCleaned 的 persist 同一模式）。
   *  BUG-130a：写失败不阻断 init（云索引是派生物，坏了能重建）。 */
  private async persistCloudIfStray(): Promise<void> {
    if (!this.cloudStrayCleaned) return
    try {
      await this.writeCloudIndex()
      this.cloudStrayCleaned = false
    } catch (e) {
      console.error('[Momo] 云索引自愈写盘失败（不影响插件加载）', e)
    }
  }

  // ---- 账号段 sidecar（v3：`.obsidian/plugins/<插件 id>/account.json`）----
  //
  // 为什么单独一个文件：data.json 要进 git（用户的视图偏好跟着库同步走），
  // 而 accessToken / refreshToken 明文住在里面 = 一旦提交即外传（2026-09-30
  // 那条 ignore 规则当初就是为这个把整份 data.json 排除的，副作用是设置也
  // 不同步了）。拆开后 token 留在这个继续被 .gitignore 排除的小文件里，
  // data.json 恢复跟踪——「设置要同步」与「token 不外传」不再二选一。
  //
  // 与 cloud 索引 sidecar 的分工：cloud 索引在 vault 内容里（跟着库走的派生物），
  // 账号段在**配置目录**里（设备本地状态，token 每台设备一份，同步过去只会
  // 互相覆盖——将来若改用 Obsidian Sync，也要把它加进排除清单）。

  /** 账号段 sidecar 路径：与 data.json 同目录（Obsidian 的 loadData/saveData 就写在
   *  `<configDir>/plugins/<插件 id>/` 下），所以 configDir + manifest.id 拼。 */
  accountSidecarPath(): string {
    return normalizePath(`${this.vault.configDir}/plugins/${this.plugin.manifest.id}/${ACCOUNT_SIDECAR_FILE}`)
  }

  /**
   * 读账号段（BUG-147 起三态）：**确认没有**（文件不存在 / JSON 坏）→ `account: null,
   * unreadable: false`（未登录，允许搬迁擦除）；**读 IO 失败**（占用 / 锁 / 权限抖动）→
   * `unreadable: true`，调用方必须**跳过**搬迁写盘，保留 sidecar 与 data.json 里的 token。
   * 不创建文件、不抛出（与 readCloudIndex 同口径），形状净化在 accountFromDisk。
   */
  private async readAccount(): Promise<{ account: MomoAccount | null; unreadable: boolean }> {
    const path = this.accountSidecarPath()
    let exists: boolean
    try {
      exists = await this.vault.adapter.exists(path)
    } catch (e) {
      console.debug('[Momo] 账号 sidecar 存在性检查失败，按「读不到」处理', e)
      return { account: null, unreadable: true }
    }
    if (!exists) return { account: null, unreadable: false }
    let raw: string
    try {
      raw = await this.vault.adapter.read(path)
    } catch (e) {
      // 读 IO 失败：**不等于未登录**。旧实现一律返回 null，迁移分支据此 persistAccount
      // 的「null=删文件」把真实 token 删掉，并把 data.json 的 account 段一并擦除——不可逆。
      console.error('[Momo] 账号 sidecar 读取失败，按「不可读」处理（跳过搬迁写盘）', e)
      return { account: null, unreadable: true }
    }
    try {
      // 读到了：JSON 坏 = 确认是空（可搬迁擦除），不是「读不到」
      return { account: accountFromDisk(JSON.parse(raw) as unknown), unreadable: false }
    } catch (e) {
      console.debug('[Momo] 账号 sidecar JSON 坏，按未登录处理', e)
      return { account: null, unreadable: false }
    }
  }

  /**
   * 写账号段（登录 / 刷新 / 退出登录都走它；当前调用方只有 init 的 v3 搬迁，
   * P4 登录流程接上）。null = **删文件**（不是写空文件——盘上「没有这个文件」
   * 与「未登录」必须同一种形态，与 v2 时 data.json 丢 account 键同口径）。
   * 与 persist 分工：那条写 data.json（快照里没有 account），这条写 sidecar。
   */
  async persistAccount(): Promise<void> {
    const path = this.accountSidecarPath()
    if (this.account === null) {
      if (await this.vault.adapter.exists(path)) await this.vault.adapter.remove(path)
      return
    }
    await this.vault.adapter.write(path, serializeAccount(this.account))
  }

  /** 归一化后的目录布局（判定函数的入参；每次现算，全是字符串拼接，可忽略） */
  private layout(): MomoLayout {
    return this.layoutOf(this.settings)
  }

  /** 同一套布局、显式传入 settings——「合并 patch 之后会长什么样」要用
   *  （notesRelocation 数影响面、migrateNotes 定搬迁目标，都靠合并**后**的布局） */
  private layoutOf(s: MomoSettings): MomoLayout {
    return {
      rootPath: normalizePath(s.root),
      notesPath: normalizePath(`${s.root}/${s.notesDir}`),
      attachmentsPath: normalizePath(`${s.root}/${s.attachmentsDir}`),
      trashFolderPath: normalizePath(`${s.root}/${s.trashDir}`),
      draftPath: normalizePath(`${s.root}/draft.md`),
      cloudIndexPath: normalizePath(`${s.root}/${CLOUD_INDEX_FILE}`),
    }
  }

  /** 小记 = 直接位于 root 的 md（旧平铺）或 notes 目录下的 md（新布局） */
  isMomoFile(file: TAbstractFile): file is TFile {
    return this.isMomoFileIn(file, this.layout())
  }

  /** BUG-68b：循环内 layout 是常量——调用方提出循环外复用，别让每个文件现算
   *  一次（layout() 里 6 个 normalizePath，几千条时一次刷新数万次纯字符串归一）。 */
  private isMomoFileIn(file: TAbstractFile, layout: MomoLayout): file is TFile {
    if (!(file instanceof TFile) || file.extension !== 'md') return false
    return isMomoMdPath(file.path, layout)
  }

  /** 根目录缺失 → 提示重建，不静默写散文件（contract-momo-storage 校验点） */
  rootExists(): boolean {
    const folder = this.vault.getAbstractFileByPath(this.rootPath())
    return folder instanceof TFolder
  }

  async ensureRoot(): Promise<void> {
    // 容错：目录已存在/索引未就绪导致的「already exists」一律忽略，不阻塞加载
    for (const path of [
      this.rootPath(),
      this.notesPath(),
      this.attachmentsPath(),
      this.trashFolderPath(),
    ]) {
      if (!this.vault.getAbstractFileByPath(path)) {
        try {
          await this.vault.createFolder(path)
        } catch {
          // ignore
        }
      }
    }
  }

  // ---- 索引 ----

  async reindex(): Promise<void> {
    this.emit()
  }

  /** 现读现解析：全部 Momo（不含回收、不含草稿），按 createdAt 倒序。
   *
   * **增量**（2026-09-19）：索引缓存按 path 保留上次解析结果与当时的 mtime/size，
   * 只有 `mtime` 或 `size` 变了的文件才重读。旧的实现每次刷新都把全库 md
   * 重新 cachedRead + 重新解析，几千条时会明显卡（尤其「逐键自动写盘」让 modify
   * 事件很密），而且每次都造出全新对象 → React 侧每张卡片都重挂 MarkdownRenderer。
   * 缓存命中时返回**同一个对象**，配合 Card 的 memo，未变卡片完全不重渲染。
   *
   * 读失败的文件**不入缓存**（下次刷新会重试），且只丢它自己、不炸整轮刷新。
   *
   * **在途合并**（N17）：两个面板 / 启动加载并发首次拉列表时，扫描与读盘只跑
   * 一轮（在途调用挂到同一个 Promise 上）。只合并在途窗口，结束后不缓存结果——
   * 缓存只会让改动迟迟不出现，而条目引用守卫本来就归 store.refresh 管。
   */
  async listEntries(): Promise<MomoEntry[]> {
    return this.listGate.run(() => this.listEntriesRun())
  }

  private async listEntriesRun(): Promise<MomoEntry[]> {
    if (!this.rootExists()) {
      if (this.index.size > 0) this.index.clear()
      return []
    }
    const layout = this.layout()
    const files = this.vault.getMarkdownFiles().filter((f) => this.isMomoFileIn(f, layout))

    const seen = new Set<string>()
    const pending: TFile[] = []
    for (const f of files) {
      seen.add(f.path)
      const hit = this.index.get(f.path)
      if (hit && hit.mtime === f.stat.mtime && hit.size === f.stat.size) continue
      pending.push(f)
    }
    // 已消失 / 不再是 Momo 的路径：清出缓存
    for (const path of [...this.index.keys()]) {
      if (!seen.has(path)) this.index.delete(path)
    }

    if (pending.length > 0) {
      const read = await Promise.all(
        pending.map(async (f) => {
          try {
            return { path: f.path, mtime: f.stat.mtime, size: f.stat.size, entry: await this.readEntry(f) }
          } catch (e) {
            console.error(`[Momo] 读取 Momo 失败，已跳过：${f.path}`, e)
            return null // 不入缓存 → 下次刷新重试
          }
        }),
      )
      for (const r of read) {
        if (r) this.index.set(r.path, { mtime: r.mtime, size: r.size, entry: r.entry })
      }
    }

    const entries: MomoEntry[] = []
    for (const f of files) {
      const hit = this.index.get(f.path)
      if (hit?.entry) entries.push(hit.entry)
    }
    entries.sort((a, b) => compareTimeKey(b.createdAt, a.createdAt))
    return entries
  }

  /** 回收目录里的 md 文件名（列表 / 全部恢复 / 清空共用；不读内容） */
  private trashNames(): string[] {
    const folder = this.vault.getAbstractFileByPath(this.trashFolderPath())
    return folder instanceof TFolder
      ? folder.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'md').map((c) => c.name)
      : []
  }

  /**
   * 回收站目录里的 md 每行一条（v0.9.26 起带**完整索引投影** `entry`）。
   * 回收站行要按正常卡片渲染——正文 / 标签 / 日期全读盘，与列表里的卡片同一套口径，
   * 筛选（搜索 / 标签 / 热力图选日）因此能原样作用于它，见 trash/Trash.tsx 的 matchEntries 链路。
   * `entry.path` 是**回收目录内**的路径（恢复 / 彻底删除都仍按 `name` 递）。
   */
  async listTrash(): Promise<TrashItem[]> {
    const names = this.trashNames()
    // 已不在回收目录的条目：缓存跟着清（否则只增不减；目录设置变化时整表已清）
    if (this.trashCache.size > names.length) {
      const alive = new Set(names)
      for (const name of [...this.trashCache.keys()]) if (!alive.has(name)) this.trashCache.delete(name)
    }
    return Promise.all(
      names.map(async (name) => {
        const file = this.vault.getAbstractFileByPath(this.trashPath(name))
        return {
          name,
          record: this.data.trash[name] ?? ({ originalPath: '', deletedAt: '' } as TrashRecord),
          entry: file instanceof TFile
            ? await this.readTrashEntryCached(name, file)
            : emptyTrashEntry(this.trashPath(name), undefined, this.data.trash[name]?.deletedAt),
        }
      }),
    )
  }

  /**
   * 回收站条目的缓存读：mtime/size 都没变就还回**同一个 entry 对象**（N02 引用守卫的地基）。
   *
   * 两条纪律（BUG-95，与 `listEntriesRun` 的快照同一条）：
   * - **缓存键在读盘之前取住**：await 期间文件可能被改写，读完之后再取 stat 会把
   *   「新 mtime + 旧正文」封进缓存，永远命不中重读；
   * - **读失败的结果不入缓存**：降级占位（`readFailed`）只服务这一轮渲染，下一轮
   *   刷新必须重读——否则一次 EBUSY 之后这张卡片永远显示「读不到正文」。
   */
  private async readTrashEntryCached(name: string, file: TFile): Promise<MomoEntry> {
    const hit = this.trashCache.get(name)
    const mtime = file.stat.mtime
    const size = file.stat.size
    if (hit && hit.mtime === mtime && hit.size === size) return hit.entry
    try {
      const entry = await this.readTrashEntry(file)
      this.trashCache.set(name, { mtime, size, entry })
      return entry
    } catch (e) {
      console.error(`[Momo] 读取回收站条目失败，本条不入缓存、下次刷新重试：${file.path}`, e)
      return emptyTrashEntry(file.path, { ctime: file.stat.ctime, mtime })
    }
  }

  /**
   * 回收站条目的索引投影：与 `readEntry` 同一套取材（T2 起走 `projectEntry` 一处），
   * 两处口径**刻意不同**：
   * - 不跳过空白条目、不跳过草稿——删都删了，回收站要原样渲染，空文件也得能恢复；
   * - `path` 是回收目录内的路径（卡片点击「在 Obsidian 中打开」开的就是它）。
   * 读失败**原样上抛**（BUG-95）：吞掉异常会把失败伪装成空正文并随缓存落定，
   * 降级占位与「不入缓存、下轮重试」的决定归 `readTrashEntryCached`。
   */
  private async readTrashEntry(file: TFile): Promise<MomoEntry> {
    const p = projectEntry(file, await this.vault.cachedRead(file))
    return {
      path: file.path,
      name: file.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      backfilled: p.backfilled,
      scheduled: p.scheduled,
      tags: p.tags,
      locations: p.locations,
      content: p.content,
    }
  }

  private async readEntry(file: TFile): Promise<MomoEntry | null> {
    const raw = await this.vault.cachedRead(file)
    const p = projectEntry(file, raw)
    if (isDraftFlag(p.frontmatter.draft)) return null
    // 空 Momo 不进索引：发布框与「新建 Momo」都是「先建文件 → 在原生编辑器里写」，
    // 用户没写就关掉标签页时不该在列表里留一张空卡片（一旦写了内容或标签就会自然出现）。
    // 地点也算「写过的痕迹」（BUG-172）：只填属性面板的笔记同样不该消失。
    if (isBlankEntry(p.content, p.tags, p.locations)) return null
    return {
      path: file.path,
      name: file.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      backfilled: p.backfilled,
      scheduled: p.scheduled,
      tags: p.tags,
      locations: p.locations,
      content: p.content,
    }
  }

  // ---- 新建 / 文件名 ----

  /**
   * 文件名 YYYY-MM-DD-HHmmss.md，重名追加序号（contract-momo-storage）。
   * `taken` = 已落盘文件之外还要避开的名字集合（D-07：同秒在途创建已占的名字）。
   */
  fileNameFor(createdAt: Date, taken?: ReadonlySet<string>): string {
    const base = fileStamp(createdAt)
    let name = `${base}.md`
    let i = 2
    while (
      this.vault.getAbstractFileByPath(normalizePath(`${this.notesPath()}/${name}`)) ||
      taken?.has(name)
    ) {
      name = `${base}-${i}.md`
      i++
    }
    return name
  }

  /**
   * 新建 Momo：写 frontmatter(createdAt/tags/locations) + 正文，返回文件。
   *
   * `at` 缺省 = 现在（老路径逐字节不变：文件名 / createdAt / 并发去重全走原地）。
   * 传入 = **时间位移**到那一刻：文件名与 frontmatter 的 `createdAt` 都取它，
   * 于是 `dayKey(createdAt)` 落在 `at` 的本地日历日（WO-1 口径）。时间位移有两个
   * 方向，痕迹字段也因此有两个（都只是「这条是哪条路建出来的」的回答，见
   * `types/entry.ts`）：
   * - `at` 的本地日在今天及以前 → `backfilled: true`（补记到过去）
   * - `at` 的本地日在今天之后 → `scheduled: true`（写到未来）
   *
   * 调用方负责把 `at` 造在目标本地日的安全时刻——用 `dayMoment(day)`
   * （本地中午，翻不过日界）；别传 0 点前后的时刻。
   *
   * `locations: []` 那行由 `prefs.newNoteLocations` 决定（v0.9.28 起默认开，
   * 设置页「地点」卡可关）：开 = 每篇新笔记都带着空地点字段，Obsidian 属性面板
   * 点开就能填；关 = 与之前逐字节一致（只有真用过地点的笔记才有这个键）。
   * 开与关读侧零差异——`locationsOf` 对缺省与空数组一视同仁（momo/locations/locations.ts）。
   */
  async create(content: string, tags: string[], at?: Date): Promise<TFile> {
    await this.ensureRoot()
    // D-07：同秒并发创建会撞名。fileNameFor 只查**已落盘**的文件，而它与
    // vault.create 之间有 await（这个函数自己还先 await ensureRoot()），
    // 连点两次 Ribbon 时两个调用都在对方落盘前算出同一个文件名，第二次
    // vault.create 抛 "File already exists"——用户看到「点了两下，第二下报错」。
    // 这里把「这一秒已经占了哪些名字」也记进在途表：已被占的名字直接跳过。
    // 补记同一天两条同理：两个并发都在对方落盘前算出同一个 120000 文件名，
    // 靠的也是这张在途表。
    const when = at ?? new Date()
    const name = this.fileNameFor(when)
    const finalName = this.reserving.has(name) ? this.fileNameFor(when, this.reserving) : name
    this.reserving.add(finalName)
    // 时间位移痕迹：传了 at 就在 frontmatter 落一道痕（与 sourceId 同属
    // 「用户/系统痕迹」——列表、将来的统计、卡片上的标记都靠它认出这条是哪条路
    // 建出来的；草稿清扫也据此放行，见 sweepOneDraft）。补到过去写 backfilled、
    // 写到未来写 scheduled，按 at 的本地日与今天的先后判定（补记选今天而现在是
    // 上午 = 那天不是未来，仍是 backfilled）。不传 at 的普通新建不带痕迹字段
    // （唯一的例外是下面那行空 locations，它由 pref 决定、且读侧认不认都一样）。
    const fields: Record<string, string | string[]> = { createdAt: when.toISOString(), tags: normalizeTags(tags) }
    // 空 locations 字段（v0.9.28，默认开）：排在 tags 之后、痕迹字段之前——
    // 与盘上既有的字段顺序一致（createdAt / tags / locations），diff 好看。
    // 读侧不依赖它（缺省也等于空数组），纯粹是给用户在新笔记里一个直接填地点的入口。
    if (this.data.prefs.newNoteLocations) fields.locations = []
    if (at !== undefined) {
      const trace = dayKey(when.toISOString()) > localDay(new Date()) ? 'scheduled' : 'backfilled'
      fields[trace] = 'true'
    }
    try {
      const file = await this.vault.create(
        normalizePath(`${this.notesPath()}/${finalName}`),
        buildFrontmatter(fields) + content,
      )
      return file
    } finally {
      // 无论成败都让出名字：失败的调用不该把这一秒的名字永久占住
      this.reserving.delete(finalName)
    }
  }

  /** 单个文件是不是「新建即弃」的空白草稿；是则移进系统回收站并返回 true。
   *  读-判-移都可能抛（并发删除 / 权限），由调用方统一 try 住。 */
  private async sweepOneDraft(file: TFile): Promise<boolean> {
    if (this.leavesShowing(file.path).length > 0) return false
    const raw = await this.vault.cachedRead(file)
    const { frontmatter, content } = splitFrontmatter(raw)
    if (isDraftFlag(frontmatter.draft)) return false
    // 地点也算痕迹（BUG-172）：只填属性面板、正文空、无标签的笔记不是「新建即弃」
    if (!isBlankEntry(content, tagsOf(frontmatter, content), locationsOf(frontmatter))) return false
    // 有 sourceId 等用户/系统痕迹的不算空白，只清「新建即弃」的文件
    if (frontmatter.sourceId !== undefined) return false
    // 同理放行时间位移文件：用户是显式选了一个日子才建它的（create(at)），
    // 当时没写内容不该让它在某次启动时被静默扫走——那等于用户选的日子白选了。
    // 补记（backfilled）与预写（scheduled）两条路都放行。
    if (frontmatter.backfilled !== undefined) return false
    if (frontmatter.scheduled !== undefined) return false
    await this.vault.trash(file, true)
    return true
  }

  /**
   * 启动清扫空白草稿（时机 A）：「写点什么…」是先建文件再打开编辑器，
   * 用户没写就关掉标签页时文件会留在 vault 里。启动时把这类从未写过的
   * 空文件移进系统回收站（vault.trash，不进 Momo 回收站列表——那里
   * 登记的是用户删除的 Momo）；正在打开的文件不动，清了才提示。
   */
  private async sweepEmptyDrafts(): Promise<number> {
    if (!this.rootExists()) return 0
    const layout = this.layout()
    const files = this.vault.getMarkdownFiles().filter((f) => this.isMomoFileIn(f, layout))
    let n = 0
    for (const file of files) {
      // N07：读盘（cachedRead）原来在 try 外——文件被并发删掉/读权限不足时
      // 整轮清扫半途而废，剩下的空白草稿留在库里，rejection 还没人接。
      // 一个文件失败只跳过它。
      try {
        if (await this.sweepOneDraft(file)) n++
      } catch (e) {
        console.error(`[Momo] 清理空白草稿失败：${file.path}`, e)
      }
    }
    if (n > 0) {
      // 静默清理：不再弹出黑底白字提醒
    }
    return n
  }

  /** 就地编辑写回：保留 frontmatter**全部字段**（含用户自定义字段），仅替换正文。
   *  与 removeTags/retag 同一手法：正文的读-判-写都在 process 内对现读内容做，判定与写入同源；
   *  正文未变时原样返回，Obsidian 不落盘（不顶 mtime、不触发整库重读）。 */
  async saveEntry(path: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path)
    // 编辑中途文件被外部删除 / 手动改名：`return` 会让调用方误以为「保存成功」——
    // 无 Notice、无抛错，用户以为改上了实际落空（B 系列复查）。这里抛错，由 caps 层
    // 统一 Notice + rethrow，调用方决定是否重试。
    if (!(file instanceof TFile)) throw new Error(copy.errors.fileGone(path))
    // splitFrontmatter 的 prefix 就是「正文前的全部字节」（含围栏）：换正文按前缀拼。
    // BUG-130e：旧实现 `raw.slice(0, raw.length - old.length)` 是尾切片，隐含「围栏已被
    // 换行终止」——文件以 `---` 收尾且无尾随换行时 content 为 ''，拼出 `---新正文`
    // （闭合围栏与正文粘连，整块 frontmatter 不再被识别，tags / createdAt 全丢）。
    await this.vault.process(file, (raw) => {
      const { content: old, prefix } = splitFrontmatter(raw)
      if (old === content) return raw
      return prefix + content
    })
  }

  /**
   * 标签改写的公共一步：`vault.process` 里改正文行内 `#标签`，命中才再走一次
   * `processFrontMatter` 改 frontmatter（其它字段原样保留）。
   * removeTags / retag 共用——两步之间只剩毫秒级窗口，那毫秒里恰好补打的标签
   * 留待下次改名（旧实现是整库扫描期间都不防）。
   */
  private async rewriteTagsInFile(
    file: TFile,
    map: (raw: string) => string | null,
  ): Promise<{ updated: boolean }> {
    let fmNeedsRewrite = false
    let contentRewritten = false
    // 正文的读-判-写都在 process 内对**现读内容**做，判定与写入同源、
    // 无「读了旧内容再决定改不改」的窗口；未命中时原样返回（Obsidian 的 process
    // 对原样返回不落盘，不会无谓顶新 mtime 触发整库重读）。
    await this.vault.process(file, (raw) => {
      const { frontmatter, content, prefix } = splitFrontmatter(raw)
      const fmTags = fmTagList(frontmatter)
      fmNeedsRewrite = fmTags.some((t) => map(t) !== null)
      const rewritten = rewriteInlineTags(content, map)
      if (rewritten === content) return raw
      contentRewritten = true
      // splitFrontmatter 的 prefix 就是「正文前的全部字节」（含围栏）：按前缀拼，
      // 不靠尾切片（BUG-130e：围栏无尾随换行时尾切片会粘连）。
      return prefix + rewritten
    })
    if (fmNeedsRewrite) {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm.tags = remapFmTags(fmTagList(fm), map)
      })
    }
    return { updated: contentRewritten || fmNeedsRewrite }
  }

  /**
   * 批量添加标签（多选工具栏「添加标签」，concept-momo-tags §批量添加）：
   * - **只写 frontmatter `tags`**，正文一个字节都不动（行内 `#标签` 是用户自己写的，插件不改）。
   * - 经 `app.fileManager.processFrontMatter()`（Obsidian 官方 YAML 通道）：createdAt / sourceId /
   *   用户自定义字段原样保留；新标签追加在已有 tags 之后，保留原有顺序与大小写。
   * - **并集身份键去重**：Momo 已经含该标签——无论来自正文行内还是 frontmatter——就跳过该条、
   *   一个字节都不写（既不制造同义重复 chip，也不制造无意义 diff）。
   * - 串行执行，**单条失败不中断**（非破坏性操作，一条失败不该拦住其余 N−1 条；
   *   与批量删除的「单个失败即停」刻意不同，见 docs/requirements/overview.md §6/§9）。
   */
  async addTags(paths: readonly string[], tags: readonly string[]): Promise<AddTagsResult> {
    const result: AddTagsResult = { updated: 0, skipped: 0, failed: 0 }
    const add = normalizeTags(tags)
    if (add.length === 0) return result

    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path)
      if (!(file instanceof TFile)) {
        result.failed++
        continue
      }
      try {
        // 现读现判：已有标签 = 行内 ∪ frontmatter（与索引口径一致），已含就不写盘
        const raw = await this.vault.cachedRead(file)
        const { frontmatter, content } = splitFrontmatter(raw)
        const existing = new Set(tagsOf(frontmatter, content).map(tagKey))
        const missing = add.filter((t) => !existing.has(tagKey(t)))
        if (missing.length === 0) {
          result.skipped++
          continue
        }
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          // 只追加：盘上既有项原样搬运（BUG-116b——读侧的 normalizeTags 不是写侧的删除授权，
          // 整份过一遍会把 `2024` 这类非法项、`Note`/`note` 大小写重复项连坐删掉）。
          // missing 已按「行内 ∪ frontmatter」身份键去过重，追加不会制造同义重复。
          fm.tags = [...fmTagList(fm), ...missing]
        })
        result.updated++
      } catch (e) {
        // 单条失败不中断：计数后继续，由 caps 层汇总成一条 Notice
        result.failed++
        console.error(`[Momo] 添加标签失败：${path}`, e)
      }
    }
    return result
  }

  /**
   * 批量移除标签（多选工具栏「去标签」，2026-09-22）：
   * 从**给定的这批路径**里摘掉指定标签（精确身份键匹配，不连带子标签）。
   *
   * 与 addTags 的三点刻意不同，都是「移除」本身的语义决定的：
   * - **两处一起改**：frontmatter `tags` **与**正文行内 `#标签`。添加只落 frontmatter 就够了
   *   （标签全集是「行内 ∪ frontmatter」的并集，追加一处即可生效）；移除只改一处的话，
   *   另一处会把标签读回来——「删了却还显示」。这条与 renameTag / deleteTag 同口径。
   * - **只作用于传入的路径**（addTags 也一样，但这里更容易被误解）：它不是 deleteTag，
   *   不会去动没选中的 Momo。
   * - **精确匹配，不级联**：摘 `读书` 不会顺手摘掉 `读书/小说`（同 deleteTag）。
   *   反过来也成立：只打 `读书/小说` 的 Momo 里没有 `读书`，所以这条不会被改动。
   *
   * 串行、**单条失败不中断**（与 addTags / retag 同取）；`skipped` = 一个待移除标签都没有的条数。
   */
  async removeTags(paths: readonly string[], tags: readonly string[]): Promise<RemoveTagsResult> {
    const result: RemoveTagsResult = { updated: 0, skipped: 0, failed: 0 }
    const kill = normalizeTags(tags)
    if (kill.length === 0) return result
    // 身份键集合：比较一律走 tagKey（大小写只影响显示，见 ADR-004）
    const killKeys = new Set(kill.map(tagKey))
    // map 的两种返回正是 rewriteInlineTags 的契约：'' = 删掉这个 token，null = 与它无关
    // frontmatter 项可能带 `#`（手写 `"#读书"`），与读侧同口径剥掉再比（BUG-116c 同族）
    const map = (raw: string): string | null => (killKeys.has(tagKey(raw.trim().replace(/^#+/, ''))) ? '' : null)

    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path)
      if (!(file instanceof TFile)) {
        result.failed++
        continue
      }
      try {
        const { updated } = await this.rewriteTagsInFile(file, map)
        if (updated) result.updated++
        else result.skipped++
      } catch (e) {
        // 单条失败不中断：计数后继续，由 caps 层汇总成一条 Notice
        result.failed++
        console.error(`[Momo] 移除标签失败：${path}`, e)
      }
    }
    return result
  }

  /**
   * 批量添加地点（多选工具栏「设地点」的追加态，F1 一期）：
   * - **只写 frontmatter `locations`**，正文一个字节都不动（地点没有行内形态，
   *   不像 #标签 能写在正文里——见 momo/locations/locations.ts 的存储口径）。
   * - 经 `app.fileManager.processFrontMatter()`：createdAt / tags / 用户自定义字段
   *   原样保留；新地点追加在已有 locations 之后，保留原有顺序（用户可预判 diff）。
   * - **去重按身份**（canonicalLocName，BUG-110a：纽约 / New York 两种写法是同一
   *   处地点）：Momo 已含该处就跳过该条、一个字节都不写。上限（8 个）也按身份数。
   * - **只加不减**：接手的数组里已有项一律原样写回（`addLocationsTo`）。读侧的
   *   `normalizeLocations` 会丢掉超 20 字的、非字符串的、第 9 个往后的项——那是
   *   「看不见」的口径；写侧借它重写一遍就等于把用户手写的内容从盘上删掉。
   *   读侧已满 8 个时这一次就不写（skipped），而不是把数组截到 8。
   * - 串行执行，**单条失败不中断**（与 addTags / removeTags 完全同一套纪律）。
   */
  async addLocations(paths: readonly string[], locations: readonly string[]): Promise<AddLocationsResult> {
    const result: AddLocationsResult = { updated: 0, skipped: 0, failed: 0 }
    const add = normalizeLocations(locations)
    if (add.length === 0) return result

    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path)
      if (!(file instanceof TFile)) {
        result.failed++
        continue
      }
      try {
        // 现读现判：已有地点 = frontmatter locations 的归一 + 身份结果（与索引口径一致），
        // 已含就不写盘（读到的脏值顺带被归一掉，与 removeTags 的 fm 重写同行为）。
        const raw = await this.vault.cachedRead(file)
        const { frontmatter } = splitFrontmatter(raw)
        const existing = locationsOf(frontmatter)
        // 读侧（身份数）已满 8 个：加不进去（也不许借这次机会把盘上内容改成 8 个）——
        // 计 skipped，让 caps 层弹出「跳过 N 条」而不是假装改过
        if (existing.length >= LOCATIONS_MAX) {
          result.skipped++
          continue
        }
        const missing = add.filter((l) => !existing.includes(canonicalLocName(l)))
        if (missing.length === 0) {
          result.skipped++
          continue
        }
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          // **只追加**：已有项（超 20 字的、非字符串的、第 9 个往后的）原样写回。
          // 这里若改成 normalizeLocations（读侧口径）就会把用户手写的内容删掉——
          // 读侧限额是「看不见」的口径，不是写侧的删除授权（见 locations/locations.ts 的
          // locListOf 注释）。上限只限制「这次还能不能加进去」。
          fm.locations = addLocationsTo(fm.locations, missing)
        })
        result.updated++
      } catch (e) {
        // 单条失败不中断：计数后继续，由 caps 层汇总成一条 Notice
        result.failed++
        console.error(`[Momo] 添加地点失败：${path}`, e)
      }
    }
    return result
  }

  /**
   * 批量移除地点（多选工具栏「设地点」的移除态，F1 一期）：
   * 从**给定的这批路径**里摘掉指定地点（**按身份**匹配，BUG-110a：点名「纽约」时
   * 盘上的「New York」同去，不许留下幽灵 pill；不级联——地点本来是平铺字符串，
   * 没有「父地点 / 子地点」可连带）。
   *
   * 与 addLocations 的三点刻意不同，都是「移除」本身的语义决定的：
   * - 写入前同样**现读现判**（cachedRead → splitFrontmatter → locationsOf），
   *   没有可移除地点的条目不调 processFrontMatter，避免无谓顶新 mtime 触发整库重读；
   * - 移除后为空数组时**保留 `locations: []` 键**（与 removeTags 清空 tags 同口径：
   *   删键会让 Obsidian 的 frontmatter 编辑器少一行，序列化形状随活跃度漂移）；
   * - skipped = 一个待移除地点都没有的条数（UI 摘要「无需改动」的来源）；
   * - **只摘点名的那几个**（`removeLocationsFrom`）：盘上别的项——超 20 字的、
   *   非字符串的、读侧看不见的第 9 个往后——原样留着，不借这次机会净化掉。
   *
   * 串行、单条失败不中断（与 addLocations / addTags / removeTags 同取）。
   */
  async removeLocations(paths: readonly string[], locations: readonly string[]): Promise<RemoveLocationsResult> {
    const result: RemoveLocationsResult = { updated: 0, skipped: 0, failed: 0 }
    const kill = normalizeLocations(locations)
    if (kill.length === 0) return result
    const killIds = new Set(kill.map((l) => canonicalLocName(l)).filter((id) => id !== ''))

    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path)
      if (!(file instanceof TFile)) {
        result.failed++
        continue
      }
      try {
        const raw = await this.vault.cachedRead(file)
        const { frontmatter } = splitFrontmatter(raw)
        const cur = locationsOf(frontmatter)
        const next = cur.filter((l) => !killIds.has(l))
        if (next.length === cur.length) {
          result.skipped++
          continue
        }
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          // 以写入时刻的现读值再算一次（两次读之间用户可能刚动过前端），
          // 同样**只摘点名的那几个**：盘上别的项（超长 / 非字符串 / 第 9 个往后）原样留着
          fm.locations = removeLocationsFrom(fm.locations, kill)
        })
        result.updated++
      } catch (e) {
        // 单条失败不中断：计数后继续，由 caps 层汇总成一条 Notice
        result.failed++
        console.error(`[Momo] 移除地点失败：${path}`, e)
      }
    }
    return result
  }

  /**
   * 标签改名 / 合并（读取侧维护，concept-momo-tags §标签管理）：
   * 把 `from` 及其**整棵子树**改写为 `to`（`读书/小说` → `阅读/小说`）；
   * 命中文件同时改 frontmatter `tags` 与正文行内 `#标签`——行内不改就会出现
   * 「改了却还显示」的错觉（Obsidian 自己的标签改名也是全库改写）。
   * 目标为空串 = 删除（见 deleteTag：只删精确匹配的那一个，不连带子标签）。
   */
  async renameTag(from: string, to: string): Promise<RetagResult> {
    const target = canonicalTagPath(to.trim().replace(/^#+/, ''))
    if (target && !isValidTag(target)) {
      throw new Error(copy.errors.invalidTag(to))
    }
    if (tagKey(from) === tagKey(target)) return { updated: 0, failed: 0 }
    // 文档约定（上方注释）：空串 = 只删精确匹配那一个标签（与 deleteTag 同口径），
    // 不连带子标签。非空目标才整棵子树级联。
    return this.retag(from, target, target !== '')
  }

  /** 删除标签：只删**精确相同**的那一个（删父标签不连带子标签，与改名不同） */
  async deleteTag(tag: string): Promise<RetagResult> {
    return this.retag(tag, '', false)
  }

  /**
   * 修复失效标签：把标签里的空白**清掉**（全库唯一一种修法，见 tags/tagHealth.ts 的
   * 定义与取舍）。`targetKeys` 缺省 = 全库都修；给了就只修这几个身份键（行内「修复」）。
   *
   * 与 retag 同一套纪律与同一套写盘通道（rewriteTagsInFile → frontmatter 重写）：
   * - **正文行内一个字节都不动**。行内 `#标签` 的语法本身不含空白（tags/parse.ts 的
   *   `[^\s#]+` 遇到空白就收），所以含空白的标签只可能住在 frontmatter 里；map 对
   *   行内 token 一律返回 null，rewriteInlineTags 逐字保留。
   * - 修不了的一律跳过（squeezeTagSpace 返回 null，如 `19 84` → `1984` 纯数字）。
   *   这一条是**数据保护**：写侧 normalizeTags 会把非法标签整条丢掉，放它过去等于
   *   用户点一下按钮就静默丢标签。
   * - 用索引里已解析的 tags 预筛（D-08，同 retag）：全库修时预筛不省什么，但行内
   *   单条修只碰真正带它的笔记，几千条时差别很大。
   * - 串行、单条失败不中断；批量期间抑制 vault 事件，收尾由调用方 refresh 一次
   *   （同 renameTag / deleteTag 的 caps 收尾）。
   */
  async squeezeTagSpaces(targetKeys?: readonly string[]): Promise<RetagResult> {
    const result: RetagResult = { updated: 0, failed: 0 }
    const only = targetKeys ? new Set(targetKeys) : null
    const map = (raw: string): string | null => {
      if (!hasTagSpace(raw)) return null
      if (only && !only.has(tagKey(raw))) return null
      return squeezeTagSpace(raw)
    }
    const files: TFile[] = []
    const layout = this.layout()
    for (const f of this.vault.getMarkdownFiles()) {
      if (!this.isMomoFileIn(f, layout)) continue
      const hit = this.index.get(f.path)
      if (hit && hit.entry && hit.mtime === f.stat.mtime && hit.size === f.stat.size) {
        // 索引新鲜：标签里没有含空白的那一个 → 这个文件不可能被改写。
        // BUG-179a：entry===null（空白条目 vs 草稿）分不清，一律读一次（与 retag 同款）。
        if (!hit.entry.tags.some((t) => map(t) !== null)) continue
      }
      files.push(f)
    }
    this.beginQuiet()
    try {
      for (const file of files) {
        try {
          const { updated } = await this.rewriteTagsInFile(file, map)
          if (updated) result.updated++
        } catch (e) {
          result.failed++
          console.error(`[Momo] 修复失效标签失败：${file.path}`, e)
        }
      }
    } finally {
      this.endQuiet()
    }
    return result
  }

  /**
   * 标签改写的公共实现（renameTag / deleteTag 共用）：
   * - 每个文件一次原子的改写（见 `rewriteTagsInFile`）——两步之间只剩毫秒级窗口；
   * - 正文只替换命中的 `#标签` token，其余字节一个都不动（代码段不参与，见 tags/parse.ts）；
   * - 串行、单条失败不中断（与 addTags 同取），收尾由 caps 层全量 refresh 一次。
   *
   * D-08：先用**索引里已解析好的 tags** 预筛，只读可能命中的文件。旧实现对
   * `getMarkdownFiles()` 的每一条 Momo 都调 rewriteTagsInFile（先 cachedRead 再
   * 判要不要写），几千条时一次改名就是几千次串行读，且绝大多数文件与这个标签
   * 毫无关系。索引按 path + mtime/size 判新鲜（listEntriesRun 同一条口径），
   * 命中过缓存的条目 tags 就是盘上现状；未命中缓存的 파일 没有 tags 可判，
   * 只能保留「读一次看看」的旧路径（宁可多读几个，不能漏改一个）。
   */
  private async retag(from: string, to: string, cascade: boolean): Promise<RetagResult> {
    const result: RetagResult = { updated: 0, failed: 0 }
    const fromKey = tagKey(from)
    if (!fromKey) return result
    const map = (raw: string): string | null => remapTagPath(raw, from, to, cascade)
    const files: TFile[] = []
    const layout = this.layout()
    for (const f of this.vault.getMarkdownFiles()) {
      if (!this.isMomoFileIn(f, layout)) continue
      const hit = this.index.get(f.path)
      if (hit && hit.entry && hit.mtime === f.stat.mtime && hit.size === f.stat.size) {
        // 索引新鲜：标签都没提这个键（含层级子树）→ 这个文件不可能被改写。
        // BUG-179a：`hit.entry === null` 有两种含义——空白条目（真没标签）与**草稿**
        // （readEntry 对 `draft: true` 不索引，盘上仍可能带标签）——分不清就不许拿
        // 「无标签」跳过，必须走「读一次看看」的旧路径（D-08：宁可多读几个，不能漏改一个）。
        const related = hit.entry.tags.some((t) => tagKey(t) === fromKey || (cascade && tagKey(t).startsWith(fromKey + '/')))
        if (!related) continue
      }
      files.push(f)
    }
    this.beginQuiet()
    try {
      for (const file of files) {
        try {
          const { updated } = await this.rewriteTagsInFile(file, map)
          if (updated) result.updated++
        } catch (e) {
          result.failed++
          console.error(`[Momo] 标签改写失败：${file.path}`, e)
        }
      }
    } finally {
      this.endQuiet()
    }
    return result
  }

  /**
   * 附件写盘的**串行链**（BUG-68d 落地）。
   *
   * 此前 attachImage 没有任何生产调用方，撞名不可达，只在 docs 里记着一条
   * 「接入粘贴/拖放前先把它修好」。编辑器扩展接上之后这条立刻变成日常路径：
   * 一次粘三张、或连着粘两次，走的是三条**并发**的异步链，而文件名是
   * `Date.now()` + 查重现算的——同一毫秒里两个调用各自算出同一个
   * `IMG-<stamp>.png`，后一个 `createBinary` 抛 "File already exists"，
   * 用户看到的是「粘贴进去的图少了一张 / 报了个看不懂的错」。
   *
   * 两条防护缺一不可，理由与 saveBrandIconImage 那处一致：
   * ① 串行链——「算名字 + 查重 + 落盘」三步对所有调用者互斥，不存在两个调用
   *    同时停在同一步的场景；
   * ② 查重走 adapter 层——`createBinary` 返回时 vault **索引**未必已更新，拿
   *    `getAbstractFileByPath` 探会漏掉刚落盘的那一张，于是序号停在一个已被
   *    占用的名字上，下一个 createBinary 照样抛。探测与写入必须在同一层。
   *
   * 链节自带 catch：一节失败不把整条链永久毒死（与 writeChain 同一口径）。
   */
  private attachChain: Promise<unknown> = Promise.resolve()

  /** 图片落盘到附件目录，返回 vault 路径（标准 md 图片语法引用，不用 base64） */
  async attachImage(filename: string, data: ArrayBuffer): Promise<string> {
    const link = this.attachChain.then(() => this.attachImageNow(filename, data))
    this.attachChain = link.catch((e: unknown) => {
      console.debug('[momo] 附件写入失败，写链已恢复，后续附件照常排队', e)
    })
    return link
  }

  /** attachImage 的本体（已在串行链上跑，调用方不要直接调） */
  private async attachImageNow(filename: string, data: ArrayBuffer): Promise<string> {
    await this.ensureRoot()
    // D-13：扩展名直接取用户文件名的话，粘个 a.exe 也能写进附件目录。白名单与
    // saveBrandIconImage 同一把尺子；查重与 fileNameFor / uniqueTrashName 同思路
    // （追加序号）。名字查重那一半见上方 attachChain 的注释（两层防护）。
    const rawExt = (filename.includes('.') ? filename.split('.').pop() : '') ?? ''
    const ext = BRAND_ICON_EXTS.includes(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'png'
    const stamp = Date.now()
    let name = `IMG-${stamp}.${ext}`
    let i = 2
    while (await this.vault.adapter.exists(normalizePath(`${this.attachmentsPath()}/${name}`))) {
      name = `IMG-${stamp}-${i}.${ext}`
      i++
    }
    const path = normalizePath(`${this.attachmentsPath()}/${name}`)
    await this.vault.createBinary(path, data)
    return path
  }

  /**
   * 写入用户上传的左上角图标（设置 → 界面外观 → 左上角图标）：落
   * `<root>/icons/brand-icon-<时间戳>.<ext>`，返回 vault 相对路径。
   * 调用方（设置页）把它追加进 prefs.brandIconImages 并把 brandIconImage
   * 指过去——「当前用哪张」是 pref 的事，写盘只负责「落一个不撞名的文件」。
   *
   * **v0.9.12 起多图，文件名带时间戳、不再覆盖** `brand-icon.<ext>`：用户要的
   * 是「传多张、想换就换」，覆盖写会让上一张无声消失（最初的反馈正是「上传图片
   * 后点其他图标，图片就消失了」的其中一半）。同一毫秒内两张重名时追加序号
   * （命名尺子与 attachImage 同；撞名探测走 adapter 层，见 while 处的理由）。
   * 旧文件不再由这里删——移除一张走
   * removeBrandIconImage（用户显式点的 ×），不上传就悄悄删上一个。
   *
   * 扩展名白名单在 types（BRAND_ICON_EXTS）；越界值由调用方（设置页）先拦，
   * 这里兜底回 png——service 不假设调用方守规矩。
   */
  async saveBrandIconImage(data: ArrayBuffer, ext: string): Promise<string> {
    await this.ensureRoot()
    const dir = this.iconsPath()
    if (!this.vault.getAbstractFileByPath(dir)) {
      try {
        await this.vault.createFolder(dir)
      } catch {
        // ignore：目录已存在 / 并发创建都算成功，下面的 writeBinary 才是判据
      }
    }
    const safeExt = BRAND_ICON_EXTS.includes(ext.toLowerCase()) ? ext.toLowerCase() : 'png'
    const stamp = Date.now()
    let name = `brand-icon-${stamp}.${safeExt}`
    let i = 2
    // 撞名探测走 adapter.exists 而不是 vault 索引：写盘用的 adapter.writeBinary 对
    // 已存在文件是**静默覆盖**（不像 vault.createBinary 会抛「File already exists」，
    // 那条路径上 attachImage 用索引探就够）。同一毫秒连传两张、第一张还没入索引时，
    // 按索引探会把第一张覆盖掉——探测与写入必须在同一层。
    while (await this.vault.adapter.exists(normalizePath(`${dir}/${name}`))) {
      name = `brand-icon-${stamp}-${i}.${safeExt}`
      i++
    }
    const path = normalizePath(`${dir}/${name}`)
    await this.vault.adapter.writeBinary(path, data)
    return path
  }

  /**
   * 读回某一档星球贴图六面的字节（v1.0.x）。顺序 = globePackCubeNames（px/nx/py/ny/pz/nz）。
   *
   * **为什么不再走资源 URL**（2026-10-13 用户现场，改前的实现）：贴图原先由
   * `caps.globeCubeUrls` 拼成 `resourcePathPrefix` 形式的 URL 交给 `<img>` 装载，而那个
   * URL 对文档（`app://obsidian.md`）是**跨源**的。`<img>` 不带 CORS 装载 → canvas 被标成
   * 「跨源污染」→ `globeTexture` 的 `getImageData` 抛 SecurityError → 六面全部解不出 →
   * 星球只剩「黑卡 + 说明条 + 下载资源包按钮」，而资源包其实早就装好了（13 件齐、字节
   * 逐字节对得上）：用户看到的是「下载了也没用」。改自己读字节后由 caps 包成 `blob:` URL
   * ——blob URL 与创建它的文档**同源**，画布不再被污染，也顺手免掉 Chromium 的资源缓存
   * （贴图那一路的内容指纹随之退役，`withAssetRev` 只剩 globe3d.js 的 `<script>` 一个消费者）。
   *
   * 缺件 / 权限异常一律 reject：调用方（GlobeStage 的 `.catch`）照旧报
   * `onTextureFailed(true)` 出说明条——那条口径不变。
   */
  async readGlobeCubeFaces(earth: GlobeEarth): Promise<ArrayBuffer[]> {
    const dir = this.pluginDir()
    const out: ArrayBuffer[] = []
    for (const name of globePackCubeNames(earth)) {
      out.push(await this.vault.adapter.readBinary(normalizePath(`${dir}/${name}`)))
    }
    return out
  }

  /**
   * 星球资源包的状态（v1.0.0）：装没装、记账的是哪个版本、缺哪些文件。
   * `installed` 只由「13 件文件齐不齐」判定（本地构建也会把它们直接铺进插件目录，
   * 那条路不经过下载）；`version` 是记账版本，'' = 没有记账（手动拷进来的完整包）。
   * `version` ≠ 当前插件版本时调用方提示重下——新 main.js 配旧 globe3d.js 是错配。
   */
  async globePackStatus(): Promise<{ installed: boolean; version: string; missing: string[] }> {
    const dir = this.pluginDir()
    const missing: string[] = []
    for (const name of globePackFileNames()) {
      if (!(await this.vault.adapter.exists(normalizePath(`${dir}/${name}`)))) missing.push(name)
    }
    let version = ''
    try {
      const raw = await this.vault.adapter.read(normalizePath(`${dir}/${GLOBE_PACK_MANIFEST_FILE}`))
      const j = JSON.parse(raw) as { version?: unknown }
      if (typeof j.version === 'string') version = j.version
    } catch {
      version = ''
    }
    return { installed: missing.length === 0, version, missing }
  }

  /**
   * 下载星球资源包（v1.0.0）。这是插件**唯一的联网动作**，且只在用户显式点击时发生。
   *
   * 逐件下 + 逐件校验（贴图查 PNG 魔数、三维库查工厂标记，见 globe/pack.ts）；任何
   * 一件不过关都记进 `failed`，**不写半包**——全部过关后才写记账文件 globe-pack.json。
   * 部分失败时已成功的件留在盘上（下次重下会覆盖），但这不算「装好」（记账文件不写）。
   */
  async downloadGlobePack(
    version: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ ok: boolean; failed: string[]; reason: GlobePackFailure }> {
    const dir = this.pluginDir()
    const names = globePackFileNames()
    const failed: string[] = []
    const kinds: GlobePackFailure[] = []
    if (!(await this.vault.adapter.exists(dir))) {
      try {
        await this.vault.adapter.mkdir(dir)
      } catch {
        // ignore：目录已存在 / 并发创建都算成功，下面的 writeBinary 才是判据
      }
    }
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!
      // 失败口径逐件定，取第一次失败的那档当整包口径（13 件同因时它就是代表）
      let kind: GlobePackFailure = 'network'
      try {
        const res = await requestUrl({ url: globePackUrl(version, name), method: 'GET' })
        if (res.status === 404) {
          kind = 'missing'
          throw new Error(`HTTP 404 (${name})`)
        }
        if (res.status !== 200) throw new Error(`HTTP ${res.status} (${name})`)
        const buf = res.arrayBuffer
        if (!isGlobePackFileValid(name, buf)) {
          kind = 'corrupt'
          throw new Error('globe pack: content check failed')
        }
        await this.vault.adapter.writeBinary(normalizePath(`${dir}/${name}`), buf)
      } catch (e) {
        kinds.push(kind)
        console.error('[Momo] 星球资源包下载失败', name, e)
        failed.push(name)
      }
      onProgress?.(i + 1, names.length)
    }
    if (failed.length === 0) {
      await this.vault.adapter.write(
        normalizePath(`${dir}/${GLOBE_PACK_MANIFEST_FILE}`),
        JSON.stringify({ version }),
      )
    }
    return { ok: failed.length === 0, failed, reason: kinds[0] ?? 'network' }
  }

  /**
   * 删除闸：这条路径是不是「上传图标」入口管得着的文件。两种情形放行：
   * ① 在**当前** `<root>/icons/` 里（原口径）；
   * ② 登记在 `prefs.brandIconImages` 里、且形状就是上传时 `saveBrandIconImage` 拼出来的那种
   *    （`…/icons/brand-icon-*.<白名单扩展名>`，过 sanitizeBrandIconImage 不变形）——
   *    BUG-118c：清单存的是**含上传当时 root** 的完整路径，用户改过 root 后只按当前 root
   *    现拼前缀，× 永远删不掉、清单与文件再无第二个入口。登记 + 形状双条件，不放开任意文件。
   */
  private ownsBrandIconPath(path: string): boolean {
    if (path.startsWith(`${this.iconsPath()}/`)) return true
    if (sanitizeBrandIconImage(path) !== path) return false
    if (!/(^|\/)icons\/brand-icon-[^/]+$/.test(path)) return false
    return this.data.prefs.brandIconImages.includes(path)
  }

  /**
   * 删掉一张上传的左上角图标（设置页格子角上那枚 × 调它）。闸只有一道：路径必须
   * 真在 `<root>/icons/` 里——这个目录整块归自定义图标管，别处的文件不从这个
   * 入口删。**不拿 prefs 清单当闸**：历史上调用方先收窄清单再来删，拿清单当
   * 判据等于永远删不掉（第一版就这样，× 点了只悄悄清 pref，盘上留死文件）。
   * BUG-80d 起调用方改为**先删成功再收窄清单**，这条历史仍值得记着——防止
   * 有人把闸改回清单。
   * BUG-80d：返回**是否真的删掉了**——旧实现失败只 debug、调用方无从得知，
   * 「点 ✕ 说删了其实还在」零反馈。删失败时调用方（LookTab）不动清单、行内
   * 红字说明，界面上看得见的和盘上的一致。路径不在 icons/ 下按「没删」处理。
   */
  async removeBrandIconImage(path: string): Promise<boolean> {
    if (!this.ownsBrandIconPath(path)) return false
    try {
      if (await this.vault.adapter.exists(path)) await this.vault.adapter.remove(path)
      return true
    } catch (e) {
      console.debug('[Momo] 上传的左上角图标删除失败', e)
      return false
    }
  }

  /** 打开文件进入 Obsidian 原生编辑器（就地编辑：原生 CodeMirror 即编辑器，不封装第二套）。
   *  三条行为约定（焦点不离开 Momo 面板是核心诉求）：
   *  ① 就地复用 —— 已有标签页在显示这个文件就不再新开（连点卡片 / 回顾里重复点同一条
   *     不会累积同名标签页），只把它显示到前台；
   *  ② 只追加新标签页 —— 没有现成标签页时用 getLeaf('tab')：在 root split（主区）当前的
   *     标签组里追加一格，连开多条也都在同一组分屏里，且不会顶掉侧边栏里的 Momo 面板；
   *  ③ 不抢焦点 —— openFile 传 active:false（不激活编辑器），显示到前台用 revealLeaf
   *     （它只切换显示、不夺键盘焦点），也不再调用 editor.focus()：输入焦点始终留在 Momo
   *     面板。新开时把光标落到 frontmatter 之后的第一行（正文开头），点进标签页即可续写。 */
  async openInEditor(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) return
    const workspace = this.app.workspace
    const existing = this.leavesShowing(path)[0]
    const leaf = existing ?? workspace.getLeaf('tab')
    // active:false：新标签页只出现在标签条并接管主区显示，键盘焦点原地不动
    // BUG-23：openFile / revealLeaf 的 rejection 也要接住——索引与盘之间有窗口
    // （getAbstractFileByPath 命中之后文件被同步删掉）、leaf 也可能刚被用户关掉。
    // 这条路是 caps 侧 `void` 调用的（caps.ts 的 openInEditor，没有 catch），漏出去就是
    // unhandled rejection：点开一张卡的同时文件被删，用户只会看到 console 里一行。
    try {
      await leaf.openFile(file, { active: false })
    } catch (e) {
      console.debug('[Momo] 打开文件失败（文件可能已被删除 / leaf 被关掉）', e)
      return
    }
    // 侧边栏 / 其他分栏 / 弹出窗口里的标签页也要带到前台；revealLeaf 只显示不夺焦
    try {
      await workspace.revealLeaf(leaf)
    } catch (e) {
      console.debug('[Momo] revealLeaf 失败（leaf 可能已被关掉）', e)
    }
    if (existing) return
    const view = leaf.view
    if (!(view instanceof MarkdownView)) return
    // BUG-23 的同一个形状：这条路是 caps 侧 void 调用的（caps.ts 的 openInEditor，没有 catch），
    // openFile 与 cachedRead 之间文件仍可能被删掉——读正文抛出来就是 unhandled
    // rejection。文件已经打开成功，光标落点不值得让它炸。
    let raw: string
    try {
      raw = await this.vault.cachedRead(file)
    } catch (e) {
      console.debug('[Momo] 读取正文失败（文件可能已被删除）', e)
      return
    }
    // frontmatter 占用的行数 = 原文行数 − 正文行数（splitFrontmatter 已剥掉围栏块）
    const { content } = splitFrontmatter(raw)
    const line = Math.max(0, raw.split('\n').length - content.split('\n').length)
    // openFile 返回 ≠ 编辑器已灌完内容（视图刚建 / 文件大时 CodeMirror 仍异步加载）：
    // 目标行还不存在时 setCursor 会被钳到文档末尾、光标落不到正文开头。轮询等目标行
    // 出现（≤2s），等不到就按现状落——不阻塞打开。
    // 兜底（2026-09-29 补，回归测试 scripts/service.open-in-editor.test.mts）：
    // 轮询期间用户把标签页关掉 → view.editor 变 null、已销毁的 editor 也会抛；
    // 这条路是 caps 侧 `void` 调用的（caps.ts 的 openInEditor，没有 catch），抛出来就是
    // unhandled rejection。文件已经打开成功，光标落点不值得让它炸——所以每轮
    // 重新取 editor、空就收工，整段再包一层 try。
    try {
      for (let i = 0; i < CURSOR_POLL_MAX; i++) {
        const editor = view.editor
        if (!editor || editor.lastLine() >= line) break
        await delay(CURSOR_POLL_MS)
      }
      view.editor?.setCursor({ line, ch: 0 })
    } catch (e) {
      console.debug('[Momo] 打开后落光标失败（标签页可能已关闭）', e)
    }
  }

  // ---- 回收（软删 / 恢复 / 彻底清除）----

  /** 回收目录里可用的文件名：已存在则追加 -1/-2…（与 restoreOne 的重名策略对称；工单 WO-2） */
  private uniqueTrashName(name: string): string {
    if (!this.vault.getAbstractFileByPath(this.trashPath(name))) return name
    const base = name.replace(/\.md$/, '')
    let i = 1
    while (this.vault.getAbstractFileByPath(this.trashPath(`${base}-${i}.md`))) i++
    return `${base}-${i}.md`
  }

  /** 正在显示某个文件的标签页：删除 / 移走后要一并关掉，否则标签会跟着文件跑到回收目录。
   *  必须在 rename / delete **之前**调用（之后路径已变，按原路径就找不到了）。 */
  private leavesShowing(path: string): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = []
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view
      if (view instanceof FileView && view.file?.path === path) leaves.push(leaf)
    })
    return leaves
  }

  /**
   * 批量软删（多选工具栏「删除到回收站」；单卡删除按钮传单元素数组走同一条路）：
   * 逐条 rename + 登记，data.json 收尾只落盘一次；批量期间抑制事件刷新（见 quiet），
   * 结束后由 caps 层做一次全量 refresh。保留「单个失败即停」语义（BUSINESS.md §4/§9，
   * 与批量加标签的「单条失败不中断」刻意不同）：某条 rename 抛错即中止，已完成的
   * 登记照常落盘，错误连同已删条数一起抛给 caps 层提示。
   * 返回**实际落盘的回收文件名列表**（供 caps 层做「一步撤销」，工单 WO-5）；重名自动 -1/-2…（WO-2）。
   */
  async trashMany(paths: readonly string[]): Promise<string[]> {
    const names: string[] = []
    this.beginQuiet()
    try {
      await this.ensureRoot()
      for (const path of paths) {
        const file = this.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile)) continue
        // 回收目录可能已有同名文件（历史平铺在根目录的文件与 notes/ 新文件可以同名，
        // fileNameFor 只查 notes/）→ 重名加 -1/-2…，否则 rename 会报错并让整批停在中途（工单 WO-2）
        const stored = this.uniqueTrashName(file.name)
        // 先记下打开着这条 Momo 的标签页（rename 之后 Obsidian 会把它们跟到 trash 目录）
        const openLeaves = this.leavesShowing(path)
        await this.vault.rename(file, this.trashPath(stored))
        this.data.trash[stored] = { originalPath: path, deletedAt: new Date().toISOString() }
        names.push(stored)
        for (const leaf of openLeaves) leaf.detach()
      }
    } catch (e) {
      throw new Error(
        copy.errors.deletePartial({ done: names.length, reason: errMsg(e) }),
      )
    } finally {
      this.endQuiet()
      // B08：登记必须落盘（否则重载后 listTrash 给空 originalPath，恢复回退 notes/，
      // 原路径元数据永久丢失）；但 persist 失败只提示，绝不覆盖「已删除 X 条，第 Y 条失败」
      if (names.length > 0) await this.persistBestEffort()
    }
    return names
  }

  /** 恢复单条：移回原路径（占用则加序号），无登记 / 原路径不可用回退 notes 目录。
   *  只就地清登记、不落盘，由调用方统一 persist（单条 / 全部恢复共用）。 */
  private async restoreOne(name: string): Promise<boolean> {
    const record = this.data.trash[name]
    const file = this.vault.getAbstractFileByPath(this.trashPath(name))
    if (!(file instanceof TFile)) {
      // 文件已不存在（手工删掉等）：清掉无文件的登记
      delete this.data.trash[name]
      return false
    }
    const fallback = normalizePath(`${this.notesPath()}/${name}`)
    const original = record?.originalPath
    const originalDir = original ? original.slice(0, original.lastIndexOf('/')) : ''
    // 原路径不可用（无登记 / 父目录已不存在）→ 回退 notes 目录
    let target =
      original &&
      originalDir &&
      this.vault.getAbstractFileByPath(originalDir) instanceof TFolder
        ? original
        : fallback
    if (this.vault.getAbstractFileByPath(target)) {
      // 原路径被占用 → 依次尝试 -1/-2/… 序号，直到可用（原来只试一次，重名会抛错）
      const base = target.replace(/\.md$/, '')
      let i = 1
      while (this.vault.getAbstractFileByPath(normalizePath(`${base}-${i}.md`))) i++
      target = normalizePath(`${base}-${i}.md`)
    }
    await this.vault.rename(file, target)
    delete this.data.trash[name]
    return true
  }

  /** 恢复：优先按登记原路径移回（占用则加序号），无登记/原路径占用回退 notes 目录，清除登记 */
  async restore(name: string): Promise<void> {
    // BUG-68a：与 trashMany 对齐——rename 的 vault 事件经 emitSoon 排 150ms 后
    // 自己刷新一次，caps 层收尾又显式 refresh 一次，单次恢复因此跑两轮
    // listEntries + listTrash。单条也进 quiet 窗口，事件全丢，只留 caps 那一次。
    this.beginQuiet()
    try {
      await this.restoreOne(name)
    } finally {
      this.endQuiet()
    }
    // BUG-179b：与 trashMany / restoreMany / purge / purgeAll 对齐走 best-effort——
    // 文件此刻已经移回原处，唯一还没落盘的是回收登记删除（自愈安全动作，下次启动
    // 会清悬空键）。旧实现的严格 persist 在 data.json 只读时会把这次成功报成
    // 「恢复失败」（Notice + 列表不刷新），反馈是错的。
    await this.persistBestEffort()
  }

  /** 全部恢复：逐条按 restore 规则移回，登记一次性落盘；返回实际恢复的文件数 */
  async restoreAll(): Promise<number> {
    return this.restoreMany(this.trashNames())
  }

  /**
   * 按名恢复一批（“删除后一步撤销”与“全部恢复”共用；工单 WO-5）：
   * 逐条按 restore 规则移回，登记一次性落盘。不存在的名字由 restoreOne 自行清登记。
   */
  async restoreMany(names: readonly string[]): Promise<number> {
    let n = 0
    this.beginQuiet()
    try {
      for (const name of names) {
        if (await this.restoreOne(name)) n++
      }
    } catch (e) {
      // B08：错误带成功计数——否则报错说「失败」但文件其实已移回，误导用户
      throw new Error(
        copy.errors.restorePartial({ done: n, reason: errMsg(e) }),
      )
    } finally {
      this.endQuiet()
      // B08：persist 从 try 外挪进 finally，且单独 try/catch——中途 rename 失败时
      // 已成功恢复的条目登记已落盘，内存与盘面不撕裂
      if (names.length > 0) await this.persistBestEffort()
    }
    return n
  }

  /** 彻底清除（不可恢复；UI 负责二次确认） */
  async purge(name: string): Promise<void> {
    const path = this.trashPath(name)
    const openLeaves = this.leavesShowing(path)
    // BUG-68a：同 restore——vault.delete 的事件刷新与 caps 收尾 refresh 会叠成
    // 两轮全量；单条彻底删除也进 quiet 窗口，只留 caps 那一次。
    this.beginQuiet()
    try {
      const file = this.vault.getAbstractFileByPath(path)
      if (file instanceof TFile) await this.vault.delete(file, true)
    } finally {
      this.endQuiet()
    }
    delete this.data.trash[name]
    // 先收标签再落盘：persist 放在 detach 之后 await，磁盘慢时不至于让 UI 白等多等一轮
    for (const leaf of openLeaves) leaf.detach()
    await this.persistBestEffort()
  }

  /** 清空回收站（不可恢复；UI 负责二次确认），返回实际删除的文件数 */
  async purgeAll(): Promise<number> {
    const names = this.trashNames()
    const openLeaves = names.flatMap((name) => this.leavesShowing(this.trashPath(name)))
    this.beginQuiet()
    // 实际处理条数：中途抛错时错误信息里的「已删 N 条」必须是真的（旧写法用
    // `names.length - Object.keys(trash).length` 反推，data.trash 里残留的
    // 「文件已不在、登记没清」的键会让它少算，甚至算出负数）。
    let done = 0
    try {
      for (const name of names) {
        const file = this.vault.getAbstractFileByPath(this.trashPath(name))
        if (file instanceof TFile) await this.vault.delete(file, true)
        delete this.data.trash[name]
        done++
      }
    } catch (e) {
      // B08：带已删条数的错误信息，避免「报失败但其实删了」的误导
      throw new Error(
        copy.errors.purgePartial({
          done,
          reason: errMsg(e),
        }),
      )
    } finally {
      this.endQuiet()
      // B08：登记落盘进 finally + 单独 try/catch，失败只提示、不覆盖主错误
      await this.persistBestEffort()
      for (const leaf of openLeaves) leaf.detach()
    }
    return done
  }

  // ---- 附件统计（v0.6.0）----

  /** 附件目录里的文件列表（仅 attachmentsDir 下一级，不含子目录） */
  async listAttachmentFiles(): Promise<{ path: string; size: number; mtime: number }[]> {
    const folder = this.vault.getAbstractFileByPath(this.attachmentsPath())
    if (!(folder instanceof TFolder)) return []
    const files: { path: string; size: number; mtime: number }[] = []
    for (const child of folder.children) {
      if (child instanceof TFile) files.push({ path: child.path, size: child.stat.size, mtime: child.stat.mtime })
    }
    return files
  }

  // ---- vault 事件挂接 ----

  registerVaultEvents(): void {
    // D-10：modify 与其余三种事件同一把尺子（affects）。旧写法用 isMomoFile
    // （必须 md 且在笔记目录），覆盖保存一张已存在的图片不触发刷新，
    // attachmentStats 的 totalBytes / monthlyTrend 会停在旧值直到碰巧
    // 发生别的事件。附件变更不值得为它省这一次刷新。
    this.plugin.registerEvent(this.vault.on('modify', (f) => this.affects(f) && this.emitSoon()))
    this.plugin.registerEvent(this.vault.on('delete', (f) => this.affects(f) && this.emitSoon()))
    // D-02：rename 的第二个参数 oldPath 必须一起判。只判新路径时，把
    // `danpen/notes/x.md` 拖到 Inbox/ 下（新路径不在布局内）不触发刷新 ——
    // 索引里仍是旧条目，面板留一张点开静默无反应的僵尸卡片； rename 之后
    // 不会再有 delete 事件，僵尸卡片能一直留到碰巧发生别的 Momo 事件。
    // 反向（从外部拖进来）本来就靠新路径命中，两个方向都判才闭合。
    this.plugin.registerEvent(
      this.vault.on('rename', (f, oldPath) => {
        if (this.affects(f) || affectsPath(oldPath, this.layout())) this.emitSoon()
        // BUG-51：回收目录里的文件进出都顺延自愈宽限
        if (this.isInTrash(f.path) || this.isInTrash(oldPath)) this.nudgeTrashHeal()
      }),
    )
    // B09：create 也听——Obsidian Sync / iCloud / Git 同步带入、从资源管理器拖入、
    // 其他插件创建的新 Momo 此前不进面板（要等恰好发生一次别的 Momo 事件才刷新）
    this.plugin.registerEvent(
      this.vault.on('create', (f) => {
        if (this.affects(f)) this.emitSoon()
        // BUG-51：Sync 把回收目录里的文件逐条送达 → 顺延自愈宽限，别在半途清登记
        if (this.isInTrash(f.path)) this.nudgeTrashHeal()
      }),
    )
  }

  private affects(f: TAbstractFile): boolean {
    return affectsPath(f.path, this.layout())
  }
}
