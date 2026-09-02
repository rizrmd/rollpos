import type { ProductRecord } from "@/lib/types"

export type CartItem = {
  product: ProductRecord
  quantity: number
}

export function addCartItem(
  items: readonly CartItem[],
  product: ProductRecord
): CartItem[] {
  const existing = items.find((item) => item.product.id === product.id)
  if (!existing) return [...items, { product, quantity: 1 }]
  return items.map((item) =>
    item.product.id === product.id
      ? { ...item, product, quantity: item.quantity + 1 }
      : item
  )
}

export function setCartItemQuantity(
  items: readonly CartItem[],
  productId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) return removeCartItem(items, productId)
  return items.map((item) =>
    item.product.id === productId ? { ...item, quantity } : item
  )
}

export function removeCartItem(
  items: readonly CartItem[],
  productId: string
): CartItem[] {
  return items.filter((item) => item.product.id !== productId)
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return items.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  )
}

export function cartQuantity(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}
