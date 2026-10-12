// 命令面板注册表（R6 插槽化，feature-registry-design.md §3 的 command 插槽）：
// main.ts 的 onload 只保留 `for (const def of COMMANDS) this.addCommand(...)`——
// 加一条命令改本表，不再去 onload 里手写。momo/core/features.ts 的 slots.command 是没人读的只写数据；现在两边由本文件末尾的
// 编译锚定（R1b 补齐）钉死对齐。
//
// **只收四条**（2026-09-30 用户裁过一次：「Obsidian 命令优化，只要以下命令」）：
// 打开 / 新建 / 补记到过去 / 写到未来——「建一条 Momo」的三个时间方向（此刻 /
// 过去 / 未来）加一个打开面板。被请出命令面板的两类仍在用，只是换了入口：
//   - 随机回顾：侧栏「回顾」分区照旧（`random-review` 命令删除，setMode('review')
//     的能力没动，回顾功能本身不受影响）；
//   - 面板移到左 / 右侧边栏：标签页右键菜单与设置页各有一份，命令里那份是重复入口。
// 以后想再加命令，先想清楚「它是不是又一把重复的勺子」。
//
// 依赖方向：本文件住 views/（obsidian import 只允许在 views/ 与 main.ts 两层）。
// callback 闭包的东西（service / app / openView）由 main.ts 经 host
// 参数传进来——注册表不反向 import main.ts（避免循环），形状见 CommandHost。
import type { App } from 'obsidian'
import { copy } from '../momo/i18n'
import type { MomoService } from '../momo/service'
import { FEATURES } from '../momo/core'
import { pickBackfillDay, pickFutureDay, backfillCreate, futureCreate } from './caps'

/** main.ts 传进来的宿主能力（MomoViewHost 的形状 + app；openView 是 main.ts 的
 *  私有方法，经这里转交，注册表因此不用 import main.ts） */
export interface CommandHost {
  service: MomoService
  app: App
  openView(): Promise<void>
}

export interface CommandDef {
  id: string
  /** 名字取 brand 的函数：命令名仍在 onload 时从 prefs.brandName 取一次
   *  （现状行为——registry 不改这个语义，见 main.ts 的注释） */
  name: (brand: string) => string
  run: (host: CommandHost) => void | Promise<void>
}

export const COMMANDS = [
  {
    id: 'open-Momo',
    name: (brand: string) => copy.commands.openPanel(brand),
    run: (host) => void host.openView(),
  },
  {
    id: 'new-Momo',
    name: (brand: string) => copy.commands.newEntry(brand),
    run: async (host) => {
      try {
        if (!host.service.rootExists()) {
          // 静默重建：不再弹出黑底白字提醒
        }
        const file = await host.service.create('', [])
        await host.service.openInEditor(file.path)
      } catch {
        // 静默失败：不再弹出黑底白字提醒
      }
    },
  },
  {
    id: 'backfill-Momo',
    name: () => copy.commands.backfill,
    run: async (host) => {
      const day = await pickBackfillDay(host.app, host.service.data.prefs.colorScheme, host.service.data.prefs.brandName)
      if (!day) return
      // caps.backfillCreate 失败时先 notice 再 rethrow（调用方要能判断成败）；
      // 命令这一层没有更多信息可加，但必须接住——否则 rethrow 漏成 unhandled
      // rejection，用户已经看到 Notice 之后控制台还会再报一次错。
      try {
        await backfillCreate(host.service, day)
      } catch {
        // caps 已弹 Notice，这里只别让 rejection 漏出去
      }
    },
  },
  {
    id: 'future-Momo',
    name: () => copy.commands.future,
    run: async (host) => {
      const day = await pickFutureDay(host.app, host.service.data.prefs.colorScheme, host.service.data.prefs.brandName)
      if (!day) return
      // 与 backfill-Momo 同款分工：caps 弹 Notice，命令层只别让 rejection 漏出去
      try {
        await futureCreate(host.service, day)
      } catch {
        // caps 已弹 Notice
      }
    },
  },
] as const satisfies readonly CommandDef[]

// ---- 命令锚定（R1b 补齐的 command 半边）：core/features.ts 声明的 slots.command 必须
// 都是本表的真 id——「注册表加了命令、功能表没登记」或反之都编译不过。
// 反向不锚：四条建档命令全属 notes（它在 core/features.ts 里登记的 command 是
// open-Momo），搬家 / 回顾这些面板家具入口不属于任何功能，这是刻意的。
type _AssertNever<T extends never> = T
type _CommandSlotOf<T> = T extends { slots: { command: infer V } } ? V : never
type _DeclaredCommand = _CommandSlotOf<(typeof FEATURES)[number]>
type _UnknownCommand = Exclude<_DeclaredCommand, (typeof COMMANDS)[number]['id']>
type _EveryCommandSlotIsRegistered = _AssertNever<_UnknownCommand>
