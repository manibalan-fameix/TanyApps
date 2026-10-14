// Browser-only: durable storage for the upload queue.
import type { UploadItem, UploadStore } from "./queue.ts"

const DB_NAME = "tany-uploads"
const STORE = "items"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

export const idbStore: UploadStore = {
  put: (item: UploadItem) => run("readwrite", (s) => s.put(item)).then(() => {}),
  delete: (id: string) => run("readwrite", (s) => s.delete(id)).then(() => {}),
  all: () => run("readonly", (s) => s.getAll() as IDBRequest<UploadItem[]>),
}

/** Private windows and some webviews block IndexedDB. The queue then runs in memory only. */
export async function idbAvailable(): Promise<boolean> {
  try {
    await open().then((db) => db.close())
    return true
  } catch {
    return false
  }
}

export const memoryStore = (): UploadStore => {
  const m = new Map<string, UploadItem>()
  return {
    put: async (i) => void m.set(i.id, i),
    delete: async (id) => void m.delete(id),
    all: async () => [...m.values()],
  }
}
