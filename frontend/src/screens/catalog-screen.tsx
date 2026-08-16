import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  createProduct,
  deleteProduct,
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

export function CatalogScreen() {
  const { database, products, ready, error } = useProducts()
  const [form, setForm] = useState<ProductInput>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.sku.trim()) {
      setNotice("Nama dan SKU wajib.")
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
      setNotice("Produk tersimpan lokal.")
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Tambah produk</CardTitle>
          <CardDescription>Katalog demo, terpisah dari jadwal.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <Input
              aria-label="Nama produk"
              className="min-h-12"
              placeholder="Nama"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              aria-label="SKU"
              className="min-h-12"
              placeholder="SKU"
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
            />
            <Input
              aria-label="Harga"
              className="min-h-12"
              placeholder="Harga"
              type="number"
              value={form.price ? String(form.price) : ""}
              onChange={(event) =>
                setForm({ ...form, price: Number(event.target.value) })
              }
            />
            <Button type="submit" size="touch" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Katalog</CardTitle>
          <CardDescription>
            {ready ? `${products.length} item` : "Membuka database…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <ul className="divide-y rounded-lg border">
            {products.map((product) => (
              <li key={product.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  {product.name}{" "}
                  <span className="text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <span className="flex items-center gap-2">
                  {currency.format(product.price)}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => void deleteProduct(database, product)}
                  >
                    Hapus
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
