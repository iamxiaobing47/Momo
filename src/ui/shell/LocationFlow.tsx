import { useEffect, useRef } from 'react'
import { useUi } from '../store'
import { copy } from '../../momo/i18n'
import { locKeyActive, firstLocGroupKey, type LocationGroup } from '../../momo/locations'
import type { MomoEntry } from '../../momo/types'
import { EntryFlow } from './CardGroup'
import { Icon } from '../shared/icons'
import { locScrollerOf, scrollLocToTop, scrollToLocGroup } from '../locations/locScroll'
import { LocGroupProvider } from '../locations/locGroup'

// 地点分组流（原地点模式的主区主体，2026-10-01 晚起是「全部笔记」的一种视图）：
// 所有地点组按条数降序连成一条流往下滚，没有分页、没有二级页面——
// 「往下滚就是全部浏览路径」（F6 裁决③）。它不再是**页面**，而是视图分段里的
// 「地点分组」那一档（与星球并列），入口在侧栏「全部地点」树与那颗星球图标旁。
//
// 组头（.momo-loc-head）**不吸顶**（2026-10-09 用户报 Bug：「卡片滚动的时候，地点名
// 也应该参与滚动」）：组头属于自己那一组，跟着本组的卡片一起滚走，与日期组头
// （.momo-group-head，static）同形制——「就像全部笔记里那样」。用户为这件事说过三次：
// 2026-09-30「地点名不要固定，要跟随滚动」（那轮把 sticky 改成了 static）；2026-10-01
// 同一句被误读成「滚到哪一组、哪一组的名字停在顶上」而改回 sticky（补了不透明底与
// 下沿细线当「边界表现」）；2026-10-09 明说「地点名也应该参与滚动」——sticky 下组头
// top 恒为 0、滚 0→960 一路钉在视口顶，正是用户两次都不要的「地点名固定」。
// **别改回 sticky**。样式在 styles.src/60-design/080-locgroups.css 的「地点分组流」
// 段：static，无不透明底、无下沿细线（分界只剩 .momo-loc-rule 一条）。两组头从此
// 同形制；独立类名（momo-loc-*）仍保留——同形状、不同语言，以后各改互不波及。
//
// 「我在哪一组」除吸顶外还有一处信号：组头激活态（.momo-loc-head-on）与侧栏
// 「全部地点」树的选中行（v0.9.31 ④ 起过滤入口整体搬进侧栏，顶栏跳转钮与浮层已删）。
//
// 过滤态（`filterLocations` 多选 + `locJumpSeq`）在 store；本组件只做一件事：
// 序号变了就滚到筛中的那些组的**第一组**（effect 只认序号，见 slice 注释）。
// ⚠️ **没有「滚动离开自动取消」**（F1 一期有，v0.9.31 删）：那时锚点是「定在
// 哪儿」的瞬时指示，滚走自然取消；现在筛选是**筛出来的结果**，用户在「中国」的
// 地盘里往下滚看别的组是天经地义——滚走就清等于把筛选器变成一次性按钮。清除
// 只有两个入口：筛选条上的地点胶囊 ✕、侧栏树里再点一次那一行。
//
// 每个组体外面包一层 LocGroupProvider（值 = 本组的**路径键**）：卡片 meta 行的
// 交叉引用 pill 据此把「本组」从自己的列表里剔掉（用户已经在这儿了）。值恒非空
// ——无地点的笔记不进分组档，没有「未标地点」虚拟组（小饼 2026-09-30 定）。
//
// 组体恒按单列窗口化列表渲染（见 LocBody 的注释）。地点视图与密度视图各自独立：
// 焦点档不进这里（网格档 2026-10-12 已整体移除）。

/** 组体：恒按**单列窗口化列表**（`EntryFlow`）渲染，**不看密度**。
 *
 * BUG-144（2026-10-09 用户报「地点视图有概率卡片没有正确渲染」）：密度档曾原样带进
 * 分组档——在（当时还有的）网格档下点进来，每组按多列瀑布流铺：小组的列高参差
 * （实测一组里 92 / 288 / 816 各占一列），更难看的是瀑布流**刻意不走窗口化**，
 * 于是折叠线下的卡只剩一副空壳——meta / 胶囊都在，正文要等 MarkdownBody 自己那颗
 * 600px IO，滚过去才蹦出来。用户看到的就是「卡片没有正确渲染」。
 * （2026-10-12：网格档整体移除，这条路径不再可能被踩；断言留在用例里守「地点两档
 *   恒单列」这个仍然成立的口径。）
 *
 * 地点视图是「同一份筛选结果按地点罗列」的独立视图，一列滚到底才是它的读法；
 * 密度档（焦点）是另一套独立视图，不许暗地里改写这一屏的长相（用户裁定：
 * 每个视图都是独立存在的）。
 */
