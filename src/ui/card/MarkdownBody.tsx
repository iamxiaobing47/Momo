import { useEffect, useRef, useState } from 'react'
import { useUi } from '../store'
import type { MomoCaps } from '../store'
import { highlightMatches, prepareCardBody } from './markdown'

/**
 * 正文渲染件（卡片与回顾页共用）：Markdown 轻渲染 + 搜索命中高亮。
 * 搜索词放 ref 而不是进渲染 effect 的依赖：否则输入每个字符都会让全部命中卡片的
 * MarkdownRenderer 重跑一遍。
 */
/**
 * 共享的「靠近视口」观察者（D-09）。
 *
 * 旧写法每张卡 new 一个 IntersectionObserver：500 张卡 = 500 个 IO 实例，
 * 每个都带自己的 root margin 命中测试。这里全库共用**一个** IO，回调按元素
 * 分发（WeakMap 存每张卡的那一支），unobserve 时把自己的记录摘掉。
 * 语义与旧实现逐字一致：rootMargin '600px 0px'、命中即触发、触发后该卡
 * 「进过视口就保持」（visible 置true，effect 因 [visible] 变化而 unobserve）。
 * 无 IntersectionObserver 的环境（jsdom / 老 Electron）退回「直接当可见」。
 */
const nearViewportCallbacks = new WeakMap<Element, () => void>()
let sharedObserver: IntersectionObserver | null = null

function observeNearViewport(el: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible()
    return () => {}
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          const cb = nearViewportCallbacks.get(en.target)
          if (cb) cb()
        }
      },
      { rootMargin: '600px 0px' },
    )
  }
  nearViewportCallbacks.set(el, onVisible)
  sharedObserver.observe(el)
  return () => {
    nearViewportCallbacks.delete(el)
    sharedObserver?.unobserve(el)
  }
}

/**
 * 正文渲染缓存（治「切密度后内容逐个蹦出来」）。
 *
 * 密度切换会整棵卡片树重挂载（五档外层元素类型互异，见 `shell/CardFlow` 的分发），
 * 每张卡的 `visible` 复位 → 已渲染过的正文全部作废、异步重渲、逐张 resolve——
 * 那一下卡顿之后内容逐张蹦出来，就是切换迟滞感的主力。这里按**条目对象**缓存
 * 渲染产物，重挂载时同步回填。
 *
 * 失效靠两条，都不需要手动清理：
 * - 按 entry 对象做 WeakMap 键：refresh 对内容变化的条目换新对象（`store/refresh.ts`
 *   的引用守卫，没变的保留原引用），缓存随之天然失效；
 * - 值里记 caps 与 content：caps 每次 `init` 都 new（`views.tsx` 的 buildCaps），
 *   换了实例就当 miss；content 会随标题升格开关 / 字数上限变（见 `title.ts` 的
 *   bodyOf），条目对象没变也不行。
 *
 * 缓存的是**渲染产物节点**（不含容器自身类名）：列表卡与回顾大卡的容器类不同，
 * 但 Obsidian 的 MarkdownRenderer 只认 `markdown-rendered`（实时渲染与预热两条路径的游离容器
 * 都经 `detachedHost` 带上它——BUG-120：预热曾裸建 div，缺类容器渲染的 HTML 被缓存成长期值），
 * 其余 momo-* 前缀是自家 CSS 的作用域、渲染器读不到——所以同一条目在两种卡之间
 * 共享缓存是安全的，回顾跳到刚看过的条目也秒开。内存上界 = 库内活跃条目数
 * （它们的正文本来就在 service 索引里）。
 */
interface RenderedBody {
  caps: MomoCaps
  content: string
  /**
   * 渲染出来的子节点，**未高亮的原始副本**（BUG-217）。
   *
   * 存节点而非 HTML 字符串：字符串回填必须重新解析（`innerHTML` 或 `template`），
   * 而 `innerHTML` 赋值是 Obsidian 评审的 Error（`no-unsanitized/property` +
   * `@microsoft/sdl/no-inner-html`）。节点本来就在手边——存一份、回填时
   * `cloneNode(true)`，解析这一步整个消失，「解析即执行脚本」的顾虑也就不存在了
   * （比 BUG-100 那版「挑一个不执行脚本的解析 API」更强）。
   *
   * 必须是**未高亮**的：`highlightMatches` 就地改 DOM，而回填路径每次都会重做高亮——
   * 存下高亮过的节点会在第二次装载时叠加一层。
   */
  nodes: Node[]
}
const bodyCache = new WeakMap<object, RenderedBody>()

