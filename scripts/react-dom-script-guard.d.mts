// react-dom-script-guard.mjs 的类型声明（scripts 层 typecheck 用，见 tsconfig.scripts.json；
// 先例 scripts/vault-targets.d.mts）。构建期 esbuild.config.mjs 与
// react-dom-script-guard.test.mts 都 import 这个 .mjs——esbuild 剥类型跑、类型只在 tsc
// 那层用，改了 .mjs 的导出记得同步这里。

/** 中和后的标签名：`<template>` 惰性，不取网络、不执行 */
export declare const INERT_TAG: string

/** 数文本里还有几处运行期建 `<script>`（0 = 干净） */
export declare function countScriptElements(text: string): number

/** 中和：`createElement(<script 字面>)` → `createElement("template")`（幂等） */
export declare function neutralizeScriptElements(text: string): { code: string; replaced: number }

/** 产物判据：问题列表，空数组 = 过 */
export declare function scriptElementProblems(text: string, label?: string): string[]
