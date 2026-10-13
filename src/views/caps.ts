import { MarkdownRenderer, Modal, Notice } from 'obsidian'
import { useUi, type MomoCaps } from '../ui/store'
import type { MomoService } from '../momo/service'
import { copy } from '../momo/i18n'
import { dayMoment, localDay } from '../momo/dates'
import { errMsg } from '../momo/core'
import type { GlobeEarth } from '../momo/types'

// `MomoCaps` 的组装：ui/ 与 service 之间**唯一**的通道。
// ui/ 不 import obsidian（AGENTS.md §3.1），所有需要 Obsidian 能力的地方都在这里
// 包一层白手套交给 store；写操作的 Notice 也全发生在这一层。

export interface MomoConfirmOptions {
  message: string
  confirmText?: string
  danger?: boolean
}

/**
 * 二次确认弹窗：Obsidian Modal（原生 Esc / 遮罩语义），替代原生 confirm()——
 * 原生框和面板整体的视觉语言不搭，也无法标注危险按钮。resolve 恰好一次：
 * 确认 / 取消走按钮路径，Esc / 右上角关闭走 modal.onClose 兜底。
 * 放在模块顶层：confirmDialog 与其它需要二次确认的写操作共用。
 * 弹窗挂在 body 下拿不到 .momo-app 的令牌：styles.css 的共享令牌块挂在
 * .momo-confirm 上供应设计令牌；colorScheme 再把配色方案类也挂上去，
 * 让弹窗跟随用户选的配色（每套方案各有一份令牌覆写块，类按 id 挂）。
 *
 * 视觉（v0.9.0 Dialog 视觉系统）：与面板内四个浮层收敛成同一套骨架
 * （.momo-pop-*：容器 328 / 底 44 / 按钮 h 32 · r 9 · 内缩 14——
 * v0.9.26 从 44 / 54 收紧，见 styles.src/30-pop.css 文件头）。
 * 底栏左侧放「不可撤销」提示（仅危险确认），右侧 取消（描边）+ 主动作
 * （实底 accent；危险为实底 danger——可逆操作如批量移除标签不报红）。
 * 设计稿 card 05 的确认框没有关闭钮，故隐藏原生 modal-close-button。
 *
 * 2026-10-10 起**没有头部标题**（BUG-160：用户「所有的 dialog，左上角都不要有标题」）：
 * 头部那一行与 BUG-157 / 158 去掉的面板浮层标题同一条判据——确认框的标题（「删除
 * 标签」/「彻底删除」…）和底栏主动作按钮是同一句话的第二遍。`MomoConfirmOptions`
 * 的 `title` 字段随之删除；`.momo-confirm .modal-title` 由 CSS 隐藏，正文的上内距
 * 补到与无头浮层（.momo-pop-nohead）相称的一刀。
 */
function openConfirmModal(
  app: import('obsidian').App,
  options: MomoConfirmOptions,
  colorScheme: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (v: boolean) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    const modal = new Modal(app)
    modal.modalEl.addClass('momo-confirm')
    modal.modalEl.addClass(`momo-theme-${colorScheme}`)
    modal.contentEl.createEl('p', { text: options.message, cls: 'momo-confirm-message' })
    const actions = modal.contentEl.createDiv('momo-confirm-actions')
    if (options.danger) actions.createEl('span', { cls: 'momo-confirm-hint', text: copy.dialog.irreversible })
    const acts = actions.createDiv('momo-confirm-acts')
    const cancel = acts.createEl('button', { text: copy.common.cancel })
    cancel.addClass('momo-pop-btn')
    cancel.addEventListener('click', () => {
      done(false)
      modal.close()
    })
    const ok = acts.createEl('button', { text: options.confirmText ?? copy.common.confirm })
    // 主行动按钮：普通确认实底 accent、危险确认实底 danger（可逆不报红）
    ok.addClass('momo-pop-btn')
    ok.addClass(options.danger ? 'momo-pop-btn-danger' : 'momo-pop-btn-primary')
    ok.addEventListener('click', () => {
      done(true)
      modal.close()
    })
    modal.onClose = () => done(false)
    modal.open()
    // 危险操作默认聚焦「取消」（回车连点不误删）；普通确认聚焦主动作
    ;(options.danger ? cancel : ok).focus()
  })
}

