# styles.src/ 局部规约

根 [`../AGENTS.md`](../AGENTS.md) 管全局红线；本文件只补 CSS 源的约定。

## 分片结构（2026-10-03 起：层包 + 组件分片）

- `styles.css` 是**部署件**（入库但禁止手改），由本目录全部 `.css` 分片拼接产出。
- 源按「**层 → 组件**」两级组织：
  - **层包** `NN-<组件族>/`（NN = 层序，与分包前的 `NN-*.css` 同名分片一一对应），
    层内按组件切成分片 `NNN-<组件>.css`。三位序号 = 该组件在**原层内的先后顺序**——
    同特异性 tie 靠源序决胜，序号让「谁盖谁」可读，也是拼接口能与分包前逐字节一致的原因。
  - **单文件层** `NN-*.css`：整个层只有一个关注点（`00-tokens` / `10-base` / `50-narrow` /
    `75-host` / `95-responsive`），不硬凑成包。
    `95-responsive.css` 必须是这个形态——构建门禁按文件名认它。
  - 主题在 `themes/`（5 套：2026-10-04 由十套收编，2026-10-09 删 qingmang 与 stone 后加
    stepfun「StepFun」；退役记录见该目录 README）。配色 token 一致性归 `npm run check:themes`，
    对比度归 `npm run check:contrast`（WCAG 2.1 AA）。
- 收集是**递归**的（`build-css.mjs` 的 `collectParts()`）：新增组件分片只要放进对应层包、
  序号不撞，就自动进拼接序，不用改任何脚本。完整分片清单与各层职责见
  [`docs/howto/styling.md`](../../docs/howto/styling.md) §2。

## 硬性门禁

- 新 `@container` / `@media` **只许**加在 `95-responsive.css`（门禁会拦别处的）——
  断点集中管理，见 `build-css.mjs` 的门禁实现。
- `!important` 有配额门禁（当前 0），加之前先看现有配额余量。
- 新 `.momo-` 类必须真的被用到（`npm run lint:dead` 抓死类与死导出）。
- 编码红线：`npm run check:encoding` 全查本目录（含各层包内的分片）与产物（cp932 事故防回归）。

## 改动路径

改分片 → `npm run build:css` → `lint:css` + `lint:css:rules` + `check:css` →
（主题改动）`check:themes` + `check:contrast`。完整流程见
`.agents/skills/momo-css-change/SKILL.md`。