/** Obsidian MarkdownRenderer 认的容器类：它按容器的这个类决定生成什么样式 */
export const MARKDOWN_HOST_CLASS = 'markdown-rendered'

/**
 * 渲染用的**游离容器**——实时路径与预热路径共用这一个准备步骤（BUG-120，别各写一遍）。
 * 实时路径传卡容器的类名（含 markdown-rendered 与自家 momo-* 作用域）；预热没有卡容器，
 * 只带渲染器认的那个类。无论哪条路，`markdown-rendered` 都必须在。
 */
function detachedHost(className?: string): HTMLDivElement {
  const box = document.createElement('div')
  box.className = className ?? MARKDOWN_HOST_CLASS
  box.classList.add(MARKDOWN_HOST_CLASS)
  return box
}

/**
 * 预热：离屏渲染一条正文并写进缓存（密度按钮 hover 时用，见 `ListControls`）。
 * 已缓存 / caps 缺失直接跳过；渲染失败静默——预热只是「把点击前的等待挪到
 * hover 期」，点下去后照常走 MarkdownBody 的异步路径，不承载正确性。
 */
export async function warmBodyCache(
  caps: MomoCaps | null,
  cacheKey: object,
  content: string,
): Promise<void> {
  if (!caps) return
  const hit = bodyCache.get(cacheKey)
  if (hit && hit.caps === caps && hit.content === content) return
  const box = detachedHost()
  try {
    await caps.renderMarkdown(box, prepareCardBody(content))
    // box 这一趟就丢，子节点所有权直接转给缓存（不再 clone——预热是性能路径，
    // 这批节点此后没有别的引用，也不会被高亮碰）。缓存里这份始终是未高亮的原始副本。
    bodyCache.set(cacheKey, { caps, content, nodes: Array.from(box.childNodes) })
  } catch {
    // 预热失败不影响主路径：点击后 MarkdownBody 照常异步渲染
  } finally {
    // BUG-218：这个容器用完即弃，渲染登记的子组件跟着卸载（漏了就是一次泄漏/预热）。
    caps.releaseMarkdown?.(box)
  }
}

