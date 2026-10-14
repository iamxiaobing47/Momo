// 配色方案对比度守卫（WCAG 2.1 AA + 选中态/代码块可分性）—— v0.9.31
//
//   node scripts/check-contrast.mjs           单独跑（打印全表）
//   node scripts/check-contrast.mjs --quiet   只打印不通过项（被 build-css 调用）
//
// 查的是 WCAG 2.1 两条成功准则：
//   · SC 1.4.3 Contrast (Minimum) —— 正文文字 ≥ 4.5:1，大号文字（≥24px 或
//     ≥18.66px 粗体）≥ 3:1。本项目的字号档位 fs-1..fs-8 = 11..44px，只有
//     fs-7(22px 粗) / fs-8(44px) 够得上「大号」，其余一律按 4.5:1 算。
//   · SC 1.4.11 Non-text Contrast —— 用于识别控件与状态的图形 / 边界 ≥ 3:1
//     （热力图格子、未选中圈、选中胶囊描边、焦点环）。
//
// 判定对（fg 令牌 / bg 令牌 / 门槛 / 依据）写在下面的 PAIRS 里。**改色值前先读
// 一眼这张表**：它把「这个令牌到底被当成什么用」钉死了，也是新增方案时唯一需要
// 遵守的对比度契约。
//
// 四类结果：
//   · blocking  —— 构建直接失败（正文 / 控件文字不达标，这是硬伤）
//   · advisory  —— 只报告不失败（装饰性描边：卡片分隔线。它不承担「识别控件」的
//                  职责——被它围起来的控件另有底色与文字标签，见 PAIRS 里的注）
//   · state     —— 可分性门槛（选中底 / 空格子与所在面的差），拦截
//
// 底的选择 = **这个令牌真正被画在哪个面上**：卡片里的东西按 card / surface-2 判，
// 侧栏里的东西（活跃度热力图、滚动条、hover 描边）按 surface 判，主区里的东西
// （空态图标）按 page 判。2026-10-01 之前侧栏那批只按 card 判，于是九套方案的
// 最低一级活跃度、六套的 hover 描边在侧栏上糊掉（同一族病根的两处报障：
// 「墨夜里看不到滚动条」与「活跃度格子看不清」）。判定对见 ⑤c 组。
//
// 为什么不用肉眼看：低对比的错在界面上「看得见但说不清哪里不对」，而且每套配色
// 各有一份色值，改一套会悄悄弄坏另一套。这里是唯一能一次看全 N×M 个组合的地方。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectRoot } from './project-root.mjs'

// 不传 import.meta.url：那是 URL 字符串，path.dirname 按普通路径切完后，
// existsSync 又把 `file:/c:/…` 当相对路径按 cwd 解析（实测返回 '.'）。
// 默认参数内部先 fileURLToPath——scripts/ 直跑 / 打进 tmp/test 两种宿主、
// 任意 cwd 下都指向仓库根。
const projectDir = projectRoot()
const themesDir = path.join(projectDir, 'styles.src', 'themes')

// ---- WCAG 2.1 相对亮度与对比度（SC 1.4.3 的官方算法）----
const srgbToLinear = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
/** @param {[number,number,number]} rgb 0–255 */
const luminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
/** 对比度：1（完全相同）～ 21（黑白） */
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** '#abc' / '#aabbcc' → [r,g,b]；其它（rgba()/渐变/非色值）返回 null */
const parseHex = (v) => {
  const s = String(v).trim().toLowerCase()
  if (!s.startsWith('#')) return null
  const h = s.slice(1)
  if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16))
  if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return null
}
/** 'rgba(53, 116, 90, 0.22)' → { rgb, a }；非 rgba 返回 null */
const parseRgba = (v) => {
  const m = String(v).match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const n = m[1].split(',').map((x) => parseFloat(x.trim()))
  return { rgb: [n[0], n[1], n[2]], a: n.length > 3 ? n[3] : 1 }
}
/** 半透明前景合成到不透明底上（算 --text-highlight-bg 这类命中底色时用） */
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a))
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')

