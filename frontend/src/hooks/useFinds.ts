import { useCallback, useEffect, useState } from "react"
import type { Position } from "../data/sharedFinds"

export interface Find {
  id: string
  /** Id of the species in the mushroom dataset; missing for finds logged before the app used it. */
  mushroomId?: number
  /** Kept with the find so it still shows, and can be matched again, if the dataset changes ids. */
  scientificName: string
  place: string
  date: string
  notes: string
  /** Where the user stood when logging the find, if they shared it and allowed geolocation. */
  position?: Position
  /** Set once the find has been stored in Supabase: anonymously, or with `userId`. */
  shared?: boolean
  /** Set while the find waits to be stored in Supabase, for example while the phone is offline in the woods. */
  pending?: boolean
  /** The signed-in user who logged the find; it is stored with their id, and uploaded only while they are signed in. */
  userId?: string
  /** The find has a photo in this browser (see data/findPhotos). */
  hasPhoto?: boolean
  /** Where the photo was uploaded in the find-photos bucket, for signed-in users. */
  photoPath?: string
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
    const id = crypto.randomUUID()
    setFinds((prev) => [{ ...find, id }, ...prev])
    return id
  }, [])

  const updateFind = useCallback((id: string, changes: Partial<Omit<Find, "id">>) => {
    setFinds((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)))
  }, [])

  const removeFind = useCallback((id: string) => {
    setFinds((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return { finds, addFind, updateFind, removeFind }
}