function LocBody({ items }: { items: MomoEntry[] }): React.JSX.Element {
  return <EntryFlow items={items} />
}

// S6：`jumpScroll` prop 删掉（BUG-71d 挂着的尾巴）——全仓唯一调用方 CardFlow 从不传，
// 注释里「星球视图传 false」的那个消费者在 2026-10-01 版式重裁后就不渲染 LocationFlow 了。
export function LocationFlow({ groups }: { groups: readonly LocationGroup[] }): React.JSX.Element {
  const filterLocations = useUi((s) => s.filterLocations)
  const locJumpSeq = useUi((s) => s.locJumpSeq)
  const rootRef = useRef<HTMLDivElement>(null)

  // groups 的镜像：跳转 effect 只认 `locJumpSeq`（同值重点也要再滚一次），但落点要用
  // **最新那一份** groups（组键随 locLevel 档位变，见下面 keys 那段）。镜像 effect 声明在
  // 跳转 effect 之前，同一次提交里先跑，跳转 effect 读到的必是这一帧的值。
  const groupsRef = useRef(groups)
  useEffect(() => {
    groupsRef.current = groups
  })

  // 跳转 effect：依赖只有序号。挂载时也跑一次：带着筛选进入分组档（切模式 /
  // 切视图都不清筛选）就该落回那一组，与侧栏「全部地点」树选中的行一致。
  useEffect(() => {
    // 滚动容器：从本组件自己的 DOM 往上找（面板可同时开多份，别用 document）
    const scroller = locScrollerOf(rootRef.current?.closest<HTMLElement>('.momo-app') ?? null)
    if (!scroller) return
    const filters = useUi.getState().filterLocations
    if (filters.length === 0) {
      // 没有筛选 = 回流顶（筛选条上 ✕ 掉最后一枚地点胶囊即走这条）
      scrollLocToTop(scroller)
      return
    }
    // 落点 = **最后加进来的那个节点**对应的第一组（多选之后「刚点的那一个」才是
    // 用户想看的；集合顺序即加入顺序，倒着找第一个有落点的），组键与节点键
    // **互相覆盖**才算命中——树上的节点恒是 name 档完整路径，而组键按当前档位走：
    // 选「中国」在 name 档下组键是城市路径，精确比对一个都对不上，滚动于是静默
    // 失效（用户点了「亚洲」，筛选生效了，视图却停在原地）。
    // 一个组都不覆盖（筛出来的地名不在流里）时回顶。
    const keys = groupsRef.current.map((g) => g.key)
    let target: string | null = null
    for (let i = filters.length - 1; i >= 0 && target === null; i--) {
      target = firstLocGroupKey(keys, filters[i])
    }
    if (target === null) {
      scrollLocToTop(scroller)
      return
    }
    scrollToLocGroup(scroller, target)
  }, [locJumpSeq])

  return (
    <div className="momo-loc-flow" ref={rootRef}>
      {groups.map((g) => {
        // 组头点亮 = 本组与筛选集合里**任一个**节点互相覆盖（locKeyActive：任一边是
        // 另一边的前缀段）：筛「中国」在 name 档命中「亚洲 · 中国 · 北京」组（节点是组
        // 的前缀），在 continent 档只剩「亚洲」组（组是节点的祖先——它包着这次筛选的
        // 全部内容）。只判相等会在粗档下一处都不亮，用户没了「我筛着哪儿」的落点。
        const active = locKeyActive(filterLocations, g.key)
        // 组名 = 大洲 · 国家 · 地名（v0.9.30 起按 locLevel 截断，见 locPartsOf）；
        // 组内锚点比较走 g.key（路径键）——筛选集合存的也是键不是名。
        const name = g.label
        return (
          <section
            key={g.key}
            className={`momo-loc-group${active ? ' momo-loc-group-on' : ''}`}
            // 定位判定按 dataset.loc 逐个数（不用选择器拼地名，见 locScroll.ts 文件头）。
            // 值是路径键（\u0000 连接），用户数据里不可能出现这种字符
            data-loc={g.key}
          >
            <div
              className={`momo-loc-head${active ? ' momo-loc-head-on' : ''}`}
              role="heading"
              aria-level={2}
              aria-label={copy.location.groupAria(name, g.entries.length)}
            >
              <Icon name="mappin" size={14} />
              <span className="momo-loc-name">{name}</span>
              <span className="momo-loc-count">{g.entries.length}</span>
              <span className="momo-loc-rule" />
            </div>
            <LocGroupProvider group={g.key}>
              <LocBody items={g.entries} />
            </LocGroupProvider>
          </section>
        )
      })}
    </div>
  )
}
