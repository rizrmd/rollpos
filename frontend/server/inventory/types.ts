export const INVENTORY_UNITS = ["g", "kg", "ml", "l", "pcs"] as const
export type InventoryUnit = (typeof INVENTORY_UNITS)[number]

export type ReceiveInput = {
  inventoryItemId: string
  quantity: number
  unit: string
  receivedDate: string
  expiryDate?: string | null
  lotCode?: string | null
  containerCode?: string | null
  notes?: string | null
  actorStaffId: string
}

export class ValidationError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateReceive(input: ReceiveInput): ReceiveInput {
  if (!input.inventoryItemId?.trim())
    throw new ValidationError("Inventory item wajib dipilih.")
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new ValidationError("Quantity harus lebih dari 0.")
  if (!INVENTORY_UNITS.includes(input.unit as InventoryUnit))
    throw new ValidationError("Unit tidak valid.")
  if (
    !ISO_DATE.test(input.receivedDate) ||
    Number.isNaN(Date.parse(`${input.receivedDate}T00:00:00Z`))
  )
    throw new ValidationError("Received Date harus berupa tanggal yang valid.")
  if (
    input.expiryDate &&
    (!ISO_DATE.test(input.expiryDate) ||
      Number.isNaN(Date.parse(`${input.expiryDate}T00:00:00Z`)))
  )
    throw new ValidationError("Expiry Date harus berupa tanggal yang valid.")
  if (input.expiryDate && input.expiryDate < input.receivedDate)
    throw new ValidationError("Expiry Date tidak boleh sebelum Received Date.")
  if (!input.actorStaffId?.trim())
    throw new ValidationError("Staff penerima wajib teridentifikasi.")
  return input
}
