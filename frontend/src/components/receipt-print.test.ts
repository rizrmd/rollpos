import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRollposDatabase, TABLES } from "@/db/database"
import { loadOrderHistory } from "@/db/order-history"
import { createOpenOrder, payOrderNonCash, type PosOrder } from "@/db/orders"
import { formatRupiah } from "@/lib/format"
import { receiptLines } from "@/lib/receipt"
import { ReceiptPrint } from "./receipt-print"

const order: PosOrder = {
  id: "order-20",
  orderNumber: "ORD-20260905-020",
  status: "PAID",
  createdAt: 1788570000000,
  subtotal: 56000,
  total: 54000,
  items: [
    {
      id: "item-1",
      menuProductId: "latte",
      name: "Cafe Latte",
      quantity: 2,
      price: 28000,
      subtotal: 56000,
      modifiers: [{ id: "shot", name: "Extra Shot", additionalPrice: 6000 }],
    },
  ],
  payment: {
    id: "payment-20",
    orderId: "order-20",
    method: "CASH",
    amount: 60000,
    change: 6000,
    actorStaffId: "rani",
    paidAt: Date.parse("2026-09-05T04:00:00Z"),
  },
}
const render = (value: PosOrder) =>
  renderToStaticMarkup(createElement(ReceiptPrint, { order: value }))

describe("receipt order PAID", () => {
  test("tunai menampilkan snapshot lengkap tanpa menghitung ulang modifier atau total", () => {
    const before = JSON.stringify(order)
    const html = render(order)
    for (const value of [
      order.orderNumber,
      "PAID",
      "5 Sep 2026",
      "11.00",
      "WIB",
      "Cafe Latte",
      "Extra Shot",
      "2 ×",
      "Subtotal",
      "Total",
      "Tunai",
      "Uang diterima",
      "Kembalian",
      ...[28000, 56000, 54000, 60000, 6000].map(formatRupiah),
    ]) {
      expect(html).toContain(value)
    }
    expect(JSON.stringify(order)).toBe(before)
    expect(receiptLines(order)).toHaveLength(2)
    expect(receiptLines(order)[0].amount).toBe(formatRupiah(56000))
  })

  test.each(["QRIS", "CARD"] as const)(
    "%s tidak menampilkan uang tunai dan kembalian",
    (method) => {
      const html = render({ ...order, payment: { ...order.payment!, method } })
      expect(html).toContain(method === "CARD" ? "Kartu" : "QRIS")
      expect(html).not.toContain("Uang diterima")
      expect(html).not.toContain("Kembalian")
    }
  )

  test("OPEN tidak memiliki receipt; PAID lama tanpa payment tidak mengarang data", () => {
    expect(render({ ...order, status: "OPEN" })).toBe("")
    const html = render({ ...order, payment: undefined })
    expect(html).toContain("Tidak tercatat")
    expect(html).not.toContain("Uang diterima")
  })

  test("cetakan mencakup seluruh baris meskipun melebihi kapasitas layar dan mengescape nama", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      ...order.items[0],
      id: `item-${i}`,
      name: `Latte ${i} <script>alert(1)</script>`,
    }))
    const html = render({ ...order, items })
    expect(html.match(/<li /g)).toHaveLength(80)
    expect(html).toContain("Latte 39 &lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(
      render({ ...order, items: [{ ...order.items[0], modifiers: undefined }] })
    ).toContain("Cafe Latte")
  })

  test("membaca snapshot lokal sesudah katalog berubah; render berulang tidak memutasi database", async () => {
    const db = createRollposDatabase({ inMemory: true })
    const open = await createOpenOrder(db, order.items)
    await payOrderNonCash(db, {
      orderId: open.id,
      method: "QRIS",
      actorStaffId: "rani",
      paidAt: order.payment!.paidAt,
    })
    db.store.setRow(TABLES.menuProducts, "latte", {
      name: "Harga baru",
      price: 99000,
    })
    const before = db.store.getJson()
    const [paid] = await loadOrderHistory(db)
    const html = render(paid)
    expect(html).toContain("Cafe Latte")
    expect(html).toContain("Extra Shot")
    expect(html).toContain(formatRupiah(56000))
    expect(html).not.toContain("Harga baru")
    expect(render(paid)).toBe(html)
    expect(db.store.getJson()).toBe(before)
  })
})