// ---- Lab / ΔE（BUG-44 ⑥b 用：代码块 palette 角色两两「分得开」）----
// 只走 CIE76（欧氏距离），够守卫用；要更严可以换 CIEDE2000。
const linearToXyz = ([r, g, b]) => {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  return [
    0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
    0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb,
    0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb,
  ]
}
const pivot = (n) => (n > 0.008856 ? Math.pow(n, 1 / 3) : 7.787 * n + 16 / 116)
const rgbToLab = (rgb) => {
  const [x, y, z] = linearToXyz(rgb)
  const xn = x / 0.95047
  const yn = y / 1.0
  const zn = z / 1.08883
  return [
    116 * pivot(yn) - 16,
    500 * (pivot(xn) - pivot(yn)),
    200 * (pivot(yn) - pivot(zn)),
  ]
}
const deltaE = (a, b) => {
  const [l1, a1, b1] = rgbToLab(a)
  const [l2, a2, b2] = rgbToLab(b)
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

/** 正文文字：4.5:1（本项目只有 fs-7/fs-8 够「大号」，见文件头注释） */
const TEXT = 4.5
/** 非文字（控件边界 / 图形）：3:1 */
const NONTEXT = 3
/** vivid 档热力图相邻级的色相补判（ΔE）：明度 3:1 放开后，级差可读性的一半交给色相。
 *  定义在 PAIRS 之前——下面 ⑤c 的相邻级 ΔE 判定对要引用它（见 HEAT_MIN 的 vivid 档）。 */
const VIVID_DE_STEP = 12

/**
 * 判定对。改这套表 = 改「WCAG AA 在本项目里意味着什么」，动之前想清楚。
 *
 * fg/bg 里的 `a:数字` 表示该令牌是半透明的，需先合成到 bg 上再比。
 */
const PAIRS = [
  // ---- ① 墨阶文字 × 四种底（正文、次级、辅助、微标注 / 图表轴标签）----
  // ink-4 不是「装饰灰」：--momo-text-3 与 --dp-axis 都指向它，
  // 卡片 meta、热力图月份、图表轴标签全是它，所以按正文门槛算。
  ...['ink', 'ink-2', 'ink-3', 'ink-4'].flatMap((fg) =>
    ['page', 'card', 'surface', 'surface-2'].map((bg) => ({ fg, bg, min: TEXT, kind: 'text' })),
  ),
  { fg: 'ink', bg: 'accent-soft', min: TEXT, kind: 'text' },
  { fg: 'ink', bg: 'accent-soft-2', min: TEXT, kind: 'text' },
  { fg: 'ink-2', bg: 'accent-soft', min: TEXT, kind: 'text' },
  { fg: 'ink-3', bg: 'accent-soft', min: TEXT, kind: 'text' },
  { fg: 'ink-4', bg: 'accent-soft', min: TEXT, kind: 'text' },
  // 按压底上的文字（2026-10-13，与 ⑧b 同批）：按压态只换底、不换字色，所以静置字色
  // 必须在这块底上仍然达标。消费者是设置页的按钮一族（.momo-set-btn 的 ink-2、chip
  // 按压时转 ink、配色卡继承 ink）。⚠️ ink-3 目前在 mist-blue 的按压底上只有 4.41
  // （#65686b on #e4e4e4）——所以 chip 的按压态跟着 hover 一起写了 `color: ink`；
  // 谁要往按压底上放 ink-3，先把 press 提亮到让这条过。
  { fg: 'ink', bg: 'press', min: TEXT, kind: 'text' },
  { fg: 'ink-2', bg: 'press', min: TEXT, kind: 'text' },

  // ---- ② 语义色文字（链接 / 选中名 / 危险项 / 状态字）----
  ...['accent', 'accent-hover', 'danger', 'danger-hover', 'warn', 'sage', 'clay', 'primary'].flatMap((fg) =>
    ['page', 'card'].map((bg) => ({ fg, bg, min: TEXT, kind: 'text' })),
  ),
  { fg: 'accent', bg: 'accent-soft', min: TEXT, kind: 'text' },
  { fg: 'accent', bg: 'accent-soft-2', min: TEXT, kind: 'text' },
  { fg: 'accent', bg: 'surface', min: TEXT, kind: 'text' },
  { fg: 'danger', bg: 'surface', min: TEXT, kind: 'text' },
  // BUG-190（2026-10-11 hover 专项）：hover 换底后语义色跟着换深浅档的组合，此前全在
  // 判定对面外——消费点见各条注释，五套现值 5.99~8.34 / 6.25~7.68（全过，这条是
  // 守卫缺口不是现行缺陷）。
  { fg: 'accent-hover', bg: 'accent-soft', min: TEXT, kind: 'text' }, // 写点什么 / 主按钮 / 回顾主动作 hover（accent-soft 底 + accent-hover 字）
  { fg: 'danger-hover', bg: 'surface', min: TEXT, kind: 'text' }, // 批量条危险项 hover（surface 底 + danger-hover 字）

  // ---- ②b 卡片 meta 行的两族胶囊：loc × loc-soft / tag × tag-soft（2026-10-12 解耦）----
  // 地点 pill（.momo-loc-pill）与标签 chip（.momo-card-tag）从 sage / accent 令牌
  // 解耦到 loc / tag 专用令牌——各方案按自己的 palette 给这两族上色（雾蓝 = 雾蓝 pill、
  // 苔绿 = 中性灰 pill、蛤白 = 赭石 pill、StepFun = 活力橙 pill、墨夜照抄 sage/accent 原值）。
  // 判据三条一对：静止（字 × soft 底）、pill 落在 card 上（字 × card）、hover 实底反色
  // （page 字 × 实底）。tag 在五套里都取签名色本体，loc 才是各方案的辨识度所在。
  { fg: 'loc', bg: 'loc-soft', min: TEXT, kind: 'text' },
  { fg: 'loc', bg: 'card', min: TEXT, kind: 'text' },
  { fg: 'page', bg: 'loc', min: TEXT, kind: 'text' },
  { fg: 'tag', bg: 'tag-soft', min: TEXT, kind: 'text' },
  { fg: 'tag', bg: 'card', min: TEXT, kind: 'text' },
  { fg: 'page', bg: 'tag', min: TEXT, kind: 'text' },

  // ---- ③ 实底控件上的文字（按钮 / 选中勾 / 危险钮）----
  { fg: 'primary-ink', bg: 'primary', min: TEXT, kind: 'text' },
  { fg: 'on-accent', bg: 'accent', min: TEXT, kind: 'text' },
  { fg: 'on-accent', bg: 'accent-hover', min: TEXT, kind: 'text' },
  { fg: 'on-danger', bg: 'danger', min: TEXT, kind: 'text' },
  { fg: 'on-danger', bg: 'danger-hover', min: TEXT, kind: 'text' },

  // ---- ④ 搜索命中：高亮底色是半透明的，先合成到卡片上再比 ----
  { fg: 'ink', bg: 'card', overFg: 'text-highlight-bg', min: TEXT, kind: 'text' },

  // ---- ⑤ 非文字（SC 1.4.11）：热力图格子 / 未选中圈 / 选中胶囊描边 ----
  // heat-0 是「这天没记录」，是**无数据的底色**而非图形信息，不参与判定。
  // heat-1..4 的门槛**按方案分档**（见 HEAT_MIN），不是一个全局 3:1。
  ...['heat-1', 'heat-2', 'heat-3', 'heat-4'].map((fg) => ({ fg, bg: 'card', min: NONTEXT, kind: 'ui', heat: true })),
  { fg: 'ink-5', bg: 'card', min: NONTEXT, kind: 'ui' }, // 未选中圈 / 复选空圈
  { fg: 'ink-5', bg: 'page', min: NONTEXT, kind: 'ui' },
  { fg: 'ink-6', bg: 'card', min: NONTEXT, kind: 'ui' }, // 空状态图标 / hover 描边
  { fg: 'accent', bg: 'card', min: NONTEXT, kind: 'ui' }, // 焦点环 / 进度条

  // ---- ⑤c 侧栏 surface 上的细节（2026-10-01「细节处要体现配色」专项）----
  // 上面的卡片底口径漏了**真正用色的地方**：侧栏活跃度（20-panel.css 的
  // .momo-heat-cell 一族）整张坐在 --momo-surface 上；滚动条拇指、未选圈、hover 描边、
  // 空状态图标（80-settings）也都在 surface / page 上现形。
  // 于是出现一族「色值按 card 调、用在了 surface 上」的糊：九套方案的「记了一天」
  // 最低一级不足 3:1、六套的 hover 描边与滚动条拇指不足 3:1、七套的空格子与侧栏
  // 同色——与墨夜「看不到滚动条」那条报障是同一个病根（门槛的底 ≠ 真实的底）。
  // 十套方案的色值已按这三底重调（见各主题文件同段注释），这里把口径补齐钉住。
  ...['heat-1', 'heat-2', 'heat-3', 'heat-4'].map((fg) => ({
    fg,
    bg: 'surface',
    min: NONTEXT,
    kind: 'ui',
    heat: true,
    why: '侧栏活跃度格子 × 侧栏 surface',
  })),
  { fg: 'ink-5', bg: 'surface', min: NONTEXT, kind: 'ui', why: '滚动条拇指 / 未选圈 × 侧栏 surface' },
  { fg: 'ink-6', bg: 'surface', min: NONTEXT, kind: 'ui', why: 'hover 描边 / 空态图标 × 侧栏 surface' },
  { fg: 'ink-6', bg: 'page', min: NONTEXT, kind: 'ui', why: '空态图标 × 主区 page' },
  // BUG-190（2026-10-11 hover 专项）：侧栏热力格的 hover 描边（.momo-heat-cell:hover
  // 的 outline accent）也在 surface 上现形——⑤ 只判了 accent × card，这里补齐；
  // 五套现值 4.91~6.80（全过）。
  { fg: 'accent', bg: 'surface', min: NONTEXT, kind: 'ui', why: '侧栏热力格 hover 描边 × 侧栏 surface' },
  // 空格子（heat-0）是「这天没记录」，不按图形信息判 3:1；但它与侧栏 surface 的差
  // 必须看得见，否则整张网格「溶」进侧栏、只剩有数据的格子像漂着的点。
  // v0.9.11 起这条只 advisory，兜底是格子上的内描边（20-panel.css .momo-heat-cell）；
  // 2026-10-01 十套色值按 1.05 重调后升级为拦截——描边仍有，但空格子先自分得清。
  { fg: 'heat-0', bg: 'surface', min: 1.05, kind: 'state', why: '侧栏空格子 × 侧栏 surface' },
  // ★ 分档语言通用（2026-10-07 起 moss-green 浅绿 / 2026-10-09 起 stepfun vivid）：
  //   **空格子 vs 有数据格**这条信号在
  //   moss-green 是靠**色相**（灰 → 绿）而非明度承担的——实测 heat-0 #EFEFEF 与
  //   heat-1 #C2E8D1 的明度比只有 1.16:1，但 Lab ΔE = 19.0。所以对走浅绿语言的
  //   方案，「有记录」的可辨识性该由 ΔE 判，而不是硬套 3:1 明度门槛
  //   （SC 1.4.11 本就只要求识别**状态**所必需的对比，两条路径都合规）。
  //   这两条只对 HEAT_MIN 里登记了 `tint` 语言的方案生效，其余五套仍按 3:1 拦。
  { fg: 'heat-1', bg: 'heat-0', min: 0, kind: 'deltaE', deMin: 15, heatTint: true, why: '有数据格 vs 空格子（分档语言靠色相）' },

  // ★ 二次元鲜明语言（2026-10-09，stepfun 专用）：vivid 档的**相邻级 ΔE 补判**。
  //   vivid 放开了 heat-1..3 的 3:1（品牌渐变「薄荷→青→阶跃蓝→紫」的中段本该是
  //   明艳的，压成深色块就不是这套语言了），级差可读性改由「明度倍率 1.15（全局
  //   照拦）+ 色相阶梯」共同承担——这三条钉色相那一半。防的是「相邻级色相撞车
  //   且明度贴太近」双失守：薄荷→青→蓝→紫每一跳都换色相，本条本就该过。
  { fg: 'heat-2', bg: 'heat-1', min: 0, kind: 'deltaE', deMin: VIVID_DE_STEP, heatVivid: true, why: '热力图相邻级（vivid 档色相补判）' },
  { fg: 'heat-3', bg: 'heat-2', min: 0, kind: 'deltaE', deMin: VIVID_DE_STEP, heatVivid: true, why: '热力图相邻级（vivid 档色相补判）' },
  { fg: 'heat-4', bg: 'heat-3', min: 0, kind: 'deltaE', deMin: VIVID_DE_STEP, heatVivid: true, why: '热力图相邻级（vivid 档色相补判）' },

  // ---- ⑥ 代码块 palette（2026-09-28）----
  // 卡片里的代码块 / 行内代码底是 --momo-surface-2（themes/*.css 注释为「嵌面」，
  // 与 60-design.css 的引用块同档），语法高亮打出来的每个角色都是正文级文字，
  // 所以按 4.5:1 卡（与 ② 同一门槛）。墨阶那三个角色不用在这里重复——ink / ink-2 /
  // ink-3 在 ① 里已经按 surface-2 判过。
  // 为什么必须补这一组：palette 把 sage 用到了**字符串**上，而 ② 只判到 page / card。
  // mist-blue 的 sage / clay / warn 在 card（#ffffff）上本来就压线（4.66~4.68），
  // 搬到 surface-2（#fafaf9）只剩 4.46~4.48——差 0.02 不达标，三个色值因此各压深一档。
  ...['accent', 'accent-hover', 'sage', 'clay', 'warn', 'danger'].map((fg) => ({
    fg,
    bg: 'surface-2',
    min: TEXT,
    kind: 'text',
  })),

  // ---- ⑥b 代码块 palette 角色两两可分（2026-09-30，BUG-44）----
  // ⑥ 只判「每个角色读得清」，这里判「角色之间分得开」。判据用 Lab ΔE 不用对比度——
  // 同亮度不同色相仍然分得开（石案的 accent 与 warn 正是这种，对比度 1.09 但一眼分得出）。
  ...['accent', 'sage', 'clay', 'warn', 'danger'].flatMap((fg, i) =>
    ['accent', 'sage', 'clay', 'warn', 'danger'].filter((bg, j) => j > i).map((bg) => ({
      fg, bg, min: 0, kind: 'deltaE', deMin: 15,
    })),
  ),

  // ---- ⑧ 选中态可分辨：选中底 vs 卡片底至少差 1.10（2026-09-30，BUG-45）----
  // 「选中 = 换底」是项目语言的一部分（segmented / chip / checked 卡三处），
  // 底色差 <1.10 时选中实际只剩描边一道信号。
  { fg: 'accent-soft', bg: 'card', min: 1.10, kind: 'state' },
  { fg: 'accent-soft-2', bg: 'card', min: 1.10, kind: 'state' },

  // ---- ⑧b 按压底可分辨（2026-10-13 用户报「雾蓝配色，所有的按钮，在点击后都会变成
  //   白色，然后与背景色融为一体，就看不清了」）----
  // 按压底 --momo-press 是**按钮按下去那一刻唯一换的东西**（:active 只改 background，
  // 形变只有 0.5px 下沉），所以它必须离两种静置面都够远：
  //   · card    —— 按钮一族的静置面（.momo-set-btn / .momo-set-scheme 自带 card 底）；
  //   · surface —— 轨道控件的静置面（chip / 分段 / 导航 chip / 步进器 / 序位钮都坐在
  //                父容器的 surface 轨道上、自己透明）。
  // 门槛沿用 ⑧ 组「选中 = 换底」的 1.10——它是同一族病：原先七条 :active 全吃
  // --momo-surface-2（「嵌面」）。横展复算五套 × 两底（旧值，card / surface）：
  //   mist-blue **1.02 / 1.02**（报障的一套：page=card=#ffffff，surface-2 #fdfdfd）
  //   moss-green **1.09 / 1.04** · stepfun 1.13 / **1.08** · ink-night **1.07** / 1.10
  //   clam-white 1.13 / 1.11 —— 数值上唯一过的，可它的 surface-2 比 surface **亮**
  //   （「压一档」压成「浮一档」），方向反了。
  // 即五套里四套至少一侧不达标。clam-white 那条留着 ⑧b 拦是因为它只差 0.01 的余量，
  // 色值一动就掉下去；方向那一半由 80-buttons.css 的通则注与令牌语义兜。
  { fg: 'press', bg: 'card', min: 1.10, kind: 'state', why: '按压底 × 按钮的静置卡片面' },
  { fg: 'press', bg: 'surface', min: 1.10, kind: 'state', why: '按压底 × 轨道控件的静置侧栏面' },

  // ---- ⑦ 装饰性描边：只报告，不作废 ----
  // SC 1.4.11 只约束「识别控件与状态**所必需**的视觉信息」；这几条线围起来的东西
  // 都有冗余线索，所以不适用：
  //   · line / line-soft —— 卡片分隔线。卡片另有底色、内边距与文字标签。
  //   · accent-line —— 选中胶囊描边。选中态另有 accent-soft 底 + accent 色文字 +
  //     加粗（v0.9.6 定下的选中语言），描边只是第三重强调。把它压到 3:1 会在浅色
  //     胶囊上糊一圈中灰，跟整套克制的调子打架。
  // 留着数字是为了别让它们一路淡到彻底看不见。
  { fg: 'line', bg: 'card', min: NONTEXT, kind: 'advisory' },
  { fg: 'line-soft', bg: 'card', min: NONTEXT, kind: 'advisory' },
  { fg: 'accent-line', bg: 'card', min: NONTEXT, kind: 'advisory' },
]

/**
 * 阶梯单调性（在 card 底上量）：只比对比度，不比色相。
 * 少了这条，改一个令牌就能把「次级比主文更深」这种倒挂悄悄带进来——WCAG 一条都
 * 没违反，但整条灰阶读起来是乱的（v0.9.8 调色时就真出现过 ink-3 比 ink-2 深）。
 */
const RAMP = [
  { name: '墨阶 ink', tokens: ['ink', 'ink-2', 'ink-3', 'ink-4', 'ink-5', 'ink-6'], dir: -1, bg: 'card' },
  { name: '热力图 heat', tokens: ['heat-1', 'heat-2', 'heat-3', 'heat-4'], dir: 1, bg: 'card' },
]

/**
 * 热力图相邻级的**最小倍率**（v0.9.11 新增的拦截项）。
 *
 * 为什么单调性不够：热力图格子只有 8~26px，「这一格比那一格多记了一天」是**读級**
 * 的唯一通道，两级挨得太近就等于少一级。v0.9.10 的十套里有七套顶端两级倍率
 * ≤1.10（moss-green 1.03 / stone 1.14 / 青瓷 1.08 / 绛红 1.04 / 暮紫 1.10 /
 * 米黄纸 1.03），用户实拍反馈「活跃度格子看不清楚」——WCAG 一条没违反，
 * 但级差在侧栏小格子上根本看不出来。
 *
 * 1.15 是实测选定的：略高于「两格并排能数出来」的下限，又不至于为凑倍率把
 * 色阶拉得失真。守卫红了**修色值**（回调中间级 / 给顶端留更深的一档），
 * 不许调阈值——阈值一动，这条守卫就白加了。
 */
const HEAT_MIN_STEP = 1.15

/**
 * 热力图语言**按方案分档**（2026-10-07 新增；此前 heat-1..4 只有一条全局 3:1）。
 *
 * 为什么不能继续用一条 3:1：moss-green（苔绿）的热力图是**浅绿语言**——真机实测
 * heat-0（空格）`#EFEFEF`、heat-1（有数据）`#C2E8D1`，两者明度比只有 **1.16:1**，
 * 远不到 3:1；但它们靠**色相**（灰 → 绿，Lab ΔE = **19.0**）就能一眼分开。
 * SC 1.4.11 要求的是「识别状态**所必需**的视觉信息」达到 3:1，而这里承担
 * 「这天有没有记录」这条状态识别的是色相差，不是明度差——把 3:1 硬套上去，
 * 等于强迫 moss-green 把「记了一天」画成深绿块，那就不是 moss-green 了。
 *
 * 两档的判据各自对准真实的信号（**机制不同，不是简单地松一档**）：
 *   · `deep`（默认，五套）：heat-1..4 明度上 ≥3:1 @ surface（现行口径不动）。
 *   · `tint`（浅绿，moss-green）：heat-1..4 只要求 heat-4 顶到 3:1（保证「最活跃」
 *     那档仍从底色里跳出来），**有记录 vs 空格子**改由 ΔE(heat-1, heat-0) ≥ 15 判。
 *
 * ⚠️ 登记 `tint` 的方案必须同时满足：① heat-0 vs surface ≥1.05（PAIRS ⑤c 末条
 *   对所有方案都拦，浅绿语言下空格仍要溶不进侧栏）；② 相邻级倍率 ≥HEAT_MIN_STEP
 *   （对所有方案都拦）。这两条是浅绿语言**不靠明度之后的兜底**，缺一条就回去改。
 *
 * ⚠️ 加新方案时若要走浅绿语言，先跑一遍 ΔE 实测再登记；`tint` 档下 heat-1
 * 的 3:1 不再拦，别拿「它过了」当证据——判据是 ΔE 那条。
 *
 * ── `vivid` 档（二次元鲜明语言，2026-10-09 用户裁定「更大胆、更活泼、更二次元」）──
 *   stepfun 的热力图是**品牌渐变**：薄荷青 → 青 → 阶跃蓝 → 紫（取自品牌图上
 *   发根到发尾、再到像素单车的那条渐变）。明艳的薄荷 / 青打底是小格子上「活」
 *   的来源；按 3:1 明度卡住，等于把渐变中段全压成深色块——那就不是这套语言了。
 *   机制与 tint 档同族（**不是简单松一档**）：
 *     · heat-1..3 不套 3:1（card / surface 两底都放行），**heat-4 仍顶 3:1**；
 *     · 「有记录 vs 空格子」仍由 ΔE(heat-1, heat-0) ≥ 15 判（色相承担）；
 *     · **相邻级 ΔE ≥ VIVID_DE_STEP**——明度阶梯放开后，色相阶梯补上级差可读性；
 *     · 相邻级明度倍率仍走全局 HEAT_MIN_STEP 1.15，vivid 档**不豁免**——
 *       色相是加分项，不是明度阶梯的替代品（v0.9.11 的实拍反馈就是「数不出级」）。
 */
const HEAT_MIN = {
  'moss-green': { tint: true, topOnly: 3 },
  stepfun: { vivid: true, topOnly: 3 },
}

/** heat-1..4 在某方案下的明度门槛：分档方案（tint / vivid）只对 heat-4 生效，其余放行到 0 */
function heatMinFor(themeId, fg) {
  const spec = HEAT_MIN[themeId]
  if (!spec) return NONTEXT             // 未登记 = deep 档：全局 3:1 照拦
  // BUG-175b 顺手对齐：HEAT_MIN 的成文意图是「heat-4 仍顶 3:1」（card / surface 两底）
  // ——旧实现对 card 底一律放行（连 heat-4 也放），与注释相反。现两套真值都过，
  // 收紧后语义与注释一致（code comment 与 doc comment 不再打架）。
  return spec.topOnly && fg === 'heat-4' ? spec.topOnly : 0
}

/**
 * heat-0（无数据格）与 surface（侧栏活跃度的底）的最小倍率。
 * 侧栏热力图坐在 --momo-surface 上而不是 card 上，heat-0 按 card 底设计，
 * 两色常常几乎同色（v0.9.11 实测十套里七套 ≤1.10、celadon（已删） 1.00 完全同色（celadon（已删） 已随 2026-10-04 收编删除））。
 * 2026-10-01「细节处要体现配色」专项里十套色值按这个倍率重调过，这条随之从
 * 「只报告」升级为拦截（判定对见 PAIRS ⑤c 末条）。格子上的内描边
 * （20-panel.css .momo-heat-cell）仍在，但空格子先自分得清。
 */
const HEAT_0_VS_SURFACE = 1.05

/**
 * 跑全部方案 × 全部组合。
 *
 * @param {{ quiet?: boolean, themesDir?: string }} opts
 *   themesDir：读方案文件的目录，默认项目里的 styles.src/themes。测试用临时目录
 *   构造「故意不过」的方案来钉死守卫本身——不改这个参数就只能拿真源当试验田。
 * @returns {{ ok: boolean, problems: string[], lines: string[] }}
 */
export function checkContrast({ quiet = false, dir = themesDir } = {}) {
  const problems = []
  const lines = ['check-contrast（WCAG 2.1 AA：正文 4.5:1 · 非文字 3:1）']
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.css')).sort().map((f) => f.replace(/\.css$/, ''))

  for (const id of ids) {
    const text = fs.readFileSync(path.join(dir, `${id}.css`), 'utf8')
    const tok = {}
    for (const m of text.matchAll(/^\s+(--[\w-]+):\s*([^;]+);/gm)) tok[m[1]] = m[2].trim()
    // PAIRS 里写的是短名（ink / card），真令牌一律是 --momo-<短名>
    const rgbOf = (name) => parseHex(tok['--momo-' + name] ?? '')

    const fails = []
    const missing = []
    let worst = { ratio: 99 }
    let worstBlocking = { ratio: 99 }
    for (const p of PAIRS) {
      const fg = rgbOf(p.fg)
      const bg = rgbOf(p.bg)
      if (!fg || !bg) {
        // 静默 continue 曾让某令牌改写成 8 位 hex（合法 CSS，parseHex 不认）后，
        // 该主题的判定对**无声消失**、守卫照常「AA 通过」（BUG-34）。
        // 取不到色值本身就是问题：缺令牌 / 改名 / 色值格式不支持都要报出来。
        missing.push(`${p.fg}×${p.bg}`)
        continue
      }
      // 半透明的命中底色先合成到背景上，再拿文字色去比（否则会高估对比度）
      let base = bg
      if (p.overFg) {
        // BUG-175b：令牌全名是 `--text-highlight-bg`（Obsidian 原生变量，不带 momo 前缀）
        // ——旧查表 `tok[p.overFg]` 少了 `--`，恒为 undefined，`if (hl)` 永不成立，
        // ④ 这条判定对自 2026-09-26 引入起**从未生效**（base 恒等于 card，退化成
        // ① ink×card 的重复）。取不到色值也不许静默：rgba 解析失败与 fg/bg 同待遇，
        // 并入 missing（BUG-34 / BUG-154 两处都收口了，这是第三处）。
        const hl = parseRgba(tok['--' + p.overFg] ?? '')
        if (!hl) {
          missing.push(`${p.fg}×${p.bg}（over ${p.overFg} 取不到）`)
          continue
        }
        base = over(hl.rgb, hl.a, bg)
      }
      const ratio = contrast(fg, base)
      // deltaE 用 Lab 欧氏距离（BUG-44 ⑥b：代码块角色两两分得开）
      const de = p.kind === 'deltaE' ? deltaE(fg, bg) : null
      const effectiveRatio = p.kind === 'deltaE' ? de : ratio
      let effectiveMin = p.kind === 'deltaE' ? (p.deMin ?? 0) : p.min
      // 热力图明度门槛按方案分档（浅绿 / 二次元鲜明语言：heat-1..3 不套 3:1，见 HEAT_MIN）。
      // ΔE 那几条反过来——只对登记了分档的方案生效，deep 档不参与。
      if (p.heat) effectiveMin = heatMinFor(id, p.fg)
      if (p.heatTint && !HEAT_MIN[id]) continue
      if (p.heatVivid && !HEAT_MIN[id]?.vivid) continue
      if (effectiveRatio < worst.ratio) worst = { ratio: effectiveRatio, pair: `${p.fg} on ${p.bg}` }
      if (p.kind !== 'advisory' && effectiveRatio < worstBlocking.ratio) worstBlocking = { ratio: effectiveRatio, pair: `${p.fg} on ${p.bg}` }
      if (effectiveRatio < effectiveMin) {
        const fgHex = p.kind === 'deltaE' ? hex(fg) : hex(fg)
        const bgHex = p.kind === 'deltaE' ? hex(bg) : hex(base)
        fails.push({ ...p, ratio: effectiveRatio, fgHex, bgHex, need: effectiveMin })
      }
    }

    // 判定对里取不到的短名：非零即报（BUG-34）。提示里点名 8 位 hex 这个已知触发。
    if (missing.length > 0) {
      problems.push(
        `themes/${id}.css：${missing.length} 组判定对取不到色值（${[...new Set(missing)].join(' / ')}）` +
          `——令牌缺失 / 改名 / 写成 8 位 hex 或非 rgba() 都会走到这里（含 overFg 高亮底），守卫不允许静默跳过`,
      )
    }

    // 阶梯单调性 + 热力图相邻级最小倍率
    for (const ramp of RAMP) {
      const bg = rgbOf(ramp.bg)
      if (!bg) {
        // BUG-154：与 PAIRS 侧（BUG-34）对齐——取不到色值即报，不静默 continue。
        // 旧实现整条阶梯连同单调性 / 最小倍率检查一起蒸发，check-contrast 仍输出通过。
        problems.push(
          `themes/${id}.css：${ramp.name} 的基准色 --momo-${ramp.bg} 取不到色值` +
            `——令牌缺失 / 改名 / 写成 8 位 hex 或 rgba() 都会走到这里，阶梯检查不允许静默跳过`,
        )
        continue
      }
      const seq = ramp.tokens.map((t) => {
        const rgb = rgbOf(t)
        if (!rgb) {
          problems.push(
            `themes/${id}.css：${ramp.name} 的 --momo-${t} 取不到色值` +
              `——令牌缺失 / 改名 / 写成 8 位 hex 或 rgba() 都会走到这里，阶梯检查不允许静默跳过`,
          )
        }
        return { t, r: rgb ? contrast(rgb, bg) : null }
      })
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1]
        const b = seq[i]
        if (a.r == null || b.r == null) continue
        const ok = ramp.dir < 0 ? b.r < a.r : b.r > a.r
        if (!ok) {
          problems.push(
            `themes/${id}.css：${ramp.name} 阶梯倒挂——${a.t} ${a.r.toFixed(2)}:1` +
              ` ${ramp.dir < 0 ? '不深于' : '不浅于'} ${b.t} ${b.r.toFixed(2)}:1（on ${ramp.bg}）`,
          )
        }
        // 热力图相邻级最小倍率（拦截）：只对升序的 heat 阶梯生效；墨阶是文字层级，
        // 各级本来就密（6.48 → 5.33 这种），套 1.15 会把灰阶拉得失真。
        if (ramp.dir > 0) {
          const step = (ramp.dir < 0 ? a.r / b.r : b.r / a.r)
          if (step < HEAT_MIN_STEP) {
            problems.push(
              `themes/${id}.css：热力图相邻级倍率不足——${a.t} ${a.r.toFixed(2)}:1 → ` +
                `${b.t} ${b.r.toFixed(2)}:1 只有 ${step.toFixed(2)}×（需 ≥${HEAT_MIN_STEP}×）`,
            )
          }
        }
      }
    }

    const blocking = fails.filter((f) => f.kind !== 'advisory')
    const advisory = fails.filter((f) => f.kind === 'advisory')
    const tag = blocking.length === 0 ? 'AA 通过' : `AA 未通过（${blocking.length}）`
    lines.push(
      `  ${id.padEnd(7)} ${tag}｜最低达标 ${worstBlocking.ratio.toFixed(2)}（${worstBlocking.pair}）` +
        `｜装饰线最低 ${worst.ratio.toFixed(2)}:1`,
    )
    if (!quiet) {
      for (const f of [...blocking, ...advisory]) {
        const suffix = f.kind === 'deltaE' ? 'ΔE' : ':1'
        lines.push(
          `      ${f.kind === 'advisory' ? '·' : '×'} ${f.fg} ${f.fgHex} on ${f.bg} ${f.bgHex}` +
            ` = ${f.ratio.toFixed(2)}${suffix}（需 ${f.need}${suffix}）`,
        )
      }
    }
    // heat-0 × surface 的判定已并进 PAIRS（⑤c 末条，kind: 'state'）——2026-10-01 十套
    // 色值按 1.05 重调后它从 advisory 升成拦截，这里不再单独报一遍（内描边仍在，
    // 见 20-panel.css .momo-heat-cell）。
    for (const f of blocking) {
      const suffix = f.kind === 'deltaE' ? ' ΔE' : ':1'
      const reason = f.why ??
        (f.kind === 'deltaE' ? '两角色分不开' :
          f.kind === 'state' ? '选中态不可分辨' :
          f.kind === 'ui' ? 'SC 1.4.11 非文字' : 'SC 1.4.3 正文')
      problems.push(
        `themes/${id}.css：${f.fg} ${f.fgHex} 在 ${f.bg} ${f.bgHex} 上只有 ${f.ratio.toFixed(2)}${suffix}` +
          `（${reason}需 ${f.need}${suffix}）`,
      )
    }
  }

  if (!quiet) {
    lines.forEach((l) => console.log(l))
  }
  return { ok: problems.length === 0, problems, lines }
}

// CLI 入口（被 import 时不执行，跟 build-css.mjs / check-themes.mjs 一个套路）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, lines, problems } = checkContrast({ quiet: true })
  lines.forEach((l) => console.log(l))
  if (!ok) {
    console.log('check-contrast: 未通过')
    problems.forEach((p) => console.log(`  × ${p}`))
    process.exit(1)
  }
  console.log('check-contrast: 通过')
}
