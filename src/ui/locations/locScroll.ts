// 地点流的滚动辅助（F1「连续分组流 + 跳转」，视觉稿 docs/design/mockups/location-view/）。
//
// 单独成文件而不是住在 LocationFlow 里：**滚这条流的不止分组流自己**——侧栏「全部地点」树里
// 的「再点一次当前行」（= 清除）、卡片的交叉引用 pill 都要把同一条流送到
// 某个位置。而「滚的是哪个容器」这件事只该有一处定义（.momo-content，与列表 /
// 网格共用同一颗），否则每个调用点各写一遍 querySelector，改动时必然漏。
//
// 定位**不用 CSS 选择器拼地名**：地名是用户输入（可含引号 / 空格 / CJK / emoji），
// `querySelector('[data-loc="…"]')` 会抛 SyntaxError。这里取出全部组节点后逐个数
// `dataset.loc` 比对——组数是几十个，O(n) 的代价可以忽略，换来的是零转义风险。

/** 地点流的滚动容器 = 主区滚动区（与其它模式共用） */
export function locScrollerOf(app: HTMLElement | null): HTMLElement | null {
  return app?.querySelector<HTMLElement>('.momo-content') ?? null
}

/** 流里所有地点组，按文档顺序（= 视觉顺序） */
function locGroupsOf(scroller: HTMLElement): HTMLElement[] {
  // Array.from 而不是展开：本仓 tsconfig 的 lib 没开 DOM.Iterable，展开 NodeList 编译不过
  return Array.from(scroller.querySelectorAll<HTMLElement>('.momo-loc-group'))
}

/**
 * 把某个地点组送到视口顶部（组头的位置；组头不吸顶，2026-09-30 起与日期组头
 * 同形制——这一函数只负责「送去」，不负责「钉住」）。
 * 返回 false = 流里没有这个组（筛选后该地名空了 / 锚点是陈旧值）——调用方据此
 * 决定要不要取消定位，这里不擅自清 store。
 */
export function scrollToLocGroup(scroller: HTMLElement, location: string): boolean {
  const el = locGroupsOf(scroller).find((g) => g.dataset.loc === location)
  if (!el) return false
  // rect 现场换算，不猜 offsetParent：组外面套了 .momo-loc-flow  wrapper，
  // offsetTop 会相对它而不是滚动容器。
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  scroller.scrollTop = Math.max(0, Math.round(top))
  return true
}

/** 回到流顶（侧栏「全部地点」树里再点一次当前行 = 清除） */
export function scrollLocToTop(scroller: HTMLElement): void {
  scroller.scrollTop = 0
}
