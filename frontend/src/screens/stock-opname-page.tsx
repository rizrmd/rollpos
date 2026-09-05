import { useRef, useState, type FormEvent } from "react"
import { ArrowLeft } from "lucide-react"
import { LiveNotice } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Database } from "@/db/database"
import { loadInventoryLots } from "@/db/inventory"
import { recordStockOpname } from "@/db/stock-opname"
import type { InventoryItem, InventoryLot } from "@/lib/inventory"
import type { StaffRecord } from "@/lib/types"

export function StockOpnamePage({
  database,
  actor,
  items,
  onBack,
  onSaved,
}: {
  database: Database
  actor: StaffRecord
  items: InventoryItem[]
  onBack: () => void
  onSaved: (name: string) => void
}) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "")
  const [lotId, setLotId] = useState("")
  const [snapshot, setSnapshot] = useState<InventoryLot | null>(null)
  const [physical, setPhysical] = useState("")
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const item = items.find((row) => row.id === itemId)
  const lots = loadInventoryLots(database, itemId)
  const currentLot = lots.find((row) => row.id === lotId) ?? lots[0]
  const lot = snapshot ?? currentLot
  const format = (value: number) =>
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(value)
  const difference =
    physical.trim() && lot ? Number(physical) - lot.remainingQuantity : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true
    setError(null)
    try {
      recordStockOpname(database, {
        inventoryLotId: lot?.id ?? "",
        systemQuantity: lot?.remainingQuantity ?? NaN,
        physicalQuantity: physical.trim() ? Number(physical) : NaN,
        actorStaffId: actor.id,
      })
      onSaved(item?.name ?? "Stok")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setSnapshot(null)
      setPhysical("")
      saving.current = false
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <Button variant="outline" size="touch" onClick={onBack}>
          <ArrowLeft /> Kembali
        </Button>
      </div>
      <form
        className="grid min-h-0 flex-1 content-center gap-3 border bg-card p-3 sm:grid-cols-2 sm:p-6"
        onSubmit={submit}
      >
        <div className="grid gap-1">
          <Label htmlFor="opname-item">Item</Label>
          <select
            id="opname-item"
            className="min-h-11 min-w-0 border bg-background px-3"
            value={itemId}
            required
            onChange={(event) => {
              setItemId(event.target.value)
              setLotId("")
              setPhysical("")
              setSnapshot(null)
              setError(null)
            }}
          >
            {items.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="opname-lot">Lot / Container</Label>
          <select
            id="opname-lot"
            className="min-h-11 min-w-0 border bg-background px-3"
            value={lot?.id ?? ""}
            required
            disabled={!lots.length}
            onChange={(event) => {
              setLotId(event.target.value)
              setPhysical("")
              setSnapshot(null)
              setError(null)
            }}
          >
            {!lots.length && <option value="">Belum ada lot penerimaan</option>}
            {lots.map((row) => (
              <option key={row.id} value={row.id}>
                {row.lotCode || `Lot #${row.id}`} ·{" "}
                {row.containerCode || "Tanpa container"} · {row.receivedAt}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="opname-system">Saldo sistem ({item?.baseUnit})</Label>
          <Input
            id="opname-system"
            readOnly
            value={lot ? format(lot.remainingQuantity) : "—"}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="opname-physical">
            Saldo fisik ({item?.baseUnit})
          </Label>
          <Input
            id="opname-physical"
            type="number"
            min="0"
            step="any"
            required
            disabled={!lot}
            value={physical}
            onChange={(event) => {
              setSnapshot(lot ?? null)
              setPhysical(event.target.value)
            }}
          />
        </div>
        <div className="flex items-center justify-between sm:col-span-2">
          <span>Selisih ({item?.baseUnit})</span>
          <output className="font-semibold tabular-nums" aria-live="polite">
            {difference !== null && Number.isFinite(difference)
              ? `${difference > 0 ? "+" : ""}${format(difference)}`
              : "—"}
          </output>
        </div>
        <div className="sm:col-span-2">
          <LiveNotice message={error} tone="error" />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Batal
          </Button>
          <Button type="submit" disabled={!lot || !physical.trim()}>
            Simpan opname
          </Button>
        </div>
      </form>
    </div>
  )
}
