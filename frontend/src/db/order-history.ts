import { cellStr, listRows, TABLES, type Database } from "./database"
import { loadOrders, type PosOrder } from "./orders"

export type HistoryOrder = PosOrder & { staffName: string }

/** Read-only projection: item names/prices come from the sale snapshot. */
export async function loadOrderHistory(
  database: Database
): Promise<HistoryOrder[]> {
  const orders = await loadOrders(database)
  const staff = new Map(
    listRows(database, TABLES.staffMembers).map((row) => [
      row.id,
      cellStr(row, "name"),
    ])
  )
  return orders
    .filter((order) => order.status === "PAID")
    .map((order) => ({
      ...order,
      staffName:
        staff.get(order.payment?.actorStaffId ?? "") ||
        (order.payment?.actorStaffId
          ? `Staff ${order.payment.actorStaffId}`
          : "Tidak tercatat"),
    }))
    .sort(
      (a, b) =>
        (b.payment?.paidAt ?? b.createdAt) -
          (a.payment?.paidAt ?? a.createdAt) || a.id.localeCompare(b.id)
    )
}

export function historyPage<T>(
  rows: readonly T[],
  requested: number,
  size: number
) {
  const pageSize = Math.max(1, Math.floor(size) || 1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.floor(requested) || 1))
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
  }
}

export function historyCapacity(height: number, rowHeight: number) {
  return Math.max(1, Math.floor(height / rowHeight))
}
