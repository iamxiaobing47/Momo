// 运行期建 <script> 的**中和**与**产物门禁**（2026-10-13 / BUG-233）。
//
// 评审的判据是**字面串**：
//   「Code creates script elements at runtime / createElement('script') /
//     Dynamically injecting script elements can load and execute arbitrary external code.」
// 它扫的是**发布产物**（`main.js`），而且这条检查住在评审平台自己的包装层里——不在
// `eslint-plugin-obsidianmd`（0.4.2 的包内没有这条规则）里，所以 `npm run lint:obsidian`
// 扫 `src/` 是**扫不到它**的：本地必须有自己的一条判据。
//
// 现状（react-dom 19.2.8）：**我们自己的代码一处都没有**，三处全在 react-dom 的
// `cjs/react-dom-client.*.js` 里——React 19 的「资源提升」（hoistable scripts）：
// 调 `ReactDOM.preinit(src, { as: 'script' })` 或渲染 `<script src>` 子节点时，
// 把 `<script>` 建进 head。插件从不渲染 `<script>` 子节点、也从不调 `preinit`，
// 那三个分支在本仓是**死代码**；但 react-dom 的 client 入口是 CJS
// （`module.exports = require('./cjs/…')`），esbuild 树摇不掉它，字节照原样落进
// `main.js`，评审照样拦（先例：BUG-219 之后我们自己的注入没了，这条 Error 却还在）。
//
// 修法：**esbuild 装载期把那串换成 `<template>`**。`<template>` 是惰性的——不取网络、
// 不执行、内容进独立的 document fragment，后面那几句（`markNodeAsHoistable` /
// `setInitialProperties` / `head.appendChild`）原样跑也只会往 head 里放一个空壳。
// 语义是「让这段死代码**永远建不出** `<script>`」，不是把字面量藏起来（**藏字面量才是
// 评审说的代码混淆**）。同款做法有公开先例：`obsidian-wysimark` 的 esbuild 插件
// `react-dom-no-dynamic-script-elements`（github.com/takeshy/obsidian-wysimark）。
//
// 为什么是「装载期改 vendor 源码」而不是 postinstall 打补丁：`package.json` **不在同步面**
// （公开仓 `Momo` 的 package.json 是精简版），postinstall 在公开仓检出里不会跑——而发布资产
// 正是公开仓的 CI 用同一条 `node esbuild.config.mjs production` 构建的。补丁必须住在
// esbuild 的 import 图里，两条构建路径（本仓 / 公开仓 CI）才共用同一份。

/** `<script>` 的字面形态：三种引号都收（评审认字面串，我们比它宽一档，顺手吃掉空白差异） */
const PATTERN = 'createElement\\(\\s*(?:"script"|\'script\'|`script`)\\s*\\)'

/** 中和后的标签名。`<template>` 惰性：不取网络、不执行、内容不进渲染树 */
export const INERT_TAG = 'template'

/** 数文本里还有几处运行期建 `<script>`（0 = 干净）。判据吃的是**产物**文本，不是源码 */
export function countScriptElements(text) {
  return text.match(new RegExp(PATTERN, 'g'))?.length ?? 0
}

/**
 * 中和：`createElement(<script 字面>)` → `createElement("template")`。
 * 幂等；返回 `{ code, replaced }`，`replaced === 0` 就是「这文本里没有可中和的东西」。
 */
export function neutralizeScriptElements(text) {
  let replaced = 0
  const code = text.replace(new RegExp(PATTERN, 'g'), () => {
    replaced += 1
    return `createElement("${INERT_TAG}")`
  })
  return { code, replaced }
}

/** 产物判据：返回问题列表（空数组 = 过）。`label` 只进文案 */
export function scriptElementProblems(text, label = 'main.js') {
  const n = countScriptElements(text)
  if (n === 0) return []
  return [
    `${label} 里有 ${n} 处运行期 createElement(<script>)——评审「Code creates script elements at ` +
      'runtime」是发布阻断 Error（BUG-233）。三种来路都要先查清再发版：中和补丁失效、' +
      'react-dom 换了打包形态、新依赖带进来了。中和点在 esbuild.config.mjs 的 react-dom ' +
      'onLoad 里，**别改产物**（手改 main.js 只会被下一次构建盖掉）。',
  ]
}
