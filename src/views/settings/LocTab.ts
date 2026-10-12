import { LOCATION_MAX_CHARS, canonicalLocName, displayLocName, locationTallies, userKeyOf } from '../../momo/locations'
import { charLength } from '../../momo/core'
import { copy } from '../../momo/i18n'
import { BUILTIN_LOC_COORDS, formatLatLon, isValidLatLon, type LatLon } from '../../momo/locations'
import { BUILTIN_LOC_REGIONS, isValidLocRegion, type LocRegion } from '../../momo/locations'
import { GLOBE_EARTHS, sanitizeGlobeEarth, sanitizeLocTreeExpand } from '../../momo/types'
import type { GlobeEarth, LocTreeExpand } from '../../momo/types'
import { globePackFileNames } from '../../momo/globe/pack'
import { h } from './dom'
import { actionButton as actBtn } from './fields'
import type { SettingsCtx } from './context'

// ⑥ 地点（F7 星球视图的坐标管理 + v0.9.30 地点分组的大洲 / 国家；设计稿 F7b
// 「任意地点都允许手填坐标」）：卡头没有说明（2026-10-11 用户要求整句去掉——
// 它那句「管两件事」只是把行名列的两条轴各点一遍，而下面三块的块头就在页里）。
// 三块——上面「手填新坐标」，下面「地点与坐标」
// （listEntries() 现算的有笔记地点 + 只填了坐标还没笔记可用的手填地点；按条数
// 降序，0 条的排最后），以及与之并列的「大洲与国家」块（同形制，另一条轴）。
// 行内三件事：无该项 → 填写；有该项 → 修改；手填的 → 移除（回落到内置或无）。
//
// 两条轴的分工（也是拆成两块而不是合成一张四列表的理由）：**坐标**管星球上
// 摆哪儿（consumers = 星球视图），**归属**管分组流怎么并组、组头写多长
// （consumers = 分组流 / 跳转 / pill / 弹层）。一个地点可以只有一侧——只填
// 坐标不填归属完全说得通（那个地方只上个球、不进分组语境）。
//
// 读取口径两个块各自与消费者共用：坐标走 locations/locCoords.ts、归属走 locations/locRegions.ts，
// 都是**用户手填压过内置字典**（明确的一次覆盖，不是缓存）。所以这里的「来源」
// 要分清三种：手填 / 内置 / 无——行内据此给不同动作。
//
// 这张卡**没有**卡头「恢复默认」：locCoords / locRegions 是用户数据（同
// pinnedNotes 一类的 curation，裁决写在 types/entry.ts 的注释里），PREFS_DEFAULTS
// 刻意不收它们；给一颗清它的按钮，与「恢复默认不清手填」自相矛盾。

/**
 * 星球资源包行（v1.0.0）：状态注记 + 一颗「下载」钮。
 *
 * 3D 星球渲染库（globe3d.js）与两套 cube 贴图是**可选下载**——Obsidian 商店安装器与
 * BRAT 都只下发 main.js / manifest.json / styles.css，重资产到不了自动安装的用户手里。
 * 这一行是下载入口，也是「插件唯一的联网动作」的说明。
 *
 * 状态三态：未安装 / 已安装 / 升级后旧版本（记账的是上次下载时的插件版本）。
 * 资源包不是偏好（不落 data.json），所以本卡没有卡片级「恢复默认」。
 */
function buildGlobePackRow(ctx: SettingsCtx, card: HTMLElement): void {
  const p = copy.settingsPage.loc.pack
  const row = ctx.row(card, p.name, p.desc, { wide: true, note: p.notInstalled })
  const note = row.querySelector<HTMLElement>('.momo-set-note')
  const setNote = (text: string): void => {
    if (note) note.textContent = text
  }
  const btn = actBtn(p.download, 'is-primary', () => void run())
  const run = async (): Promise<void> => {
    btn.disabled = true
    const total = globePackFileNames().length
    setNote(p.downloading(0, total))
    const res = await ctx.service.downloadGlobePack(ctx.service.pluginVersion, (done) => {
      setNote(p.downloading(done, total))
    })
    btn.disabled = false
    setNote(res.ok ? p.installed : p.failed(res.failed.length))
  }
  const refresh = async (): Promise<void> => {
    const s = await ctx.service.globePackStatus()
    setNote(!s.installed ? p.notInstalled : s.version !== ctx.service.pluginVersion ? p.stale : p.installed)
  }
  row.append(btn)
  void refresh()
}

