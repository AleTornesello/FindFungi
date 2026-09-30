export const MUSHROOMS_URL =
  "https://raw.githubusercontent.com/AleTornesello/FindFungi/refs/heads/develop/data/mushrooms.json"

/** Re-download the dataset once the local copy is this old. */
export const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export interface Mushroom {
  id: number
  taxonomy: {
    kingdom: string
    division: string
    class: string
    order: string
    family: string
    genus: string
    species: string
  }
  properties: {
    edible: boolean
    microscopic: boolean
    cap: string
    hymenium: string
    lamella: string
    stipe: string
    gleba: string
    sporePrint: string
    ecology: string
    conservationStatus: string
    coverImage: string
  }
}

export const scientificName = (m: Mushroom) => `${m.taxonomy.genus} ${m.taxonomy.species}`.trim()

/** Rejects payloads that would break the UI, so a bad download never replaces a good local copy. */
export function parseMushrooms(data: unknown): Mushroom[] {
  if (!Array.isArray(data) || data.length === 0) throw new Error("Mushroom data is empty or not a list")
  for (const m of data) {
    if (typeof m?.id !== "number" || typeof m?.taxonomy?.genus !== "string" || typeof m?.properties !== "object") {
      throw new Error("Mushroom data has an unexpected shape")
    }
  }
  return data as Mushroom[]
}
