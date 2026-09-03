import type { ProductRecord } from "@/lib/types"

export type CartModifierSnapshot = {
  id: string
  name: string
  additionalPrice: number
}

export type CartItem = {
  id: string
  product: ProductRecord
  modifiers: CartModifierSnapshot[]
  quantity: number
}

function snapshotModifiers(
  modifiers: readonly CartModifierSnapshot[]
): CartModifierSnapshot[] {
  return [...modifiers]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, name, additionalPrice }) => ({ id, name, additionalPrice }))
}

export function cartItemId(
  productId: string,
  modifiers: readonly Pick<CartModifierSnapshot, "id">[] = []
): string {
  return [productId, ...modifiers.map((modifier) => modifier.id).sort()].join(
    "::"
  )
}

export function cartItemUnitPrice(item: CartItem): number {
  return (
    item.product.price +
    item.modifiers.reduce(
      (total, modifier) => total + modifier.additionalPrice,
      0
    )
  )
}

export function addCartItem(
  items: readonly CartItem[],
  product: ProductRecord,
  selectedModifiers: readonly CartModifierSnapshot[] = []
): CartItem[] {
  const modifiers = snapshotModifiers(selectedModifiers)
  const id = cartItemId(product.id, modifiers)
  const existing = items.find((item) => item.id === id)
  if (!existing) return [...items, { id, product, modifiers, quantity: 1 }]
  return items.map((item) =>
    item.id === id
      ? { ...item, product, modifiers, quantity: item.quantity + 1 }
      : item
  )
}

export function setCartItemQuantity(
  items: readonly CartItem[],
  itemId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) return removeCartItem(items, itemId)
  return items.map((item) =>
    item.id === itemId ? { ...item, quantity } : item
  )
}

export function removeCartItem(
  items: readonly CartItem[],
  itemId: string
): CartItem[] {
  return items.filter((item) => item.id !== itemId)
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return items.reduce(
    (total, item) => total + cartItemUnitPrice(item) * item.quantity,
    0
  )
}

export function cartQuantity(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0)
}
