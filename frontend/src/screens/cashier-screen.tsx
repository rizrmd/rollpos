import { useEffect, useMemo, useState } from "react"
import { Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
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
import type { ProductRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const MENU_PAGE_SIZE = 8
const CART_PAGE_SIZE = 4

export function CashierScreen() {
  const { products, categories, ready, error } = useProducts()
  const [category, setCategory] = useState("all")
  const [menuPage, setMenuPage] = useState(1)
  const [cartPage, setCartPage] = useState(1)
  const [cart, setCart] = useState<CartItem[]>([])

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
          <span className="text-xs text-muted-foreground">
            {cartQuantity(cart)} item
          </span>
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
        </div>
      </section>
    </div>
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
