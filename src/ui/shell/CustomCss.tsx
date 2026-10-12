import { useLayoutEffect, useRef } from 'react'

/**
 * 自定义 CSS 注入：<style> 挂在 .momo-app 里（DOM 顺序在插件样式之后），
 * 同特异性时覆盖配色方案；用 textContent 写入（不做 HTML 解析，避免 CSS 里
 * 出现 </style> 之类把内容当标记解析）。
 *
 * 写入放 useLayoutEffect：useEffect 在绘制**之后**才跑，面板打开 / lang key 重挂时
 * 首帧 `<style>` 还是空的，会闪一帧无自定义 CSS；useLayoutEffect 在 DOM 变更后、
 * 浏览器绘制前同步写 textContent，首帧就带上（BUG-70b）。更新路径不变。
 */
export function CustomCss({ css }: { css: string }) {
  const ref = useRef<HTMLStyleElement>(null)
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = css
  }, [css])
  return <style ref={ref} className="momo-custom-css" />
}
