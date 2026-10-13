import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MomoEntry } from '../../momo/types'
import { copy } from '../../momo/i18n'
import { Card } from '../card'
import { useUi } from '../store'
import { anchorRootOf, readAnchor, writeAnchor } from '../shared/viewAnchor'
import {
  DEPTH_RADIUS,
  GLASS_RADIUS,
  MOUNT_RADIUS,
  hitFocusAtCenter,
  scanFocus,
  snapTop,
  type RegisterItem,
} from './geometry'
import { useFocusWindow } from './useFocusWindow'

// 焦点滚动视图（v0.8.0 新密度档，prefs.density === 'focus'）：
// 纵向滚动 + scroll-snap 吸附，**任一时刻只有一张卡片占焦点**（停在视口中心、
// 实底不透明、完整尺寸）；上下相邻的卡片退后成**毛玻璃**（半透明底 + 背景模糊 +
// 内容柔化 + 轻微缩放），点一下任意退后的卡片即把它滚到中心、接管焦点。
//
// 与「随机回顾」的分工：回顾是**抽一批**逐张过（按钮 / 方向键驱动，有「本轮已看完」
// 的收尾态），焦点滚动是**当前筛选结果的连续滚动浏览**（滚动驱动，没有批、没有结尾）。
// 两者共用 Card / MarkdownBody，卡内交互（打开编辑 / 复制 / 加标签 / 勾选）同口径。
//
// 为什么**曾经**卡片之间要叠瓦（负 margin）：毛玻璃的 backdrop-filter 需要「背后有
// 东西」才模糊得出来，相邻卡片各探出 36px 互相压住，退后的卡模糊到的正是下一张卡的
// 内容。**v0.9.15 三轮起叠瓦退场**（见下面「一屏一卡」段）：探出槽位的 36px 尾巴在
// 短卡居中时正好落在屏幕顶端（用户报「最上部分不要有其他卡片的影子」）；槽位改为
// 整屏高、卡永远在槽内，静止时邻居不入画，滚动途中的玻璃靠半透明 + blur 本身成立。
//
// ---- 一屏一卡（2026-09-27，v0.9.15 三轮）----
// 构图规则第三轮（前两轮：卡片定高被否——卡框内留白太大；槽位下限 45vh——顶部
// 残影）。槽位高度 = 整个滚动视口（CSS `height: var(--momo-focus-h)`，组件在
// syncGeometry 写入），卡居中其中：静止时相邻卡最近的边缘也在视口外 ≥ 2vh，顶部
// 与底部**构造性**地干净，与卡片内容高低无关。连锁简化：
//   · 占位高度 / 估算均值（heightsRef / heightSumRef / PLACEHOLDER_*）退场——槽位
//     高度不再看内容，滚动条长度天生精确；
//   · RO 长高补偿（grewAbove）退场——正文长高被 max-height + 卡内滚动关在卡里，
//     槽位几何不可能被内容推动（syncGeometry 的首末居中补偿也随之恒为 0，保留）；
//   · 落点重投影（tick 逐帧重算 snapTop）**保留**：防 resize / 换茬期间几何漂移，
//     成本为零。
// 滚动途中邻居照常滑过视口，玻璃景深（半透明 + blur + k 插值）在运动中生效：
// 静置 = 独处，滚动 = 上下文。
//
// ---- 性能改造（2026-09-21，v0.8.1）----
// 原实现把**整份筛选结果**挂进 DOM 并按全量连算，笔记一多（实测几百条）四处代价
// 同时线性放大，四条都在这一版拆掉：
//
//   1. **每帧的焦点判定是 O(N)**：原 `focusedIndexOf` 每帧遍历全部槽位读 offsetTop /
//      offsetHeight —— 几百次布局属性读取 × 60fps，是滚动掉帧的主力。
//      → 换成**视口中心命中测试**（`document.elementFromPoint` + `closest`）：O(1)，
//      而且天然跟上布局（正文 Markdown 渲染完会长高也不会读错）。中心落在槽位缝隙、
//      或环境没这个 API（jsdom 就没有）时返回 null，**保守维持当前焦点**，不退回全量扫描。
//
//   2. **每翻一张都要重渲 N 行**：`entries.map` 会给每个槽位重建 className、内联
//      style（z-index 几乎每行都变）与事件闭包，几百次 style diff。
//      → 槽位抽成 memo 行组件，props 里的「距离」被夹到 0..DEPTH_RADIUS+1（窗口外恒为
//      同值），再把逐项 `onClickCapture` 改成**容器上的一次事件委托**（从 data-index
//      认槽位）。焦点一动只有窗口内十几行真重渲，其余行连 reconcile 都跳过。
//
//   3. **一次性挂载几百张 Card**（切密度那一刻最明显）：每张都要建 zustand 订阅、
//      跑选区/IntersectionObserver、Render Markdown。
//      → **窗口挂载**：只有焦点 ±MOUNT_RADIUS 的槽位挂真卡片，更远的只留「定高空槽」。
//      槽位始终存在于 DOM（scroll-snap 的吸附位要它，对外 DOM 契约也照旧），
//      变的只是里面有没有内容。
//
//   4. **空槽必须自带高度**，否则内容一卸载滚动几何就塌了（下面的卡片往上串）。
//      → 每张卡挂载期间由一只共享 ResizeObserver 记下它**真实占多高**（回调只更新 ref、
//      不触发重渲），卸载时把这个高度写回空槽；没量过的槽位用「已测量槽位的平均高」
//      兜底。估算值与真值难免有出入，于是还有下一条。
//
//   5. **静止收尾**（`useLayoutEffect` + 120ms 定时器，早于绘制）：估算行落在焦点
//      **上方**并被换成真内容时，焦点卡会被推离视口中心。滚动停下后把容器**精确**送回
//      焦点卡自己的吸附位（offsetTop + 半高 − 半视口，与 scroll-snap-align: center
//      同口径），偏差 ≤2px 不写。v0.9.2 起加了两道闸：手势进行中不写（写 scrollTop 会
//      腰斩浏览器正在跑的吸附动画，实测旧版一次滚动要写 ~20 次），以及只在中心命中
//      确认「浏览器就停在这张卡上」时才写——实测多数情况浏览器自己 re-snap 就归位了。
//      （不指望浏览器的 scroll anchoring：变的那几行在离屏处，它的默认锚点挑不中。）
//      我们**主动**改布局的地方（syncGeometry 的居中补偿、entries 换了一茬）会 bump
//      几何版本号，遇到版本变化就不收尾。
//
// 取舍：没量过的槽位用估算高，滚动条长度会随翻张微微收敛（动态测量的固有现象，
// 列表虚拟化同款）。换来的是挂载数与每帧工作量都不再随笔记数增长。
//
// ---- 滚动跟手性（2026-09-25，v0.9.2）----
// 用户反馈「鼠标滚轮已经在滚，画面还是跟不上手」。把焦点视图在滚动路径上的开销
// 逐项拆开量（headless Chrome + 真组件 + 511 条复刻库，Quadro T1000 真 GPU +
// 一套 --disable-gpu 的软件合成分当作弱 GPU 模型），三条采纳、一条**实测推翻**：
//   1. **每帧的毛玻璃层数**（采纳）：退后的卡每张都是一层 backdrop-filter，Chromium 每帧
//      要为每层重采背板再模糊一次。挂载窗口 ±4 → 最多 7 层，而 depth 3–4 那几张几乎整张
//      在视口外，纯属替看不见的东西付 GPU 的钱。→ 玻璃只留给焦点 ±GLASS_RADIUS（2）内
//      的卡（类名 momo-focus-near），更远的换半透明 + 轻缩放（momo-focus-far）。
//      收益全在长卡顿（>50ms 的帧）上：软件合成 + 1300 高面板 18 帧 → 1~2 帧；
//      真 GPU 上与全量毛玻璃无差（本来就只丢 3~5 帧）。
//   2. **过渡只留合成器属性**（**已推翻并回退**）：一度删掉 filter / box-shadow /
//      background / border-color 四个主线程绘制属性，真 GPU 上掉帧从 3~4 帧涨到
//      37~45 帧——瞬时换 filter / 大投影会让**某一帧**一次性吞下整张卡的重绘，
//      渐变把同样的绘制摊到 22 帧上。详见 styles.css 里那条注释，别再「优化」第二次。
//   3. **命中测试复用容器矩形**（采纳）：原来每帧 getBoundingClientRect = 每帧逼一次
//      同步布局；矩形只在 syncGeometry 时量（滚动时容器位置像素级不变）。
//   4. **静止收尾不打断吸附动画**（采纳）：见上面第 5 条，旧版一次滚动要写 ~20 次
//      scrollTop，现在写 0 次，停止后焦点卡对中偏差仍是 0px。
//
// ---- 滚轮一格翻一张（2026-09-26，滚轮步进自管）----
// 用户反馈「滚动时中间的卡片会被略过，连滚两张」。对照实验（真 Chromium + 真实组件，
// 再加一份**纯静态**复刻页：无 React、无窗口挂载、无过渡，只保留逐字相同的吸附 CSS）
// 证实根因在浏览器：**Chromium 在滚轮路径上不遵守 scroll-snap-stop: always**——
// 相邻吸附间距小于一次滚动的位移时，一次输入直接落到第二三个吸附点。而短 Momo 的
// 槽位只有 40~110px（卡高 − 72px 叠瓦压边），短卡区稳定跳卡；跳过去之后命中测试与
// 静止收尾跟着新落点走，跳卡就「坐实」了。同一根因的反面：位移不足半个吸附间距时
// 一次滚动会**原地弹回**（短卡区偶尔「滚了没反应」）。
// 解法（WHEEL_STEP_PX，见本文件的 wheel 监听）：纵向滚轮**全量接管**，翻几张由我们
// 按输入粒度算：离散一格（≥120px）按整格量化、量化完残量清零（不让余量跨事件堆积
// ——堆起来就是五格之后第六格一次翻两张，2026-09-26 实测踩过）；触控板 / 高分辨率
// 滚轮的几十像素小增量才走累积，满一格翻一张。两种粒度都殊途同归到
// scrollToIndex(焦点 ± 1)：目标永远是**下标**，机械上不可能一次跨两张。
// 指针落在卡内正文（超长卡被 max-height 截住时的滚动逃生口）且正文还能滚时放行
// 原生，滚到头/到底再接管步进。
// CSS 里的 scroll-snap-stop: always 保留，服务触摸等**原生**输入路径。
//
// ---- 滑行质感（2026-09-26 二轮，自管补间）----
// 「一格一张」做到之后的新问题：不跟手。因为翻张交给的是 Chromium 的
// `scrollTo({behavior:'smooth'})`——它的动画有启动延迟（ notch 之后要等浏览器排上
// 才动），连续 notch 又反复重启缓动（速度掉零再加速，读起来就是一顿一顿）。且
// `scroll-snap-type: y mandatory` 会在我们逐帧写 scrollTop 之间反复重定向。三件事
// 一起改成自管补间（scrollToIndex + tick）：
//   1. **自管 rAF 补间**：输入后下一帧就移动（easeOutCubic，首帧即 ~20% 位移），
//      连续 notch 按**上一段的平均速度**决定下一段时长——速度延续，滑着走不停顿；
//   2. **滑行中摘掉 scroll-snap**（inline `scroll-snap-type: none`，收尾恢复）：
//      mandatory 吸附不参与，像素只由补间说了算；收尾写精确吸附位，落点仍是 0 偏差；
//   3. **滑行中焦点钉在目标卡**：命中测试不再逐张翻转焦点，改由补间的终点决定。
//      于是滑行途中一次焦点翻转都没有（少掉每张卡的 tier 变换 + 行 reconcile），
//      配合 useFocusWindow 的「窗口覆盖滑行区间」，整个滑行过程零挂载 / 卸载
//      （真库里每次挂载都是一次 MarkdownRenderer，那是连滚几张就卡一下的主力）。
// 触摸 / 拖动滚动条等**不经过 wheel 的输入**仍是原生的：命中测试照旧逐帧定焦点，
// 静止收尾（resnapWhenIdle）照旧兜底——只有我们驱动的滑行才走补间这条快路。
// 没能量出结论的两条也记在案（见工单 2026-09-25-focus-scroll-responsiveness.md）：
// 弱 GPU 上三种配置都明显掉帧（设计本身的合成层成本），以及每 notch 那两次
// `caps.renderMarkdown` 在复刻页里被桩掉、量不到真实开销。
//
// ---- 上滚跳跃根因（2026-09-27，落点重投影 + 长高补偿）----
// 用户报障「向下滚动正常、向上滚动跳跃」。根因有两层，都在**滑行窗口的几何**里：
// 挂载窗口覆盖 [目标−R, 目标+R]，上滚时窗口前缘那张卡（目标−R）在目标卡**上方**——
// 它在输入这一刻挂载，正文 Markdown 异步到达后长高 Δ，把目标卡的 offsetTop 往下推 Δ。
//   1. **落点一次性算死**：补间的 `to` 在滑行开始时按旧 offsetTop 算定，终点已落后 Δ；
//      随后 useLayoutEffect 的漂移修正瞬写 scrollTop 一把掰回来（读作「跳」），
//      或中心命中测试在下次滚动时改判焦点、三阶类名整批翻（同样一跳）。
//   2. **增生瞬间视图就跳了**：视口上缘外的卡长高时，它下方整片内容（含焦点卡）
//      在视空间里下移 Δ——用户看不见这次增生，只看得见「画面颠了一下」。浏览器自己的
//      scroll anchoring 本可补住，但它挑不中离屏的锚点（本文件 v0.8.1 第 5 条同款结论）。
// 解法（两件套，缺一不可）：
//   · **每帧重投影落点**：tick 里按当前几何重算 snapTop，起点同步平移（内容长高 =
//     整个坐标系平移，起止一起挪，轨迹在视空间里才连续），收尾零「掰回」；
//   · **RO 长高补偿**：对「长在视口上缘之外」的槽位按焦点卡视偏移的不变式补
//     scrollTop——先量浏览器 anchoring 补没补（量，不猜，double-compensate 会把
//     整片内容推回去，同样是跳），没补才我们补。
//     **v0.9.15 三轮起此半退场**：一屏一卡后槽位高度由 CSS 定死，正文长高被
//     max-height + 卡内滚动关在卡里，「前缘卡长高推走目标卡」的场景在构造上不再
//     存在；重投影保留（防 resize / 换茬期间的几何漂移）。
// 下滚时前缘卡在目标卡**下方**，长高不推目标卡的 offsetTop，两层都不触发——
// 方向性完全由「异步长高的卡在目标卡哪一侧」决定，与报障逐字吻合。
// 残余漂移（增生恰好长在视口内 / 手势中跳过的补偿）走 settleDrift 的 180ms 轻柔收尾。
//
// ---- 连续景深（2026-09-27，--momo-focus-k）----
// 更早那个报障「像从一张卡跳到另一张，没有滚动效果」的根因：焦点在输入这一刻就钉到
// 目标卡，目标卡随即（220ms 过渡）变成全尺寸 / 清晰 / 浮起，而位置还要滑一程
// （150~620ms）——「先变身再滑到」。退后三阶是按焦点下标翻的**离散态**，过路卡不清洗。
// 解法：把「清晰度」从类名手里接过来，改成按**卡心与视口中心的实时距离**插值——
// 每帧（滑行 tick / 原生滚动的 rAF 路径）给挂载窗口内的卡算归一值
// k = 1 − |卡心 − 视口中心| / (DEPTH_SPAN × 卡高)（1 = 压在中线），写进槽位根的
// `--momo-focus-k`，CSS 据此插值 scale / 不透明度 / 柔化 / 底色 / 描边。归一用卡高
// 当尺子：相邻卡 d≈一张卡高 → k≈0.375，与静置态 near 档对齐；短卡密、长卡疏自动成立。
// 于是过路卡是**渐变着**退后 / 清晰的，不再是瞬切。
// 保留的：三阶类名仍写静置兜底 k（JS 没写 / reduced-motion / 老引擎时接管）、z-index
// 分层与 DOM 测试契约不变；backdrop-filter 仍只挂 near 类（每帧 GPU 采背板的那笔钱，
// v0.9.2 实测口径不变）；CSS 过渡只留 box-shadow（类名驱动的离散投影）——k 插值的
// 五属性不过渡：逐帧写的值再挂 220ms transition 就是让样子追着位置跑，被滚上去的卡
// 会「残留」着一层没退干净的观感（2026-09-27 用户报障，详见 60-design.css 同处注释）。
// reduced-motion 下滑行降级瞬时落位、k 不逐帧写，类名兜底。
//
// ---- 视图联动（2026-09-27，v0.9.15）----
// 用户要的是「切的是看法，不是换一篇笔记看」：焦点视图滚到某张卡再切去列表 /
// 网格，落点还该是那张卡；从那些档切回来也一样。做法是一份
// **视图锚点**（viewAnchor.ts）：焦点档的锚点就是焦点下标——现成状态，写一次不花
// 任何布局读；非焦点档由 App 的滚动跟踪写（「视口最上面那张卡」）。读侧只有两处：
// 本文件挂载时认领（落下点 = 那张卡的吸附位，判定交给 scanFocus，见下面
// 「认领」effect），以及 App 切密度时的贴顶归位。锚点按 App 实例存（WeakMap 键 =
// .momo-app 根），多开面板互不串台。
// jsdom 里量不到布局（rect 全 0、没有 elementFromPoint），这套机制**测的是切换
// 语义**：靠测试里伪造的假布局把锚点写进去，再断言对面的视图认领了它——
// scripts/view-anchor.test.mts。
//
// 拆分：几何常量与焦点判定（MOUNT_RADIUS / hitFocusAtCenter / scanFocus …）在
// geometry.ts——那是本文件唯一不依赖 React 的部分，可以单独测。
// 「窗口挂载判定」（渲染段的距离夹取）拆去了 useFocusWindow.ts，同样是纯计算。
//
// ---- 导航溶解（2026-09-27 四轮，v0.9.15）----
// 「一屏一卡」落地后用户报「每次都整卡上去，晃眼睛」：每步滚轮在物理上都是整屏
// 位移，连续步进 = 反复的大幅上扫。离散输入（滚轮 / 方向键 / 点卡）改为**原地
// 溶解**——焦点下标立即翻转（挂载窗口 / 视图锚点 / 计数条同步走），旧卡原地
// 140ms 淡出（轻微上漂），然后**单次**落位（scrollTop 只写一次），新卡自下方
// 18px 淡入 220ms。上面「自管补间」的整屏滑行与速度延续随之退场，补间机制只剩
// 漂移修正（glideTo = 180ms 轻柔归位）一个职责。原生滚动（触摸 / 滚动条拖拽）
// 仍是物理滑行：直接操纵就该有直接反馈，k 插值继续服务那条路。

