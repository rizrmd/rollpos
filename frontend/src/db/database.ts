import { createStore, type Row, type Store } from "tinybase"

import { TABLES, tablesSchema, type TableName } from "./schema"

export type Database = {
  store: Store
  ready: Promise<void>
}

export function createRollposDatabase(options?: {
  dbName?: string
  inMemory?: boolean
}): Database {
  const store = createStore().setTablesSchema(tablesSchema)
  const ready =
    options?.inMemory || typeof indexedDB === "undefined"
      ? Promise.resolve()
      : persistStore(store, options?.dbName ?? "rollpos")

  return { store, ready }
}

async function persistStore(store: Store, dbName: string): Promise<void> {
  const { createIndexedDbPersister } = await import(
    "tinybase/persisters/persister-indexed-db"
  )
  const persister = createIndexedDbPersister(store, dbName, undefined, (error) => {
    console.error("TinyBase persist error", error)
  })
  await persister.load()
  await persister.startAutoSave()
}

export function listRows(database: Database, table: TableName): Array<Row & { id: string }> {
  return Object.entries(database.store.getTable(table)).map(([id, row]) => ({
    id,
    ...row,
  }))
}

export function addRow(database: Database, table: TableName, cells: Row): string {
  const id = database.store.addRow(table, cells)
  if (!id) {
    throw new Error(`Gagal menulis baris ${table}`)
  }
  return id
}

export function updateRow(database: Database, table: TableName, id: string, cells: Row): void {
  if (!database.store.hasRow(table, id)) {
    throw new Error(`${table}#${id} tidak ditemukan`)
  }
  database.store.setPartialRow(table, id, cells)
}

export function deleteRow(database: Database, table: TableName, id: string): void {
  database.store.delRow(table, id)
}

export function deleteMatching(
  database: Database,
  table: TableName,
  match: (row: Row & { id: string }) => boolean
): void {
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
  database.store.transaction(work)
}

export const database = createRollposDatabase()

export { TABLES }