export function buildLocTab(ctx: SettingsCtx): void {
  const lc = copy.settingsPage.loc
  const c = ctx.card('momo-set-loc', 'momo-set-loc-card', lc.title, '')

  // ---- 块零：新建笔记带不带空 locations（v0.9.28）----
  // 排在两张坐标块**之前**：它是「新建那一刻的 frontmatter 长相」，比坐标管理
  // 更常被碰到（每个新笔记都有）。取值现读 service，不取 display() 时的 prefs
  // 快照——同屏连点两个开关时快照会把前一次改动整份回写吃掉（v0.7.6 修过的坑，
  // 见 PanelTab 侧栏开关网格的同一段注释）。
  ctx.row(c, lc.newNoteLocations.name, lc.newNoteLocations.desc).append(
    ctx.field.buildSwitch(
      () => ctx.service.data.prefs.newNoteLocations,
      (v) => ctx.setPref({ newNoteLocations: v }),
    ),
  )

  // ---- 块零一：侧栏「全部地点」树的展开方式（2026-10-01，用户要求「在设置里
  // 添加配置，有两种：全展开没有展开钮 / 可以展开和折叠」）----
  // 与下一行同属「当下就能看见效果」的视图偏好（改完切回侧栏就是新的树），所以排在
  // 两个数据块之前。行说明已于 2026-10-11 按用户要求去掉（两个档名已经自明）。
  // 这一行只管「能不能收」，不管「默认可见到哪一级」——那是侧栏「全部地点」标题行
  // 那颗漏斗的事。
  ctx.row(c, lc.treeExpand.name, '').append(
    ctx.field.segmented<LocTreeExpand>(
      [
        { value: 'all', label: lc.treeExpand.all },
        { value: 'fold', label: lc.treeExpand.fold },
      ],
      () => ctx.service.data.prefs.locTreeExpand,
      (v) => ctx.setPref({ locTreeExpand: sanitizeLocTreeExpand(v) }),
    ),
  )

  // ---- 块零二：星球地球外观（2026-10-05，用户要求「一个夜地球、一个换成
  // globe.html 那套日地球 + 光照」）----
  // 同样排在两个数据块之前。**贴图与光照一起切**，这个控件就是那一件事的入口——两档的
  // 取舍曾经写在 desc 里（夜地球不加方向光那条是有理由的），已于 2026-10-11 按用户
  // 要求去掉，理由与理由的完整版留在 ui/globe/globeLight.ts 的光照配方注释里。
  // 选项从 GLOBE_EARTHS 现算：加一档地球，这里自动多一段（名字没写则编译不过）。
  ctx.row(c, lc.earth.name, '').append(
    ctx.field.segmented<GlobeEarth>(
      GLOBE_EARTHS.map((value) => ({ value, label: lc.earth.option[value] })),
      () => ctx.service.data.prefs.globeEarth,
      (v) => ctx.setPref({ globeEarth: sanitizeGlobeEarth(v) }),
    ),
  )

  // ---- 块零三：星球资源包（v1.0.0）----
  // 3D 星球渲染库与两套贴图是**可选下载**（Obsidian 商店安装器与 BRAT 都只下发
  // main.js / manifest.json / styles.css，重资产到不了自动安装的用户手里）。这一行
  // 是下载入口 + 「插件唯一联网动作」的说明。资源包不是偏好（不落 data.json），
  // 所以本卡仍不带卡片级「恢复默认」。
  buildGlobePackRow(ctx, c)

  /** 现读盘上手填坐标（**不取 display() 时的 prefs 快照**：同屏连点两个行内动作时，
   *  快照会让后一次把前一次整份回写、吃掉前者——v0.7.6 修过的同一个坑）。 */
  const coordsNow = (): Record<string, LatLon> => ctx.service.data.prefs.locCoords
  const saveCoords = (next: Record<string, LatLon>): void => ctx.setPref({ locCoords: next })

  /** 输入 → 两位小数的数：空 / 非有限数 → null（越界由 isValidLatLon 收口） */
  const parseCoord = (s: string): number | null => {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }

  /** 校验提示：空串即收起（.momo-set-loc-warn 默认 display:none，见 80-settings.css） */
  const showWarn = (el: HTMLElement, msg = ''): void => {
    el.textContent = msg
    el.classList.toggle('is-show', msg !== '')
  }

  // 块零（原「手填新坐标」入口）：2026-10-11 按用户要求整块删除。留下的写入口只有
  // 下面那张表里的行内「填写 / 修改 / 移除」——而它够用：表按地点列出所有有笔记用的
  // 地点（外加只填过还没笔记可用的手填项），一个想补坐标的地点本来就在表里。
  // 顺带删掉的还有字典里那一组 addBlock / addName / addLat / addLon / add / nameErr /
  // tooLongErr / dupErr，与添加行那两条 CSS 规则（见 80-settings/070-tabs.css 的注释）。

  // ---- 块一：地点与坐标 ----
  const useBlock = h('div', 'momo-set-block is-group is-coord')
  const useHead = h('div', 'momo-set-block-head')
  // 块头只有标题：原先那句「按笔记条数排序；只填了坐标、还没笔记可用的排在后面」
  // 已于 2026-10-11 按用户要求整句去掉（列表确实是这么排的，但那是读列表自己
  // 看出来的事）。**排序与「manualOnly 也列」的行为一个字没动**，只是不再写在页上。
  useHead.append(h('span', 'momo-set-block-title', lc.useBlock.title))
  const listBox = h('div', 'momo-set-loc-list')
  const useWarn = h('div', 'momo-set-loc-warn')

  /**
   * BUG-80a：行内编辑的**存活登记**。旧实现「A 行在编辑中，任何一次写盘
   * （别的行保存 / 移除 / 上方添加）触发整列重画，A 行的输入框连同已输入的
   * 值一起消失」——编辑态没登记，重画无从恢复。键 = 地点名，值 = 两格输入
   * 的现值（随输入更新）；提交 / 取消 / 移除该行时清掉。null = 没有行在编辑。
   */
  let editing: { name: string; lat: string; lon: string } | null = null

  /**
   * 一行地点。三种状态三套动作：
   *  - 无坐标：只能「填写」（保存即新建手填）；
   *  - 内置命中：「修改」——预填字典值，用户可纠正（手填压内置的入口）；
   *  - 手填：「修改」+「移除」——移除即回落到内置或无坐标。
   * 编辑态把整行换成两个 is-num 输入 + 保存 / 取消，保存失败在块底警告行说明。
   * `restore`（BUG-80a）：整列重画后恢复这一行的编辑态，值来自存活登记。
   */
  const buildRow = (name: string, count: number, restore?: { lat: string; lon: string }): HTMLElement => {
    const row = h('div', 'momo-set-locrow')
    // BUG-110a：手填表按**身份**找键（行名是归一根，旧盘上的键可能是另一种写法）。
    // 行内一切读写都落在找回来的那个键上——键本身不搬家，用户数据不改词。
    const key = userKeyOf(coordsNow(), name)
    const user = key === null ? undefined : coordsNow()[key]
    const custom = isValidLatLon(user) ? user : null
    // 内置字典的索引签名在 TS 眼里不可空，运行时未命中是 undefined——?? null 兜的是运行时
    const builtin = custom === null ? (BUILTIN_LOC_COORDS[name] ?? null) : null
    const coord = custom ?? builtin

    const paintRead = (): void => {
      row.empty()
      row.append(h('span', 'momo-set-locrow-name', name))
      row.append(h('span', 'momo-set-locrow-count', lc.count(count)))
      const coordEl = h('span', `momo-set-locrow-coord${coord ? '' : ' is-none'}`, coord ? formatLatLon(coord) : lc.coordNone)
      row.append(coordEl)
      if (custom !== null) row.append(h('span', 'momo-set-locrow-src', lc.srcCustom))
      else if (builtin !== null) row.append(h('span', 'momo-set-locrow-src', lc.srcBuiltin))

      const acts = h('div', 'momo-set-locrow-acts')
      acts.append(actBtn(coord === null ? lc.fill : lc.edit, 'is-ghost', () => openEdit()))
      if (custom !== null) {
        acts.append(
          actBtn(lc.remove, 'is-ghost', () => {
            // 移除的正是编辑中的那行才清登记；移除别的行不能把编辑态带走（BUG-80a）
            if (editing?.name === name) editing = null
            const next = { ...coordsNow() }
            delete next[key ?? name]
            saveCoords(next)
            void paintList()
          }),
        )
      }
      row.append(acts)
    }

    const openEdit = (): void => {
      showWarn(useWarn)
      // 登记编辑态（BUG-80a）：预填 = 恢复值 > 行自身坐标；此后随输入更新，
      // 任何一次整列重画都能原样带回
      editing = {
        name,
        lat: restore?.lat ?? (coord ? String(coord[0]) : ''),
        lon: restore?.lon ?? (coord ? String(coord[1]) : ''),
      }
      row.empty()
      row.append(h('span', 'momo-set-locrow-name', name))
      const lat = ctx.field.textInput(editing.lat, lc.addLat, () => {}, 'is-num')
      lat.setAttribute('aria-label', lc.addLat)
      const lon = ctx.field.textInput(editing.lon, lc.addLon, () => {}, 'is-num')
      lon.setAttribute('aria-label', lc.addLon)
      // 输入实时进登记：编辑中发生在别处的写盘（重画）不会丢已输入的值
      lat.addEventListener('input', () => {
        if (editing?.name === name) editing.lat = lat.value
      })
      lon.addEventListener('input', () => {
        if (editing?.name === name) editing.lon = lon.value
      })
      const commit = (): void => {
        showWarn(useWarn)
        const la = parseCoord(lat.value)
        const lo = parseCoord(lon.value)
        if (la === null || lo === null || !isValidLatLon([la, lo])) {
          showWarn(useWarn, lc.rangeErr)
          return
        }
        editing = null
        // 保存落在原键上（BUG-110a）：改一次坐标不该让「New York」这条用户的键搬家
        saveCoords({ ...coordsNow(), [key ?? name]: [la, lo] })
        void paintList()
      }
      lat.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' && !ev.isComposing) commit()
      })
      lon.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' && !ev.isComposing) commit()
      })
      const acts = h('div', 'momo-set-locrow-acts')
      acts.append(actBtn(lc.save, '', commit), actBtn(lc.cancel, 'is-ghost', () => {
        editing = null
        paintRead()
      }))
      row.append(lat, lon, acts)
      lat.focus()
    }

    paintRead()
    // 恢复编辑态（BUG-80a）：openEdit 从闭包里的 restore 取预填值并重新登记
    if (restore) openEdit()
    return row
  }

  let listSeq = 0

  /** 整列重画：任何一次写盘后都走这里（列表行数不变、只是内容与动作变）。
   *  listEntries() 是异步的（在途合并），所以这里是 async——await 回来后同一份
   *  entries 现算一次分组，与星球视图的锚点同源。
   *  只填了坐标、还没有笔记可用的地点也列（排在 0 条这档的最后，按名称排）：
   *  dupErr 指的路是「下面的列表」，那些行就是被改的对象；漏了它们，先填坐标的
   *  用户没有任何入口改错一个数字、也没法移除。 */
  async function paintList(): Promise<void> {
    const mine = ++listSeq
    // 这张表按**地点**列（管的是「一个地名的坐标」）：names 不带任何归属，
    // 所以用 locationTallies 而不是 groupByLocation——后者在粗档下给的组键
    // 是大洲 / 国家，手填表的键对不上
    const tallies = locationTallies(await ctx.service.listEntries())
    // BUG-73：期间又起了一轮（连续两笔写盘各自重画）——这一轮是过期快照，丢掉，
    // 否则它会在下一轮 empty() 之后才 append，行成对重复（照 TagsTab:101-108）。
    if (mine !== listSeq) return
    listBox.empty()
    // BUG-110a：手填键与列出地点按**身份**对表——盘上「New York」对上列出的「纽约」
    // 时不再并出第二行（那一行已由 userKeyOf 读回手填值）；同一身份有多个手填键时
    // 只列排序后的第一个
    const used = new Set(tallies.map((t) => canonicalLocName(t.location)))
    const seenManual = new Set<string>()
    const manualOnly = Object.keys(coordsNow())
      .sort((a, b) => a.localeCompare(b))
      .filter((name) => {
        const id = canonicalLocName(name)
        if (used.has(id) || seenManual.has(id)) return false
        seenManual.add(id)
        return true
      })
    if (tallies.length === 0 && manualOnly.length === 0) {
      listBox.append(h('div', 'momo-set-loc-empty', lc.empty))
      return
    }
    for (const t of tallies) {
      listBox.append(buildRow(t.location, t.count, editing?.name === t.location ? editing : undefined))
    }
    for (const name of manualOnly) {
      listBox.append(buildRow(name, 0, editing?.name === name ? editing : undefined))
    }
    // BUG-80a：编辑中的行没被这次重画画出来（刚被移除 / 地名消失）→ 放弃恢复
    if (editing) {
      const present = [...tallies.map((t) => t.location), ...manualOnly]
      if (!present.includes(editing.name)) editing = null
    }
  }

  useBlock.append(useHead, listBox, useWarn)
  // 块尾那两条注记（「精度两位小数，约 1 公里」「手填坐标是用户数据：恢复默认不会清掉
  // 它」）已于 2026-10-11 按用户要求整句移除（与 BUG-156 对头像卡做的是同一件事：
  // 把裁决从屏幕挪回源码）。**裁决一个字没变**：坐标仍取两位小数（parseCoord 吸合），
  // `locCoords` 仍不进 `PREFS_DEFAULTS`、这张卡仍没有卡头「恢复默认」——理由与出处
  // 见 types/entry.ts 的注释。
  c.append(useBlock)
  void paintList()

  // ---- 块二：地点的大洲与国家（v0.9.30）----
  // 与上面那张表同形制、另一条轴：归属决定分组流怎么并组、组头写多长（坐标决定星球
  // 上摆哪儿）。原先这块上面另有一份「手填新归属」的添加入口，2026-10-11 按用户要求
  // 整块删除（同上面那块「手填新坐标」）：写入口只剩下面那张表的行内三态——无归属
  // 「填写」/ 有归属「修改」/ 手填的「修改 + 移除」（回落到内置或无归属）。
  // 只填一侧也算数：分组时跳过空的那一环（见 locPartsOf），所以这里不校验
  // 「至少填一项」——两项全空才视为没填，sanitize 层会整条丢。
  /** 现读盘上手填归属（与 coordsNow 同一条理由：不取 display() 时的快照） */
  const regionsNow = (): Record<string, LocRegion> => ctx.service.data.prefs.locRegions
  const saveRegions = (next: Record<string, LocRegion>): void => ctx.setPref({ locRegions: next })

  /**
   * 大洲 / 国家两格的收口：长度与地点名同一个上限（这两串会进组头 / 树节点 / pill，
   * 不限长的话一次粘贴就把整条分组流撑变形），另外**控制字符一律拒绝**——
   * 组键的分隔符是 `\u0000`（locations/locations.ts 的 KEY_SEP），它能出现的前提正是
   * 「用户数据里没有这种字符」，从输入口把它堵死。
   */
  const badRegionPart = (s: string): boolean =>
    charLength(s) > LOCATION_MAX_CHARS || /[\u0000-\u001f\u007f]/.test(s)

  // 块二的列表（与上面那张表同形制）
  const regionUse = h('div', 'momo-set-block is-group is-region')
  const regionUseHead = h('div', 'momo-set-block-head')
  regionUseHead.append(
    h('span', 'momo-set-block-title', lc.regionUseBlock.title),
    h('span', 'momo-set-block-note', lc.regionUseBlock.note),
  )
  const regionListBox = h('div', 'momo-set-loc-list')
  const regionUseWarn = h('div', 'momo-set-loc-warn')

  /** 归属行的编辑存活登记（BUG-80a，与坐标块同款）：键 = 地点名，值 = 两格现值 */
  let editingRegion: { name: string; continent: string; country: string } | null = null

  /**
   * 一行地点。三种状态三套动作（与坐标块同一套读法）：
   *  - 无归属：只能「填写」；
   *  - 内置命中：「修改」——预填字典值，用户可纠正（手填压内置的入口）；
   *  - 手填：「修改」+「移除」——移除即回落到内置或无归属。
   * 编辑态把整行换成两个文本输入 + 保存 / 取消。`restore` = BUG-80a 的重画恢复。
   */
  const buildRegionRow = (name: string, count: number, restore?: { continent: string; country: string }): HTMLElement => {
    const row = h('div', 'momo-set-locrow')
    // BUG-110a：手填表按**身份**找键（与坐标块同一条读法）
    const key = userKeyOf(regionsNow(), name)
    const user = key === null ? undefined : regionsNow()[key]
    const custom = isValidLocRegion(user) ? user : null
    // 内置字典的索引签名在 TS 眼里不可空，运行时未命中是 undefined——?? null 兜运行时
    const builtin = custom === null ? (BUILTIN_LOC_REGIONS[name] ?? null) : null
    const region = custom ?? builtin
    // 归属列是**显示**不是数据编辑：大洲 / 国家按当前界面语言写（2026-10-06「界面
    // 语言选英语后地点还是中文」，三级同一把尺子 displayLocName）。手填的归属不在
    // 任何字典里 → 原样返回；行身份与编辑态预填都仍是盘上那个字符串（`name` /
    // `region`），本地化只发生在这一列的文字上。
    const regionText = region
      ? [region[0], region[1]]
          .filter((s) => s !== '')
          .map((s) => displayLocName(s))
          .join(copy.location.pathSep)
      : ''

    const paintRead = (): void => {
      row.empty()
      row.append(h('span', 'momo-set-locrow-name', name))
      row.append(h('span', 'momo-set-locrow-count', lc.count(count)))
      row.append(
        h(
          'span',
          `momo-set-locrow-region${regionText ? '' : ' is-none'}`,
          regionText || lc.regionNone,
        ),
      )
      if (custom !== null) row.append(h('span', 'momo-set-locrow-src', lc.srcCustom))
      else if (builtin !== null) row.append(h('span', 'momo-set-locrow-src', lc.srcBuiltin))

      const acts = h('div', 'momo-set-locrow-acts')
      acts.append(actBtn(region === null ? lc.fill : lc.edit, 'is-ghost', () => openRegionEdit()))
      if (custom !== null) {
        acts.append(
          actBtn(lc.remove, 'is-ghost', () => {
            // 移除的正是编辑中的那行才清登记（BUG-80a，与坐标块同一条）
            if (editingRegion?.name === name) editingRegion = null
            const next = { ...regionsNow() }
            delete next[key ?? name]
            saveRegions(next)
            void paintRegionList()
          }),
        )
      }
      row.append(acts)
    }

    const openRegionEdit = (): void => {
      showWarn(regionUseWarn)
      // 登记编辑态（BUG-80a）：预填 = 恢复值 > 行自身归属；随输入实时更新
      editingRegion = {
        name,
        continent: restore?.continent ?? (region ? region[0] : ''),
        country: restore?.country ?? (region ? region[1] : ''),
      }
      row.empty()
      row.append(h('span', 'momo-set-locrow-name', name))
      const cont = ctx.field.textInput(editingRegion.continent, lc.addContinentPh, () => {})
      cont.setAttribute('aria-label', lc.addContinent)
      const ctry = ctx.field.textInput(editingRegion.country, lc.addCountryPh, () => {})
      ctry.setAttribute('aria-label', lc.addCountry)
      cont.addEventListener('input', () => {
        if (editingRegion?.name === name) editingRegion.continent = cont.value
      })
      ctry.addEventListener('input', () => {
        if (editingRegion?.name === name) editingRegion.country = ctry.value
      })
      const commit = (): void => {
        showWarn(regionUseWarn)
        const a = cont.value.trim()
        const b = ctry.value.trim()
        if (a === '' && b === '') {
          // 两项全空 = 没填：与「移除」等价（回落到内置或无归属），不落一条空数据
          editingRegion = null
          const next = { ...regionsNow() }
          delete next[key ?? name]
          saveRegions(next)
          void paintRegionList()
          return
        }
        if (badRegionPart(a) || badRegionPart(b)) {
          showWarn(regionUseWarn, lc.regionTooLongErr(LOCATION_MAX_CHARS))
          return
        }
        // 与添加行同一条闸：两项同值 = 脏输入，不许落一条会把国家拆成两组的数据（BUG-71b）
        if (a !== '' && a === b) {
          showWarn(regionUseWarn, lc.regionSameErr)
          return
        }
        editingRegion = null
        // 保存落在原键上（BUG-110a，与坐标块同一条）：旧写法的键不搬家
        saveRegions({ ...regionsNow(), [key ?? name]: [a, b] })
        void paintRegionList()
      }
      cont.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' && !ev.isComposing) commit()
      })
      ctry.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' && !ev.isComposing) commit()
      })
      const acts = h('div', 'momo-set-locrow-acts')
      acts.append(actBtn(lc.save, '', commit), actBtn(lc.cancel, 'is-ghost', () => {
        editingRegion = null
        paintRead()
      }))
      row.append(cont, ctry, acts)
      cont.focus()
    }

    paintRead()
    if (restore) openRegionEdit()
    return row
  }

  let regionSeq = 0

  /** 整列重画：与坐标块同一节奏（写盘后重画；只填了归属还没笔记的地点也列） */
  async function paintRegionList(): Promise<void> {
    const mine = ++regionSeq
    // 同样按**地点**列（管的是「一个地名的归属」）：identifier 是地名本身
    const tallies = locationTallies(await ctx.service.listEntries())
    // BUG-73：同坐标块的 seq 守卫——过期轮次不许再往 DOM 里 append（重复行）
    if (mine !== regionSeq) return
    regionListBox.empty()
    // BUG-110a：与坐标块同一条对表口径（按身份去重手填键）
    const used = new Set(tallies.map((t) => canonicalLocName(t.location)))
    const seenManual = new Set<string>()
    const manualOnly = Object.keys(regionsNow())
      .sort((a, b) => a.localeCompare(b))
      .filter((name) => {
        const id = canonicalLocName(name)
        if (used.has(id) || seenManual.has(id)) return false
        seenManual.add(id)
        return true
      })
    if (tallies.length === 0 && manualOnly.length === 0) {
      regionListBox.append(h('div', 'momo-set-loc-empty', lc.regionEmpty))
      return
    }
    for (const t of tallies) {
      regionListBox.append(
        buildRegionRow(t.location, t.count, editingRegion?.name === t.location ? editingRegion : undefined),
      )
    }
    for (const name of manualOnly) {
      regionListBox.append(buildRegionRow(name, 0, editingRegion?.name === name ? editingRegion : undefined))
    }
    // BUG-80a：编辑中的行没被这次重画画出来 → 放弃恢复（与坐标块同一条）
    if (editingRegion) {
      const present = [...tallies.map((t) => t.location), ...manualOnly]
      if (!present.includes(editingRegion.name)) editingRegion = null
    }
  }

  regionUse.append(regionUseHead, regionListBox, regionUseWarn)
  // 同上：块尾两条注记（「只填大洲或只填国家也算数」「手填归属是用户数据：恢复默认不会
  // 清掉它」）2026-10-11 按用户要求整句移除。**行为没变**：只填一侧仍然落盘、仍然
  // 分组时跳过空的那一环（locPartsOf），`locRegions` 仍不进 `PREFS_DEFAULTS`。
  c.append(regionUse)
  void paintRegionList()
}
