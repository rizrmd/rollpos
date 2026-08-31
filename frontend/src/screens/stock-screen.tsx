import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ChevronDown, ChevronRight, PackagePlus, RefreshCw } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import {
  loadInventory,
  loadInventoryLots,
  receiveInventory,
  seedInventoryIfEmpty,
} from "@/db/inventory"
import type { Database } from "@/db/database"
import { useDatabase } from "@/db/database-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import {
  stockStatus,
  type InventoryItem,
  type InventoryLot,
} from "@/lib/inventory"
import type { StaffRecord } from "@/lib/types"

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function quantity(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(
    value
  )
}

function dateLabel(value: string | null) {
  if (!value) return "Tanpa expiry"
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))
}

export function StockScreen({ actor }: { actor: StaffRecord }) {
  const database = useDatabase()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const store = database.store

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await seedInventoryIfEmpty(database)
      setItems(loadInventory(database))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Inventory lokal tidak dapat dibuka. Silakan coba lagi."
      )
    } finally {
      setLoading(false)
    }
  }, [database])

  useEffect(() => {
    const listenerId = store.addTablesListener(() => void load())
    const timer = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timer)
      store.delListener(listenerId)
    }
  }, [load, store])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Stok</h1>
          <p className="text-sm text-muted-foreground">
            Saldo dihitung dari ledger lokal pada perangkat ini.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="touch"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw /> Muat ulang
          </Button>
          <Button
            size="touch"
            onClick={() => setReceiving(true)}
            disabled={!items.some((item) => item.isActive)}
          >
            <PackagePlus /> Terima stok
          </Button>
        </div>
      </div>
      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading inventory...</p>
      ) : error ? (
        <div className="border p-4">
          <p className="font-medium">Inventory lokal tidak tersedia.</p>
          <p className="text-sm text-muted-foreground">
            Periksa penyimpanan browser lalu coba lagi.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border">
          <div className="grid grid-cols-[minmax(9rem,1fr)_auto_auto_auto] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <span>Item</span>
            <span>Stock</span>
            <span className="hidden sm:block">Unit</span>
            <span>Minimum</span>
            <span>Status</span>
          </div>
          {items.map((item) => {
            const status = stockStatus(item)
            const open = selected?.id === item.id
            return (
              <div key={item.id} className="border-b last:border-0">
                <button
                  className="grid w-full grid-cols-[minmax(9rem,1fr)_auto_auto_auto] items-center gap-3 px-3 py-3 text-left hover:bg-muted/40 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                  onClick={() => setSelected(open ? null : item)}
                  aria-expanded={open}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {open ? (
                      <ChevronDown className="size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0" />
                    )}
                    <span>
                      <span className="block truncate font-medium">
                        {item.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.sku}
                      </span>
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {quantity(item.balance)}
                  </span>
                  <span className="hidden sm:block">{item.baseUnit}</span>
                  <span className="tabular-nums">
                    {quantity(item.minimumStock)}
                  </span>
                  <Badge
                    variant={
                      status === "OK"
                        ? "secondary"
                        : status === "LOW"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {status}
                  </Badge>
                </button>
                {open ? <LotDetail database={database} item={item} /> : null}
              </div>
            )
          })}
        </div>
      )}
      <ReceiveDialog
        open={receiving}
        items={items}
        actor={actor}
        database={database}
        onOpenChange={setReceiving}
        onReceived={async (name) => {
          setNotice(`${name} berhasil diterima dan saldo diperbarui.`)
          await load()
        }}
      />
    </div>
  )
}

function LotDetail({
  database,
  item,
}: {
  database: Database
  item: InventoryItem
}) {
  const lots: InventoryLot[] = loadInventoryLots(database, item.id)
  return (
    <div className="bg-muted/30 px-4 py-3 sm:pl-10">
      <p className="mb-2 text-sm font-medium">
        Lots · {quantity(item.balance)} {item.baseUnit}
      </p>
      {lots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada lot penerimaan.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lots.map((lot) => (
            <li key={lot.id} className="border bg-background p-3 text-sm">
              <div className="flex justify-between gap-2">
                <strong>{lot.containerCode || "Tanpa container"}</strong>
                <span>
                  {quantity(lot.remainingQuantity)} {lot.baseUnit}
                </span>
              </div>
              <p className="text-muted-foreground">Lot {lot.lotCode || "—"}</p>
              <p className="text-muted-foreground">
                Expiry: {dateLabel(lot.expiryDate)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReceiveDialog({
  open,
  items,
  actor,
  database,
  onOpenChange,
  onReceived,
}: {
  open: boolean
  items: InventoryItem[]
  actor: StaffRecord
  database: Database
  onOpenChange: (open: boolean) => void
  onReceived: (name: string) => Promise<void>
}) {
  const active = items.filter((item) => item.isActive)
  const [itemId, setItemId] = useState(active[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = active.find((candidate) => candidate.id === itemId) ?? active[0]
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      receiveInventory(database, {
        inventoryItemId: item?.id ?? "",
        quantity: Number(form.get("quantity")),
        unit: item?.baseUnit ?? "",
        receivedDate: String(form.get("receivedDate") ?? ""),
        expiryDate: String(form.get("expiryDate") ?? "") || null,
        lotCode: String(form.get("lotCode") ?? "") || null,
        containerCode: String(form.get("containerCode") ?? "") || null,
        notes: String(form.get("notes") ?? "") || null,
        actorStaffId: actor.id,
      })
      onOpenChange(false)
      await onReceived(item?.name ?? "Stok")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Terima stok</DialogTitle>
          <DialogDescription>
            Satu penerimaan membuat lot dan pergerakan RECEIVE secara atomik.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-1">
            <Label htmlFor="inventory-item">Inventory Item *</Label>
            <select
              id="inventory-item"
              className="min-h-10 border bg-background px-3"
              value={item?.id ?? ""}
              onChange={(event) => setItemId(event.target.value)}
              required
            >
              {active.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1">
              <Label htmlFor="receive-quantity">Quantity *</Label>
              <Input
                id="receive-quantity"
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
            </div>
            <div className="grid gap-1">
              <Label>Unit</Label>
              <div className="flex min-h-10 items-center border bg-muted px-4">
                {item?.baseUnit}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="received-date">Received Date *</Label>
              <Input
                id="received-date"
                name="receivedDate"
                type="date"
                defaultValue={todayJakarta()}
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="expiry-date">Expiry Date</Label>
              <Input id="expiry-date" name="expiryDate" type="date" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="lot-code">Lot/Batch</Label>
              <Input
                id="lot-code"
                name="lotCode"
                placeholder="2026-09-01-001"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="container-code">Container Code</Label>
              <Input
                id="container-code"
                name="containerCode"
                placeholder="A.1"
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="receive-notes">Notes</Label>
            <Textarea id="receive-notes" name="notes" />
          </div>
          <LiveNotice message={error} tone="error" />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy || !item}>
              {busy ? "Menyimpan..." : "Terima stok"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
