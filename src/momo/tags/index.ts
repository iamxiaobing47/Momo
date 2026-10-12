// tags 域纯逻辑（obsidian-free，可被 ui/ 与 views/ 共用）。包内模块直连，包外经本 barrel。

export { PAIR_SEP, pairKey, buildCooccurrence, suggestScore } from './cooccur'
export { tagTreeOf, tagNodeMapOf, cooccurrenceOf } from './derived'
export type { ParsedFile } from './parse'
export { TAG_RE_HEAD, TAG_RE_TAIL, TAG_TAIL_RE, mapOutsideCode, eachTextSegment, hasImageMarkdown, parseInlineTags, rewriteInlineTags, remapTagPath, remapFmTags, canonicalTagPath, tagKey, isValidTag, normalizeTags, isTagAncestor, splitFrontmatter, buildFrontmatter } from './parse'
export type { TagTimeFilter, TagAttachmentFilter, TagFilterState } from './tagFilter'
export { matchesFilter, filterTagNodes, TAG_TIME_FILTERS, TAG_ATTACHMENT_FILTERS, DEFAULT_TAG_FILTER, isTagFilterActive, applyTagFilter } from './tagFilter'
export type { DefectiveTag } from './tagHealth'
export { hasTagSpace, squeezeTagSpace, defectiveTags } from './tagHealth'
export { sortTagTree } from './tagSort'
export type { TagNode } from './tagTree'
export { buildTagTreeCalls, resetBuildTagTreeCalls, buildTagTree, entryMatchesTagKey, flattenTagTree } from './tagTree'
