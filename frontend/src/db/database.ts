import { createStore, type Row, type Store } from "tinybase"

import { migrateCatalogInventory } from "./catalog-inventory-migration"

import { openStorage, readStorage, writeStorage } from "./indexed-db"

import { TABLES, tablesSchema, type TableName } from "./schema"

export type Database = {
  store: Store
  ready: Promise<void>
}

type PersistenceState = {
  tail: Promise<unknown>
  storage?: IDBDatabase
  testOnly: boolean
  staged?: boolean
}
const states = new WeakMap<Database, PersistenceState>()

export function createRollposDatabase(options?: {
  dbName?: string
  /** Explicit fixture mode only; never selected automatically on storage failure. */
  inMemory?: boolean
}): Database {
  const store = createStore().setTablesSchema(tablesSchema)
  const state: PersistenceState = {
    tail: Promise.resolve(),
    testOnly: options?.inMemory === true,
  }
  const database: Database = { store, ready: Promise.resolve() }
  states.set(database, state)
  database.ready = state.testOnly
    ? Promise.resolve()
    : (async () => {
        const storage = await openStorage(options?.dbName ?? "rollpos")
        try {
          const content = await readStorage(storage)
          const restored = createStore()
            .setTablesSchema(tablesSchema)
            .setContent(content)
          migrateCatalogInventory(restored)
          if (
            JSON.stringify(content) !== JSON.stringify(restored.getContent())
          ) {
            await writeStorage(storage, restored.getContent())
          }
          store.setContent(restored.getContent())
          state.storage = storage
        } catch (error) {
          storage.close()
          throw error
        }
      })()
  // Consumers still receive the rejection; avoid an unhandled singleton rejection
  // before React mounts and attaches its initialization error handler.
  void database.ready.catch(() => {})
  return database
}

/** Stage the entire operation, serialize validation and commit, then publish once. */
export function persistentOperation<Args extends unknown[], Result>(
  work: (database: Database, ...args: Args) => Promise<Result>
): (database: Database, ...args: Args) => Promise<Result> {
  return (database, ...args) => {
    const state = states.get(database)
    if (!state) return Promise.reject(new Error("Database tidak terdaftar."))
    if (state.staged) return work(database, ...args)
    const operation = state.tail.then(async () => {
      await database.ready
      const draft: Database = {
        store: createStore()
          .setTablesSchema(tablesSchema)
          .setContent(database.store.getContent()),
        ready: Promise.resolve(),
      }
      states.set(draft, {
        tail: Promise.resolve(),
        testOnly: state.testOnly,
        staged: true,
      })
      const before = JSON.stringify(database.store.getContent())
      const result = await work(draft, ...args)
      if (JSON.stringify(draft.store.getContent()) !== before) {
        if (!state.testOnly) {
          if (!state.storage)
            throw new Error("Penyimpanan IndexedDB belum terkonfirmasi.")
          try {
            await writeStorage(state.storage, draft.store.getContent())
          } catch (cause) {
            throw new Error(
              "Gagal menyimpan ke IndexedDB. Transaksi tidak tersimpan.",
              { cause }
            )
          }
        }
        database.store.setContent(draft.store.getContent())
      }
      return result
    })
    state.tail = operation.catch(() => {})
    return operation
  }
}

function assertWritable(database: Database): void {
  const state = states.get(database)
  if (!state?.staged && !state?.testOnly) {
    throw new Error("Penulisan wajib melalui transaksi penyimpanan.")
  }
}

export function listRows(
  database: Database,
  table: TableName
): Array<Row & { id: string }> {
  return Object.entries(database.store.getTable(table)).map(([id, row]) => ({
    id,
    ...row,
  }))
}

export function addRow(
  database: Database,
  table: TableName,
  cells: Row
): string {
  assertWritable(database)
  const id = database.store.addRow(table, cells)
  if (!id) {
    throw new Error(`Gagal menulis baris ${table}`)
  }
  return id
}

export function updateRow(
  database: Database,
  table: TableName,
  id: string,
  cells: Row
): void {
  assertWritable(database)
  if (!database.store.hasRow(table, id)) {
    throw new Error(`${table}#${id} tidak ditemukan`)
  }
  database.store.setPartialRow(table, id, cells)
}

export function deleteRow(
  database: Database,
  table: TableName,
  id: string
): void {
  assertWritable(database)
  database.store.delRow(table, id)
}

export function deleteMatching(
  database: Database,
  table: TableName,
  match: (row: Row & { id: string }) => boolean
): void {
  assertWritable(database)
  for (const row of listRows(database, table)) {
    if (match(row)) {
      database.store.delRow(table, row.id)
    }
  }
}

export function cellStr(row: Row, key: string): string {
  const value = row[key]
  return typeof value === "string" ? value : String(value ?? "")
}

export function cellNum(row: Row, key: string): number {
  const value = row[key]
  return typeof value === "number" ? value : Number(value ?? 0)
}

export function cellFlag(row: Row, key: string): boolean {
  return Boolean(row[key])
}

export function transact(database: Database, work: () => void): void {
  assertWritable(database)
  const before = database.store.getContent()
  database.store.startTransaction()
  try {
    work()
  } catch (error) {
    database.store.setContent(before)
    throw error
  } finally {
    database.store.finishTransaction()
  }
}

export const database = createRollposDatabase()

export { TABLES }
