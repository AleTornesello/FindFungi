import { supabase } from "./supabase"

/** Longest side of a stored photo, in pixels: enough to identify a mushroom, small enough to upload from the woods. */
const MAX_SIDE = 1600
const QUALITY = 0.85

/**
 * The photo as a downscaled JPEG, turned upright. Redrawing it also drops the EXIF metadata,
 * GPS position included, that phone cameras write into the file.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))),
      "image/jpeg",
      QUALITY,
    ),
  )
}

// Photos are too big for localStorage, where the finds are: they live in IndexedDB, keyed by find id.
// Not in the "findfungi" database of the species cache (data/mushroomStore), whose version 1
// already exists in browsers without this store.
const DB_NAME = "findfungi-photos"
const STORE = "photos"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Resolves once the transaction has committed, so a saved photo is on disk. */
async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Photos saved in this session, so a new find shows its photo before IndexedDB has written it. */
const recent = new Map<string, Blob>()

export async function savePhoto(findId: string, photo: Blob) {
  recent.set(findId, photo)
  await inStore("readwrite", (store) => store.put(photo, findId))
}

/** The find's photo, or undefined if it has none or storage is unavailable. */
export async function loadPhoto(findId: string): Promise<Blob | undefined> {
  const cached = recent.get(findId)
  if (cached) return cached
  try {
    return (await inStore<Blob | undefined>("readonly", (store) => store.get(findId))) ?? undefined
  } catch {
    return undefined
  }
}

export async function deletePhoto(findId: string) {
  recent.delete(findId)
  try {
    await inStore("readwrite", (store) => store.delete(findId))
  } catch {
    // Nothing stored.
  }
}

/** Private bucket where signed-in users' photos go, each in a folder named after their user id. */
const BUCKET = "find-photos"

/** Uploads the photo of a signed-in user's find and returns its path in the bucket. */
export async function uploadPhoto(userId: string, findId: string, photo: Blob): Promise<string> {
  const path = `${userId}/${findId}.jpg`
  // Upsert: a retry after a lost response finds the photo already there.
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: "image/jpeg", upsert: true })
  if (error) throw error
  return path
}
