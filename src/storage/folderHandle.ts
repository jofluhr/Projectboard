/**
 * Remembers the picked data folder between sessions. Directory handles can be
 * stored in IndexedDB (not in localStorage).
 */
const DB = 'projectboard'
const STORE = 'handles'
const KEY = 'data-folder'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await run<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await run('readwrite', (s) => s.put(handle, KEY))
}

export function isFolderAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}
