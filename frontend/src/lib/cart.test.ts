import { describe, expect, test } from "bun:test"

import {
  addCartItem,
  cartQuantity,
  cartSubtotal,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart"
import type { ProductRecord } from "@/lib/types"

const americano: ProductRecord = {
  id: "americano",
  name: "Americano",
  sku: "RNB-AME",
  price: 22_000,
  stock: 0,
  kind: "menu",
  category: "minuman",
  unit: "porsi",
  note: "",
  isActive: true,
  lowStock: 0,
  createdAt: 1,
  updatedAt: 1,
}

describe("cart", () => {
  test("menambah menu baru dan quantity menu yang sama", () => {
    const first = addCartItem([], americano)
    const second = addCartItem(first, americano)

    expect(second).toHaveLength(1)
    expect(second[0]?.quantity).toBe(2)
    expect(cartQuantity(second)).toBe(2)
    expect(cartSubtotal(second)).toBe(44_000)
  })

  test("mengubah quantity dan menghapus item ketika quantity nol", () => {
    const cart = addCartItem([], americano)
    expect(setCartItemQuantity(cart, americano.id, 3)[0]?.quantity).toBe(3)
    expect(setCartItemQuantity(cart, americano.id, 0)).toEqual([])
  })

  test("menghapus item berdasarkan product id", () => {
    expect(removeCartItem(addCartItem([], americano), americano.id)).toEqual([])
  })
})
