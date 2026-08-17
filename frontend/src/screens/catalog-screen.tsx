import { useMemo, useState, type FormEvent, type ReactNode } from "react"

import { LiveNotice } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createMenuCategory,
  createProduct,
  deleteMenuCategory,
  deleteProduct,
  setRecipe,
  updateProduct,
  type ProductInput,
  type RecipeLineInput,
} from "@/db/catalog"
import { useProducts } from "@/hooks/use-products"
import {
  categoryLabel,
  ingredientsOf,
  isLowStock,
  matchesQuery,
  menusOf,
  recipeCountFor,
  sortCatalog,
  sortMenuCategories,
  suggestSku,
  usedInMenus,
} from "@/lib/catalog"
import { formatQty, formatRupiah } from "@/lib/format"
import { canManageProducts } from "@/lib/permissions"
import {
  INGREDIENT_UNITS,
  type MenuCategoryRecord,
  type ProductKind,
  type ProductRecord,
  type RecipeLineRecord,
  type StaffRecord,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type CatalogTab = ProductKind
type MenuFilter = "all" | string
type IngredientFilter = "all" | "low"

export function CatalogScreen({ actor }: { actor: StaffRecord }) {
  const { database, products, recipes, categories, ready, error } = useProducts()
  const canWrite = canManageProducts(actor.roles)
  const [tab, setTab] = useState<CatalogTab>("menu")
  const [query, setQuery] = useState("")
  const [menuFilter, setMenuFilter] = useState<MenuFilter>("all")
  const [ingredientFilter, setIngredientFilter] = useState<IngredientFilter>("all")
  const [editing, setEditing] = useState<ProductRecord | "new" | null>(null)
  const [managingCategories, setManagingCategories] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const menus = useMemo(() => menusOf(products), [products])
  const ingredients = useMemo(() => ingredientsOf(products), [products])
  const lowCount = ingredients.filter(isLowStock).length
  const menuCategories = useMemo(
    () => mergeMenuCategories(categories, menus),
    [categories, menus]
  )

  const visible = useMemo(() => {
    const source = tab === "menu" ? menus : ingredients
    return sortCatalog(
      source.filter((item) => {
        if (!matchesQuery(item, query)) return false
        if (tab === "menu" && menuFilter !== "all") {
          return item.category === menuFilter
        }
        if (tab === "ingredient" && ingredientFilter === "low") {
          return isLowStock(item)
        }
        return true
      })
    )
  }, [tab, menus, ingredients, query, menuFilter, ingredientFilter])

  function openNew() {
    if (!canWrite) return
    setEditing("new")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <TabButton
          active={tab === "menu"}
          label="Menu"
          count={menus.length}
          onClick={() => setTab("menu")}
        />
        <TabButton
          active={tab === "ingredient"}
          label="Bahan"
          count={ingredients.length}
          warn={lowCount}
          onClick={() => setTab("ingredient")}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="cari-katalog" className="sr-only">
          Cari {tab === "menu" ? "menu" : "bahan"}
        </Label>
        <Input
          id="cari-katalog"
          className="min-h-12"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === "menu" ? "Cari menu atau SKU" : "Cari bahan"}
        />
        {canWrite ? (
          <Button type="button" size="touch" onClick={openNew}>
            Tambah {tab === "menu" ? "menu" : "bahan"}
          </Button>
        ) : null}
      </div>

      {tab === "menu" ? (
        <ChipRow>
          <FilterChip
            active={menuFilter === "all"}
            onClick={() => setMenuFilter("all")}
          >
            Semua
          </FilterChip>
          {menuCategories.map((category) => (
            <FilterChip
              key={category.slug}
              active={menuFilter === category.slug}
              onClick={() => setMenuFilter(category.slug)}
            >
              {category.name}
            </FilterChip>
          ))}
          {canWrite ? (
            <FilterChip
              active={false}
              onClick={() => setManagingCategories(true)}
            >
              + Kategori
            </FilterChip>
          ) : null}
        </ChipRow>
      ) : (
        <ChipRow>
          <FilterChip
            active={ingredientFilter === "all"}
            onClick={() => setIngredientFilter("all")}
          >
            Semua
          </FilterChip>
          <FilterChip
            active={ingredientFilter === "low"}
            onClick={() => setIngredientFilter("low")}
          >
            Stok rendah{lowCount ? ` · ${lowCount}` : ""}
          </FilterChip>
        </ChipRow>
      )}

      <LiveNotice message={error} tone="error" />
      <LiveNotice message={notice} />

      {!ready ? (
        <p className="text-sm text-muted-foreground">Membuka katalog…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          tab={tab}
          queried={
            query.trim().length > 0 ||
            (tab === "menu" ? menuFilter !== "all" : ingredientFilter !== "all")
          }
          canWrite={canWrite}
          onAdd={openNew}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li key={item.id}>
              <CatalogRow
                item={item}
                recipes={recipes}
                products={products}
                categories={menuCategories}
                canWrite={canWrite}
                onOpen={() => setEditing(item)}
              />
            </li>
          ))}
        </ul>
      )}

      <CatalogDialog
        key={editing === "new" ? `new-${tab}` : editing?.id ?? "closed"}
        open={editing !== null}
        kind={
          editing === "new"
            ? tab
            : editing
              ? editing.kind
              : tab
        }
        item={editing === "new" ? undefined : (editing ?? undefined)}
        products={products}
        recipes={recipes}
        categories={menuCategories}
        canWrite={canWrite}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSave={async (input, lines) => {
          const saved = editing && editing !== "new"
            ? await updateProduct(database, actor, editing.id, input)
            : await createProduct(database, actor, input)
          if (saved.kind === "menu") {
            await setRecipe(database, actor, saved.id, lines)
          }
          setNotice(
            saved.kind === "ingredient"
              ? `${saved.name} tersimpan di bahan.`
              : `${saved.name} tersimpan di menu.`
          )
          setEditing(null)
        }}
        onDelete={async (item) => {
          await deleteProduct(database, actor, item)
          setNotice(`${item.name} dihapus.`)
          setEditing(null)
        }}
      />

      <CategoryDialog
        open={managingCategories}
        categories={menuCategories}
        products={menus}
        canWrite={canWrite}
        onOpenChange={setManagingCategories}
        onCreate={async (name) => {
          const created = await createMenuCategory(database, actor, { name })
          setMenuFilter(created.slug)
          setNotice(`Kategori ${created.name} ditambahkan.`)
        }}
        onDelete={async (category) => {
          await deleteMenuCategory(database, actor, category)
          if (menuFilter === category.slug) setMenuFilter("all")
          setNotice(`Kategori ${category.name} dihapus.`)
        }}
      />
    </div>
  )
}

