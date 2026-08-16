import { createContext, useContext, type ReactNode } from "react"

import type { Database } from "./database"

const DatabaseContext = createContext<Database | null>(null)

export function DatabaseProvider({
  database,
  children,
}: {
  database: Database
  children: ReactNode
}) {
  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>
}

export function useDatabase(): Database {
  const value = useContext(DatabaseContext)
  if (!value) {
    throw new Error("DatabaseProvider belum terpasang")
  }
  return value
}
