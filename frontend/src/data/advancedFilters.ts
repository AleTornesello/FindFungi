import type { Mushroom } from "./mushrooms"
import type { MessageKey } from "../i18n/locales/en"

/**
 * Fields the explore page doesn't already cover (name/family search and the edibility toggle).
 * Each one maps a mushroom to the option values it matches, so a compound value like
 * "convex or flat" is found under both "convex" and "flat".
 */
export interface FilterField {
  key: string
  label: MessageKey
  group: "taxonomy" | "characteristics"
  values: (m: Mushroom) => string[]
  /** Values the app itself produces (rather than the dataset), shown translated. */
  valueLabels?: Record<string, MessageKey>
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

const taxon = (key: keyof Mushroom["taxonomy"], label: MessageKey): FilterField => ({
  key,
  label,
  group: "taxonomy",
  values: (m) => single(m.taxonomy[key]),
})

const trait = (key: keyof Mushroom["properties"], label: MessageKey, map = split): FilterField => ({
  key,
  label,
  group: "characteristics",
  values: (m) => map(String(m.properties[key])),
})

export const FILTER_FIELDS: FilterField[] = [
  taxon("kingdom", "field.kingdom"),
  taxon("division", "field.division"),
  taxon("class", "field.class"),
  taxon("order", "field.order"),
  trait("hymenium", "field.hymenium"),
  trait("cap", "field.capShape"),
  trait("lamella", "field.lamella"),
  trait("stipe", "field.stipe"),
  trait("gleba", "field.gleba", single),
  trait("sporePrint", "field.sporePrint"),
  trait("ecology", "field.ecology"),
  trait("conservationStatus", "field.conservationStatus", withoutSource),
  {
    key: "microscopic",
    label: "field.microscopic",
    group: "characteristics",
    values: (m) => [m.properties.microscopic ? "documented" : "undocumented"],
    valueLabels: {
      documented: "filters.microscopy.documented",
      undocumented: "filters.microscopy.undocumented",
    },
  },
]

/** Option label: app-made values go through `t`, characteristics through the dataset's translations. */
export function filterValueLabel(
  field: FilterField,
  value: string,
  t: (key: MessageKey) => string,
  valueLabel: (property: keyof Mushroom["properties"], value: string) => string,
) {
  const key = field.valueLabels?.[value]
  if (key) return t(key)
  return field.group === "characteristics" ? valueLabel(field.key as keyof Mushroom["properties"], value) : value
}

export function matchesFilters(m: Mushroom, filters: AdvancedFilters, skipKey?: string) {
  return FILTER_FIELDS.every((f) => {
    const selected = filters[f.key]
    if (f.key === skipKey || !selected?.length) return true
    return f.values(m).some((v) => selected.includes(v))
  })
}

export const activeFilterCount = (filters: AdvancedFilters) =>
  Object.values(filters).reduce((n, vs) => n + vs.length, 0)
