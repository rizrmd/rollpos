import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loadProducts } from "@/db/catalog"
import { loadInventory } from "@/db/inventory"
import {
  loadRecipes,
  RECIPE_UNITS,
  saveRecipe,
  type Recipe,
  type RecipeUnit,
} from "@/db/recipes"
import { useDatabase } from "@/db/database-provider"
import type { InventoryItem } from "@/lib/inventory"
import type { ProductRecord } from "@/lib/types"

type DraftLine = { inventoryItemId: string; quantity: string; unit: RecipeUnit }

const RECIPE_PAGE_SIZE = 6
const INGREDIENT_PAGE_SIZE = 3

const selectClass =
  "flex min-h-10 w-full border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"

export function RecipesScreen() {
  const database = useDatabase()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [menus, setMenus] = useState<ProductRecord[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [editing, setEditing] = useState<Recipe | "new" | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const store = database.store
  const pageCount = Math.max(1, Math.ceil(recipes.length / RECIPE_PAGE_SIZE))
  const visibleRecipes = recipes.slice(
    (Math.min(page, pageCount) - 1) * RECIPE_PAGE_SIZE,
    Math.min(page, pageCount) * RECIPE_PAGE_SIZE
  )

  const refresh = useCallback(async () => {
    try {
      const [recipeRows, productRows] = await Promise.all([
        loadRecipes(database),
        loadProducts(database),
      ])
      setRecipes(recipeRows)
      setMenus(
        productRows.filter((item) => item.kind === "menu" && item.isActive)
      )
      setInventory(loadInventory(database).filter((item) => item.isActive))
      setError(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Recipe lokal tidak dapat dibuka."
      )
    } finally {
      setLoading(false)
    }
  }, [database])

  useEffect(() => {
    const listenerId = store.addTablesListener(() => void refresh())
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timer)
      store.delListener(listenerId)
    }
  }, [refresh, store])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="touch"
          onClick={() => setEditing("new")}
          disabled={!menus.length || !inventory.length}
        >
          <Plus /> Tambah recipe
        </Button>
      </div>
      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />
      {loading ? (
        <p className="text-sm text-muted-foreground">Membuka recipe lokal…</p>
      ) : recipes.length === 0 ? (
        <div className="flex items-center justify-center gap-3 border border-dashed p-8 text-sm text-muted-foreground">
          <BookOpen className="size-8 text-muted-foreground" />
          Belum ada recipe
        </div>
      ) : (
        <>
          <ul className="divide-y border">
            {visibleRecipes.map((recipe) => (
              <li
                key={recipe.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{recipe.menuName}</strong>
                    <Badge variant="outline">V{recipe.version}</Badge>
                    <Badge variant={recipe.isActive ? "secondary" : "outline"}>
                      {recipe.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {recipe.ingredients
                      .map(
                        (line) =>
                          `${line.inventoryItemName} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(line.quantity)} ${line.unit}`
                      )
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setEditing(recipe)}
                  aria-label={`Edit ${recipe.menuName}`}
                >
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
          <Pagination
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            onPage={setPage}
          />
        </>
      )}
      <RecipeDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        open={editing !== null}
        recipe={editing === "new" ? undefined : (editing ?? undefined)}
        recipes={recipes}
        menus={menus}
        inventory={inventory}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSave={async (input) => {
          await saveRecipe(
            database,
            input,
            editing && editing !== "new" ? editing.id : undefined
          )
          setNotice(
            `Recipe ${menus.find((menu) => menu.id === input.menuProductId)?.name ?? "menu"} tersimpan.`
          )
          setEditing(null)
          await refresh()
        }}
      />
    </div>
  )
}

function RecipeDialog({
  open,
  recipe,
  recipes,
  menus,
  inventory,
  onOpenChange,
  onSave,
}: {
  open: boolean
  recipe?: Recipe
  recipes: Recipe[]
  menus: ProductRecord[]
  inventory: InventoryItem[]
  onOpenChange: (open: boolean) => void
  onSave: (input: Parameters<typeof saveRecipe>[1]) => Promise<void>
}) {
  const availableMenus = menus.filter(
    (menu) =>
      menu.id === recipe?.menuProductId ||
      !recipes.some((item) => item.menuProductId === menu.id)
  )
  const [menuProductId, setMenuProductId] = useState(
    recipe?.menuProductId ?? availableMenus[0]?.id ?? ""
  )
  const [version, setVersion] = useState(String(recipe?.version ?? 1))
  const [isActive, setIsActive] = useState(recipe?.isActive ?? true)
  const [lines, setLines] = useState<DraftLine[]>(
    recipe?.ingredients.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: String(line.quantity),
      unit: line.unit,
    })) ??
      (inventory[0]
        ? [
            {
              inventoryItemId: inventory[0].id,
              quantity: "",
              unit: inventory[0].baseUnit as RecipeUnit,
            },
          ]
        : [])
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ingredientPage, setIngredientPage] = useState(1)
  const ingredientPageCount = Math.max(
    1,
    Math.ceil(lines.length / INGREDIENT_PAGE_SIZE)
  )
  const currentIngredientPage = Math.min(ingredientPage, ingredientPageCount)
  const visibleLines = lines
    .map((line, index) => ({ line, index }))
    .slice(
      (currentIngredientPage - 1) * INGREDIENT_PAGE_SIZE,
      currentIngredientPage * INGREDIENT_PAGE_SIZE
    )
  const inventoryById = useMemo(
    () => new Map(inventory.map((item) => [item.id, item])),
    [inventory]
  )

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, ...patch } : line
      )
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({
        menuProductId,
        version: Number(version),
        isActive,
        ingredients: lines.map((line) => ({
          ...line,
          quantity: Number(line.quantity),
        })),
      })
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Recipe gagal disimpan."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="sr-only">
              {recipe ? "Edit recipe" : "Tambah recipe"}
            </DialogTitle>
          </DialogHeader>
          <LiveNotice message={error} tone="error" />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="grid gap-2">
              <Label htmlFor="recipe-menu">Menu</Label>
              <select
                id="recipe-menu"
                className={selectClass}
                value={menuProductId}
                onChange={(event) => setMenuProductId(event.target.value)}
                required
              >
                {availableMenus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipe-version">Versi</Label>
              <Input
                id="recipe-version"
                type="number"
                min="1"
                step="1"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                required
              />
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-3 border px-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span className="text-sm font-medium">Recipe aktif</span>
          </label>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Ingredient inventory</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next =
                    inventory.find(
                      (item) =>
                        !lines.some((line) => line.inventoryItemId === item.id)
                    ) ?? inventory[0]
                  if (next)
                    setLines((current) => {
                      const updated = [
                        ...current,
                        {
                          inventoryItemId: next.id,
                          quantity: "",
                          unit: next.baseUnit as RecipeUnit,
                        },
                      ]
                      setIngredientPage(
                        Math.ceil(updated.length / INGREDIENT_PAGE_SIZE)
                      )
                      return updated
                    })
                }}
              >
                <Plus /> Ingredient
              </Button>
            </div>
            {visibleLines.map(({ line, index }) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border p-2"
              >
                <select
                  aria-label={`Ingredient ${index + 1}`}
                  className={selectClass}
                  value={line.inventoryItemId}
                  onChange={(event) => {
                    const item = inventoryById.get(event.target.value)
                    updateLine(index, {
                      inventoryItemId: event.target.value,
                      unit: (item?.baseUnit ?? "g") as RecipeUnit,
                    })
                  }}
                >
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, position) => position !== index)
                    )
                  }
                  aria-label={`Hapus ingredient ${index + 1}`}
                >
                  <Trash2 />
                </Button>
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                  <Input
                    aria-label={`Quantity ${index + 1}`}
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    required
                  />
                  <select
                    aria-label={`Unit ${index + 1}`}
                    className={selectClass}
                    value={line.unit}
                    onChange={(event) =>
                      updateLine(index, {
                        unit: event.target.value as RecipeUnit,
                      })
                    }
                  >
                    {RECIPE_UNITS.map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <Pagination
              page={currentIngredientPage}
              pageCount={ingredientPageCount}
              onPage={setIngredientPage}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={busy || !menuProductId || lines.length === 0}
            >
              {busy ? "Menyimpan…" : "Simpan recipe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <div
      className="flex items-center justify-end gap-2"
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Halaman sebelumnya"
      >
        <ChevronLeft />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {page} / {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Halaman berikutnya"
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