/** 滚轮累积一格对应的像素量：略小于 Windows 标准一格的 120px，保证一下午到 120
 *  仍只翻一张、余量滚进下一格（不重不漏也不会一张变两张） */
const WHEEL_STEP_PX = 100
/** 离散格的像素单位（Windows WHEEL_DELTA）：一次事件的 |dy| 超过它按整格量化 */
const WHEEL_NOTCH_PX = 120
/** 滚轮游标的有效期：连续滚动中的下一格从它续延；超时说明手势已停，下一格重新起步 */
const WHEEL_DRIVE_MS = 260
/** 溶解导航的两段时长（v0.9.15 四轮）：旧卡淡出 / 新卡淡入。导航不再有位移，
 *  原 TWEEN_MIN/MAX 的「整屏滑行时长分级」随滑行一起退场 */
const NAV_OUT_MS = 140
const NAV_IN_MS = 220
/** 轻柔收尾（settleDrift / resnapWhenIdle 的漂移修正）时长：比滑行短一截，
 *  读作「轻轻归位」而不是又翻了一张 */
const SETTLE_MS = 180
/** 景深归一跨度（以卡高为单位）：相邻卡（d ≈ 一张卡高）对应 k = 1 − 1/DEPTH_SPAN ≈ 0.375，
 *  与 CSS 侧 near 档的静置兜底值对齐 */
