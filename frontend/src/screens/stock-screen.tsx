import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  PackagePlus,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import {
  loadInventory,
  loadInventoryLots,
  recordInventoryWaste,
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
  expiryStatus,
  stockStatus,
  WASTE_REASONS,
  type InventoryItem,
  type InventoryLot,
} from "@/lib/inventory"
import type { StaffRecord } from "@/lib/types"
import { StockOpnamePage } from "./stock-opname-page"

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
  const [opname, setOpname] = useState(false)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [wasteLot, setWasteLot] = useState<InventoryLot | null>(null)
  const [page, setPage] = useState(1)
  const store = database.store
  const pageCount = Math.max(1, Math.ceil(items.length / 6))
  const currentPage = Math.min(page, pageCount)
  const visibleItems = items.slice((currentPage - 1) * 6, currentPage * 6)

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

  if (opname) {
    return (
      <StockOpnamePage
        database={database}
        actor={actor}
        items={items}
        onBack={() => setOpname(false)}
        onSaved={(name) => {
          setOpname(false)
          setNotice(`Opname ${name} berhasil disimpan dan saldo diperbarui.`)
          void load()
        }}
      />
    )
  }

  if (wasteLot) {
    const wasteItem = items.find((item) => item.id === wasteLot.inventoryItemId)
    return (
      <WastePage
        database={database}
        actor={actor}
        item={wasteItem}
        initialLot={wasteLot}
        onBack={() => setWasteLot(null)}
        onSaved={async (name) => {
          setWasteLot(null)
          setNotice(`Waste ${name} berhasil dicatat dan saldo lot diperbarui.`)
          await load()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="touch"
            onClick={() => setOpname(true)}
            disabled={loading || !items.length}
          >
            Stock opname
          </Button>
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
          {visibleItems.map((item) => {
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
                {open ? (
                  <LotDetail
                    database={database}
                    item={item}
                    onWaste={setWasteLot}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        onPage={(nextPage) => {
          setPage(nextPage)
          setSelected(null)
        }}
      />
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
  onWaste,
}: {
  database: Database
  item: InventoryItem
  onWaste: (lot: InventoryLot) => void
}) {
  const lots: InventoryLot[] = loadInventoryLots(database, item.id)
  const currentDate = todayJakarta()
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
          {lots.map((lot) => {
            const status = expiryStatus(lot.expiryDate, currentDate)
            return (
              <li key={lot.id} className="border bg-background p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <strong>{lot.containerCode || "Tanpa container"}</strong>
                  <span>
                    {quantity(lot.remainingQuantity)} {lot.baseUnit}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Lot {lot.lotCode || "—"}
                </p>
                <p className="text-muted-foreground">
                  Expiry: {dateLabel(lot.expiryDate)}
                </p>
                <Badge
                  className="mt-2"
                  variant={
                    status === "EXPIRED"
                      ? "destructive"
                      : status === "EXPIRING SOON"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {status}
                </Badge>
                <Button
                  className="mt-2 w-full"
                  variant="outline"
                  size="sm"
                  disabled={lot.remainingQuantity <= 0}
                  onClick={() => onWaste(lot)}
                >
                  <Trash2 /> Catat waste
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function WastePage({
  database,
  actor,
  item,
  initialLot,
  onBack,
  onSaved,
}: {
  database: Database
  actor: StaffRecord
  item: InventoryItem | undefined
  initialLot: InventoryLot
  onBack: () => void
  onSaved: (name: string) => Promise<void>
}) {
  const lots = loadInventoryLots(database, initialLot.inventoryItemId).filter(
    (lot) => lot.remainingQuantity > 0
  )
  const [lotId, setLotId] = useState(initialLot.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lot = lots.find((candidate) => candidate.id === lotId) ?? lots[0]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      await recordInventoryWaste(database, {
        inventoryLotId: lot?.id ?? "",
        quantity: Number(form.get("quantity")),
        reason: String(form.get("reason")) as (typeof WASTE_REASONS)[number],
        actorStaffId: actor.id,
      })
      await onSaved(item?.name ?? "inventory")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100svh-8rem)] flex-col gap-4">
      <div>
        <Button variant="outline" size="touch" onClick={onBack}>
          <ArrowLeft /> Kembali
        </Button>
      </div>
      <form
        className="grid flex-1 content-center gap-4 border bg-card p-4 sm:grid-cols-2 sm:p-6"
        onSubmit={submit}
      >
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="waste-lot">Lot / Container *</Label>
          <select
            id="waste-lot"
            className="min-h-11 border bg-background px-3"
            value={lot?.id ?? ""}
            onChange={(event) => setLotId(event.target.value)}
            required
          >
            {lots.map((row) => (
              <option value={row.id} key={row.id}>
                {row.lotCode || "Tanpa lot"} ·{" "}
                {row.containerCode || "Tanpa container"} ·{" "}
                {quantity(row.remainingQuantity)} {row.baseUnit}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="waste-quantity">Quantity waste *</Label>
          <Input
            id="waste-quantity"
            name="quantity"
            type="number"
            min="0.001"
            max={lot?.remainingQuantity}
            step="0.001"
            required
          />
          <span className="text-xs text-muted-foreground">
            Saldo lot: {quantity(lot?.remainingQuantity ?? 0)} {lot?.baseUnit}
          </span>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="waste-reason">Alasan *</Label>
          <select
            id="waste-reason"
            name="reason"
            className="min-h-10 border bg-background px-3"
            defaultValue={WASTE_REASONS[0]}
            required
          >
            {WASTE_REASONS.map((reason) => (
              <option value={reason} key={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>
        <LiveNotice message={error} tone="error" />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Batal
          </Button>
          <Button type="submit" disabled={busy || !lot}>
            {busy ? "Menyimpan..." : "Simpan waste"}
          </Button>
        </div>
      </form>
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
      await receiveInventory(database, {
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
