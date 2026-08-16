import { useEffect, useState } from "react"

import { loadProducts, loadRecipeLines } from "@/db/catalog"
import { useDatabase } from "@/db/database-provider"
import type { ProductRecord, RecipeLineRecord } from "@/lib/types"

export function useProducts() {
  const database = useDatabase()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [recipes, setRecipes] = useState<RecipeLineRecord[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    void database.ready.then(() => {
      if (cancelled) return

      const refresh = () => {
        void Promise.all([loadProducts(database), loadRecipeLines(database)])
          .then(([rows, lines]) => {
            if (cancelled) return
            setProducts(rows)
            setRecipes(lines)
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

  return { database, products, recipes, ready, error }
}
