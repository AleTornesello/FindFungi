import type { Mushroom, ValueTranslations } from "./mushrooms"

/**
 * The species dataset (~1 MB) lives in IndexedDB rather than localStorage, which is too small
 * and synchronous for it. Data and sync date are written as one record so they never disagree.
 */
export interface MushroomSnapshot {
  mushrooms: Mushroom[]
  /** Missing in snapshots saved before the dataset carried translations. */
  translations?: ValueTranslations
  /** Epoch milliseconds of the last successful download. */
  syncedAt: number
}

const DB_NAME = "findfungi"
const STORE = "cache"
const KEY = "mushrooms"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = op(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result as T)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function loadSnapshot(): Promise<MushroomSnapshot | undefined> {
  try {
    return await run<MushroomSnapshot | undefined>("readonly", (s) => s.get(KEY))
  } catch {
    // IndexedDB can be unavailable (some private modes); behave as if nothing is cached.
    return undefined
  }
}

export function saveSnapshot(snapshot: MushroomSnapshot): Promise<void> {
  return run<void>("readwrite", (s) => s.put(snapshot, KEY))
}