/**
 * 写操作的统一反馈出口：cap + ui 全链路的 Notice 只发生在这一层（ui/ 不 import
 * obsidian，写盘结果提示的承诺注释全在这里兑现）。service 抛出的已是本地化错误
 * 文案（fileGone / deletePartial / restorePartial / purgePartial / invalidTag）
 * 直接透传，不二次包装；原始错误才统一包 copy.errors.*Failed。
 */
function notice(message: string): void {
  new Notice(message)
}

// ---- 时间位移建档（2026-09-28 刀 2）：选一天 → 建空白 Momo 到那天 → 开原生编辑器 ----
//
// 与「新建 Momo」的分工：那个建在**此刻**，这两条建在**过去某天 / 未来某天**。
// 三条路共用同一个落库原语（`service.create(content, tags, at)`，见该函数的 JSDoc），
// 区别只在 `at` 传不传、以及弹窗夹哪一边的日期。入口都**不独占于任何视图**（边界 ⑤）：
// 命令面板（main.ts 的 `backfill-Momo` / `future-Momo`）、筛选条（日期筛选只剩一天时
// 那枚「补记到 X」）——节奏视图连同它的缺口补记尺移除后，这两条就是补记的全部入口。

/** 日期选择弹窗的边界与默认值（两条路只有这两处不同，其余骨架完全共用） */
interface DayPickSpec {
  hint: string
  confirm: string
  /** 允许的本地日下界（含）；缺省 = 不夹过去 */
  min?: string
  /** 允许的本地日上界（含）；缺省 = 不夹未来 */
  max?: string
  /** 默认选中的本地日 */
  value: string
}

/**
 * 日期选择弹窗骨架：Obsidian 原生 `<input type="date">`，resolve 字符串 = 选中的
 * 本地日 `YYYY-MM-DD`；null = 取消 / Esc / 点遮罩（resolve 恰好一次，与
 * openConfirmModal 同口径）。
 *
 * 复用确认弹窗的视觉系统（.momo-confirm）：同一套模态骨架、按钮与令牌作用域，
 * 不为它新造一套浮层。注意浏览器不拦「手输的越界日期」（min/max 只约束挑选器），
 * confirm 里按字符串再夹一遍（定宽日期键字典序 = 时间序）；夹不过就不放行，
 * 弹窗保持开着，用户改对了再确认。
 *
 * 2026-10-10 起同样没有头部标题（BUG-160）：「补记到过去 / 写到未来」与底栏主动作
 * 按钮（「补记」/「写到未来」）是同一句话的第二遍，方向由入口（命令面板 / 筛选条
 * 那枚「补记到 X」）与 min / max 夹子说清。
 */
function pickDay(app: import('obsidian').App, colorScheme: string, spec: DayPickSpec): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: string | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const modal = new Modal(app)
    modal.modalEl.addClass('momo-confirm')
    modal.modalEl.addClass(`momo-theme-${colorScheme}`)
    modal.contentEl.createEl('p', { text: spec.hint, cls: 'momo-confirm-message' })
    const row = modal.contentEl.createDiv('momo-backfill-row')
    const input = row.createEl('input', { type: 'date', cls: 'momo-backfill-date' })
    if (spec.min !== undefined) input.min = spec.min
    if (spec.max !== undefined) input.max = spec.max
    input.value = spec.value
    const confirm = () => {
      const day = input.value
      // 空值 / 格式不对 / 越过 min-max：不放行，弹窗保持开着（用户改对了再确认）
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return
      if (spec.min !== undefined && day < spec.min) return
      if (spec.max !== undefined && day > spec.max) return
      done(day)
      modal.close()
    }
    const actions = modal.contentEl.createDiv('momo-confirm-actions')
    const acts = actions.createDiv('momo-confirm-acts')
    const cancel = acts.createEl('button', { text: copy.common.cancel })
    cancel.addClass('momo-pop-btn')
    cancel.addEventListener('click', () => {
      done(null)
      modal.close()
    })
    const ok = acts.createEl('button', { text: spec.confirm })
    ok.addClass('momo-pop-btn')
    ok.addClass('momo-pop-btn-primary')
    ok.addEventListener('click', confirm)
    modal.onClose = () => done(null)
    modal.open()
    input.focus()
  })
}

