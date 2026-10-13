import type { MomoCaps } from '../store'
import { warmBodyCache } from './MarkdownBody'

/**
 * 预热队列（切密度意图期）：把「前 N 条正文离屏烘缓存」这件事从**一次全甩**改成
 * **分片 + 让帧**。
 *
 * 旧写法（`useListDerivations` 的 `warmVisibleBodies`）是一个 for 循环把 N 个
 * `warmBodyCache` 一次性全发出去。`renderMarkdown` 虽是异步的，但 N 个 promise
 * 同时在飞，回调一起回来——主线程照样被淹没。比例档从「1/2」提到「全部」、或库本身
 * 上千条时，那一下就是一整片 UI 卡顿，而预热本该是**看不见的成本**（用户手停在
 * 密度按钮上、正等着点下去）。
 *
 * 三件事：
 * ① **分片**：一次只放 CHUNK 条在飞，整批跑完再放下一批；
 * ② **让帧**：批与批之间 `setTimeout(0)` 让出主线程，悬停那一刻的点击与滚动不被拖住；
 * ③ **代次作废**：`warmBodies` 每次调用 ++runToken，在跑的那批发现 token 过期就
 *    整个停下——悬停划过又划走、连着点别的密度、筛选变了 list 换了，这些情况下
 *    上一批的渲染纯属白花（它烘的条目已经不是当前列表前 N 条了）。
 *
 * 口径不变：每条仍走 `warmBodyCache`（已缓存跳过、失败静默），缓存仍是按条目对象的
 * WeakMap，命中与命中回填语义一字未改。
 */

/** 一批同时在飞的条数。取 4：够摊开异步渲染的等待，又不至于一次占满主线程 */
const CHUNK = 4

/** 代次令牌：比它小的批一律作废（见文件头 ③） */
let runToken = 0

/** 让出主线程。用 setTimeout 而不是 requestIdleCallback：
 *  rIC 在滚动 / 连续 hover 下可能长期不回调（没有真正的空闲），整批就永远卡在
 *  第一片；setTimeout 的语义是「下一宏任务」，必定让开一帧，正是这里要的。 */
function nextFrame(run: () => void): void {
  // BUG-224：`window.setTimeout`（不是裸 `setTimeout`）——popout 窗口里裸调用绑的是
  // 主窗口的定时器，评审口径 obsidianmd/prefer-window-timers。
  window.setTimeout(run, 0)
}

/**
 * 预热一批正文（离屏烘缓存）。**同步返回**——调用方（hover 意图回调）不等它跑完。
 *
 * caps 为 null（面板还没装配好）或空批：直接作废当前在跑的那批就返回。
 * items 已在缓存里的由 `warmBodyCache` 自己跳过，不占并发额度。
 */
export function warmBodies(
  caps: MomoCaps | null,
  items: readonly { key: object; content: string }[],
): void {
  const token = ++runToken
  if (!caps || items.length === 0) return
  const queue = items.slice()
  const step = async (): Promise<void> => {
    if (token !== runToken) return
    const batch = queue.splice(0, CHUNK)
    // warmBodyCache 自带 try/catch（预热不承载正确性），这批不会 reject
    await Promise.all(batch.map((item) => warmBodyCache(caps, item.key, item.content)))
    if (token !== runToken || queue.length === 0) return
    nextFrame(() => void step())
  }
  void step()
}