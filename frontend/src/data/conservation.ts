import type { MessageKey } from "../i18n/locales/en"

/** Conservation statuses the scraper normalizes to: IUCN categories, plus NatureServe's "secure" ranks. */
export const CONSERVATION_STATUS_LABELS: Record<string, MessageKey> = {
  "extinct": "conservation.extinct",
  "extinct in the wild": "conservation.extinctInTheWild",
  "critically endangered": "conservation.criticallyEndangered",
  "endangered": "conservation.endangered",
  "vulnerable": "conservation.vulnerable",
  "near threatened": "conservation.nearThreatened",
  "least concern": "conservation.leastConcern",
  "data deficient": "conservation.dataDeficient",
  "not evaluated": "conservation.notEvaluated",
  "apparently secure": "conservation.apparentlySecure",
  "secure": "conservation.secure",
}

const AT_RISK = new Set(["critically endangered", "endangered", "vulnerable", "near threatened"])

/** Statuses that mean the species is at risk in the wild, as opposed to "least concern" or "secure". */
export const isThreatened = (status: string) => AT_RISK.has(status)

/** Older exports had "Vulnerable (IUCN 3.1)": keep only the status, in lowercase. */
export const normalizeConservationStatus = (status: string) => status.replace(/\s*\([^()]*\)$/, "").toLowerCase()
