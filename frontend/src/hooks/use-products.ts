import { useEffect, useState } from "react"

import { loadProducts } from "@/db/catalog"
import { useDatabase } from "@/db/database-provider"
import type { ProductRecord } from "@/lib/types"

export function useProducts() {
  const database = useDatabase()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    void database.ready.then(() => {
      if (cancelled) return

      const refresh = () => {
        void loadProducts(database)
          .then((rows) => {
            if (cancelled) return
            setProducts(rows)
            setReady(true)
            setError(null)
          })
          .catch((err: unknown) => {
            if (cancelled) return
            setError(err instanceof Error ? err.message : String(err))
          })
      }

      const listenerId = database.store.addTablesListener(() => refresh())
      unsubscribe = () => database.store.delListener(listenerId)
      refresh()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [database])

  return { database, products, ready, error }
}
