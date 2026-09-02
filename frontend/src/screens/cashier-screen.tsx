import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  ShoppingBasket,
  Trash2,
} from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createOpenOrder,
  loadOrders,
  payOrderCash,
  payOrderNonCash,
  type PaymentMethod,
  type PosOrder,
} from "@/db/orders"
import { useProducts } from "@/hooks/use-products"
import {
  addCartItem,
  cartQuantity,
  cartSubtotal,
  removeCartItem,
  setCartItemQuantity,
  type CartItem,
} from "@/lib/cart"
import { sortCatalog, sortMenuCategories } from "@/lib/catalog"
import { formatRupiah } from "@/lib/format"
import type { ProductRecord, StaffRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const MENU_PAGE_SIZE = 8
const CART_PAGE_SIZE = 4

export function CashierScreen({ actor }: { actor: StaffRecord | null }) {
  const { database, products, categories, ready, error } = useProducts()
  const [category, setCategory] = useState("all")
  const [menuPage, setMenuPage] = useState(1)
  const [cartPage, setCartPage] = useState(1)
  const [cart, setCart] = useState<CartItem[]>([])
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [mode, setMode] = useState<"sale" | "payment">("sale")

  const activeMenus = useMemo(
    () =>
      sortCatalog(
        products.filter((item) => item.kind === "menu" && item.isActive)
      ),
    [products]
  )
  const activeCategories = useMemo(() => {
    const slugs = new Set(activeMenus.map((item) => item.category))
    return sortMenuCategories(categories).filter((item) => slugs.has(item.slug))
  }, [activeMenus, categories])
  const filteredMenus = useMemo(
    () =>
      category === "all"
        ? activeMenus
        : activeMenus.filter((item) => item.category === category),
    [activeMenus, category]
  )
  const menuPageCount = Math.max(
    1,
    Math.ceil(filteredMenus.length / MENU_PAGE_SIZE)
  )
  const currentMenuPage = Math.min(menuPage, menuPageCount)
  const visibleMenus = filteredMenus.slice(
    (currentMenuPage - 1) * MENU_PAGE_SIZE,
    currentMenuPage * MENU_PAGE_SIZE
  )
  const cartPageCount = Math.max(1, Math.ceil(cart.length / CART_PAGE_SIZE))
  const currentCartPage = Math.min(cartPage, cartPageCount)
  const visibleCart = cart.slice(
    (currentCartPage - 1) * CART_PAGE_SIZE,
    currentCartPage * CART_PAGE_SIZE
  )
  const subtotal = cartSubtotal(cart)

  useEffect(() => {
    setMenuPage(1)
  }, [category])

  useEffect(() => {
    if (cartPage > cartPageCount) setCartPage(cartPageCount)
  }, [cartPage, cartPageCount])

  function add(product: ProductRecord) {
    setCart((items) => addCartItem(items, product))
  }

  async function checkout() {
    if (cart.length === 0 || isCheckingOut) return
    setIsCheckingOut(true)
    setCheckoutError(null)
    setCheckoutSuccess(null)
    try {
      const order = await createOpenOrder(
        database,
        cart.map((item) => ({
          menuProductId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        }))
      )
      setCart([])
      setCartPage(1)
      setCheckoutSuccess(`Order ${order.orderNumber} dibuat.`)
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Gagal membuat order."
      )
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (mode === "payment") {
    return (
      <CashPayment
        database={database}
        actor={actor}
        onBack={() => setMode("sale")}
      />
    )
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section
        className="flex min-h-0 flex-col border bg-card"
        aria-label="Menu aktif"
      >
        <div className="flex shrink-0 flex-wrap gap-2 border-b p-3">
          <CategoryButton
            active={category === "all"}
            label="Semua"
            onClick={() => setCategory("all")}
          />
          {activeCategories.map((item) => (
            <CategoryButton
              key={item.id}
              active={category === item.slug}
              label={item.name}
              onClick={() => setCategory(item.slug)}
            />
          ))}
        </div>

        <LiveNotice message={error} tone="error" />
        {!ready ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Membuka katalog lokal…
          </div>
        ) : visibleMenus.length === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Belum ada menu aktif.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleMenus.map((product) => {
              const quantity =
                cart.find((item) => item.product.id === product.id)?.quantity ??
                0
              return (
                <button
                  key={product.id}
                  type="button"
                  className={cn(
                    "relative flex min-h-0 flex-col justify-between border p-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    quantity > 0 && "border-foreground bg-muted/50"
                  )}
                  onClick={() => add(product)}
                >
                  {quantity > 0 ? (
                    <span className="absolute top-2 right-2 grid size-6 place-items-center bg-foreground text-xs font-semibold text-background">
                      {quantity}
                    </span>
                  ) : null}
                  <strong className="pr-7 text-sm leading-tight sm:text-base">
                    {product.name}
                  </strong>
                  <span className="mt-2 text-sm font-medium tabular-nums">
                    {formatRupiah(product.price)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="shrink-0 border-t p-2">
          <Pagination
            page={currentMenuPage}
            pageCount={menuPageCount}
            onPage={setMenuPage}
          />
        </div>
      </section>

      <section
        className="flex min-h-0 flex-col border bg-card"
        aria-label="Cart"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBasket className="size-4" /> Cart
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {cartQuantity(cart)} item
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode("payment")}
            >
              <Banknote /> Bayar order
            </Button>
          </div>
        </div>
        {cart.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 text-center text-sm text-muted-foreground">
            Pilih menu untuk menambahkannya ke cart.
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y">
            {visibleCart.map((item) => (
              <li key={item.product.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {item.product.name}
                  </strong>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRupiah(item.product.price * item.quantity)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Kurangi ${item.product.name}`}
                  onClick={() =>
                    setCart((items) =>
                      setCartItemQuantity(
                        items,
                        item.product.id,
                        item.quantity - 1
                      )
                    )
                  }
                >
                  <Minus />
                </Button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">
                  {item.quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Tambah ${item.product.name}`}
                  onClick={() => add(item.product)}
                >
                  <Plus />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Hapus ${item.product.name}`}
                  onClick={() =>
                    setCart((items) => removeCartItem(items, item.product.id))
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="shrink-0 border-t p-2">
          <Pagination
            page={currentCartPage}
            pageCount={cartPageCount}
            onPage={setCartPage}
          />
        </div>
        <div className="shrink-0 space-y-2 border-t p-3 tabular-nums">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-lg font-semibold">
            <span>Total</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <LiveNotice message={checkoutError} tone="error" />
          <LiveNotice message={checkoutSuccess} />
          <Button
            type="button"
            className="w-full"
            disabled={cart.length === 0 || isCheckingOut}
            onClick={() => void checkout()}
          >
            {isCheckingOut ? "Membuat order…" : "Buat order"}
          </Button>
        </div>
      </section>
    </div>
  )
}

const ORDER_PAGE_SIZE = 5

function CashPayment({
  database,
  actor,
  onBack,
}: {
  database: ReturnType<typeof useProducts>["database"]
  actor: StaffRecord | null
  onBack: () => void
}) {
  const [orders, setOrders] = useState<PosOrder[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [amountText, setAmountText] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("CASH")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const next = (await loadOrders(database)).filter(
        (order) => order.status === "OPEN"
      )
      setOrders(next)
      setSelectedId((current) =>
        next.some((order) => order.id === current)
          ? current
          : (next[0]?.id ?? "")
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka order.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [database])

  const pageCount = Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleOrders = orders.slice(
    (currentPage - 1) * ORDER_PAGE_SIZE,
    currentPage * ORDER_PAGE_SIZE
  )
  const selected = orders.find((order) => order.id === selectedId)
  const amount = Number(amountText || 0)
  const change = selected ? Math.max(0, amount - selected.total) : 0
  const enough = Boolean(
    selected &&
    (method !== "CASH" || (Number.isFinite(amount) && amount >= selected.total))
  )

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function selectOrder(order: PosOrder) {
    setSelectedId(order.id)
    setAmountText("")
    setMethod("CASH")
    setNotice(null)
    setError(null)
  }

  async function confirmPayment() {
    if (!selected || !actor || !enough || paying) return
    setPaying(true)
    setError(null)
    setNotice(null)
    try {
      const payment =
        method === "CASH"
          ? await payOrderCash(database, {
              orderId: selected.id,
              amount,
              actorStaffId: actor.id,
            })
          : await payOrderNonCash(database, {
              orderId: selected.id,
              method,
              actorStaffId: actor.id,
            })
      setNotice(
        method === "CASH"
          ? `${selected.orderNumber} lunas. Kembalian ${formatRupiah(payment.change)}.`
          : `${selected.orderNumber} lunas dengan ${method}.`
      )
      setAmountText("")
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pembayaran gagal.")
      await refresh()
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(22rem,1.15fr)]">
      <section
        className="flex min-h-0 flex-col border bg-card"
        aria-label="Order terbuka"
      >
        <div className="flex shrink-0 items-center justify-between border-b p-3">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft /> Kembali
          </Button>
          <span className="text-xs text-muted-foreground">
            {orders.length} OPEN
          </span>
        </div>
        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Membuka order lokal…
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 text-center text-sm text-muted-foreground">
            Tidak ada order yang menunggu pembayaran.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 auto-rows-fr gap-2 p-3">
            {visibleOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={cn(
                  "flex items-center justify-between border px-3 py-2 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selectedId === order.id && "border-foreground bg-muted/50"
                )}
                onClick={() => selectOrder(order)}
              >
                <span>
                  <strong className="block text-sm">{order.orderNumber}</strong>
                  <span className="text-xs text-muted-foreground">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                    item
                  </span>
                </span>
                <strong className="text-sm tabular-nums">
                  {formatRupiah(order.total)}
                </strong>
              </button>
            ))}
          </div>
        )}
        <div className="shrink-0 border-t p-2">
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPage={setPage}
          />
        </div>
      </section>

      <section
        className="flex min-h-0 flex-col border bg-card p-4"
        aria-label="Pembayaran order"
      >
        {selected ? (
          <div className="flex h-full min-h-0 flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-3 text-sm">
                <span>{selected.orderNumber}</span>
                <span className="font-semibold tabular-nums">
                  Total {formatRupiah(selected.total)}
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-2"
                aria-label="Metode pembayaran"
              >
                <PaymentMethodButton
                  method="CASH"
                  selected={method}
                  onSelect={setMethod}
                />
                <PaymentMethodButton
                  method="QRIS"
                  selected={method}
                  onSelect={setMethod}
                />
                <PaymentMethodButton
                  method="CARD"
                  selected={method}
                  onSelect={setMethod}
                />
              </div>
              {method === "CASH" ? (
                <>
                  <label className="block space-y-2 text-sm font-medium">
                    <span>Uang diterima</span>
                    <Input
                      inputMode="numeric"
                      value={amountText}
                      placeholder="0"
                      onChange={(event) =>
                        setAmountText(event.target.value.replace(/\D/g, ""))
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[selected.total, 50_000, 100_000]
                      .filter(
                        (value, index, values) =>
                          values.indexOf(value) === index &&
                          value >= selected.total
                      )
                      .map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAmountText(String(value))}
                        >
                          {formatRupiah(value)}
                        </Button>
                      ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between border p-3 text-sm">
                  <span>Nominal {method}</span>
                  <strong className="tabular-nums">
                    {formatRupiah(selected.total)}
                  </strong>
                </div>
              )}
            </div>
            <div className="space-y-3 border-t pt-4">
              {method === "CASH" ? (
                <div className="flex items-center justify-between text-lg font-semibold tabular-nums">
                  <span>Kembalian</span>
                  <span>{formatRupiah(change)}</span>
                </div>
              ) : null}
              <LiveNotice message={error} tone="error" />
              <LiveNotice message={notice} />
              {!actor ? (
                <LiveNotice
                  message="Buka akses staff untuk mengonfirmasi pembayaran."
                  tone="error"
                />
              ) : null}
              <Button
                type="button"
                className="w-full"
                disabled={!enough || !actor || paying}
                onClick={() => void confirmPayment()}
              >
                {paying
                  ? "Menyimpan pembayaran…"
                  : `Konfirmasi ${method === "CARD" ? "kartu" : method.toLowerCase()}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Pilih order OPEN.
          </div>
        )}
      </section>
    </div>
  )
}

function PaymentMethodButton({
  method,
  selected,
  onSelect,
}: {
  method: PaymentMethod
  selected: PaymentMethod
  onSelect: (method: PaymentMethod) => void
}) {
  const Icon =
    method === "CASH" ? Banknote : method === "QRIS" ? QrCode : CreditCard
  const label =
    method === "CASH" ? "Tunai" : method === "CARD" ? "Kartu" : "QRIS"
  return (
    <Button
      type="button"
      variant={selected === method ? "default" : "outline"}
      className="h-auto flex-col py-3"
      onClick={() => onSelect(method)}
    >
      <Icon /> {label}
    </Button>
  )
}

function CategoryButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
