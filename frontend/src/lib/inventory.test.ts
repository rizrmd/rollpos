import { describe, expect, test } from "bun:test"
import { expiryStatus, stockStatus } from "./inventory"

describe("status saldo inventory", () => {
  test("membedakan kosong, rendah, dan aman", () => {
    expect(stockStatus({ balance: 0, minimumStock: 2 })).toBe("OUT OF STOCK")
    expect(stockStatus({ balance: 2, minimumStock: 2 })).toBe("LOW")
    expect(stockStatus({ balance: 4, minimumStock: 2 })).toBe("OK")
  })
})

describe("status expiry lot inventory", () => {
  const currentDate = "2026-09-01"

  test("menandai lot tanpa expiry", () => {
    expect(expiryStatus(null, currentDate)).toBe("NO EXPIRY")
  })

  test("menandai lot yang sudah kedaluwarsa", () => {
    expect(expiryStatus("2026-08-31", currentDate)).toBe("EXPIRED")
  })

  test("menandai expiry hari ini sampai tepat tujuh hari lagi", () => {
    expect(expiryStatus("2026-09-01", currentDate)).toBe("EXPIRING SOON")
    expect(expiryStatus("2026-09-08", currentDate)).toBe("EXPIRING SOON")
  })

  test("menandai expiry lebih dari tujuh hari sebagai aman", () => {
    expect(expiryStatus("2026-09-09", currentDate)).toBe("OK")
  })
})
