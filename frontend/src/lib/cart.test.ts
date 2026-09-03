import { describe, expect, test } from "bun:test"

import {
  addCartItem,
  cartItemUnitPrice,
  cartQuantity,
  cartSubtotal,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart"
import type { ModifierRecord, ProductRecord } from "@/lib/types"

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

const extraShot: ModifierRecord = {
  id: "extra-shot",
  name: "Extra Shot",
  additionalPrice: 6_000,
  isActive: true,
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
    expect(setCartItemQuantity(cart, cart[0]!.id, 3)[0]?.quantity).toBe(3)
    expect(setCartItemQuantity(cart, cart[0]!.id, 0)).toEqual([])
  })

  test("menghapus item berdasarkan product id", () => {
    const cart = addCartItem([], americano)
    expect(removeCartItem(cart, cart[0]!.id)).toEqual([])
  })

  test("memisahkan kombinasi modifier dan menyimpan snapshot harga", () => {
    const withoutModifier = addCartItem([], americano)
    const cart = addCartItem(withoutModifier, americano, [extraShot])

    expect(cart).toHaveLength(2)
    expect(cart[1]?.modifiers).toEqual([
      { id: "extra-shot", name: "Extra Shot", additionalPrice: 6_000 },
    ])
    expect(cartItemUnitPrice(cart[1]!)).toBe(28_000)
    expect(cartSubtotal(cart)).toBe(50_000)

    extraShot.name = "Double Shot"
    extraShot.additionalPrice = 10_000
    expect(cart[1]?.modifiers[0]).toEqual({
      id: "extra-shot",
      name: "Extra Shot",
      additionalPrice: 6_000,
    })
  })
})
