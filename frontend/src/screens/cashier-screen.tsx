import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
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
import {
  closeDrawerSession,
  getDrawerExpectedCash,
  loadOpenDrawerSession,
  openDrawerSession,
  type DrawerSession,
} from "@/db/drawers"
import { loadMenuModifiers, loadModifiers } from "@/db/modifiers"
import { useProducts } from "@/hooks/use-products"
import {
  addCartItem,
  cartQuantity,
  cartItemUnitPrice,
  cartSubtotal,
  removeCartItem,
  setCartItemQuantity,
  type CartItem,
} from "@/lib/cart"
import { sortCatalog, sortMenuCategories } from "@/lib/catalog"
import { formatRupiah } from "@/lib/format"
import type {
  MenuModifierRecord,
  ModifierRecord,
  ProductRecord,
  StaffRecord,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const MENU_PAGE_SIZE = 8
const CART_PAGE_SIZE = 4
const MODIFIER_PAGE_SIZE = 8

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
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([])
  const [menuModifiers, setMenuModifiers] = useState<MenuModifierRecord[]>([])
  const [selectedMenu, setSelectedMenu] = useState<ProductRecord | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [modifierPage, setModifierPage] = useState(1)

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
  const availableModifiers = useMemo(() => {
    if (!selectedMenu) return []
    const linkedIds = new Set(
      menuModifiers
        .filter((link) => link.menuProductId === selectedMenu.id)
        .map((link) => link.modifierId)
    )
    return modifiers.filter(
      (modifier) => modifier.isActive && linkedIds.has(modifier.id)
    )
  }, [menuModifiers, modifiers, selectedMenu])
  const modifierPageCount = Math.max(
    1,
    Math.ceil(availableModifiers.length / MODIFIER_PAGE_SIZE)
  )
  const visibleModifiers = availableModifiers.slice(
    (modifierPage - 1) * MODIFIER_PAGE_SIZE,
    modifierPage * MODIFIER_PAGE_SIZE
  )

  useEffect(() => {
    setMenuPage(1)
  }, [category])

  useEffect(() => {
    if (cartPage > cartPageCount) setCartPage(cartPageCount)
  }, [cartPage, cartPageCount])

  useEffect(() => {
    if (!ready) return
    let active = true
    void Promise.all([loadModifiers(database), loadMenuModifiers(database)])
      .then(([nextModifiers, nextLinks]) => {
        if (!active) return
        setModifiers(nextModifiers)
        setMenuModifiers(nextLinks)
      })
      .catch((err) => {
        if (active) {
          setCheckoutError(
            err instanceof Error ? err.message : "Gagal membuka modifier."
          )
        }
      })
    return () => {
      active = false
    }
  }, [database, ready])

  function chooseMenu(product: ProductRecord) {
    const linkedIds = new Set(
      menuModifiers
        .filter((link) => link.menuProductId === product.id)
        .map((link) => link.modifierId)
    )
    if (!modifiers.some((item) => item.isActive && linkedIds.has(item.id))) {
      setCart((items) => addCartItem(items, product))
      return
    }
    setSelectedMenu(product)
    setSelectedModifierIds([])
    setModifierPage(1)
  }

  function addSelectedMenu() {
    if (!selectedMenu) return
    const selected = availableModifiers.filter((modifier) =>
      selectedModifierIds.includes(modifier.id)
    )
    setCart((items) => addCartItem(items, selectedMenu, selected))
    setSelectedMenu(null)
    setSelectedModifierIds([])
    setModifierPage(1)
  }

  function addExisting(item: CartItem) {
    setCart((items) => addCartItem(items, item.product, item.modifiers))
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
          price: cartItemUnitPrice(item),
          modifiers: item.modifiers,
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
        ) : selectedMenu ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedMenu(null)}
              >
                <ArrowLeft /> Kembali
              </Button>
              <strong className="text-sm">{selectedMenu.name}</strong>
              <span className="text-sm font-medium tabular-nums">
                {formatRupiah(
                  selectedMenu.price +
                    availableModifiers
                      .filter((item) => selectedModifierIds.includes(item.id))
                      .reduce((sum, item) => sum + item.additionalPrice, 0)
                )}
              </span>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleModifiers.map((modifier) => {
                const selected = selectedModifierIds.includes(modifier.id)
                return (
                  <button
                    key={modifier.id}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-0 flex-col justify-between border p-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      selected && "border-foreground bg-muted/50"
                    )}
                    onClick={() =>
                      setSelectedModifierIds((ids) =>
                        selected
                          ? ids.filter((id) => id !== modifier.id)
                          : [...ids, modifier.id]
                      )
                    }
                  >
                    <strong className="text-sm leading-tight">
                      {modifier.name}
                    </strong>
                    <span className="mt-2 text-sm tabular-nums">
                      +{formatRupiah(modifier.additionalPrice)}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 border-t p-2">
              <Pagination
                page={modifierPage}
                pageCount={modifierPageCount}
                onPage={setModifierPage}
              />
              <Button type="button" onClick={addSelectedMenu}>
                <Plus /> Tambah
              </Button>
            </div>
          </div>
        ) : visibleMenus.length === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Belum ada menu aktif.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleMenus.map((product) => {
              const quantity = cart
                .filter((item) => item.product.id === product.id)
                .reduce((sum, item) => sum + item.quantity, 0)
              return (
                <button
                  key={product.id}
                  type="button"
                  className={cn(
                    "relative flex min-h-0 flex-col justify-between border p-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    quantity > 0 && "border-foreground bg-muted/50"
                  )}
                  onClick={() => chooseMenu(product)}
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
        {!selectedMenu ? (
          <div className="shrink-0 border-t p-2">
            <Pagination
              page={currentMenuPage}
              pageCount={menuPageCount}
              onPage={setMenuPage}
            />
          </div>
        ) : null}
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
              <li key={item.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {item.product.name}
                  </strong>
                  {item.modifiers.length > 0 ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.modifiers
                        .map((modifier) => modifier.name)
                        .join(", ")}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRupiah(cartItemUnitPrice(item) * item.quantity)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Kurangi ${item.product.name}`}
                  onClick={() =>
                    setCart((items) =>
                      setCartItemQuantity(items, item.id, item.quantity - 1)
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
                  onClick={() => addExisting(item)}
                >
                  <Plus />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Hapus ${item.product.name}`}
                  onClick={() =>
                    setCart((items) => removeCartItem(items, item.id))
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
  const [drawer, setDrawer] = useState<DrawerSession | undefined>()
  const [openingDrawer, setOpeningDrawer] = useState(false)
  const [closingDrawer, setClosingDrawer] = useState(false)
  const [expectedCash, setExpectedCash] = useState(0)
  const [cashCountText, setCashCountText] = useState("")
  const [savingClosing, setSavingClosing] = useState(false)

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

  useEffect(() => {
    let active = true
    void loadOpenDrawerSession(database, actor?.id ?? "").then((session) => {
      if (active) setDrawer(session)
    })
    return () => {
      active = false
    }
  }, [actor?.id, database])

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

  async function openDrawer() {
    if (!actor || openingDrawer || drawer) return
    setOpeningDrawer(true)
    setError(null)
    setNotice(null)
    try {
      const session = await openDrawerSession(database, {
        actorStaffId: actor.id,
      })
      setDrawer(session)
      setNotice(`Laci ${actor.nickname || actor.name} dibuka.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka laci.")
      setDrawer(await loadOpenDrawerSession(database, actor.id))
    } finally {
      setOpeningDrawer(false)
    }
  }

  async function prepareClosing() {
    if (!drawer || closingDrawer) return
    setError(null)
    setNotice(null)
    try {
      setExpectedCash(await getDrawerExpectedCash(database, drawer.id))
      setCashCountText("")
      setClosingDrawer(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca saldo laci.")
    }
  }

  async function confirmClosing() {
    if (!drawer || savingClosing || cashCountText === "") return
    setSavingClosing(true)
    setError(null)
    setNotice(null)
    try {
      const closed = await closeDrawerSession(database, {
        sessionId: drawer.id,
        actualCash: Number(cashCountText),
      })
      setDrawer(undefined)
      setClosingDrawer(false)
      setCashCountText("")
      setNotice(
        `Laci ditutup. Selisih ${formatRupiah(closed.discrepancy ?? 0)}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menutup laci.")
      setDrawer(
        actor ? await loadOpenDrawerSession(database, actor.id) : undefined
      )
    } finally {
      setSavingClosing(false)
    }
  }

  const actualCash = Number(cashCountText || 0)
  const discrepancy = actualCash - expectedCash

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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {orders.length} OPEN
            </span>
            <Button
              type="button"
              variant={drawer ? "secondary" : "outline"}
              size="sm"
              disabled={!actor || openingDrawer || savingClosing}
              onClick={() => void (drawer ? prepareClosing() : openDrawer())}
            >
              <BriefcaseBusiness />
              {drawer ? "Tutup Laci" : openingDrawer ? "Membuka…" : "Buka Laci"}
            </Button>
          </div>
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
        {closingDrawer && drawer ? (
          <div className="flex h-full min-h-0 flex-col justify-between gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border p-3">
                <span className="block text-xs text-muted-foreground">
                  Expected cash
                </span>
                <strong className="mt-1 block text-lg tabular-nums">
                  {formatRupiah(expectedCash)}
                </strong>
              </div>
              <div className="border p-3">
                <span className="block text-xs text-muted-foreground">
                  Actual cash
                </span>
                <strong className="mt-1 block text-lg tabular-nums">
                  {formatRupiah(actualCash)}
                </strong>
              </div>
              <label className="col-span-2 block space-y-2 text-sm font-medium">
                <span>Cash count</span>
                <Input
                  autoFocus
                  inputMode="numeric"
                  value={cashCountText}
                  placeholder="0"
                  onChange={(event) =>
                    setCashCountText(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              <div className="col-span-2 flex items-center justify-between border p-3">
                <span className="text-sm text-muted-foreground">
                  Discrepancy
                </span>
                <strong
                  className={cn(
                    "text-lg tabular-nums",
                    discrepancy < 0 && "text-destructive"
                  )}
                >
                  {discrepancy > 0 ? "+" : ""}
                  {formatRupiah(discrepancy)}
                </strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={savingClosing}
                onClick={() => {
                  setClosingDrawer(false)
                  setCashCountText("")
                }}
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={cashCountText === "" || savingClosing}
                onClick={() => void confirmClosing()}
              >
                {savingClosing ? "Menyimpan…" : "Simpan closing"}
              </Button>
              <div className="col-span-2">
                <LiveNotice message={error} tone="error" />
              </div>
            </div>
          </div>
        ) : selected ? (
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
              {actor && method === "CASH" && !drawer ? (
                <LiveNotice
                  message="Buka laci sebelum menerima pembayaran tunai."
                  tone="error"
                />
              ) : null}
              <Button
                type="button"
                className="w-full"
                disabled={
                  !enough || !actor || paying || (method === "CASH" && !drawer)
                }
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
