import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { MUSHROOMS_URL, parseMushrooms, RESYNC_AFTER_MS, type Mushroom } from "../data/mushrooms"
import { loadSnapshot, saveSnapshot } from "../data/mushroomStore"

export type SyncStatus = "loading" | "syncing" | "idle" | "error"

interface MushroomsState {
  mushrooms: Mushroom[]
  /** Epoch ms of the last successful sync, undefined if the dataset was never downloaded. */
  syncedAt?: number
  status: SyncStatus
  error?: string
  /** Download the dataset now, regardless of its age. */
  sync: () => Promise<void>
}

const MushroomsContext = createContext<MushroomsState | null>(null)

/**
 * The app is used mostly offline: the species list is served from IndexedDB and only
 * re-downloaded when the local copy is a week old (or missing). A failed download keeps
 * the cached copy and is retried on the next launch or when the device comes back online.
 */
export function MushroomsProvider({ children }: { children: ReactNode }) {
  const [mushrooms, setMushrooms] = useState<Mushroom[]>([])
  const [syncedAt, setSyncedAt] = useState<number>()
  const [status, setStatus] = useState<SyncStatus>("loading")
  const [error, setError] = useState<string>()
  const inFlight = useRef<Promise<void> | null>(null)
  const syncedAtRef = useRef<number | undefined>(undefined)

  const sync = useCallback(() => {
    // StrictMode and the "online" listener can both ask at once; share one download.
    if (inFlight.current) return inFlight.current
    setStatus("syncing")
    inFlight.current = (async () => {
      try {
        const res = await fetch(MUSHROOMS_URL, { cache: "no-cache" })
        if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)
        const data = parseMushrooms(await res.json())
        const snapshot = { mushrooms: data, syncedAt: Date.now() }
        setMushrooms(data)
        setSyncedAt(snapshot.syncedAt)
        syncedAtRef.current = snapshot.syncedAt
        setError(undefined)
        setStatus("idle")
        try {
          await saveSnapshot(snapshot)
        } catch {
          // Storage full or unavailable: the data still works for this session.
        }
      } catch (e) {
        setError(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : "You're offline")
        setStatus("error")
      } finally {
        inFlight.current = null
      }
    })()
    return inFlight.current
  }, [])

  useEffect(() => {
    const isStale = () => !syncedAtRef.current || Date.now() - syncedAtRef.current >= RESYNC_AFTER_MS
    let cancelled = false

    loadSnapshot().then((snapshot) => {
      if (cancelled) return
      if (snapshot) {
        setMushrooms(snapshot.mushrooms)
        setSyncedAt(snapshot.syncedAt)
        syncedAtRef.current = snapshot.syncedAt
        setStatus("idle")
      }
      if (isStale()) void sync()
    })

    // Ask the browser not to evict the offline copy under storage pressure.
    void navigator.storage?.persist?.()

    const onOnline = () => {
      if (isStale()) void sync()
    }
    window.addEventListener("online", onOnline)
    return () => {
      cancelled = true
      window.removeEventListener("online", onOnline)
    }
  }, [sync])

  return (
    <MushroomsContext.Provider value={{ mushrooms, syncedAt, status, error, sync }}>
      {children}
    </MushroomsContext.Provider>
  )
}

export function useMushrooms() {
  const ctx = useContext(MushroomsContext)
  if (!ctx) throw new Error("useMushrooms must be used inside <MushroomsProvider>")
  return ctx
}
