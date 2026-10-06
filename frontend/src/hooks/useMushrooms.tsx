import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { FunctionsHttpError } from "@supabase/supabase-js"
import {
  MUSHROOMS_FUNCTION,
  parseMushrooms,
  RESYNC_AFTER_MS,
  upgradeMushroom,
  type Mushroom,
  type ValueTranslations,
} from "../data/mushrooms"
import { loadSnapshot, saveSnapshot } from "../data/mushroomStore"
import { supabase } from "../data/supabase"
import { CONSERVATION_STATUS_LABELS } from "../data/conservation"
import { useI18n } from "../i18n/I18nProvider"

export type SyncStatus = "loading" | "syncing" | "idle" | "error"

/** `error` value when the download failed because the device has no connection. */
export const OFFLINE_ERROR = "offline"

interface MushroomsState {
  mushrooms: Mushroom[]
  translations: ValueTranslations
  /** Epoch ms of the last successful sync, undefined if the dataset was never downloaded. */
  syncedAt?: number
  status: SyncStatus
  /** Technical detail of the last failed download, or OFFLINE_ERROR. */
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
  const [translations, setTranslations] = useState<ValueTranslations>({})
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
        const { data: body, error } = await supabase.functions.invoke(MUSHROOMS_FUNCTION, { method: "GET" })
        if (error instanceof FunctionsHttpError) throw new Error(`Download failed (HTTP ${error.context.status})`)
        if (error) throw error
        const data = parseMushrooms(body)
        const snapshot = { ...data, syncedAt: Date.now() }
        setMushrooms(data.mushrooms)
        setTranslations(data.translations)
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
        setError(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : OFFLINE_ERROR)
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
        setMushrooms(snapshot.mushrooms.map(upgradeMushroom))
        setTranslations(snapshot.translations ?? {})
        setSyncedAt(snapshot.syncedAt)
        syncedAtRef.current = snapshot.syncedAt
        setStatus("idle")
      }
      // Copies saved before the dataset carried translations are replaced right away.
      if (isStale() || !snapshot?.translations) void sync()
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
    <MushroomsContext.Provider value={{ mushrooms, translations, syncedAt, status, error, sync }}>
      {children}
    </MushroomsContext.Provider>
  )
}

export function useMushrooms() {
  const ctx = useContext(MushroomsContext)
  if (!ctx) throw new Error("useMushrooms must be used inside <MushroomsProvider>")
  return ctx
}

/**
 * Shows a characteristic value in the current language, or in English when it has no translation.
 * Conservation statuses are a fixed list, so the app translates them itself.
 */
export function useValueLabel() {
  const { translations } = useMushrooms()
  const { locale, t } = useI18n()
  return useCallback(
    (property: keyof Mushroom["properties"], value: string) => {
      const status = property === "conservationStatus" ? CONSERVATION_STATUS_LABELS[value] : undefined
      return status ? t(status) : (translations[locale]?.[property]?.[value] ?? value)
    },
    [translations, locale, t],
  )
}
