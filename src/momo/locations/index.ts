// locations 域纯逻辑（obsidian-free，可被 ui/ 与 views/ 共用）。包内模块直连，包外经本 barrel。

export type { LatLon } from './locCoords'
export { BUILTIN_LOC_COORDS, isValidLatLon, coordOfLocation, formatLatLon } from './locCoords'
export type { LocRegion, LocContinent } from './locRegions'
export { CONTINENT_LIST, CONTINENT_NAMES, isContinentName, BUILTIN_LOC_REGIONS, BUILTIN_LOC_COUNTRIES, BUILTIN_LOC_COUNTRY_ALIASES, isValidLocRegion, isBlankLocRegion, regionOfLocation, canonicalLocName, userKeyOf } from './locRegions'
export { displayLocName } from './locDisplay'
export type { LocRosterCity, LocRosterContinent, RosterHit } from './locRoster'
export { LOC_ROSTER, foldLocName, foldLocNameTight, rosterCityOf, rosterMatches } from './locRoster'
export type { LocTreeNode, LocTreeLevel, LocTreeLevels } from './locTree'
export { buildLocTree, LOC_TREE_LEVELS, DEFAULT_LOC_TREE_LEVELS, normalizeLocTreeLevels, filterLocTreeByLevels, entryAtLocNode, entriesAtLocNode } from './locTree'
export type { LocationInputIssue, LocationGroup, LocCount, LocView } from './locations'
export { LOCATION_MAX_CHARS, LOCATIONS_MAX, normalizeLocations, locationsOf, locationInputIssue, locListOf, addLocationsTo, removeLocationsFrom, locPartsOf, locGroupOf, locPathLabel, locFullKey, locNodeCovers, locKeysOverlap, locKeyActive, locOverlappingFilterKey, locKeyLabel, firstLocGroupKey, groupByLocation, locationTallies } from './locations'
