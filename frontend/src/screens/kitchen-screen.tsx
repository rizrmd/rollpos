import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Clock3, Play, ReceiptText } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDatabase } from "@/db/database-provider"
import {
  loadKitchenOrders,
  startKitchenItem,
  type KitchenOrder,
  type KitchenOrderItem,
} from "@/db/kitchen"
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
  const [orderPage, setOrderPage] = useState(1)
  const [itemPage, setItemPage] = useState(1)
  const orderPageCount = Math.max(1, Math.ceil(orders.length / 4))
  const currentOrderPage = Math.min(orderPage, orderPageCount)
  const visibleOrders = orders.slice(
    (currentOrderPage - 1) * 4,
    currentOrderPage * 4
  )

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
  const itemPageCount = Math.max(
    1,
    Math.ceil((selectedOrder?.items.length ?? 0) / 4)
  )
  const currentItemPage = Math.min(itemPage, itemPageCount)
  const visibleItems = (selectedOrder?.items ?? []).slice(
    (currentItemPage - 1) * 4,
    currentItemPage * 4
  )

  async function start(item: KitchenOrderItem) {
    if (item.status === "started") return
    setBusy(true)
    setError(null)
    try {
      await startKitchenItem(database, item.id)
      setNotice(`${item.menuName} dimulai. Inventory recipe sudah dikonsumsi.`)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Menu gagal dimulai.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <LiveNotice message={notice} />
        <LiveNotice message={error} tone="error" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Membuka antrian dapur lokal…
        </p>
      ) : orders.length === 0 ? (
        <div className="grid flex-1 place-items-center border border-dashed text-sm text-muted-foreground">
          Belum ada order dapur.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <section
            className="flex min-h-0 flex-col border bg-card"
            aria-label="Antrian order"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2">
              <h2 className="text-sm font-semibold">Antrian order</h2>
              <span className="text-xs text-muted-foreground">
                Terlama dulu
              </span>
            </div>
            <ul className="min-h-0 flex-1 divide-y">
              {visibleOrders.map((order) => {
                const started = order.items.filter(
                  (item) => item.status === "started"
                ).length
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full border-l-2 border-l-transparent px-3 py-3 text-left hover:bg-muted/60",
                        order.id === selectedOrder?.id &&
                          "border-l-primary bg-muted"
                      )}
                      onClick={() => {
                        setSelectedOrderId(order.id)
                        setSelectedItemId(order.items[0]?.id ?? "")
                        setItemPage(1)
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong className="text-sm">{order.orderNumber}</strong>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="size-3" />
                          {timeLabel(order.placedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm">
                        {order.customerName}
                      </span>
                      <span className="mt-1.5 block text-xs text-muted-foreground">
                        {started}/{order.items.length} menu dimulai
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="border-t p-2">
              <Pagination
                page={currentOrderPage}
                pageCount={orderPageCount}
                onPage={(nextPage) => {
                  setOrderPage(nextPage)
                  const nextOrder = orders[(nextPage - 1) * 4]
                  setSelectedOrderId(nextOrder?.id ?? "")
                  setSelectedItemId(nextOrder?.items[0]?.id ?? "")
                  setItemPage(1)
                }}
              />
            </div>
          </section>

          <section
            className="flex min-h-0 flex-col border bg-card"
            aria-label="Menu dalam order"
          >
            {selectedOrder ? (
              <>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ReceiptText className="size-4 shrink-0" />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">
                        {selectedOrder.orderNumber} ·{" "}
                        {selectedOrder.customerName}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Masuk pukul {timeLabel(selectedOrder.placedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {selectedOrder.items.length} menu
                  </Badge>
                </div>
                <div className="shrink-0 border-b">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Menu</TableHead>
                        <TableHead className="w-24 text-center">Qty</TableHead>
                        <TableHead className="w-36">Recipe / SOP</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-28 text-right">
                          Detail
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((item) => (
                        <TableRow
                          key={item.id}
                          className={cn(
                            "cursor-pointer",
                            item.id === selectedItem?.id && "bg-muted/70"
                          )}
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <TableCell className="font-medium">
                            {item.menuName}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {item.quantity}
                          </TableCell>
                          <TableCell>
                            {item.recipe ? (
                              <span className="text-sm">
                                Aktif · v{item.recipe.version}
                              </span>
                            ) : (
                              <span className="text-sm text-destructive">
                                Tidak tersedia
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === "started"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {item.status === "started" ? (
                                <Check />
                              ) : (
                                <Clock3 />
                              )}
                              {item.status === "started"
                                ? "Dimulai"
                                : "Menunggu"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedItemId(item.id)}
                            >
                              Pilih
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t p-2">
                    <Pagination
                      page={currentItemPage}
                      pageCount={itemPageCount}
                      onPage={(nextPage) => {
                        setItemPage(nextPage)
                        setSelectedItemId(
                          selectedOrder.items[(nextPage - 1) * 4]?.id ?? ""
                        )
                      }}
                    />
                  </div>
                </div>
                <RecipeDetail item={selectedItem} busy={busy} onStart={start} />
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}

function RecipeDetail({
  item,
  busy,
  onStart,
}: {
  item: KitchenOrderItem | null
  busy: boolean
  onStart: (item: KitchenOrderItem) => Promise<void>
}) {
  if (!item) return null

  return (
    <div className="min-h-0 flex-1 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{item.menuName}</h3>
              <Badge variant="outline">Qty {item.quantity}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recipe / SOP aktif dan total kebutuhan untuk order ini.
            </p>
          </div>
          <Badge variant={item.status === "started" ? "secondary" : "outline"}>
            {item.status === "started" ? <Check /> : <Clock3 />}
            {item.status === "started" ? "Dimulai" : "Menunggu"}
          </Badge>
        </div>

        {item.recipe ? (
          <div className="border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Recipe / SOP aktif</p>
                <p className="text-xs text-muted-foreground">
                  Versi {item.recipe.version} · takaran per porsi
                </p>
              </div>
              <Badge>Aktif</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead className="text-right">Per porsi</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.recipe.ingredients.map((ingredient) => (
                  <TableRow key={ingredient.id}>
                    <TableCell className="font-medium">
                      {ingredient.inventoryItemName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number.format(ingredient.quantity)} {ingredient.unit}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {number.format(ingredient.quantity * item.quantity)}{" "}
                      {ingredient.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Recipe / SOP aktif belum tersedia. Aktifkan recipe menu ini sebelum
            memulai pengerjaan.
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            START mengonsumsi inventory sesuai total quantity.
          </p>
          <Button
            type="button"
            disabled={busy || item.status === "started" || !item.recipe}
            onClick={() => void onStart(item)}
          >
            {item.status === "started" ? <Check /> : <Play />}
            {item.status === "started"
              ? "SUDAH DIMULAI"
              : busy
                ? "MEMULAI…"
                : "START"}
          </Button>
        </div>
      </div>
    </div>
  )
}
