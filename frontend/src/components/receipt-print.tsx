import type { PosOrder } from "@/db/orders"
import { formatRupiah } from "@/lib/format"
import { paymentMethodNames, receiptLines, receiptTime } from "@/lib/receipt"

/** Mounted directly under body, independent of screen pagination and app layout. */
export function ReceiptPrint({ order }: { order: PosOrder }) {
  if (order.status !== "PAID") return null
  const payment = order.payment
  return (
    <article
      className="receipt-print"
      aria-label={`Struk ${order.orderNumber}`}
    >
      <dl>
        <Entry label="Nomor order" value={order.orderNumber} />
        <Entry label="Status" value="PAID" />
        <Entry
          label="Waktu bayar (WIB)"
          value={
            payment ? receiptTime.format(payment.paidAt) : "Tidak tercatat"
          }
        />
      </dl>
      <ul aria-label="Item struk">
        {receiptLines(order).map((line) => (
          <li key={line.id} className={line.modifier ? "receipt-modifier" : ""}>
            <div className="receipt-line">
              <span>
                {line.modifier ? "+ " : ""}
                {line.name}
              </span>
              <span>{line.amount}</span>
            </div>
            <small>{line.description}</small>
          </li>
        ))}
      </ul>
      <dl className="receipt-totals">
        <Entry label="Subtotal" value={formatRupiah(order.subtotal)} />
        <Entry label="Total" value={formatRupiah(order.total)} />
        <Entry
          label="Metode pembayaran"
          value={
            payment
              ? (paymentMethodNames[payment.method] ?? payment.method)
              : "Tidak tercatat"
          }
        />
        {payment?.method === "CASH" ? (
          <>
            <Entry label="Uang diterima" value={formatRupiah(payment.amount)} />
            <Entry label="Kembalian" value={formatRupiah(payment.change)} />
          </>
        ) : null}
      </dl>
    </article>
  )
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-line">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