const DEPTH_SPAN = 1.6
/** 补间的兜底定时器在 rAF 被暂停时收尾（窗口最小化 / 面板隐藏）：补间卡在半路、
 *  snap 已经摘了，这个定时器保证最慢也会自己收尾，不留「滚动死了」的状态 */
const TWEEN_SAFETY_MS = SETTLE_MS + 120

/**
 * prefers-reduced-motion：命中时滑行整体降级——瞬时落位、k 不逐帧写（CSS 三阶类名
 * 兜底静置态）。matchMedia 不存在（jsdom / 老 electron）时按「不降级」处理：
 * 默认有动画，只有用户在系统里关了动效才走降级。
 */
function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

/**
 * 单个槽位。加 memo 不是为了省 Card（它自己就是 memo），而是省**行本身**——
 * 原来焦点每变一次，N 行的 className / 内联 style / 事件闭包全部要重算一遍：
 * - `depth` 夹在上界内 → 焦点一动，窗口外那几百行的 props 完全不变，直接跳过；
 * - `mounted` 只在跨过窗口边界的那两行翻转 → 稳态翻张只有那一进一出在干活；
 * - 点击走容器委托 → 行上不再有每次渲染都重建的闭包。
 *
 * 退后档分三阶（v0.9.2 性能，见 GLASS_RADIUS）：`on` 占焦点 / `near` 焦点 ±2 内
 * 跑完整毛玻璃 / `far` 更远只留半透明。写成**显式类名**而不是 `:not()` 链——
 * 选择器特异性仍然压在门禁的 (0,3,0) 以内，也不用等浏览器算否定伪类。
 *
 * 槽位高度由 CSS 定死（`height: var(--momo-focus-h)`，一屏一卡，见「一屏一卡」段），
 * 挂载与否都不写内联 height——「一屏」的滚动几何因此与内容彻底无关。
 *
 * 多选态（selectMode）由 Card 自己从 store 按卡选（v0.9.10，见 Card.tsx 同处注释）：
 * 槽位只管几何与窗口挂载，不再替 App 当二传手。
 */
const FocusItem = memo(function FocusItem({
  entry,
  index,
  depth,
  mounted,
  register,
}: {
  entry: MomoEntry
  /** 在 entries 里的下标（点击委托与之对应） */
  index: number
  /** 离焦点的距离，窗口外夹到 DEPTH_RADIUS + 1 */
  depth: number
  /** 是否挂载真卡片：窗口外只留空槽 */
  mounted: boolean
  register: RegisterItem
}) {
  const setRef = useCallback((el: HTMLDivElement | null) => register(index, el), [index, register])
  const tier = depth === 0 ? 'momo-focus-on' : depth <= GLASS_RADIUS ? 'momo-focus-near' : 'momo-focus-far'
  return (
    <div
      ref={setRef}
      className={`momo-focus-item ${tier}`}
      data-index={index}
      data-path={entry.path}
      data-mounted={mounted ? '1' : '0'}
      style={{
        zIndex: depth === 0 ? 20 : depth > DEPTH_RADIUS ? 1 : Math.max(1, 20 - depth),
      }}
    >
      {mounted ? <Card entry={entry} /> : null}
    </div>
  )
})

/**
 * 焦点滚动主组件。多选态在 store 里（selection.ts，v0.9.10）：本组件只订一个
 * `selectMode` 布尔量（捕获阶段的点击拦截要它），勾选态由 Card 自己按卡选。
 * 这里因此只剩 `entries` 一个 prop。
 */
