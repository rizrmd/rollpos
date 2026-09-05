import type { Store } from "tinybase"

type Content = ReturnType<Store["getContent"]>

/** Compatible with TinyBase's existing IndexedDB v2 stores and {k, v} rows. */
export async function openStorage(dbName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "IndexedDB tidak tersedia. Penyimpanan lokal wajib tersedia."
    )
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2)
    let blocked = false
    request.onupgradeneeded = () => {
      for (const name of ["t", "v"]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: "k" })
        }
      }
    }
    request.onerror = () =>
      reject(request.error ?? new Error("Gagal membuka IndexedDB."))
    request.onblocked = () => {
      blocked = true
      reject(
        new Error(
          "IndexedDB terblokir. Tutup tab RollPOS lain lalu muat ulang."
        )
      )
    }
    request.onsuccess = () => {
      if (blocked) return request.result.close()
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

export function readStorage(db: IDBDatabase): Promise<Content> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["t", "v"], "readonly")
    const tables = tx.objectStore("t").getAll()
    const values = tx.objectStore("v").getAll()
    tx.onabort = () => reject(tx.error ?? new Error("Gagal membaca IndexedDB."))
    tx.oncomplete = () => {
      const unpack = (rows: Array<{ k: string; v: unknown }>) =>
        Object.fromEntries(rows.map(({ k, v }) => [k, v]))
      resolve([unpack(tables.result), unpack(values.result)] as Content)
    }
  })
}

export function writeStorage(db: IDBDatabase, content: Content): Promise<void> {
  return new Promise((resolve, reject) => {
    // Request success is insufficient: only transaction completion confirms commit.
    const tx = db.transaction(["t", "v"], "readwrite", { durability: "strict" })
    tx.onabort = () =>
      reject(tx.error ?? new Error("Transaksi IndexedDB dibatalkan."))
    tx.oncomplete = () => resolve()
    try {
      for (const [index, name] of ["t", "v"].entries()) {
        const target = tx.objectStore(name)
        target.clear()
        for (const [k, v] of Object.entries(content[index]))
          target.put({ k, v })
      }
    } catch (error) {
      // A synchronous failure after an earlier put must abort that put as well.
      tx.onabort = () => reject(error)
      tx.abort()
    }
  })
}
