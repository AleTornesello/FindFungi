import { useCallback, useEffect, useState } from "react"

export interface Find {
  id: string
  /** Id of the species in the mushroom dataset; missing for finds logged before the app used it. */
  mushroomId?: number
  /** Kept with the find so it still shows, and can be matched again, if the dataset changes ids. */
  scientificName: string
  place: string
  date: string
  notes: string
}

const KEY = "findfungi:finds"

/** Finds were first logged against a short hardcoded list of species, by slug. */
const LEGACY_SPECIES: Record<string, string> = {
  chanterelle: "Cantharellus cibarius",
  porcini: "Boletus edulis",
  "fly-agaric": "Amanita muscaria",
  "death-cap": "Amanita phalloides",
  "chicken-of-the-woods": "Laetiporus sulphureus",
  parasol: "Macrolepiota procera",
  morel: "Morchella esculenta",
  "turkey-tail": "Trametes versicolor",
}

function upgradeFind(find: Find & { speciesId?: string }): Find {
  const { speciesId, ...rest } = find
  if (speciesId === undefined) return rest
  return { ...rest, scientificName: LEGACY_SPECIES[speciesId] ?? speciesId }
}

function load(): Find[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Find[]).map(upgradeFind) : []
  } catch {
    return []
  }
}

/** Finds live in this browser's localStorage until there is a backend. */
export function useFinds() {
  const [finds, setFinds] = useState<Find[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(finds))
    } catch {
      // Storage can be unavailable (private mode); the log still works for this session.
    }
  }, [finds])

  const addFind = useCallback((find: Omit<Find, "id">) => {
    setFinds((prev) => [{ ...find, id: crypto.randomUUID() }, ...prev])
  }, [])

  const removeFind = useCallback((id: string) => {
    setFinds((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return { finds, addFind, removeFind }
}
