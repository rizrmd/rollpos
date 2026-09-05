import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/pagination"
import { useDatabase } from "@/db/database-provider"
import {
  historyCapacity,
  historyPage,
  loadOrderHistory,
  type HistoryOrder,
} from "@/db/order-history"
import { formatRupiah } from "@/lib/format"
import { shouldHandleInAppClick } from "@/lib/nav"

const time = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
})
const methodNames = { CASH: "Tunai", QRIS: "QRIS", CARD: "Kartu" }
const readOrderId = () =>
  new URLSearchParams(window.location.search).get("order")

export function OrderHistoryScreen() {
  const database = useDatabase()
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState(readOrderId)
  const [page, setPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)
  const [height, setHeight] = useState(0)
  const area = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    const refresh = () => {
      void loadOrderHistory(database)
        .then((rows) => {
          if (!cancelled) {
            setOrders(rows)
            setReady(true)
            setError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : String(err))
        })
    }
    void database.ready
      .then(() => {
        if (cancelled) return
        const listener = database.store.addTablesListener(refresh)
        unsubscribe = () => database.store.delListener(listener)
        refresh()
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [database])

  useEffect(() => {
    const onPop = () => {
      setOrderId(readOrderId())
      setDetailPage(1)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    const element = area.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ready, orderId, error])

  function openOrder(id: string | null) {
    window.history.pushState(
      null,
      "",
      id ? `/pesanan?order=${encodeURIComponent(id)}` : "/pesanan"
    )
    setOrderId(id)
    setDetailPage(1)
  }

  const selected = orders.find((order) => order.id === orderId)
  // Each modifier has its own paginated row, so even a large sale stays within the screen.
  const lines =
    selected?.items.flatMap((item) => [
      {
        id: item.id,
        name: item.name,
        description: `${item.quantity} × ${formatRupiah(item.price)}`,
        amount: formatRupiah(item.subtotal),
        modifier: false,
      },
      ...(item.modifiers ?? []).map((modifier, index) => ({
        id: `${item.id}-m-${index}`,
        name: modifier.name,
        description: `Tambahan per item · ${item.name}`,
        amount: formatRupiah(modifier.additionalPrice),
        modifier: true,
      })),
    ]) ?? []
  const list = historyPage(orders, page, historyCapacity(height, 132))
  const detail = historyPage(lines, detailPage, historyCapacity(height, 72))

  if (error)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {error}
      </p>
    )
  if (!ready)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Membuka transaksi…
      </p>
    )

  return (
    <section
      aria-label="Riwayat transaksi kasir"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
    >
      {orderId ? (
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon-touch"
            aria-label="Kembali ke riwayat"
            onClick={() => openOrder(null)}
          >
            <ArrowLeft />
          </Button>
          <span className="min-w-0 truncate font-mono text-sm">
            {selected?.orderNumber ?? "Order tidak ditemukan"}
          </span>
          {selected ? (
            <span className="ml-auto rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              PAID
            </span>
          ) : null}
        </div>
      ) : null}
      {selected ? (
        <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-card p-3 text-sm sm:grid-cols-4">
          <Field
            label="Waktu bayar (WIB)"
            value={
              selected.payment
                ? time.format(selected.payment.paidAt)
                : "Tidak tercatat"
            }
          />
          <Field label="Staff" value={selected.staffName} />
          <Field
            label="Metode"
            value={
              selected.payment
                ? (methodNames[selected.payment.method] ??
                  selected.payment.method)
                : "Tidak tercatat"
            }
          />
          <Field label="Total" value={formatRupiah(selected.total)} />
          {selected.payment ? (
            <>
              <Field
                label={
                  selected.payment.method === "CASH"
                    ? "Uang diterima"
                    : "Dibayar"
                }
                value={formatRupiah(selected.payment.amount)}
              />
              {selected.payment.method === "CASH" ? (
                <Field
                  label="Kembalian"
                  value={formatRupiah(selected.payment.change)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div ref={area} className="min-h-0 flex-1 overflow-hidden">
        {orderId ? (
          selected ? (
            <ul aria-label="Item order">
              {detail.rows.map((line) => (
                <li
                  key={line.id}
                  className={`flex h-[72px] items-center gap-3 border-b px-3 ${line.modifier ? "bg-muted/30" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      title={line.name}
                    >
                      {line.modifier ? "+ " : ""}
                      {line.name}
                    </p>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={line.description}
                    >
                      {line.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">
                    {line.amount}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Order PAID ini tidak tersedia di perangkat ini.
            </p>
          )
        ) : orders.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Belum ada transaksi lunas.
          </div>
        ) : (
          <ul aria-label="Transaksi lunas">
            {list.rows.map((order) => (
              <li key={order.id} className="h-[132px] pb-2">
                <a
                  href={`/pesanan?order=${encodeURIComponent(order.id)}`}
                  onClick={(event) => {
                    if (shouldHandleInAppClick(event)) {
                      event.preventDefault()
                      openOrder(order.id)
                    }
                  }}
                  aria-label={`Detail ${order.orderNumber}`}
                  className="flex h-full flex-col justify-center gap-2 rounded-xl border bg-card px-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {order.orderNumber}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatRupiah(order.total)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="truncate text-sm">
                    {order.items
                      .map((item) => `${item.quantity}× ${item.name}`)
                      .join(", ") || "Item tidak tercatat"}
                  </p>
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0">
                      {order.payment
                        ? `${time.format(order.payment.paidAt)} WIB`
                        : "Waktu tidak tercatat"}
                    </span>
                    <span>·</span>
                    <span>
                      {order.payment
                        ? (methodNames[order.payment.method] ??
                          order.payment.method)
                        : "—"}
                    </span>
                    <span>·</span>
                    <span className="truncate">{order.staffName}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t pt-2">
        <span role="status" className="text-xs text-muted-foreground">
          {orderId
            ? `${selected?.items.length ?? 0} item`
            : `${orders.length} transaksi`}
        </span>
        <Pagination
          page={orderId ? detail.page : list.page}
          pageCount={orderId ? detail.pageCount : list.pageCount}
          onPage={orderId ? setDetailPage : setPage}
        />
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium tabular-nums" title={value}>
        {value}
      </div>
    </div>
  )
}
