// 字体包「装没装 / 正在下哪套」的**共享态**（2026-10-14，用户报障「系统字体里下载了
// 思源黑体，卡片字体里还需要重复下载思源黑体」）：
//
// 系统字体与卡片字体是**两行格子**，背后却是同一个盘上事实——`<插件目录>/fonts/`
// 齐不齐（见 service.fontPackStatus，「装没装」按文件齐不齐判）。旧实现每行各持一份
// `installed` Set 与各自的 `busyId`：在系统字体行下载完一套，卡片字体行那份快照还是
// 进页面时读的——格子仍挂「未下载」虚线与大小标注，点一下又弹确认框、把同样的字节
// 再下一遍（用户视角正是「还要重复下载」）。
//
// 共享态做三件事：
//   ① **读盘去重**：两行几乎同时进页面，合并成一次 fontPackStatus（同一个 Promise），
//      也保证两行画的是同一份快照；
//   ② **广播**：任一行下载成功 / 失败，另一行的格子当场换态（订阅制——行各自重画
//      自己的格子，互不持有对方的 DOM）；
//   ③ **流程占位也共享**：「一次只走一套」是全局纪律：确认框开着 / 正在下时，
//      两行点任何一格都不该再起一个流程（各起一个就是同样的字节下两遍）。
//
// 寿命跟着一次 buildLookTab（= 一次 display()）：重建时新造一份、重新读盘，旧订阅
// 随旧对象一起被回收，不存在跨页面残留。

import { FONT_PACKS } from '../../momo/fonts/pack'
import type { FontPackId } from '../../momo/types'

/** 盘上状态读取器（设置页传 `() => ctx.service.fontPackStatus()`，测试可打桩） */
export type FontPackStatusReader = () => Promise<Record<FontPackId, boolean>>

export interface FontPackState {
  /** 盘上安装态；同一批建造里重复调用只发一次读盘，落地后广播给所有订阅者 */
  status(): Promise<Record<FontPackId, boolean>>
  /** 某包装没装（读盘未落地 / 读盘失败都按没装画，落地后重画） */
  has(id: FontPackId): boolean
  /**
   * 有没有一条「确认 → 下载」流程在走（确认框开着也算）。点格子的总闸：
   * 非空时任何一格再来点都直接不理——否则两行各开一个确认框、各起一次下载，
   * 同样的字节下两遍（用户报障的同一个症状，换了个触发方式）。
   */
  active(): FontPackId | null
  /** 正在下载的包 id（null = 空闲）：只驱动观感（进度行），闸门看 active() */
  busy(): FontPackId | null
  /** 流程开始：点格子即占位（确认框还开着，先不算「正在下载」） */
  begin(id: FontPackId): void
  /** 用户点了「下载」：观感切到正在下载 */
  downloading(id: FontPackId): void
  /** 流程收尾：ok = 这套装好了；不 ok（取消 / 失败）= 退回未下载 */
  settle(id: FontPackId, ok: boolean): void
  /** 订阅状态变化，返回退订函数 */
  subscribe(repaint: () => void): () => void
}

export function createFontPackState(read: FontPackStatusReader): FontPackState {
  const installed = new Set<FontPackId>()
  const subs = new Set<() => void>()
  let activeId: FontPackId | null = null
  let downloadingId: FontPackId | null = null
  let inflight: Promise<Record<FontPackId, boolean>> | null = null

  const notify = (): void => {
    for (const repaint of subs) repaint()
  }

  return {
    status(): Promise<Record<FontPackId, boolean>> {
      if (!inflight) {
        inflight = read()
          .catch((e) => {
            // 读盘失败按「都没装」画：格子退回未下载态，用户点一下就会重下——比把
            // 异常捅到 UI 更诚实（与 service.fontPackStatus 的局部失败口径一致）
            console.debug('[Momo] 字体包状态读取失败', e)
            return {} as Record<FontPackId, boolean>
          })
          .then((packs) => {
            installed.clear()
            for (const pack of FONT_PACKS) if (packs[pack.id]) installed.add(pack.id)
            notify()
            return packs
          })
      }
      return inflight
    },
    has: (id) => installed.has(id),
    active: () => activeId,
    busy: () => downloadingId,
    begin(id): void {
      activeId = id
      notify()
    },
    downloading(id): void {
      downloadingId = id
      notify()
    },
    settle(id, ok): void {
      if (ok) installed.add(id)
      else installed.delete(id)
      activeId = null
      downloadingId = null
      notify()
    },
    subscribe(repaint): () => void {
      subs.add(repaint)
      return () => {
        subs.delete(repaint)
      }
    },
  }
}
