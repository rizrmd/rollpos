import type { PosOrder } from "@/db/orders"
import { formatRupiah } from "./format"

export const receiptTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
})

export const paymentMethodNames = { CASH: "Tunai", QRIS: "QRIS", CARD: "Kartu" }

/** Snapshot prices already include modifiers; never add their prices again. */
export function receiptLines(order: PosOrder) {
  return order.items.flatMap((item) => [
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
      description: `Termasuk per item · ${item.name}`,
      amount: formatRupiah(modifier.additionalPrice),
      modifier: true,
    })),
  ])
}
