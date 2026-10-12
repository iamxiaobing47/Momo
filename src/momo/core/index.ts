// core 域纯逻辑（obsidian-free，可被 ui/ 与 views/ 共用）。包内模块直连，包外经本 barrel。

export type { DeferredRun } from './debounce'
export { deferredRun } from './debounce'
export type { PremiumFeature, FeatureSlots, FeatureDef } from './features'
export { PREMIUM_FEATURES, FEATURES, featureById, DEFAULT_QUOTAS } from './features'
export type { InflightGate } from './inflight'
export { createInflightGate } from './inflight'
export type { SearchDraft } from './searchDraft'
export { SEARCH_DEBOUNCE_MS, createSearchDraft } from './searchDraft'
export { sortKeyOf, sortAscendingOf, flipSortDirection, withSortDirection, withSortKey, sortEntries } from './sort'
export { truncateChars, charLength, errMsg } from './text'
