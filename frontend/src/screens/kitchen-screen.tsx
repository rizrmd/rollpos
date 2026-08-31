import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ChefHat, Clock3, Play, ReceiptText } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  loadKitchenOrders,
  startKitchenItem,
  type KitchenOrder,
} from "@/db/kitchen"
import { useDatabase } from "@/db/database-provider"
import { cn } from "@/lib/utils"

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 })

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp)
}

export function KitchenScreen() {
  const database = useDatabase()
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState("")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await loadKitchenOrders(database)
      setOrders(next)
      setSelectedOrderId((current) =>
        next.some((order) => order.id === current)
          ? current
          : (next[0]?.id ?? "")
      )
      setError(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Order dapur lokal gagal dibuka."
      )
    } finally {
      setLoading(false)
    }
  }, [database])

  useEffect(() => {
    const listenerId = database.store.addTablesListener(() => void refresh())
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timer)
      database.store.delListener(listenerId)
    }
  }, [database, refresh])

  const selectedOrder = useMemo(
    () =>
      orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  )

  const selectedItem =
    selectedOrder?.items.find((item) => item.id === selectedItemId) ??
    selectedOrder?.items[0] ??
    null

  async function start() {
    if (!selectedItem || selectedItem.status === "started") return
    setBusy(true)
    setError(null)
    try {
      await startKitchenItem(database, selectedItem.id)
      setNotice(`${selectedItem.menuName} dimulai. Inventory tidak berubah.`)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Menu gagal dimulai.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ChefHat className="size-6" />
            <h1 className="text-xl font-semibold">Kitchen View</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilih order, buka menu, cek Recipe / SOP aktif, lalu START.
          </p>
        </div>
        <Badge variant="outline">Order dummy · tersimpan lokal</Badge>
      </header>

      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Membuka antrian dapur lokal…
        </p>
      ) : orders.length === 0 ? (
        <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">
          Belum ada order dapur.
        </p>
      ) : (
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[17rem_1fr]">
          <aside className="border bg-card p-3" aria-label="Antrian order">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Antrian order</h2>
              <Badge variant="secondary">{orders.length}</Badge>
            </div>
            <ul className="grid gap-2">
              {orders.map((order) => {
                const started = order.items.filter(
                  (item) => item.status === "started"
                ).length
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full border p-3 text-left transition-colors hover:bg-muted",
                        order.id === selectedOrder?.id &&
                          "border-primary bg-primary/5"
                      )}
                      onClick={() => {
                        setSelectedOrderId(order.id)
                        setSelectedItemId(order.items[0]?.id ?? "")
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong>{order.orderNumber}</strong>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="size-3.5" />{" "}
                          {timeLabel(order.placedAt)}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm">
                        {order.customerName}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {started}/{order.items.length} menu dimulai
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {selectedOrder ? (
            <section
              className="flex min-w-0 flex-col gap-4"
              aria-label="Detail order"
            >
              <div className="border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ReceiptText className="size-5" />
                    <h2 className="font-semibold">
                      {selectedOrder.orderNumber} · {selectedOrder.customerName}
                    </h2>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Masuk {timeLabel(selectedOrder.placedAt)}
                  </span>
                </div>
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  aria-label="Pilih menu order"
                >
                  {selectedOrder.items.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant={
                        item.id === selectedItem?.id ? "default" : "outline"
                      }
                      size="touch"
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      {item.status === "started" ? <Check /> : null}
                      {item.quantity}× {item.menuName}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedItem ? (
                <article className="flex flex-1 flex-col border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div>
                      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                        Menu dipilih
                      </p>
                      <h3 className="mt-1 text-2xl font-semibold">
                        {selectedItem.menuName}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Quantity order:{" "}
                        <strong className="text-foreground">
                          {selectedItem.quantity}
                        </strong>
                      </p>
                    </div>
                    {selectedItem.status === "started" ? (
                      <Badge variant="secondary">
                        <Check /> Sudah START
                      </Badge>
                    ) : (
                      <Badge variant="outline">Menunggu</Badge>
                    )}
                  </div>

                  {selectedItem.recipe ? (
                    <div className="flex flex-1 flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                        <div>
                          <h4 className="font-semibold">Recipe / SOP aktif</h4>
                          <p className="text-sm text-muted-foreground">
                            Versi {selectedItem.recipe.version} · takaran per
                            porsi
                          </p>
                        </div>
                        <Badge>Aktif</Badge>
                      </div>
                      <ul className="divide-y border-y">
                        {selectedItem.recipe.ingredients.map((ingredient) => (
                          <li
                            key={ingredient.id}
                            className="grid grid-cols-[1fr_auto] gap-4 py-3"
                          >
                            <span>{ingredient.inventoryItemName}</span>
                            <span className="text-right tabular-nums">
                              <strong>
                                {number.format(ingredient.quantity)}{" "}
                                {ingredient.unit}
                              </strong>
                              {selectedItem.quantity > 1 ? (
                                <small className="block text-muted-foreground">
                                  Total{" "}
                                  {number.format(
                                    ingredient.quantity * selectedItem.quantity
                                  )}{" "}
                                  {ingredient.unit}
                                </small>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 text-xs text-muted-foreground">
                        START hanya menandai pengerjaan menu dan belum
                        mengurangi inventory.
                      </p>
                      <Button
                        type="button"
                        size="touch"
                        className="mt-5 w-full sm:ml-auto sm:w-48"
                        disabled={busy || selectedItem.status === "started"}
                        onClick={() => void start()}
                      >
                        {selectedItem.status === "started" ? (
                          <Check />
                        ) : (
                          <Play />
                        )}
                        {selectedItem.status === "started"
                          ? "DIMULAI"
                          : busy
                            ? "MEMULAI…"
                            : "START"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-center">
                      <div>
                        <p className="font-medium">
                          Recipe / SOP aktif belum tersedia
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Aktifkan recipe menu ini sebelum memulai pengerjaan.
                        </p>
                      </div>
                    </div>
                  )}
                </article>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
