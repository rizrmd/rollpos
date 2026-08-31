import { describe, expect, test } from "bun:test"
import { stockStatus } from "./inventory"

describe("status saldo inventory", () => {
  test("membedakan kosong, rendah, dan aman", () => {
    expect(stockStatus({ balance: 0, minimumStock: 2 })).toBe("OUT OF STOCK")
    expect(stockStatus({ balance: 2, minimumStock: 2 })).toBe("LOW")
    expect(stockStatus({ balance: 4, minimumStock: 2 })).toBe("OK")
  })
})
