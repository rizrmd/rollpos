import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  createProduct,
  deleteProduct,
  seedCatalogIfEmpty,
  type ProductInput,
} from "@/db/catalog"
import { useProducts } from "@/hooks/use-products"

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const emptyForm: ProductInput = {
  name: "",
  sku: "",
  price: 0,
  stock: 0,
}

export function App() {
  const { database, products, ready, error } = useProducts()
  const [form, setForm] = useState<ProductInput>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) {
      return
    }

    void seedCatalogIfEmpty(database)
      .then((seeded) => {
        if (seeded) {
          setNotice("Seeded the Roll n Brew demo catalog into WatermelonDB.")
        }
      })
      .catch((err: unknown) => {
        setNotice(err instanceof Error ? err.message : String(err))
      })
  }, [database, ready])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.sku.trim()) {
      setNotice("Name and SKU are required.")
      return
    }

    setBusy(true)
    try {
      await createProduct(database, {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
      })
      setForm(emptyForm)
      setNotice("Product saved locally.")
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Roll n Brew
            </p>
            <h1 className="font-heading text-lg">RollPOS</h1>
          </div>
          <p className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
            WatermelonDB · LokiJS · IndexedDB
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add product</CardTitle>
            <CardDescription>
              Stored on this device with WatermelonDB. Offline-ready catalog
              for the POS sandbox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <Field
                label="Name"
                value={form.name}
                onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              />
              <Field
                label="SKU"
                value={form.sku}
                onChange={(value) => setForm((current) => ({ ...current, sku: value }))}
              />
              <Field
                label="Price (IDR)"
                type="number"
                value={form.price ? String(form.price) : ""}
                onChange={(value) =>
                  setForm((current) => ({ ...current, price: Number(value) }))
                }
              />
              <Field
                label="Stock"
                type="number"
                value={form.stock ? String(form.stock) : ""}
                onChange={(value) =>
                  setForm((current) => ({ ...current, stock: Number(value) }))
                }
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save to local DB"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catalog</CardTitle>
            <CardDescription>
              {ready
                ? `${products.length} item${products.length === 1 ? "" : "s"} in WatermelonDB`
                : "Opening local database…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {notice ? (
              <p className="text-sm text-muted-foreground">{notice}</p>
            ) : null}
            {products.length === 0 && ready ? (
              <p className="text-sm text-muted-foreground">
                No products yet. Add one or wait for the demo seed.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {products.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {product.sku} · stock {product.stock}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums">
                        {currency.format(product.price)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          void deleteProduct(database, product).catch(
                            (err: unknown) => {
                              setNotice(
                                err instanceof Error ? err.message : String(err)
                              )
                            }
                          )
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              Press <kbd>d</kbd> to toggle dark mode
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: "text" | "number"
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  )
}

export default App
