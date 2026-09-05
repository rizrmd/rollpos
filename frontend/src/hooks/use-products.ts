import { useEffect, useState } from "react"

import { loadMenuCategories, loadProducts, loadRecipeLines } from "@/db/catalog"
import { loadMenuModifiers, loadModifiers } from "@/db/modifiers"
import { useDatabase } from "@/db/database-provider"
import type {
  MenuCategoryRecord,
  MenuModifierRecord,
  ModifierRecord,
  ProductRecord,
  RecipeLineRecord,
} from "@/lib/types"

export function useProducts() {
  const database = useDatabase()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [recipes, setRecipes] = useState<RecipeLineRecord[]>([])
  const [categories, setCategories] = useState<MenuCategoryRecord[]>([])
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([])
  const [menuModifiers, setMenuModifiers] = useState<MenuModifierRecord[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    void database.ready.then(() => {
      if (cancelled) return

      const refresh = () => {
        void Promise.all([
          loadProducts(database),
          loadRecipeLines(database),
          loadMenuCategories(database),
          loadModifiers(database),
          loadMenuModifiers(database),
        ])
          .then(([rows, lines, cats, modifierRows, modifierLinks]) => {
            if (cancelled) return
            setProducts(rows)
            setRecipes(lines)
            setCategories(cats)
            setModifiers(modifierRows)
            setMenuModifiers(modifierLinks)
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
    }).catch((cause: unknown) => {
      if (cancelled) return
      setError(cause instanceof Error ? cause.message : String(cause))
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [database])

  return {
    database,
    products,
    recipes,
    categories,
    modifiers,
    menuModifiers,
    ready,
    error,
  }
}
