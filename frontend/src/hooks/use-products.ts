import { useDatabase } from "@nozbe/watermelondb/react"
import { useEffect, useState } from "react"

import { productsCollection } from "@/db/catalog"
import type Product from "@/db/models/Product"

export function useProducts() {
  const database = useDatabase()
  const [products, setProducts] = useState<Product[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const subscription = productsCollection(database)
      .query()
      .observe()
      .subscribe({
        next: (rows) => {
          setProducts(rows)
          setReady(true)
        },
        error: (err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
        },
      })

    return () => {
      subscription.unsubscribe()
    }
  }, [database])

  return { database, products, ready, error }
}