/**
 * 补记第一步（命令面板入口）：`max` 夹到今天（往回补、不回未来），默认昨天——
 * 补记最高频的目标就是「忘了写的那天」。
 * `brand`（prefs.brandName）：提示句里可能带品牌词（BUG-105c），跟着用户改名走。
 */
export function pickBackfillDay(app: import('obsidian').App, colorScheme: string, brand: string): Promise<string | null> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return pickDay(app, colorScheme, {
    hint: copy.dialog.backfill.hint(brand),
    confirm: copy.dialog.backfill.confirm,
    max: localDay(new Date()),
    value: localDay(yesterday),
  })
}

/**
 * 预写第一步（命令面板入口）：与 `pickBackfillDay` 完全对称，只是把夹子翻过来——
 * `min` 夹到明天（往前写、不写今天），默认明天。
 */
export function pickFutureDay(app: import('obsidian').App, colorScheme: string, brand: string): Promise<string | null> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = localDay(tomorrow)
  return pickDay(app, colorScheme, {
    hint: copy.dialog.future.hint(brand),
    confirm: copy.dialog.future.confirm,
    min: day,
    value: day,
  })
}

/**
 * 时间位移主路（补记 / 预写两处入口共用）：建一条**空白** Momo 到 `day` 本地日——
 * `createdAt` = 那天中午（口径见 dateGroups 的 dayMoment）、frontmatter 按方向落
 * `backfilled: true`（过去）或 `scheduled: true`（未来，判据在 service.create）——
 * 再用 Obsidian 原生编辑器打开（与 caps.openNew 同一姿势：写作 / 渲染 / 保存全归
 * Obsidian，插件不封装第二套编辑器）。用户写完关闭标签页，vault 事件把它刷进列表、
 * 归到那一天；当时没写也不怕：痕迹字段让启动清扫放行（见 sweepOneDraft），
 * 不会把用户选的日子静默清掉。
 */
async function createBlankAtDay(service: MomoService, day: string): Promise<void> {
  try {
    const file = await service.create('', [], dayMoment(day))
    await service.openInEditor(file.path)
    await useUi.getState().refresh()
  } catch (e) {
    notice(copy.errors.writeFailed(errMsg(e)))
    throw e
  }
}

/** 补记到过去（失败时先 notice 再 rethrow，调用方要能判断成败） */
export async function backfillCreate(service: MomoService, day: string): Promise<void> {
  await createBlankAtDay(service, day)
}

/** 写到未来（与 backfillCreate 同一条落库路，只有方向不同） */
export async function futureCreate(service: MomoService, day: string): Promise<void> {
  await createBlankAtDay(service, day)
}

