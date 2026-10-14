# 配色方案：一个方案一个文件

`styles.src/themes/` 下每个 `.css` 就是一套配色方案，**文件名即方案 id**。
构建时 `scripts/build-css.mjs` 会把它们拼进 `styles.css` 的「70 段」（排在
`00-tokens.css` 之后、`75-host.css` 之前），运行时靠在宿主上挂
`.momo-theme-<id>` 来切换——**切换是纯换 class，不需要重新编译**。

## 当前五套（2026-10-09 用户裁定删 qingmang「青芒」与 stone「石白墨黑古铜」后，同日加 stepfun「StepFun」）

| id | 界面名 | 底色家族 | 签名色 |
| --- | --- | --- | --- |
| `mist-blue` | 雾蓝 | 纯白 | 雾蓝 |
| `moss-green` | 苔绿 | 近白 | 鲜绿 |
| `clam-white` | 蛤白 | 暖蛤白 | 石青 |
| `stepfun` | StepFun | 晴空青（最亮的一套） | 阶跃蓝 |
| `ink-night` | 墨夜 | **深炭（唯一暗色）** | 琥珀 |

**默认配色是 `mist-blue`「雾蓝」**（2026-10-11 用户裁定「配色方案，默认是雾蓝，它排在
第一个」——与 `brandIcon` 的 leaf 同款约定，**表序即表达默认**，排第一即是默认；此前
v0.9.44 起默认是 `ink-night`「墨夜」，再往前默认是 `stone`）。

**2026-10-12 用户裁定改名为方案本身的英文**（不再借用别的产品名）：`notion` →
`mist-blue`、`flomo` → `moss-green`、`gewu` → `clam-white`、`graphite` →
`ink-night`（`stepfun` 不变）；英文界面名同步成与 id 一致（Mist blue / Moss green /
Clam white / StepFun / Ink night——墨夜不再叫 Graphite night）。盘上旧值的 data.json
由 `sanitizeColorScheme` 的**改名映射**读成同色新 id（不清数据、不失用户选择），
其余退役 id 仍回落默认——同样不需要迁移函数。

**退役记录**：2026-10-04 用户裁定「只留四个核心」（不做备份），`dusk`（藕紫）/
`celadon`（青瓷）/ `morandi`（莫兰迪）/ `crimson`（绛红）/ `sepia`（米黄纸）/
`eink`（电子墨水）六套整文件删除；更早的 `sage`（暖米深林）在 v0.9.38 删过一次。
2026-10-07 加过 `qingmang`「青芒」与 `gewu`「蛤白」成六套，**2026-10-09 用户裁定删
`qingmang` 与 `stone`「石白墨黑古铜」回到四套**（`gewu` 保留），**同日加
`stepfun`「StepFun」成五套**（设计源：用户给的六张 StepFun 品牌图，方案卡名称行带
官方标；色值与对比度实测见 `stepfun.css` 头注）。`ColorScheme` 联合类型与
`COLOR_SCHEMES` 白名单同步收窄；盘上还留着旧值的 data.json 读盘时由
`sanitizeColorScheme` 回落默认 `mist-blue`（改名前的旧 id 走上面的**改名映射**读成
同色新 id）——不清数据、不需要迁移函数。

> 本目录与 `styles.src/**`、`scripts/**` 注释里带日期的「十套」提法（如
> 「2026-10-02 横展十套」「v0.9.11 实测十套里七套」）都是**收编前的实测与事件记录**，
> 不是目录现状；看到旧 id（stone / qingmang / sepia / dusk / celadon …）同样去 git
> 历史里找，文件已不在。`notion` / `flomo` / `gewu` / `graphite` 是 2026-10-12
> 改名前的写法——映射见上，文件还在、只是换了名字。

## 新增一套配色（三步）

假设要加一套叫 `amber` 的配色。

### ① 复制 `mist-blue.css` → `amber.css`，改色值

```bash
cp styles.src/themes/mist-blue.css styles.src/themes/amber.css
```

然后改两处：

1. 文件里 **4 处** `.momo-theme-mist-blue` → `.momo-theme-amber`（选择器末尾，四个宿主各一份）；
2. 花括号里的 **41 个色值**。令牌清单必须与 `mist-blue.css` **逐项相同**，一个都不能少——
   少一个，用到它的地方会拿到空值（变透明），而且这种错在界面上很难一眼看出来。

只需要懂「这个令牌是什么」就够了，注释里都写了。不要搬字号 / 圆角 / 字体 / 层级，
那些换肤时不变，在 `00-tokens.css`。

改完的色值还要过对比度那一关（见下面「还有一道」）——**别照着别的项目抄浅灰**，
ink-3 / ink-4 在本项目里是正文色，门槛 4.5:1，比多数设计系统默认的辅助灰要深。

### ② `src/momo/types/prefs.ts` 加一行

`ColorScheme` 联合类型加 `| 'amber'`，`COLOR_SCHEMES` 数组加一行：

```ts
{ id: 'amber', swatch: '#b0791f' }, // swatch 要与该文件的 --momo-accent 一致
```

数组顺序 = 设置页色卡的展示顺序。`swatch` 是色卡右上角那颗小色点。

### ③ `src/momo/i18n/zh/meta.ts` 加名字

在 `colorScheme: { … }` 里加：

```ts
amber: { name: '琥珀', desc: '暖白底 + 米白卡片 + 琥珀主题。' },
```

`name` 是色卡上显示的名字，`desc` 是选中后「当前：…」那行小字。

## 还有一道：色值必须过 WCAG 2.1 AA

改完色值跑这个（构建时也会自动跑，见 `scripts/build-css.mjs` 的门禁 5）：

```bash
node scripts/check-contrast.mjs
```

