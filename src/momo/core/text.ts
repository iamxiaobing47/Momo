// 字符（码点）口径的文本工具（BUG-112b）：JS 的 `length` / `slice()` 数的是
// UTF-16 **码元**，代理对（emoji / CJK 扩展区一个字符占两个码元）会被劈成半个
// 字符——界面上渲染成 �，还会一路进函数式文案。定长截断与长度校验共用这一把尺：
// 码点（`Array.from` 的迭代单位），不是码元、也不是 `Intl.Segmenter` 的字素
//（字素对组合序列更准，但那要挑引擎支持，且「20 字」的契约按码点已自洽）。

/** 截到 max 个字符（码点口径；不会把代理对劈开） */
export function truncateChars(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('')
}

/** 字符数（码点口径，与 truncateChars 同一把尺） */
export function charLength(s: string): number {
  return Array.from(s).length
}

/**
 * 任意 throw → 可展示文本（Error 取 message，其余 String() 兜底）。
 *
 * 这一把尺原先有**四份**：`views/caps.ts` 与 `ui/store/refresh.ts` 各定义一个
 * `messageOf`、`views/settings/settings.ts` 与 `momo/service/index.ts` 内联十余次。
 * 收在 core 而不是留在某个包内，是因为那两条「各留一份」的老理由只说对了一半——
 * ui/ 确实不能 import views/，但 momo/core 是两侧都够得着的纯逻辑层（AGENTS.md §2.1）。
 * 报错文本的口径不该跟着文件走。
 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
