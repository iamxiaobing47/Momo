// dates 域纯逻辑（obsidian-free，可被 ui/ 与 views/ 共用）。包内模块直连，包外经本 barrel。

export type { DateGroup } from './dateGroups'
export { localDay, dayKey, dayKeyCached, startOfToday, startOfWeek, parseDay, monthsBefore, monthWindowStart, monthWindowEnd, dayWindowStart, dayMoment, compareTimeKey, dayRange, dayLabel, groupByDate, pad2 } from './dateGroups'
export type { HeatCell, HeatWeeks } from './heatWeeks'
export { buildWeeks, pickMonthLabels, levelClass } from './heatWeeks'