判定标准写在 `scripts/check-contrast.mjs` 顶部的 `PAIRS` 表里，一共四类（text / ui /
state / deltaE，外加只报不拦的 advisory）：

| 门槛 | 适用 | 依据 |
| --- | --- | --- |
| **4.5:1** | ink / ink-2 / ink-3 / ink-4；accent / danger / warn / sage / clay / primary 当文字用；实底按钮上的文字 | SC 1.4.3 正文 |
| **3:1** | 热力图 heat-1..4；未选圈 ink-5；空状态图标 / hover 描边 ink-6；焦点环 | SC 1.4.11 非文字 |
| **可分性** | 选中底 accent-soft(-2) vs card ≥1.10；侧栏空格子 heat-0 vs surface ≥1.05 | 「选中 = 换底」的项目语言 |
| **ΔE ≥15** | 代码块 palette 的五个语义色两两之间（Lab 欧式距离） | 同亮度不同色相也要分得开 |
| 只报告 | `--momo-line` / `--momo-line-soft` / `--momo-accent-line` | 装饰性描边，有冗余线索，见脚本里的注 |

**门槛的底 = 这个令牌真正被画在哪个面上**，别只按 card 调：侧栏活跃度（`.momo-heat-cell`
一族）整张坐在 `surface` 上，滚动条拇指与 hover 描边在 `surface` 上现形，空态图标在
`page` 上现形。2026-10-01 之前 `heat-1..4` / `ink-5` / `ink-6` 只按 card 判，于是九套方案的
「记了一天」最低一级糊在侧栏里（stone 2.72 / morandi（已删） 2.62）、六套的 hover 描边
不足 3:1、七套的空格子与侧栏同色——与墨夜「看不到滚动条」那条报障同一个病根。现在 PAIRS
里 ⑤c 组按 card / page / surface 三底一起判，各方案已按这三底重调（当时十套，各主题文件同段注释
写着前后值）。**调色只动明度**：照门槛朝黑（或朝白）缩放 RGB，保住色相与饱和度比例。

顺带它还会查**阶梯不许倒挂**：墨阶的对比度必须 ink > ink-2 > … > ink-6，
热力图必须 heat-1 < heat-2 < heat-3 < heat-4。少了这条，「改一个令牌把次级文字
改得比正文还深」这种错能一路溜进产物——WCAG 一条没违反，但整条灰阶读起来是乱的。

**v0.9.11 起还查相邻级最小倍率**（`HEAT_MIN_STEP = 1.15`，拦截）：单调只管不倒挂，
管不了「两级挨太近」——侧栏活跃度的格子只有 8~26px，相邻级倍率 ≤1.10 的方案
（v0.9.10 十套里七套）用户根本数不出级，实拍反馈「格子看不清」。守卫红线，
改色值把它修过去，**不许调阈值**。

调色时想要「刚好达标」的候选值，可以照 `PAIRS` 的门槛朝黑（或朝白）缩放 RGB——
保住色相与饱和度比例，只动明度。五套方案都是这么调出来的（收编前十套同理）。

**`eink`（电子纸，v0.9.37 加、2026-10-04 删）曾是例外：手调走不通，改用求解器反解**——纯灰在 Lab 里
	a=b=0，代码块五个语义角色两两 ΔE ≥15 只剩 ΔL 一项可用，装不下。做法是结构全中性灰、只给五个语义
	角色留一点色相并把明度压进 L\* 22~46 的窄带。推导原文随 `eink.css` 一起删除，去 git 历史
	（`git log -- styles.src/themes/eink.css`）找；**这个方法论对未来的「近乎无彩」方案仍然适用**。

## 就这么三步，改完记得跑一遍

```bash
node scripts/check-themes.mjs
node scripts/check-contrast.mjs
```

这是「三处一致性守卫」，构建时必跑（挂在 `build-css.mjs` 里）。它查三件事，
漏一处直接构建失败，不会让你带着半成品上线：

1. **id 集合三处相同**：`themes/` 文件 ↔ `COLOR_SCHEMES` ↔ i18n `colorScheme`
   ↔ `ColorScheme` 联合类型。多一个少一个都失败（表现为「设置页少一张色卡」
   或「选了没反应」）。
2. **令牌清单与 `mist-blue.css` 逐项相同**：少 / 多都报，并把令牌名打出来。
3. **四个宿主选择器齐全**：`.momo-app` / `.momo-confirm` / `.momo-settings` /
   `.momo-set-scheme`，且各自带自己的 `.momo-theme-<id>`。第四个是设置页的
   配色方案卡——它让每张色卡自持自己那套令牌，预览条上显示的就是它自己的三色，
   TS 里不需要再抄一遍色值。

## 为什么是四个宿主

令牌挂在宿主上（`00-tokens.css` 里那串选择器），四个入口各挂一份：

| 宿主 | 场景 | 挂 class 的地方 |
| --- | --- | --- |
| `.momo-app` | 主面板 | `src/ui/app/App.tsx` |
| `.momo-confirm` | 确认弹窗 | `src/ui/caps.ts` |
| `.momo-settings` | 设置页 | `src/views/settings/settings.ts` 的 `applyScheme()` |
| `.momo-set-scheme` | 设置页配色方案卡 | `src/views/settings/fields.ts` 的 `schemePicker` |

这四个宿主**永远带着一个 `momo-theme-*` class**，所以 `00-tokens.css` 里才敢
不写兜底色板——所有颜色令牌都由方案文件提供，没有「忘了挂就变透明」的中间态。

## 想调某一套的色值

直接改那个文件里对应的色值就行，不用碰别的。改完跑 `node scripts/build-css.mjs`
重新拼 `styles.css`。
