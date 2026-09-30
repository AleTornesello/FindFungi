import type { Mushroom } from "./mushrooms"

/**
 * Fields the explore page doesn't already cover (name/family search and the edibility toggle).
 * Each one maps a mushroom to the option values it matches, so a compound value like
 * "convex or flat" is found under both "convex" and "flat".
 */
export interface FilterField {
  key: string
  label: string
  group: "Taxonomy" | "Characteristics"
  values: (m: Mushroom) => string[]
}

/** Selected option values per field key. Options within a field are ORed, fields are ANDed. */
export type AdvancedFilters = Record<string, string[]>

const single = (v: string) => (v ? [v] : [])

// "white to cream", "ring and volva" and "adnate or decurrent" all describe several traits.
const split = (v: string) =>
  v
    .split(/ or | and | to /)
    .map((s) => s.trim())
    .filter((s) => s && s !== "not applicable")

// "Vulnerable (IUCN 3.1)" and "Vulnerable (NatureServe)" are the same status from different sources.
const withoutSource = (v: string) => single(v.replace(/\s*\(.*\)$/, ""))

const taxon = (key: keyof Mushroom["taxonomy"], label: string): FilterField => ({
  key,
  label,
  group: "Taxonomy",
  values: (m) => single(m.taxonomy[key]),
})

const trait = (key: keyof Mushroom["properties"], label: string, map = split): FilterField => ({
  key,
  label,
  group: "Characteristics",
  values: (m) => map(String(m.properties[key])),
})

export const FILTER_FIELDS: FilterField[] = [
  taxon("kingdom", "Kingdom"),
  taxon("division", "Division"),
  taxon("class", "Class"),
  taxon("order", "Order"),
  trait("hymenium", "Hymenium"),
  trait("cap", "Cap shape"),
  trait("lamella", "Gill attachment"),
  trait("stipe", "Stipe"),
  trait("gleba", "Flesh", single),
  trait("sporePrint", "Spore print"),
  trait("ecology", "Ecology"),
  trait("conservationStatus", "Conservation status", withoutSource),
  {
    key: "microscopic",
    label: "Microscopy",
    group: "Characteristics",
    values: (m) => [m.properties.microscopic ? "Documented" : "Not documented"],
  },
]

export function matchesFilters(m: Mushroom, filters: AdvancedFilters, skipKey?: string) {
  return FILTER_FIELDS.every((f) => {
    const selected = filters[f.key]
    if (f.key === skipKey || !selected?.length) return true
    return f.values(m).some((v) => selected.includes(v))
  })
}

export const activeFilterCount = (filters: AdvancedFilters) =>
  Object.values(filters).reduce((n, vs) => n + vs.length, 0)