export function MarkdownBody({
  content,
  className,
  onClick,
  cacheKey,
  tabIndex,
  role,
  'aria-label': ariaLabel,
  onKeyDown,
}: {
  content: string
  className?: string
  onClick?: () => void
  /** 渲染缓存的键（调用方传 entry 对象）：切密度重挂载时同步回填，不重跑渲染 */
  cacheKey?: object
  /** BUG-176c：预览卡的正文是它唯一入口——把键盘等价物透传到这一层
   *  （tabIndex / role / aria-label / onKeyDown）。普通卡不传，DOM 与原来逐字一致。 */
  tabIndex?: number
  role?: string
  'aria-label'?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}) {
  const caps = useUi((s) => s.caps)
  const search = useUi((s) => s.search)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef(search)
  /** 是否已进入过视口（进过就保持，快速来回滚不闪烁重渲） */
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    searchRef.current = search
  }, [search])

  // 视口就近渲染（v0.5.3 性能）：挂载时每张卡都跑一次 Obsidian 的 MarkdownRenderer，
  // 几百条的列表一挂载就是几百次 —— 打开面板 / 清空搜索时面板卡顿的主力。
  // 现在只在进入视口前 600px 时才真正渲染（正常滚动感知不到），渲染过就保持。
  // D-09：观察者改为全库共享一个（见文件顶的 observeNearViewport）。
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    return observeNearViewport(el, () => setVisible(true))
  }, [visible])

  useEffect(() => {
    if (!visible) return
    if (!caps || !ref.current) return
    const el = ref.current
    // 命中缓存（切密度 / 重开面板后的重挂载、回顾跳到看过的条目）：同步回填，
    // 不再跑一趟 Obsidian 的 MarkdownRenderer——那正是「切一下密度，内容逐个
    // 蹦出来」的来源。三项比对（caps / content / 键本身）见文件顶的缓存注释。
    const hit = cacheKey ? bodyCache.get(cacheKey) : undefined
    if (hit && hit.caps === caps && hit.content === content) {
      // BUG-62：缓存回填与新鲜路径必须同语义——同一份内容两条装载路径，DOM 结果
      // 逐字节一致（dom-snapshot 基线盯着）。
      // BUG-100 → BUG-217：这里**不再有任何「字符串 → 节点」的解析**。旧实现缓存 HTML
      // 串、回填时用 template 重解析（当时只要挑一个不执行 <script> 的解析 API 就够）；
      // 评审把 `innerHTML` 赋值列为 Error（no-unsanitized/property），而节点本来就在
      // 缓存里——装载那刻存节点、回填这刻 cloneNode，解析这一步整个消失。
      // 必须 clone：命中路径下 `highlightMatches` 是就地改 DOM 的（见文件顶的缓存注释）。
      // 守卫 scripts/bodycache-script-guard.test.mts 钉住「回填路径不许出现解析 API」。
      el.replaceChildren(...hit.nodes.map((n) => n.cloneNode(true)))
      highlightMatches(el, searchRef.current)
      return
    }
    // B13：cancelled 防渲染竞态——content 连续变化（快速切搜索/筛选）时前一次
    // renderMarkdown 若后 resolve，会把上一张卡的正文写回本卡 DOM。
    // 旧实现只在高亮前查 cancelled，但 renderMarkdown 本身已把内容写进了 el：
    // 竞态依旧。这里先渲染进一个**游离容器**，resolve 后再整体搬进 ref 指向的
    // 真实 DOM——cancelled 之后旧渲染的结果根本不会落到界面上。
    let cancelled = false
    // 连带 el 的类名：MarkdownRenderer 会按容器的 markdown-rendered 等类决定怎么
    // 生成样式，游离容器上缺了它，搬回 el 后个别元素（标题 / 列表 / 表格）会走错外观。
    const box = detachedHost(el.className)
    // 先清展示区：渲染在游离容器里进行，这一帧的内容决定后整体搬回，不闪旧卡。
    el.empty()
    // caps.renderMarkdown 是异步的，非法内容 / 渲染抛错时把错误吞掉、不让它变成
    // 面板未接住的 unhandled rejection（正文渲染失败最多就是这一张卡空白）。
    void caps
      .renderMarkdown(box, prepareCardBody(content))
      .then(() => {
        if (cancelled) return
        // BUG-217：上屏的是**这一趟渲染出来的原节点**（replaceChildren 会把它们从 box
        // 移进 el，随后被就地高亮）；进缓存的却是它们的**克隆**——两份分开，
        // 缓存里那份永远保持未高亮的原始形态，否则第二次装载会在高亮上再叠一层
        // （回填路径每次都会重跑 highlightMatches）。这一条替代了旧的
        // 「先序列化再搬移」：那时要抢在 replaceChildren 之前读 innerHTML，
        // 读晚了只剩空串（缓存存了个空内容，重挂载时正文整段消失）。
        const nodes = Array.from(box.childNodes)
        if (cacheKey) bodyCache.set(cacheKey, { caps, content, nodes: nodes.map((n) => n.cloneNode(true)) })
        el.replaceChildren(...nodes)
        highlightMatches(el, searchRef.current)
      })
      // 注释承诺的「吞掉」落实在 catch：void 只丢值不接 rejection，漏出去就是
      // 面板未接住的 unhandled rejection（与 warmBodyCache 的 try/catch 同口径）
      .catch(() => {})
    return () => {
      cancelled = true
      // BUG-218：容器要走了，正文渲染登记的子组件跟着卸载（MarkdownRenderer 的
      // component 是按容器建的，见 views/caps.ts 的 componentFor）。
      caps.releaseMarkdown?.(el)
    }
  }, [caps, content, visible, cacheKey])

  // 搜索词变化：只重做高亮（纯 DOM），不重渲染 Markdown；未进视口的卡还没渲染，跳过
  useEffect(() => {
    if (!visible) return
    if (ref.current) highlightMatches(ref.current, search)
  }, [search, visible])

  // 拖选文字的松手同样会冒一次 click（双击选词的第二击 detail=2、三击选段同理）：
  // 那是「选中」不是「打开」，不拦住的话每次想复制几行正文都会被带进编辑器
  // （v0.5.2 用户反馈：只读浏览模式理应能直接复制文字）。
  const handleClick = (e: React.MouseEvent) => {
    if (e.detail > 1) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    onClick?.()
  }

  return (
    <div
      ref={ref}
      className={className}
      onClick={handleClick}
      tabIndex={tabIndex}
      role={role}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    />
  )
}
