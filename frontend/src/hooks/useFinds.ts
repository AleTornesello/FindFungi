import { useCallback, useEffect, useState } from "react"

export interface Find {
  id: string
  speciesId: string
  place: string
  date: string
  notes: string
}

const KEY = "findfungi:finds"

function load(): Find[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Find[]) : []
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
