import { describe, expect, test } from "bun:test"
import { validateReceive } from "./types"

const valid = {
  inventoryItemId: "item-1",
  quantity: 2,
  unit: "kg",
  receivedDate: "2026-09-01",
  expiryDate: "2026-09-10",
  actorStaffId: "staff-1",
}

describe("validasi penerimaan stok", () => {
  test("menerima input yang valid", () =>
    expect(validateReceive(valid)).toEqual(valid))
  test("menolak quantity <= 0", () =>
    expect(() => validateReceive({ ...valid, quantity: 0 })).toThrow(
      "lebih dari 0"
    ))
  test("menolak expiry sebelum tanggal terima", () =>
    expect(() =>
      validateReceive({ ...valid, expiryDate: "2026-08-31" })
    ).toThrow("tidak boleh sebelum"))
  test("menolak unit yang tidak didukung", () =>
    expect(() => validateReceive({ ...valid, unit: "box" })).toThrow(
      "Unit tidak valid"
    ))
})
