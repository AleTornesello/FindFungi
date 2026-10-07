import { supabase } from "./supabase"

export interface Position {
  latitude: number
  longitude: number
  /** Radius of the browser's estimate, in meters. */
  accuracy: number
}

export interface SharedFind {
  mushroomId?: number
  scientificName: string
  date: string
  position?: Position
}

const KEY = "findfungi:shareFinds"

/** The user's answer to "share your finds anonymously?", or undefined if they haven't been asked yet. */
export function loadSharingChoice(): boolean | undefined {
  try {
    const value = localStorage.getItem(KEY)
    return value === null ? undefined : value === "1"
  } catch {
    return undefined // Storage blocked: ask again rather than share without an answer.
  }
}

export function saveSharingChoice(share: boolean) {
  try {
    localStorage.setItem(KEY, share ? "1" : "0")
  } catch {
    // Not persisted; the question will come back next visit.
  }
}

/**
 * The current position, asking the browser for permission the first time. Resolves to undefined if
 * the user denies it, the browser has no geolocation, or no fix arrives in time.
 */
export function currentPosition(): Promise<Position | undefined> {
  if (!("geolocation" in navigator)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  })
}

/** Supabase edge function that stores a shared find (supabase/functions/share-find). */
const SHARE_FUNCTION = "share-find"

/** Stores the find anonymously: no place, notes or anything that ties it to this browser. */
export async function shareFind({ mushroomId, scientificName, date, position }: SharedFind) {
  const { error } = await supabase.functions.invoke(SHARE_FUNCTION, {
    body: { mushroomId, scientificName, date, position },
  })
  if (error) throw error
}
