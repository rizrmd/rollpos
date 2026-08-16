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
  updateProduct,
  type ProductInput,
} from "@/db/catalog"
import { useProducts } from "@/hooks/use-products"
import { canManageProducts } from "@/lib/permissions"
import type { ProductRecord, StaffRecord } from "@/lib/types"

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

export function CatalogScreen({ actor }: { actor: StaffRecord }) {
  const { database, products, ready, error } = useProducts()
  const [form, setForm] = useState<ProductInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const canWrite = canManageProducts(actor.roles)

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function startEdit(product: ProductRecord) {
    if (!canWrite) return
    setEditingId(product.id)
    setForm({
      name: product.name,
      sku: product.sku,
      price: product.price,
      stock: product.stock,
    })
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite) {
      setNotice("Hanya owner atau manager yang boleh menambah atau mengubah produk.")
      return
    }
    if (!form.name.trim() || !form.sku.trim()) {
      setNotice("Nama dan SKU wajib.")
      return
    }
    setBusy(true)
    try {
      const input: ProductInput = {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
      }
      if (editingId) {
        await updateProduct(database, actor, editingId, input)
        setNotice("Produk diperbarui.")
      } else {
        await createProduct(database, actor, input)
        setNotice("Produk tersimpan lokal.")
      }
      resetForm()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(product: ProductRecord) {
    if (!canWrite) {
      setNotice("Hanya owner atau manager yang boleh menambah atau mengubah produk.")
      return
    }
    setBusy(true)
    try {
      await deleteProduct(database, actor, product)
      if (editingId === product.id) resetForm()
      setNotice("Produk dihapus.")
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Ubah produk" : "Tambah produk"}</CardTitle>
            <CardDescription>
              Hanya owner atau manager yang boleh menambah atau mengubah katalog.
            </CardDescription>
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
              <div className="flex flex-col gap-2">
                <Button type="submit" size="touch" disabled={busy}>
                  {busy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan"}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    size="touch"
                    variant="outline"
                    disabled={busy}
                    onClick={resetForm}
                  >
                    Batal
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Katalog terkunci</CardTitle>
            <CardDescription>
              Hanya owner atau manager yang boleh menambah atau mengubah produk.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
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
                  {canWrite ? (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => startEdit(product)}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void handleDelete(product)}
                      >
                        Hapus
                      </Button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