export function FocusScroll({ entries }: { entries: MomoEntry[] }) {
  const selectMode = useUi((s) => s.selectMode)
  const scrollerRef = useRef<HTMLDivElement>(null)
  /** 槽位元素表：由各行 ref 注册进数组，卸载自动置 null */
  const itemsRef = useRef<Array<HTMLElement | null>>([])
  /** 滚动容器的视口矩形（syncGeometry 时量一次）：焦点命中测试复用，免每帧同步布局 */
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  /** 最近一次**原生** scroll 的时刻（滑行中的逐帧写不算）：settleDrift / resnapWhenIdle
   *  写 scrollTop 前用它判断「手势还在跑不跑」——写进去会腰斩浏览器正在跑的
   *  吸附动画。滑行期间不更新（见 onScroll），补偿与收尾才不被补间误判成手势。 */
  const lastScrollAtRef = useRef(0)
  const rafRef = useRef(0)
  /** BUG-182b：自造滚动的静默期（时间戳）——`stopTween` 把 scroll-snap-type 还原成
   *  mandatory 的那一下，浏览器会立刻重吸附并发 scroll 事件；那不是用户手势，
   *  不许拿它掐溶解 / 跑命中测试（否则显式导航被静默吞掉、弹回出发卡）。 */
  const selfScrollUntilRef = useRef(0)
  /** 静止收尾的定时器：手势中跳过的修正由它在滚动停下后补一次 */
  const idleTimerRef = useRef(0)
  /** 位置意图序号（BUG-107）：显式导航 / entries 换茬时 +1。resnapWhenIdle 排定时器
   *  时快照它、回调里核对——对不上说明期间发生过新的位置意图，旧落点自我作废。
   *  比「80 / 60ms」两道时间闸稳：不依赖耗时恰好把旧回调挡住。 */
  const posSeqRef = useRef(0)
  /** 几何版本号：我们主动改布局（syncGeometry / entries 换茬）时 +1，用于跳过补偿 */
  const geomStampRef = useRef(0)
  const lastGeomStampRef = useRef(0)
  const prevEntriesRef = useRef<MomoEntry[] | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  /** 自管补间的当前滑行：**v0.9.15 四轮起只剩漂移修正一个职责**（settleDrift /
   *  resnapWhenIdle 的 180ms 轻柔归位）——导航改走「溶解」（见文件头部四轮段），
   *  整屏滑行连同速度延续 / 时长分级一起退场。null = 没在补间。
   *  `to` 每帧被重投影（几何漂移时落点跟着走，见「上滚跳跃根因」段）。 */
  const animRef = useRef<{
    target: number
    from: number
    to: number
    start: number
    duration: number
  } | null>(null)
  /**
   * 溶解导航状态机（v0.9.15 四轮）：`out` = 旧卡淡出中（timer 到点 → landAt 单次
   * 落位）；`in` = 已落位、新卡淡入中（timer 到点 → 摘入场类）。`target` 在 out
   * 阶段可被连滚改签（只更新目标，跳最新那张，不逐张闪）。类挂在**槽位**上——
   * imperative class，React 的 className 不管理它（挂载时机见下面的布局效应）。
   * null = 空闲。
   */
  const dissolveRef = useRef<{
    phase: 'out' | 'in'
    /** 淡出中的卡（导航发生时的原焦点） */
    from: number
    /** 落位目标（out 阶段）/ 已落位的卡（in 阶段） */
    target: number
    timer: number
  } | null>(null)
  /** 补间的 rAF 句柄（卸载 / 几何变化时取消） */
  const rafAnimRef = useRef(0)
  /** 补间的兜底定时器：rAF 被暂停时（窗口最小化 / 面板隐藏）补间会卡在半路，
   *  而那时 scroll-snap 已被摘掉——这个定时器保证「最慢也会自己收尾」，不留死滚动 */
  const tweenSafetyRef = useRef(0)
  /** 滚轮游标：上一次 wheel 派发停在哪个下标、有效期到什么时候。**只服务滚轮连续性**
   *  ——同步连发的多格 / 组件尚未重绘的间隙都要靠它续命；键盘、点卡、原生滚动翻焦点
   *  都会立刻清掉它（各自的导航自己定焦点），260ms 不到期也失效。 */
  const wheelDriveRef = useRef<{ target: number; until: number } | null>(null)
  /** 焦点下标镜像：wheel 监听只挂一次（原生闭包），读不到每次渲染的最新 state */
  const focusIdxRef = useRef(0)
  /** 远跳（直接换页）欠一次景深重写（BUG-108a）：落位写入发生在提交**前**，
   *  那时挂载窗还是旧的、目标卡的 Card 还没挂上；在提交后的布局效应里补一次
   *  applyDepth，新窗内的 k 才是围绕新焦点算的（landAt 那份职责的等价物）。 */
  const depthPendingRef = useRef(false)

  // entries 变短（筛选掉一批）而焦点下标还没重算时，渲染先夹住范围，
  // 免得计数条闪一帧「第 51 张 / 共 3 张」
  const focus = Math.max(0, Math.min(focusIndex, entries.length - 1))
  useEffect(() => {
    focusIdxRef.current = focus
  })

  /** 槽位注册（行卸载时 React 会用 null 再调一次，自动摘除） */
  const registerItem = useCallback<RegisterItem>((index, el) => {
    itemsRef.current[index] = el
  }, [])

  // v0.9.15 一屏一卡：原「高度采样 + 视口上缘外长高补偿」的共享 ResizeObserver
  // 随占位高度一起退场——槽位高度由 CSS 定死，正文长高被 max-height + 卡内滚动
  // 关在卡里，槽位几何不再可能被内容推动。机制与退场理由见文件头部「一屏一卡」。

  /**
   * 几何同步（挂载 / entries 变化 / 容器尺寸变化时各跑一次）：
   * 1. 把滚动视口高度写进 `--momo-focus-h`——CSS 的 max-height 要用它把超长卡片
   *    截在一屏内（正文转卡内滚动），否则 mandatory 吸附下永远翻不到长卡的结尾。
   * 2. 首/末槽位的**居中补偿**：卡片比视口矮时，「居中对齐」需要的滚动位置是负的
   *    （不存在），首张会永远停在顶部而不是中心。给首槽补上边距、末槽补下边距，
   *    两者都能真正停在视口中心——开面板落在第一张、滚到底也有收尾感。
   * 3. 缓存容器矩形：滚动时容器的位置像素级不变，每帧再 getBoundingClientRect 等于
   *    每帧逼一次同步布局（输入已经等绘制了，别让焦点判定再插队）。
   *
   * 这几处都是**主动**改布局，写完要 bump 版本号，好让锚定知道这次位移不补偿。
   */
  const syncGeometry = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const h = scroller.clientHeight
    scroller.style.setProperty('--momo-focus-h', `${h}px`)
    const box = scroller.getBoundingClientRect()
    rectRef.current = { left: box.left, top: box.top, width: box.width, height: box.height }
    const items = itemsRef.current
    // BUG-152：先清上一轮写下的首/末居中补偿。React 只管 zIndex，不会在 items
    // 换茬时收回这两个 inline 样式——旧首张落到中段后仍带着 marginTop，卡片之间
    // 会留下约 (视口高 − 卡高)/2 的大段空白。
    for (const el of items) {
      if (!el) continue
      // BUG-217：撤回内联值用 removeProperty，不是写空串——空串会留下一条
      // 「空声明」把 CSS 里的值一并压住，而这里要的语义是「当它没写过」。
      el.style.removeProperty('margin-top')
      el.style.removeProperty('margin-bottom')
    }
    const first = items[0]
    const last = items[items.length - 1]
    const pad = (el: HTMLElement | null) => (el ? Math.max(0, (h - el.offsetHeight) / 2) : 0)
    if (first) first.style.marginTop = `${pad(first)}px`
    if (last && last !== first) last.style.marginBottom = `${pad(last)}px`
    geomStampRef.current += 1
  }, [])

  /** 焦点判定（全量扫描版）：给 entries 换茬 / resize 这类「一次性的对表」用 */
  const recompute = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    wheelDriveRef.current = null // 换了一茬：滚轮游标指向的下标可能已不存在
    const next = scanFocus(scroller, itemsRef.current)
    setFocusIndex((prev) => (prev === next ? prev : next))
  }, [])

  /**
   * 连续景深写入（2026-09-27，见文件头部「连续景深」）：给挂载窗口内每张卡算
   * k = 1 − |卡心 − 视口中心| / (DEPTH_SPAN × 卡高)，写进槽位根的 --momo-focus-k。
   * 纯样式写入、不触发 React 重渲；槽位高（一屏）当尺子，短卡密长卡疏自动成立。
   * reduced-motion 下一律不写：类名兜底静置态。
   */
  const applyDepth = useCallback(() => {
    if (prefersReducedMotion()) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const mid = scroller.scrollTop + scroller.clientHeight / 2
    for (let i = 0; i < itemsRef.current.length; i++) {
      const el = itemsRef.current[i]
      if (!el || el.dataset.mounted !== '1') continue
      const h = el.offsetHeight
      if (h <= 0) continue
      const d = Math.abs(el.offsetTop + h / 2 - mid)
      const k = Math.max(0, 1 - d / (DEPTH_SPAN * h))
      el.style.setProperty('--momo-focus-k', k.toFixed(3))
    }
  }, [])

  /** 摘掉逐帧写的景深变量：reduced-motion 降级时让 CSS 三阶类名接管 */
  const clearDepth = useCallback(() => {
    for (const el of itemsRef.current) el?.style.removeProperty('--momo-focus-k')
  }, [])

  /**
   * 停掉进行中的补间并恢复吸附（entries 换茬 / 面板变形 / 卸载时调）。
   * 滑行目标是用 offsetTop 现算的，布局一变就失准，所以这两处必须停。
   */
  const stopTween = useCallback(() => {
    if (rafAnimRef.current) window.cancelAnimationFrame(rafAnimRef.current)
    rafAnimRef.current = 0
    if (tweenSafetyRef.current) window.clearTimeout(tweenSafetyRef.current)
    tweenSafetyRef.current = 0
    if (!animRef.current) return
    animRef.current = null
    // 恢复 mandatory 吸附：触摸 / 触控板的原生路径要靠它（scroll-snap-stop 也才有意义）。
    // BUG-182b：还原吸附会让浏览器立刻重吸附并发出 scroll 事件——那是自造滚动，
    // 打开一个静默期让 onScroll 别把它当用户手势（否则溶解导航被掐掉、弹回出发卡）。
    const scroller = scrollerRef.current
    if (scroller) scroller.classList.remove('momo-focus-nosnap')
    selfScrollUntilRef.current = performance.now() + 120
  }, [])

  /** 作废一切在途的位置意图（BUG-107）：停进行中的漂移补间、清待触发的重吸附定时器、
   *  序号 +1（已排定未触发的回调据此自我作废）。**用户显式导航**（scrollToIndex）与
   *  entries 换茬时调——「接下来到哪由我说了算」，旧意图不许再写 scrollTop。 */
  const cancelPendingPosition = useCallback(() => {
    stopTween()
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = 0
    posSeqRef.current += 1
  }, [stopTween])

  /** 补间收尾：写精确吸附位、恢复吸附、清动画态（rAF 正常跑完 / 兜底定时器共用）。
   *  收尾再写一次景深：滑行停下的这一刻，各卡的 k 必须与最终位置严丝合缝。 */
  const finishTween = useCallback(() => {
    if (rafAnimRef.current) window.cancelAnimationFrame(rafAnimRef.current)
    rafAnimRef.current = 0
    if (tweenSafetyRef.current) window.clearTimeout(tweenSafetyRef.current)
    tweenSafetyRef.current = 0
    const scroller = scrollerRef.current
    const a = animRef.current
    if (!scroller || !a) return
    scroller.scrollTop = a.to
    scroller.classList.remove('momo-focus-nosnap')
    animRef.current = null
    applyDepth()
  }, [applyDepth])

  /**
   * 补间的一帧：easeOutQuint（1 − (1−t)⁵，长尾收尾，比 cubic 更绵），写完返回下一帧。
   * 每帧先**重投影落点**：目标卡的吸附位可能被异步长高推走（上滚跳跃根因第 1 层），
   * 起点同步平移——内容长高 = 整个坐标系平移，起止一起挪，轨迹在视空间里连续。
   */
  const tick = useCallback(() => {
    rafAnimRef.current = 0
    const scroller = scrollerRef.current
    const a = animRef.current
    if (!scroller || !a) return
    const el = itemsRef.current[a.target]
    if (el) {
      const live = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
      if (live !== a.to) {
        a.from += live - a.to
        a.to = live
      }
    }
    if (a.duration > 0) {
      const now = performance.now()
      const t = Math.min(1, (now - a.start) / a.duration)
      const eased = 1 - (1 - t) ** 5
      const nextTop = a.from + (a.to - a.from) * eased
      scroller.scrollTop = nextTop
      if (t < 1) {
        applyDepth()
        rafAnimRef.current = window.requestAnimationFrame(tick)
        return
      }
    }
    // 收尾：写精确吸附位并恢复吸附（留着 mandatory 兜底后续的原生输入）
    finishTween()
  }, [applyDepth, finishTween])

  /**
   * 漂移修正的轻柔收尾（v0.9.15 四轮起这是补间机制的**唯一职责**）：180ms 缓到 to。
   * 导航本身已改走「溶解」（scrollToIndex：旧卡淡出 → 单次落位 → 新卡淡入），
   * 整屏滑行连同速度延续 / 时长分级一起退场；easeOutQuint 曲线保留——几像素的
   * 归位读作「轻轻归位」而不是「又翻了一张」。
   */
  const glideTo = useCallback(
    (i: number, to: number) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      // reduced-motion：瞬时落位、景深回到类名态，不跑任何动画
      if (prefersReducedMotion()) {
        if (animRef.current) stopTween()
        scroller.scrollTop = to
        clearDepth()
        return
      }
      const cur = scroller.scrollTop
      if (Math.abs(to - cur) <= 0.5) {
        // 原地：停掉可能在跑的补间再落位——否则旧动画会继续把容器拖向它自己的
        // 目标，跟这次修正抢方向盘
        if (animRef.current) stopTween()
        scroller.scrollTop = to
        applyDepth()
        return
      }
      animRef.current = {
        target: i,
        from: cur,
        to,
        start: performance.now(),
        duration: SETTLE_MS,
      }
      // 滑行中摘掉 mandatory 吸附：它会在我们逐帧写 scrollTop 之间反复重定向。
      // BUG-217：走类（`.momo-focus-nosnap`）而不是内联 scrollSnapType——Obsidian 评审
      // 的 no-static-styles-assignment；类选择器 (0,2,0) 压得过 .momo-focus 本体 (0,1,0)。
      scroller.classList.add('momo-focus-nosnap')
      // 兜底：rAF 被暂停（窗口最小化 / 面板隐藏）时补间会卡住，而 snap 已经摘了——
      // 这个定时器保证最慢也会自己收尾，不留「滚动死了」的状态
      if (tweenSafetyRef.current) window.clearTimeout(tweenSafetyRef.current)
      tweenSafetyRef.current = window.setTimeout(finishTween, TWEEN_SAFETY_MS)
      if (!rafAnimRef.current) rafAnimRef.current = window.requestAnimationFrame(tick)
    },
    [applyDepth, clearDepth, finishTween, stopTween, tick],
  )

  /**
  /** 掐掉进行中的溶解（原生滚动接管 / entries 换茬 / 卸载）：摘类 + 清定时器 */
  const cancelDissolve = useCallback(() => {
    const d = dissolveRef.current
    if (!d) return
    window.clearTimeout(d.timer)
    itemsRef.current[d.from]?.classList.remove('momo-focus-leave')
    itemsRef.current[d.target]?.classList.remove('momo-focus-enter')
    dissolveRef.current = null
  }, [])

  /**
   * 单次落位 + 入场淡入（溶解的跳变帧）：scrollTop **一次性**写到目标吸附位（这是
   * 导航全程唯一一次滚动写入——「不再整屏滑行」的构造性保证），旧卡的淡出类同步
   * 摘除（与滚动写入同一帧，不会闪回旧卡），新卡挂入场类交 CSS 播 220ms 淡入。
   */
  const landAt = useCallback(
    (i: number) => {
      const scroller = scrollerRef.current
      const el = itemsRef.current[i]
      if (!scroller || !el) {
        cancelDissolve()
        return
      }
      const d = dissolveRef.current
      if (d) {
        window.clearTimeout(d.timer)
        itemsRef.current[d.from]?.classList.remove('momo-focus-leave')
        d.phase = 'in'
      }
      scroller.scrollTop = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
      applyDepth()
      el.classList.add('momo-focus-enter')
      if (d) {
        d.timer = window.setTimeout(() => {
          itemsRef.current[d.target]?.classList.remove('momo-focus-enter')
          if (dissolveRef.current === d) dissolveRef.current = null
        }, NAV_IN_MS)
      }
    },
    [applyDepth, cancelDissolve],
  )

  /**
   * 导航（滚轮 / 方向键 / 点卡，v0.9.15 四轮起走「溶解」）：焦点下标**立即**翻到
   * 目标（挂载窗口 / 视图锚点 / 计数条同步走），但滚动位置先不动——旧卡原地淡出
   * （NAV_OUT_MS，类由下面的布局效应补挂），到点 landAt 单次落位、新卡淡入。
   * 物理上不再有整屏滑行（「每次都整卡上去，晃眼睛」的修复）；连滚时淡出中改签
   * 只更新目标（跳最新那张），入场中再导航则掐掉入场、直接开始下一轮淡出。
   * reduced-motion：跳过两段动画，瞬时落位。
   * 跳距 > MOUNT_RADIUS（Home / End）：from 槽已不在挂载窗里，演不出真卡的退场
   * ——走「直接换页」分支，同样瞬时落位（BUG-108a）。
   */
  const scrollToIndex = useCallback(
    (i: number) => {
      // 显式导航（键盘 / 点卡）直接换目标：滚轮游标作废，别让 260ms 内的一次 notch
      // 从旧游标续延出一张「回头卡」（滚轮路径在调用之后再重建游标）
      wheelDriveRef.current = null
      const prev = focusIdxRef.current
      if (i === prev && !dissolveRef.current) return
      // 用户显式指定了落点（BUG-107）：作废一切在途的位置意图——手势刚停时排下的
      // 重吸附与漂移补间会把画面拽回导航前那张卡，落位只由 landAt 单次写
      cancelPendingPosition()
      if (prefersReducedMotion()) {
        cancelDissolve()
        setFocusIndex((p) => (p === i ? p : i))
        const scroller = scrollerRef.current
        const el = itemsRef.current[i]
        if (scroller && el) scroller.scrollTop = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
        return
      }
      if (Math.abs(i - prev) > MOUNT_RADIUS) {
        // 远跳（Home / End，BUG-108a）：焦点翻转的同一提交里，from 槽就掉出挂载
        // 窗、卡被卸载——再演退场，淡出的只是一个空槽（旧卡瞬间消失 → 空壳淡出
        // → 目标卡淡入，三段观感）。干脆直接换页：本帧落位、没有退场；
        // 也不给入场类——target 行的 tier 桶这次提交正好翻档（far→on），
        // React 重写 className 会把它抹掉，同步挂了也白挂。
        // dissolveRef 保持 null：settleDrift 的收尾检查照常工作（落位后漂移为 0）。
        // 景深 k 的收尾挂到提交后的布局效应（depthPendingRef）：此刻挂载窗还是
        // 旧的，同步写等于写给一批马上要卸载的空槽，目标卡反而空着。
        cancelDissolve()
        depthPendingRef.current = true
        setFocusIndex((p) => (p === i ? p : i))
        const scroller = scrollerRef.current
        const el = itemsRef.current[i]
        if (scroller && el) {
          scroller.scrollTop = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
        }
        return
      }
      const d = dissolveRef.current
      if (d && d.phase === 'out') {
        // BUG-182a：淡出窗内掉头回到出发卡——d.target 会等于 d.from，landAt 于是对
        // 同一元素先摘 leave 再挂 enter：位置一步没动，卡却整段淡出+淡入（约 360ms 白闪）。
        // 回到出发卡不需要任何动画：掐掉溶解、就地保持（出窗期滚动位置本来就没动过）。
        if (i === d.from) {
          cancelDissolve()
          setFocusIndex((p) => (p === i ? p : i))
          return
        }
        // 淡出中改签：目标更新即可，跳变帧读最新值
        d.target = i
        setFocusIndex((p) => (p === i ? p : i))
        return
      }
      if (d) {
        // 入场淡入中又导航：掐掉入场，直接开始下一轮淡出
        window.clearTimeout(d.timer)
        itemsRef.current[d.target]?.classList.remove('momo-focus-enter')
        dissolveRef.current = null
      }
      dissolveRef.current = { phase: 'out', from: prev, target: i, timer: 0 }
      setFocusIndex((p) => (p === i ? p : i))
      dissolveRef.current.timer = window.setTimeout(() => {
        const dd = dissolveRef.current
        if (dd) landAt(dd.target)
      }, NAV_OUT_MS)
    },
    [cancelDissolve, cancelPendingPosition, landAt],
  )

  /**
   * 淡出类的挂载时机（溶解）：焦点翻转的那次渲染会重写行类名（tier 翻转），
   * scrollToIndex 里同步挂的类会被 React 覆盖——必须在提交**之后**补挂（布局
   * 阶段，早于绘制，同帧生效）。入场类没有这个问题：它挂在跳变帧（此后没有
   * 会改这行类名的渲染）。
   * 远跳（直接换页）的景深重写也在这里补：提交后挂载窗才是新的，applyDepth
   * 才有对象可写（提交前写等于写空槽，见 depthPendingRef）。
   */
  useLayoutEffect(() => {
    if (depthPendingRef.current) {
      depthPendingRef.current = false
      applyDepth()
    }
    const d = dissolveRef.current
    if (!d || d.phase !== 'out') return
    const slot = itemsRef.current[d.from]
    if (!slot) return
    // **每次布局都校验**，不走 leaveApplied 短路（BUG-30）：淡出窗内连滚改签时，
    // 若该行 tier 桶翻档（near→far），React 会整体重写 className，把命令式加的
    // leave 类抹掉；短路会让「已补挂」的判断掩盖这次抹除，旧卡的淡出动画中断。
    // 加过一次再加是 no-op，撤除由 landAt 走 classList.remove ——不依赖短路。
    if (!slot.classList.contains('momo-focus-leave')) slot.classList.add('momo-focus-leave')
  })

  /**
   * 静止收尾：滚动停下后，把容器精确送回到 index 那张卡的吸附位。只在滚动真正停下后
   * 写，所以不会掐断任何进行中的动画（触摸惯性 / 原生吸附都可能持续几百毫秒；自管
   * 补间的收尾由它自己写，不走这里）；偏差 ≤2px 时什么都不写。
   * `tries` 是重排次数：滚动还没停就再等 120ms，最多等 8 次（≈1s），之后放弃
   * ——下一次焦点变化的提交会重新排一次，漏一次修正的代价只是焦点卡偏几个像素。
   * BUG-107 起回调开头两道作废检查：意图序号变过（显式导航 / 换茬）或溶解导航正在
   * 跑（落位归 landAt）时不写——「随后才 fire 的旧定时器把新落点拽回去」正是本 bug。
   */
  const resnapWhenIdle = useCallback((index: number, tries = 0) => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    const seq = posSeqRef.current
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = 0
      // 期间发生过新的位置意图：旧落点作废，不许再写（BUG-107 ①）
      if (seq !== posSeqRef.current) return
      // 溶解导航正在跑（淡出 / 淡入）：落位归 landAt 单次写，重吸附让位（BUG-107）
      if (dissolveRef.current) return
      // 还在滚（惯性 / 吸附动画进行中）：等它自然结束，别半路抢方向盘
      if (performance.now() - lastScrollAtRef.current < 60) {
        if (tries < 8) resnapWhenIdle(index, tries + 1)
        return
      }
      const scroller = scrollerRef.current
      const el = itemsRef.current[index]
      if (!scroller || !el) return
      const expected = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
      const drift = scroller.scrollTop - expected
      // 漂移修正走 180ms 轻柔收尾：瞬写读作「跳」，缓缓归位才像收尾
      if (drift > 2 || drift < -2) glideTo(index, expected)
    }, 120)
  }, [glideTo])

  /**
   * 漂移修正（2026-09-27）：焦点卡的吸附位漂了（>2px）就轻轻归位。四道闸：
   *   1. 自管补间正在滑行：收尾由 tick 自己写精确位，这里插手只会跟它抢方向盘；
   *   2. 溶解导航持有落点（BUG-107）：落位归 landAt 的单次写。导航渲染的这次布局
   *      效应里 focusIdxRef 还是旧焦点，放行会拿旧卡的吸附位开补间、与 landAt 抢；
   *   3. 手势还在跑（80ms 内还有原生 scroll）：等它自然结束（写 scrollTop 会腰斩
   *      浏览器正在跑的吸附动画，v0.9.2 同款结论）；
   *   4. 浏览器停在别张卡上（中心命中 ≠ 焦点）：不抢，下一轮滚动会重定焦点。
   * 触发点有两处：useLayoutEffect（每次渲染后）与 RO 长高回调（静置时高度变化，
   * 没有渲染也会发生——异步长高的收尾修正就靠它）。
   */
  const settleDrift = useCallback(() => {
    const scroller = scrollerRef.current
    const index = focusIdxRef.current
    const el = itemsRef.current[index]
    if (!scroller || !el) return
    if (animRef.current) return
    if (dissolveRef.current) return
    if (performance.now() - lastScrollAtRef.current < 80) return
    if (hitFocusAtCenter(scroller, rectRef.current) !== index) return
    const expected = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
    const drift = scroller.scrollTop - expected
    if (drift <= 2 && drift >= -2) return
    glideTo(index, expected)
  }, [glideTo])

  /**
   * 滚动 → 焦点（rAF 节流 + 中心命中测试：一帧一次 O(1)，不再是每帧 O(N) 遍布局属性）。
   * 自管补间滑行中**不判定**：焦点已钉在补间的目标卡上（滑行质感第 3 条），
   * 途中每张过路的卡都不翻焦点，少掉每张一次的 tier 变换与行 reconcile。
   * `lastScrollAtRef` **只记原生滚动**（滑行中的逐帧写 scrollTop 不计）：settleDrift /
   * resnapWhenIdle / RO 补偿的「手势还在跑」闸靠它分辨「用户在摸」与「补间在跑」——
   * 滑行期间不更新，补偿与收尾才不会被自己的动画误判成手势。
   */
  const onScroll = useCallback(() => {
    // BUG-182b：自造滚动的静默期（stopTween 还原吸附触发的重吸附）——不掐溶解、
    // 不跑命中测试；否则「点/滚了一下，画面弹回原位」＝导航被静默吞掉。
    if (dissolveRef.current?.phase === 'out' && performance.now() < selfScrollUntilRef.current) return
    // 滚动事件发生在溶解淡出中 = 用户走了原生路径（触摸 / 滚动条）：掐掉淡出，
    // 别让卡片在物理滑行途中自己消失（落位自身的 scroll 事件发生在 in 阶段，不受影响）
    if (dissolveRef.current?.phase === 'out') cancelDissolve()
    if (rafRef.current) return
    // 滑行中的逐帧写 scrollTop 不计入「手势时间」：settleDrift / RO 补偿的闸靠它
    // 分辨「用户在摸」与「补间在跑」，滑行期间不更新，补偿与收尾才不被误判成手势
    if (!animRef.current) lastScrollAtRef.current = performance.now()
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      if (animRef.current) return // 滑行中：焦点由补间的终点决定
      const scroller = scrollerRef.current
      if (!scroller) return
      const next = hitFocusAtCenter(scroller, rectRef.current)
      // null = 没定夺（中心落在缝隙里）：维持当前焦点，别退回全量扫描
      if (next !== null) {
        // 原生滚动（拖动滚动条 / 触摸惯性）翻了焦点：滚轮游标作废，下一次 notch
        // 从新的焦点重新起步
        wheelDriveRef.current = null
        setFocusIndex((prev) => (prev === next ? prev : next))
      }
      // 连续景深跟着原生滚动走：中心线两侧的卡渐变退后/清晰（滑行中由 tick 负责）
      applyDepth()
    })
  }, [applyDepth, cancelDissolve])

  // 挂载即聚焦容器：方向键才能直接翻张（与 Review 同一手法）。
  // **只在挂载时 focus**：entries 变化也 focus 会把用户从搜索框里拽走——
  // vault 事件 / 每次筛选都会刷新 entries，那正是用户可能正在打字的时候。
  useEffect(() => {
    scrollerRef.current?.focus()
  }, [])

  // entries 换引用（筛选 / 排序 / vault 刷新）时重算几何与焦点——卡片高度
  // 全变了，旧下标可能已指到另一张；滚动位置由浏览器按新内容自动夹住，不用手动重置。
  // 槽位增删由各行 ref 自行注册 / 摘除（行数变少时把尾部的残留引用截掉）。
  useEffect(() => {
    itemsRef.current.length = entries.length
    cancelPendingPosition() // 布局换了一茬：滑行目标（offsetTop 算出来的）已失效 + 旧位置意图作废
    cancelDissolve() // 换茬同样掐掉溶解（淡出中的卡可能已被换掉）
    syncGeometry()
    recompute()
    applyDepth() // 新几何下重算一次景深（reduced-motion 下是空操作，类名兜底）
  }, [applyDepth, cancelDissolve, cancelPendingPosition, entries, recompute, syncGeometry])

  /**
   * 认领视图锚点（v0.9.15，见文件头部「视图联动」）：从别的密度切进来时，把「刚才
   * 在那儿」的那张卡设为焦点，并把容器送到它的吸附位——**布局阶段**写（早于绘制），
   * 等 passive effect 再写会先画一帧「焦点在第 0 张」再跳过去。
   * 只跑一次：焦点视图每切一次密度都整个卸载重挂（五档外层元素类型互不相同），
   * 挂着时的焦点变化由滚动 / 点卡自己走，不归位。这条「只跑一次」由下面的
   * anchorClaimedRef 显式表达——依赖表按事实列全（entries / syncGeometry / applyDepth
   * 都会被读到），重跑在门口早退，换茬与筛选刷新不会再把用户拽回锚点卡。
   * 落点判定不自己算：写完 scrollTop 后，上面那个换茬 effect 的 recompute()
   * （scanFocus）会按新位置重算焦点——用同一批 offsetTop/offsetHeight 算的吸附位，
   * 中心必然落回这张卡，两边不可能各说各话。
   */
  const anchorClaimedRef = useRef(false)
  useLayoutEffect(() => {
    if (anchorClaimedRef.current) return
    anchorClaimedRef.current = true
    const scroller = scrollerRef.current
    if (!scroller) return
    const path = readAnchor(anchorRootOf(scroller))
    if (!path) return
    const i = entries.findIndex((e) => e.path === path)
    if (i < 0) return
    setFocusIndex((prev) => (prev === i ? prev : i))
    const el = itemsRef.current[i]
    if (el) {
      // BUG-124：先把几何写进 DOM（--momo-focus-h + 首末居中补偿）再量落点。旧实现这里早于
      // passive effect 里的 syncGeometry——槽高还是 CSS 兜底的 100vh（整窗高），侧栏面板里
      // 视口远比窗口矮，offsetTop 按整窗高的槽算，落点偏到后面好几张，随后 writeAnchor 还把
      // 错卡写回锚点。syncGeometry 幂等，换茬 effect 里再跑一次无害。
      syncGeometry()
      scroller.scrollTop = snapTop(el.offsetTop, el.offsetHeight, scroller.clientHeight)
      applyDepth()
    }
  }, [applyDepth, entries, syncGeometry])

  /** 焦点变了就把当前卡写进视图锚点（别的密度切回来时按它归位）。
   *  写的是 `entries[focus].path`：focus 已夹在 [0, entries.length-1]。
   *  挂载时也会写一次（焦点 = 第 0 张）：锚点从此有值，第一次切换就有落点。 */
  useEffect(() => {
    const entry = entries[focus]
    if (entry) writeAnchor(anchorRootOf(scrollerRef.current), entry.path)
  }, [focus, entries])

  // 面板变高变矮（拖宽不改高度，但窗口缩放 / 侧栏折叠会）：重算视口高度与首末补偿
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      stopTween() // 吸附位随视口高度平移，进行中的滑行目标失准
      syncGeometry()
      applyDepth()
    })
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [applyDepth, stopTween, syncGeometry])

  /**
   * 静止后收尾（布局阶段，早于绘制）：挂载窗口边缘那一行进出内容会改高度，焦点卡因此
   * 偏离自己的吸附位 Δ。滚动不改变 offsetTop，所以「焦点卡的吸附位动了」只可能是布局
   * 自己变了 —— 滚动停下后把 scrollTop 精确送回它该在的位置，焦点卡就回到视口中心。
   * （不指望浏览器的 scroll anchoring：变的那几行在离屏处，它的默认锚点挑不中；
   * 看得见的那部分增生由 RO 补偿兜底，见上面高度采样 effect。）
   *
   * v0.9.2 起两道闸（往 scrollTop 写字会**腰斩**浏览器正在跑的吸附动画，用户体感正是
   * 「滚了一下就停住、跟不上手」）：手势进行中不写；只修焦点卡自己的吸附位。2026-09-27
   * 起修正本盒收口到 settleDrift（三道闸 + 180ms 轻柔补间）：这里只留「换茬 / 几何
   * 主动变更不修」与「手势中等它停」两个上层判断。
   */
  useLayoutEffect(() => {
    const entriesChanged = prevEntriesRef.current !== entries
    prevEntriesRef.current = entries
    const geomChanged = geomStampRef.current !== lastGeomStampRef.current
    lastGeomStampRef.current = geomStampRef.current
    // 换了一茬 entries / 我们主动改过几何：偏移是预期的，不修正
    if (entriesChanged || geomChanged) return
    // 自管补间正在滑行：收尾由 tick 自己写精确位，这里插手只会跟它抢方向盘
    if (animRef.current) return
    // 手势还在跑（触摸惯性 / 原生吸附动画进行中）：等它自然结束再收尾
    if (performance.now() - lastScrollAtRef.current < 80) {
      resnapWhenIdle(focus)
      return
    }
    settleDrift()
  })

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      if (rafAnimRef.current) window.cancelAnimationFrame(rafAnimRef.current)
      cancelDissolve()
      if (tweenSafetyRef.current) window.clearTimeout(tweenSafetyRef.current)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      cancelDissolve()
    }
  }, [cancelDissolve])

  /**
   * 滚轮步进（一格翻一张）：纵向滚轮**全量接管**，所有输入粒度汇进同一个累积器，
   * 每满 WHEEL_STEP_PX 像素走一次 scrollToIndex(当前焦点 ± 1)——机械上不可能一次
   * 跨两张。机制、根因与对照实验见文件头部「滚轮一格翻一张」一段。
   * React 根级的 onWheel 是 passive 监听，preventDefault 会被无视——必须挂原生
   * **非 passive** 监听。边界夹取用 itemsRef 的长度（始终与 entries 同步，见换茬
   * effect），监听因此不必随 entries 重挂。
   */
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    /** 滚轮增量累积器：一格 = 累积 ~WHEEL_STEP_PX 像素，与硬件的输入粒度无关 */
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      // 缩放手势 / 横向滚动不掺合
      if (e.ctrlKey || e.deltaX !== 0) return
      // 卡内正文自己滚（超长卡被 max-height 截住时的逃生口）：指针在还能滚的正文区里
      // 就放行原生滚动，不抢；正文滚到头/滚到底（或根本没有内滚区）再接管步进——
      // 否则滚到边界时滚动链会甩给外层、又走回 Chromium 那条跳卡的吸附路径
      const body = (e.target as HTMLElement | null)?.closest?.('.momo-card-body') as HTMLElement | null
      if (body && body.scrollHeight > body.clientHeight + 1) {
        const atEnd = e.deltaY > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 1
        const atStart = e.deltaY < 0 && body.scrollTop <= 1
        if (!atEnd && !atStart) {
          acc = 0
          return
        }
      }
      // 纵向滚轮**全量接管**：所有输入粒度都由我们决定翻几张，原生吸附那条不遵守
      // snap-stop 的路彻底不参与。两种粒度分开算（2026-09-26 修：混在一起算会让
      // 每格 120px 的鼠标「余量」跨事件堆积——五格之后残量够半格，第六格一次翻两张，
      // 正是用户最初的报障）：
      //   · **离散一格**（|dy| ≥ 一格像素）：按整格量化——Windows 标准一格 120px，
      //     加速滚轮一次 240/480 就是 2/4 格；量化完残量清零，不跨事件带
      //   · **小增量流**（触控板 / 高分辨率滚轮）：正常累积，满一格翻一张
      e.preventDefault()
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
      const last = itemsRef.current.length - 1
      const now = performance.now()
      const drive = wheelDriveRef.current
      let cursor =
        drive !== null && now < drive.until
          ? drive.target
          : animRef.current !== null
            ? animRef.current.target
            : focusIdxRef.current
      if (Math.abs(dy) >= WHEEL_STEP_PX) {
        // 离散：一次事件量化成整数格（120px 一格），半点残量都不留给下一次
        const notches = Math.max(1, Math.round(Math.abs(dy) / WHEEL_NOTCH_PX))
        acc = 0
        for (let k = 0; k < notches; k++) {
          const dir = dy > 0 ? 1 : -1
          const next = Math.max(0, Math.min(last, cursor + dir))
          if (next !== cursor) {
            scrollToIndex(next)
            cursor = next
          }
          wheelDriveRef.current = { target: cursor, until: now + WHEEL_DRIVE_MS }
        }
        return
      }
      acc += dy
      // 小增量流：逐格冲刷，每格一张（冲刷上限防失控输入把列表瞬间拉穿）。每落一格
      // 把游标写回，下一次派发（哪怕还没重绘）也从它续延
      let steps = 0
      while (Math.abs(acc) >= WHEEL_STEP_PX && steps < 16) {
        const dir = acc > 0 ? 1 : -1
        acc -= dir * WHEEL_STEP_PX
        const next = Math.max(0, Math.min(last, cursor + dir))
        if (next !== cursor) {
          scrollToIndex(next)
          cursor = next
        }
        wheelDriveRef.current = { target: cursor, until: now + WHEEL_DRIVE_MS }
        steps += 1
      }
      if (steps >= 16) acc = 0
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [scrollToIndex])

  /**
   * 视口里能同时看到几张（PageUp / PageDown 的步长，D-14）。
   * 旧实现让 Page 键与方向键共用 ±1 分支——键盘用户按 PageDown 期望翻一屏，
   * 实际只走一张。这里在**按键时**做一次布局读（不是滚动时每帧扫，那条已经换成
   * O(1) 的命中测试了），数一数与视口有交集的槽位数；量不到就退 1 步。
   */
  const visibleCount = useCallback((): number => {
    const scroller = scrollerRef.current
    if (!scroller) return 1
    const top = scroller.scrollTop
    const bottom = top + scroller.clientHeight
    let n = 0
    for (const el of itemsRef.current) {
      if (!el) continue
      const t = el.offsetTop
      if (t + el.offsetHeight > top && t < bottom) n++
    }
    return Math.max(1, n)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = entries.length - 1
    // D-14：Page 键按一屏步进（一屏 = 视口内可见槽位数），方向键仍是 ±1
    const step =
      e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowUp'
          ? -1
          : e.key === 'PageDown'
            ? visibleCount()
            : e.key === 'PageUp'
              ? -visibleCount()
              : 0
    const target =
      step !== 0
        ? Math.max(0, Math.min(last, focusIndex + step))
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? last
            : -1
    if (target < 0) return
    e.preventDefault()
    scrollToIndex(target)
  }

  /**
   * 点退后的卡片 = 把它滚到中心。**捕获阶段**拦：Card 的点正文打开 / 点标签筛选都挂在
   * 冒泡路上，等气泡到容器再拦已经晚了。卡内按钮（复制 / 加标签 / 删除 / 标签 pill）
   * 与正文里渲染出的原生链接（MarkdownRenderer 产物，BUG-204）明确是功能点击，放行；
   * 多选态整卡都是勾选热区，也不拦。
   *
   * 这里从「每槽位一个闭包」改成**容器上委托一次**：逐项闭包会让 memo 行每次重渲染
   * 都换新 props（几百个闭包也随之重建），委托则让行彻底不掺合事件。
   */
  const onItemClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectMode) return
    if ((e.target as HTMLElement).closest?.('button, a[href]')) return
    const slot = (e.target as HTMLElement).closest?.<HTMLElement>('.momo-focus-item')
    if (!slot) return
    const i = Number(slot.dataset.index)
    if (!Number.isFinite(i) || i === focusIndex) return
    e.preventDefault()
    e.stopPropagation()
    scrollToIndex(i)
  }

  // 挂载窗口解析：spec 给每个槽位「挂不挂 + 退后档」。glide = 补间的目标下标
  // （没在滑行就是 focus 自己）：窗口覆盖 focus..glide 整段，滑行途中一次挂载 /
  // 卸载都不发生。占位高度口径已随「一屏一卡」退场（槽位高度 CSS 定死）。
  const specFor = useFocusWindow(focus, animRef.current?.target ?? focus)

  return (
    <div className="momo-focus-wrap">
      <div
        ref={scrollerRef}
        className="momo-focus"
        tabIndex={0}
        role="group"
        // Q12：全站唯一「Tab 可达却无名」的停靠点（GlobeStage 的 role=img 带
        // stageAria、Segmented 容器必传 ariaLabel——同一条 a11y 口径补齐）
        aria-label={copy.panel.focusStageAria}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onClickCapture={onItemClickCapture}
      >
        {entries.map((e, i) => {
          const spec = specFor(i)
          return (
            <FocusItem
              key={e.path}
              entry={e}
              index={i}
              // 窗口判定 + 距离夹取的算法都在 useFocusWindow
              depth={spec.depth}
              mounted={spec.mounted}
              register={registerItem}
            />
          )
        })}
      </div>
    </div>
  )
}