function TabButton({
  active,
  label,
  count,
  warn,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  warn?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 flex-col items-start justify-center border px-4 py-2 text-left transition-colors",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "border-foreground bg-card" : "border-border bg-background text-muted-foreground"
      )}
    >
      <span className="text-base font-medium text-foreground">{label}</span>
      <span className="text-xs">
        {count} item
        {warn ? ` · ${warn} rendah` : ""}
      </span>
    </button>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 border px-3 text-sm transition-colors",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "border-foreground bg-foreground text-background" : "border-border"
      )}
    >
      {children}
    </button>
  )
}

function CatalogRow({
  item,
  recipes,
  products,
  categories,
  canWrite,
  onOpen,
}: {
  item: ProductRecord
  recipes: RecipeLineRecord[]
  products: ProductRecord[]
  categories: MenuCategoryRecord[]
  canWrite: boolean
  onOpen: () => void
}) {
  const recipeCount = recipeCountFor(item.id, recipes)
  const usedBy = usedInMenus(item.id, recipes, products)
  const low = item.kind === "ingredient" && isLowStock(item)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center justify-between gap-3 border bg-card px-4 py-3 text-left hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.name}</span>
          {!item.isActive ? <Badge variant="outline">Nonaktif</Badge> : null}
          {low ? <Badge variant="destructive">Stok rendah</Badge> : null}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {item.kind === "menu"
            ? `${categoryLabel(item.category, categories)}${
                recipeCount ? ` · ${recipeCount} bahan` : " · tanpa resep"
              }`
            : usedBy.length
              ? `Dipakai di ${usedBy.map((menu) => menu.name).join(", ")}`
              : "Belum dipakai di menu"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-medium">
          {item.kind === "menu"
            ? formatRupiah(item.price)
            : formatQty(item.stock, item.unit)}
        </span>
        <span className="text-sm text-muted-foreground">
          {canWrite ? "Ubah" : item.sku}
        </span>
      </span>
    </button>
  )
}