export function buildCaps(service: MomoService): MomoCaps {
  /**
   * 某一档贴图的 `blob:` URL（会话级缓存）。
   *
   * URL 稳定是两件事的前提：① globeTexture 的模块级解码缓存（键 = 六面 URL 拼接）
   * 才命中，切视图不重复读盘 + 解码；② 解码出来的 canvas 不再被跨源污染——
   * blob URL 与创建它的文档**同源**（根因与现场见 service.readGlobeCubeFaces 注释）。
   *
   * 失败不进缓存：缺件 / 权限异常时下次挂载照常重试（与 globeTexture 的解码缓存同口径）。
   */
  const cubeUrls = new Map<GlobeEarth, Promise<string[]>>()
  return {
    renderMarkdown: (container, markdown) =>
      MarkdownRenderer.render(service.app, markdown, container, service.rootPath(), service.pluginOf()),
    // 发布 Momo：创建失败必须让调用方知道（别让「点了一下，什么都没发生」）
    publish: async (content, tags) => {
      try {
        await service.create(content, tags)
        await useUi.getState().refresh()
      } catch (e) {
        notice(copy.errors.writeFailed(errMsg(e)))
        throw e
      }
    },
    // 「写点什么」是先建空文件再开原生编辑器；创建失败是失败静默的高发点
    // （磁盘满 / 只读分区），这里不再让它变 unhandled rejection
    openNew: () =>
      void (async () => {
        try {
          const f = await service.create('', [])
          await service.openInEditor(f.path)
        } catch (e) {
          notice(copy.errors.writeFailed(errMsg(e)))
        }
      })(),
    openInEditor: (path) => void service.openInEditor(path),
    // 补记：建空白 Momo 到指定那天并开编辑器（弹日期的那一半在模块级 pickBackfillDay，
    // 由 commands.ts 直调、不经 caps——Q14 起不再挂第二个无消费者的入口）。
    backfillNew: (day) => backfillCreate(service, day),
    saveEntry: async (path, content) => {
      try {
        await service.saveEntry(path, content)
        await useUi.getState().refresh()
      } catch (e) {
        notice(copy.errors.writeFailed(errMsg(e)))
        throw e
      }
    },
    // 批量加标签：写文件由 service 负责，汇总提示放这一层（ui/ 不 import obsidian）。
    // 全量成功不弹——结果在卡片上当场可见；有跳过 / 失败、与「已选 N 条」对不上才弹。
    addTags: async (paths, tags) => {
      const r = await service.addTags(paths, tags)
      await useUi.getState().refresh()
      if (r.skipped > 0 || r.failed > 0) notice(copy.tags.notice.addDone(r))
      return r
    },
    // 批量移除标签：与 addTags 同一分工，但写入面不同（frontmatter + 正文行内两处一起改，
    // 只改一处会被另一处读回来）。文案把「本就没有」的跳过条数说清，
    // 否则用户会觉得「我选了 10 条，怎么只说改了 3 条」。
    removeTags: async (paths, tags) => {
      const r = await service.removeTags(paths, tags)
      await useUi.getState().refresh()
      if (r.skipped > 0 || r.failed > 0) notice(copy.tags.notice.removeDone(r))
      return r
    },
    // 批量添加地点（多选工具栏「设地点」的追加态）：只写 frontmatter locations，
    // 与 addTags 同一分工（写盘在 service、汇总提示在这一层；全量成功不弹）。
    addLocations: async (paths, locations) => {
      const r = await service.addLocations(paths, locations)
      await useUi.getState().refresh()
      if (r.skipped > 0 || r.failed > 0) notice(copy.location.notice.addDone(r))
      return r
    },
    // 批量移除地点（「设地点」的移除态）：同样只写 frontmatter；skipped = 一条都没有的条数。
    removeLocations: async (paths, locations) => {
      const r = await service.removeLocations(paths, locations)
      await useUi.getState().refresh()
      if (r.skipped > 0 || r.failed > 0) notice(copy.location.notice.removeDone(r))
      return r
    },
    // 标签改名 / 合并：service 负责全库改写（frontmatter + 正文行内），
    // 这里收尾一次全量 refresh；全量成功不弹（新名字是用户刚输入的，树当场刷新），
    // 只报失败条数。非法目标抛的 invalidTag 已是完整文案，直接透传。
    renameTag: async (from, to) => {
      try {
        const r = await service.renameTag(from, to)
        await useUi.getState().refresh()
        if (r.failed > 0)
          notice(copy.tags.notice.renamed({ from, to, updated: r.updated, failed: r.failed }))
        return r
      } catch (e) {
        notice(errMsg(e))
        throw e
      }
    },
    deleteTag: async (tag) => {
      const r = await service.deleteTag(tag)
      await useUi.getState().refresh()
      if (r.failed > 0) notice(copy.tags.notice.deleted({ tag, updated: r.updated, failed: r.failed }))
      return r
    },
    // 批量软删：service 层一次批量 rename + 一次落盘（批量期间事件刷新被抑制），
    // 这里收尾只做一次全量 refresh（ui/ 不 import obsidian）。成功不弹——
    // 卡片当场消失是最直白的反馈；失败经 catch 弹「已删除 N 条，第 N+1 条失败」。
    // 单卡删除按钮传单元素数组走同一条路——顺带修掉了旧实现「单条删除
    // 触发两次全量刷新」（caps 显式一次 + rename 事件一次）的浪费。
    trashMany: async (paths) => {
      try {
        const names = await service.trashMany(paths)
        await useUi.getState().refresh()
        return { count: names.length, names }
      } catch (e) {
        // quiet 机制把批量期间的 vault 事件全丢了（不是延后），catch 里必须补一次
        // refresh——部分失败时已删条目经 persistBestEffort 落了盘，面板却不出现，
        // 直到下一次不相关事件才自愈（BUG-08；与 restoreAll / purgeAll 同款，
        // BUG-202 补齐——那两处注释自称「与 trashMany 同款」，此前与代码相反）
        await useUi.getState().refresh()
        notice(errMsg(e))
        throw e
      }
    },
    restore: async (name) => {
      try {
        await service.restore(name)
        await useUi.getState().refresh()
      } catch (e) {
        notice(copy.errors.restoreFailed(errMsg(e)))
        throw e
      }
    },
    restoreAll: async () => {
      try {
        await service.restoreAll()
        await useUi.getState().refresh()
      } catch (e) {
        // quiet 机制把批量期间的 vault 事件全丢了（不是延后），catch 里必须补一次
        // refresh——否则「50 条恢复到第 11 条失败」时，已成功那 10 条在面板上不出现，
        // 盘面与列表脱节到下一次不相关事件才自愈（BUG-08，与 trashMany 的失败路径同款）
        await useUi.getState().refresh()
        notice(errMsg(e))
        throw e
      }
    },
    purge: async (name) => {
      try {
        await service.purge(name)
        await useUi.getState().refresh()
      } catch (e) {
        notice(copy.errors.purgeFailed(errMsg(e)))
        throw e
      }
    },
    purgeAll: async () => {
      try {
        await service.purgeAll()
        await useUi.getState().refresh()
      } catch (e) {
        // 同 restoreAll（BUG-08）：quiet 期间的事件不会自己回来
        await useUi.getState().refresh()
        notice(errMsg(e))
        throw e
      }
    },
    // 二次确认弹窗能力（实现见 openConfirmModal）；配色方案跟随当前偏好
    confirmDialog: (options) => openConfirmModal(service.app, options, service.data.prefs.colorScheme),
    attachImage: (name, data) => service.attachImage(name, data),
    listAttachmentFiles: () => service.listAttachmentFiles(),
    // vault 内路径 → app:// URL（Obsidian 自己的资源协议，桌面 / 移动端都认）。
    // 左上角自定义图标靠它把盘上的图片显示进侧栏品牌标。
    resourceUrl: (path) => service.app.vault.adapter.getResourcePath(path),
    // 星球贴图（2026-10-02 独立产物；2026-10-04 起 cube map 六面；2026-10-05 起
    // **两套**：夜地球 / 日地球，按 prefs.globeEarth 切；2026-10-13 起**读字节包 blob: URL**）：
    // 不再内联进 main.js——内联会把 onload 的 parse+eval 抬一大截，而贴图只在切到
    // 星球档时才用得上。六面名与 scripts/vault-targets.mjs 的 GLOBE_TEXTURES 同一份
    // 真源（那侧管部署 + verify）；运行期这一侧的读取口径在 momo/globe/pack.ts 的
    // globePackCubeNames，与资源包下载清单同源。顺序固定 px/nx/py/ny/pz/nz。
    //
    // 为什么不是资源 URL（旧实现）：`resourcePathPrefix` 形式的 URL 对文档
    // （app://obsidian.md）是**跨源**的，`<img>` 不带 CORS 装载会把 canvas 污染成
    // 跨源 → getImageData 抛 SecurityError → 六面全解不出（现场见
    // service.readGlobeCubeFaces）。自己读字节再包 `blob:` URL 从根上免掉这条；
    // 也因此不再需要 `?v=` 内容指纹——那一套现在只服务 globe3d.js 的 <script>
    // （见 ui/globe/globe3dLoader.ts）。
    //
    // ⚠️ 它必须是**异步**的：读盘是异步的。调用方（GlobeStage / globePrewarm）
    // 在拿到六面之前不许画球，也不许把「还没读」当成「读失败」。
    globeCubeUrls: (earth) => {
      const hit = cubeUrls.get(earth)
      if (hit) return hit
      const pending = service
        .readGlobeCubeFaces(earth)
        .then((faces) => faces.map((buf) => URL.createObjectURL(new Blob([buf], { type: 'image/png' }))))
      cubeUrls.set(earth, pending)
      pending.catch(() => {
        if (cubeUrls.get(earth) === pending) cubeUrls.delete(earth)
      })
      return pending
    },
    // 星球三维渲染库（three.js 档，2026-10-04）：同为**独立部署产物**，esbuild 的
    // 第二产物 globe3d.js（three 全量 ~600KB 不许进 main.js，onload parse 账同上）。
    // 运行期经 globe3dLoader 注入 <script> 惰性加载，失败回退 canvas 软渲染。文件名
    // 与 scripts/vault-targets.mjs 的 GLOBE3D 同一份真源（部署 + verify 都走那里）。
    // ⚠️ 这里**不加**内容指纹：globe3d.js 的 <script> 注入只有 globe3dLoader 一处
    // 发起点，指纹统一在那里加（withAssetRev，2026-10-05「球有贴图但不转」的根因，
    // 见 src/ui/globe/globeAssetRev.ts）。贴图那条路相反：<img> 由
    // globeTexture 直接发起，中间没有别的环节，所以指纹加在这里。
    globe3dUrl: () =>
      service.app.vault.adapter.getResourcePath(
        `${service.vault.configDir}/plugins/${service.pluginId}/globe3d.js`,
      ),
    // 星球资源包（v1.0.0）：globe3d.js 与两套贴图是**可选下载**——商店 / BRAT 只下发
    // main.js / manifest.json / styles.css，重资产到不了自动安装的用户手里。这两条是
    // 下载入口的能力面；网络与写盘在 service.downloadGlobePack，这里只把「当前插件
    // 版本」顶进去当记账口径（release 的 tag = 版本号）。
    globePackStatus: async () => ({ ...(await service.globePackStatus()), current: service.pluginVersion }),
    downloadGlobePack: async (onProgress) => {
      const res = await service.downloadGlobePack(service.pluginVersion, onProgress)
      // 成功就把贴图的 blob URL 缓存作废：下一次挂载重新读字节，刚下下来的贴图立刻生效
      // （清缓存不等于重挂舞台——真正拿到新图还要一次挂载，见 GlobeView 的 stageKey）
      if (res.ok) cubeUrls.clear()
      return res
    },
    // N08：签名 Promise<void>——data.json 写失败（只读分区/磁盘满）时调用方能接住，
    // 不再「UI 显示已改、重载后回退」地静默丢偏好。分工与其它写操作一致：
    // caps 层 Notice + rethrow，调用方 catch 后决定是否回退。
    savePrefs: async (prefs) => {
      try {
        await service.savePrefs(prefs)
      } catch (e) {
        notice(copy.errors.prefsSaveFailed(errMsg(e)))
        throw e
      }
    },
    listEntries: () => service.listEntries(),
    listTrash: () => service.listTrash(),
  }
}
