import type { Sql } from "../db/client"
import { validateReceive, ValidationError, type ReceiveInput } from "./types"

const inventorySelect = `
  SELECT i.id, i.name, i.sku, i.base_unit AS "baseUnit", i.minimum_stock::float8 AS "minimumStock",
    i.is_active AS "isActive", COALESCE(SUM(m.quantity), 0)::float8 AS balance
  FROM inventory_items i LEFT JOIN inventory_stock_movements m ON m.inventory_item_id = i.id`

export class InventoryRepository {
  constructor(private readonly sql: Sql) {}

  list() {
    return this.sql.unsafe(`${inventorySelect} GROUP BY i.id ORDER BY i.name`)
  }

  async get(id: string) {
    const rows = await this.sql.unsafe(
      `${inventorySelect} WHERE i.id = $1 GROUP BY i.id`,
      [id]
    )
    return rows[0] ?? null
  }

  lots(id: string) {
    return this.sql`
      SELECT id, inventory_item_id AS "inventoryItemId", lot_code AS "lotCode",
        received_quantity::float8 AS "receivedQuantity", remaining_quantity::float8 AS "remainingQuantity",
        base_unit AS "baseUnit", received_at::text AS "receivedAt", expiry_date::text AS "expiryDate",
        container_code AS "containerCode", notes, created_at AS "createdAt"
      FROM inventory_lots WHERE inventory_item_id = ${id} ORDER BY received_at DESC, created_at DESC`
  }

  async receive(raw: ReceiveInput) {
    const input = validateReceive(raw)
    return this.sql.begin(async (tx) => {
      const [item] = await tx<
        { id: string; base_unit: string; is_active: boolean }[]
      >`
        SELECT id, base_unit, is_active FROM inventory_items WHERE id = ${input.inventoryItemId} FOR UPDATE`
      if (!item) throw new ValidationError("Inventory item tidak ditemukan.")
      if (!item.is_active)
        throw new ValidationError(
          "Inventory item nonaktif tidak dapat menerima stok."
        )
      if (item.base_unit !== input.unit)
        throw new ValidationError(
          `Unit harus ${item.base_unit}. Konversi unit belum tersedia.`
        )
      const [lot] = await tx<{ id: string }[]>`
        INSERT INTO inventory_lots (inventory_item_id, lot_code, received_quantity, remaining_quantity,
          base_unit, received_at, expiry_date, container_code, notes)
        VALUES (${item.id}, ${input.lotCode?.trim() || null}, ${input.quantity}, ${input.quantity},
          ${input.unit}, ${input.receivedDate}, ${input.expiryDate || null}, ${input.containerCode?.trim() || null}, ${input.notes?.trim() || null})
        RETURNING id`
      if (!lot) throw new Error("Lot gagal dibuat.")
      await tx`INSERT INTO inventory_stock_movements (inventory_item_id, inventory_lot_id, movement_type,
        quantity, unit, reference_type, reference_id, reason, actor_staff_id)
        VALUES (${item.id}, ${lot.id}, 'RECEIVE', ${input.quantity}, ${input.unit}, 'INVENTORY_RECEIPT',
          ${lot.id}, ${input.notes?.trim() || null}, ${input.actorStaffId})`
      return { lotId: lot.id, inventoryItemId: item.id }
    })
  }
}