function EmptyState({
  tab,
  queried,
  canWrite,
  onAdd,
}: {
  tab: CatalogTab
  queried: boolean
  canWrite: boolean
  onAdd: () => void
}) {
  if (queried) {
    return (
      <div className="border bg-card px-4 py-8 text-center">
        <p className="font-medium">Tidak ada yang cocok</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ubah kata cari atau filter.
        </p>
      </div>
    )
  }

  return (
    <div className="border bg-card px-4 py-8 text-center">
      <p className="font-medium">
        {tab === "menu" ? "Belum ada menu" : "Belum ada bahan"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tab === "menu"
          ? "Tambah minuman atau makanan yang dijual di kasir."
          : "Tambah bahan dulu, lalu pasang di resep menu."}
      </p>
      {canWrite ? (
        <Button type="button" size="touch" className="mt-4" onClick={onAdd}>
          Tambah {tab === "menu" ? "menu" : "bahan"}
        </Button>
      ) : null}
    </div>
  )
}

function CatalogDialog({
  open,
  kind,
  item,
  products,
  recipes,
  categories,
  canWrite,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean
  kind: ProductKind
  item?: ProductRecord
  products: ProductRecord[]
  recipes: RecipeLineRecord[]
  categories: MenuCategoryRecord[]
  canWrite: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: ProductInput, lines: RecipeLineInput[]) => Promise<void>
  onDelete: (item: ProductRecord) => Promise<void>
}) {
  const isMenu = kind === "menu"
  const ingredients = ingredientsOf(products)
  const initialLines = item
    ? recipes
        .filter((line) => line.productId === item.id)
        .map((line) => ({ ingredientId: line.ingredientId, qty: String(line.qty) }))
    : []

  const [name, setName] = useState(item?.name ?? "")
  const [sku, setSku] = useState(item?.sku ?? "")
  const [skuTouched, setSkuTouched] = useState(Boolean(item?.sku))
  const [category, setCategory] = useState(
    item?.kind === "menu" && item.category
      ? item.category
      : (categories[0]?.slug ?? "minuman")
  )
  const [newCategory, setNewCategory] = useState("")
  const [addingCategory, setAddingCategory] = useState(false)
  const [price, setPrice] = useState(item && item.price ? String(item.price) : "")
  const [stock, setStock] = useState(item ? String(item.stock || "") : "")
  const [unit, setUnit] = useState(item?.unit || (isMenu ? "porsi" : "g"))
  const [lowStock, setLowStock] = useState(item && item.lowStock ? String(item.lowStock) : "")
  const [note, setNote] = useState(item?.note ?? "")
  const [active, setActive] = useState(item?.isActive ?? true)
  const [lines, setLines] = useState<Array<{ ingredientId: string; qty: string }>>(
    initialLines
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function applyName(next: string) {
    setName(next)
    if (!skuTouched) setSku(suggestSku(next, kind))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite) return
    if (isMenu && addingCategory && !newCategory.trim()) {
      setError("Nama kategori baru wajib diisi.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(
        {
          name,
          sku,
          price: isMenu ? Number(price) || 0 : 0,
          stock: isMenu ? 0 : Number(stock) || 0,
          kind,
          category: isMenu
            ? addingCategory
              ? newCategory
              : category
            : "bahan",
          unit,
          note,
          isActive: active,
          lowStock: isMenu ? 0 : Number(lowStock) || 0,
        },
        lines
          .filter((line) => line.ingredientId && Number(line.qty) > 0)
          .map((line) => ({ ingredientId: line.ingredientId, qty: Number(line.qty) }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const unusedIngredients = ingredients.filter(
    (ingredient) => !lines.some((line) => line.ingredientId === ingredient.id)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>
            {item
              ? item.name
              : isMenu
                ? "Menu baru"
                : "Bahan baru"}
          </DialogTitle>
          <DialogDescription>
            {isMenu
              ? "Nama dan harga tampil di kasir. Resep opsional, dari bahan yang sudah ada."
              : "Bahan dipakai di resep menu. Stok di sini, penyesuaian harian menyusul di tab Stok."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void handleSubmit(event)}>
          <Field
            id="catalog-name"
            label="Nama"
            value={name}
            onChange={applyName}
            required
            autoFocus
          />

          {isMenu ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Kategori</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    aria-pressed={!addingCategory && category === option.slug}
                    className={cn(
                      "min-h-12 min-w-24 flex-1 border px-3 text-sm font-medium",
                      !addingCategory && category === option.slug
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted"
                    )}
                    onClick={() => {
                      setAddingCategory(false)
                      setCategory(option.slug)
                    }}
                  >
                    {option.name}
                  </button>
                ))}
                {canWrite ? (
                  <button
                    type="button"
                    aria-pressed={addingCategory}
                    className={cn(
                      "min-h-12 min-w-24 flex-1 border px-3 text-sm font-medium",
                      addingCategory
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted"
                    )}
                    onClick={() => setAddingCategory(true)}
                  >
                    + Baru
                  </button>
                ) : null}
              </div>
              {addingCategory ? (
                <Input
                  className="mt-2 min-h-12"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Nama kategori, misalnya Snack"
                  required
                  autoFocus
                />
              ) : null}
            </fieldset>
          ) : null}

          {isMenu ? (
            <Field
              id="catalog-price"
              label="Harga jual"
              value={price}
              onChange={setPrice}
              inputMode="numeric"
              placeholder="28000"
              required
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                id="catalog-stock"
                label="Stok"
                value={stock}
                onChange={setStock}
                inputMode="decimal"
              />
              <label className="flex flex-col gap-1" htmlFor="catalog-unit">
                <span className="text-sm font-medium">Satuan</span>
                <select
                  id="catalog-unit"
                  className="min-h-12 border border-input bg-transparent px-2.5 text-base"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                >
                  {INGREDIENT_UNITS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                id="catalog-low"
                label="Ambang rendah"
                value={lowStock}
                onChange={setLowStock}
                inputMode="decimal"
              />
            </div>
          )}

          <Field
            id="catalog-sku"
            label="SKU"
            value={sku}
            onChange={(value) => {
              setSkuTouched(true)
              setSku(value)
            }}
            placeholder={suggestSku(name || (isMenu ? "Menu" : "Bahan"), kind)}
          />

          {isMenu ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Resep</legend>
              {ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada bahan. Tutup dialog ini, buka tab Bahan, lalu kembali untuk merakit resep.
                </p>
              ) : (
                <>
                  {lines.map((line, index) => {
                    const chosen = ingredients.find((row) => row.id === line.ingredientId)
                    return (
                      <div key={`${line.ingredientId}-${index}`} className="grid grid-cols-[1fr_5.5rem_auto] gap-2">
                        <select
                          aria-label={`Bahan ${index + 1}`}
                          className="min-h-12 border border-input bg-transparent px-2.5 text-base"
                          value={line.ingredientId}
                          onChange={(event) => {
                            const next = [...lines]
                            next[index] = { ...line, ingredientId: event.target.value }
                            setLines(next)
                          }}
                        >
                          {ingredients
                            .filter(
                              (ingredient) =>
                                ingredient.id === line.ingredientId ||
                                !lines.some((other) => other.ingredientId === ingredient.id)
                            )
                            .map((ingredient) => (
                              <option key={ingredient.id} value={ingredient.id}>
                                {ingredient.name}
                              </option>
                            ))}
                        </select>
                        <Input
                          aria-label={`Jumlah ${chosen?.name ?? "bahan"}`}
                          className="min-h-12"
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(event) => {
                            const next = [...lines]
                            next[index] = { ...line, qty: event.target.value }
                            setLines(next)
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="touch"
                          aria-label="Hapus baris resep"
                          onClick={() =>
                            setLines(lines.filter((_, lineIndex) => lineIndex !== index))
                          }
                        >
                          Hapus
                        </Button>
                      </div>
                    )
                  })}
                  {lines.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Jumlah memakai satuan bahan
                      {lines[0]
                        ? ` (contoh ${
                            ingredients.find((row) => row.id === lines[0]?.ingredientId)?.unit ?? "g"
                          })`
                        : ""}
                      .
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={unusedIngredients.length === 0}
                    onClick={() => {
                      const next = unusedIngredients[0]
                      if (!next) return
                      setLines([...lines, { ingredientId: next.id, qty: "" }])
                    }}
                  >
                    Tambah bahan ke resep
                  </Button>
                </>
              )}
            </fieldset>
          ) : (
            <Field
              id="catalog-note"
              label="Catatan"
              value={note}
              onChange={setNote}
              placeholder="Merek, pemasok, atau cara simpan"
            />
          )}

          <label className="flex min-h-12 items-center gap-2 text-sm">
            <Checkbox
              checked={active}
              onCheckedChange={(checked) => setActive(Boolean(checked))}
              disabled={!canWrite}
            />
            {isMenu ? "Aktif di kasir" : "Aktif dipakai"}
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {canWrite ? (
            <DialogFooter className="sm:justify-between">
              {item ? (
                confirmDelete ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="destructive"
                      size="touch"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          await onDelete(item)
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                          setConfirmDelete(false)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Yakin hapus
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Batal
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Hapus
                  </Button>
                )
              ) : (
                <span />
              )}
              <Button type="submit" size="touch" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter showCloseButton />
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
  autoFocus,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  inputMode?: "numeric" | "decimal" | "text"
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="min-h-12"
        value={value}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function CategoryDialog({
  open,
  categories,
  products,
  canWrite,
  onOpenChange,
  onCreate,
  onDelete,
}: {
  open: boolean
  categories: MenuCategoryRecord[]
  products: ProductRecord[]
  canWrite: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (category: MenuCategoryRecord) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name)
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("")
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Kategori menu</DialogTitle>
          <DialogDescription>
            Tambah kategori baru untuk filter dan form menu. Kategori yang masih dipakai tidak bisa dihapus.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {categories.map((category) => {
            const used = products.filter((item) => item.category === category.slug).length
            return (
              <li
                key={category.id}
                className="flex min-h-12 items-center justify-between gap-3 border px-3"
              >
                <span>
                  <span className="block font-medium">{category.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {used ? `${used} menu` : "Belum dipakai"}
                  </span>
                </span>
                {canWrite && used === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          await onDelete(category)
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        } finally {
                          setBusy(false)
                        }
                      })()
                    }}
                  >
                    Hapus
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
        {canWrite ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => void handleCreate(event)}>
            <Field
              id="new-category-name"
              label="Kategori baru"
              value={name}
              onChange={setName}
              placeholder="Snack, Paket, Es krim…"
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" size="touch" disabled={busy}>
                {busy ? "Menyimpan…" : "Tambah kategori"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter showCloseButton />
        )}
      </DialogContent>
    </Dialog>
  )
}

function mergeMenuCategories(
  stored: readonly MenuCategoryRecord[],
  menus: readonly ProductRecord[]
): MenuCategoryRecord[] {
  const bySlug = new Map(stored.map((item) => [item.slug, item]))
  for (const menu of menus) {
    const slug = menu.category.trim()
    if (!slug || slug === "bahan" || bySlug.has(slug)) continue
    bySlug.set(slug, {
      id: slug,
      slug,
      name: categoryLabel(slug),
      sortOrder: 999,
      createdAt: 0,
      updatedAt: 0,
    })
  }
  return sortMenuCategories([...bySlug.values()])
}
