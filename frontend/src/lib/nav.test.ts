import { describe, expect, test } from "bun:test"

import {
  NAV_ITEMS,
  canSeeNavItem,
  visibleNavGroups,
} from "@/lib/nav"

const manageIds = ["stock", "products", "week", "staff", "reports", "settings"] as const
const publicIds = ["kasir", "clock", "today", "orders", "prefs"] as const

describe("visibleNavGroups", () => {
  test("tanpa role, menu manage tidak tampil sama sekali", () => {
    const ids = visibleNavGroups(null).flatMap((group) =>
      group.items.map((item) => item.id)
    )
    expect(ids).toEqual([...publicIds])
    for (const id of manageIds) {
      expect(ids).not.toContain(id)
    }
    expect(visibleNavGroups(null).some((group) => group.id === "bisnis")).toBe(
      false
    )
  })

  test("kasir/barista/kitchen tidak melihat menu manage", () => {
    for (const role of ["kasir", "barista", "kitchen"] as const) {
      const ids = visibleNavGroups([role]).flatMap((group) =>
        group.items.map((item) => item.id)
      )
      expect(ids).toEqual([...publicIds])
    }
  })

  test("owner dan manager melihat semua menu", () => {
    for (const role of ["owner", "manager"] as const) {
      const ids = visibleNavGroups([role]).flatMap((group) =>
        group.items.map((item) => item.id)
      )
      expect(ids).toEqual(NAV_ITEMS.map((item) => item.id))
    }
  })

  test("canSeeNavItem mengikuti access item", () => {
    const stock = NAV_ITEMS.find((item) => item.id === "stock")
    const products = NAV_ITEMS.find((item) => item.id === "products")
    const kasir = NAV_ITEMS.find((item) => item.id === "kasir")
    expect(stock).toBeDefined()
    expect(products).toBeDefined()
    expect(kasir).toBeDefined()
    expect(canSeeNavItem(stock!, null)).toBe(false)
    expect(canSeeNavItem(stock!, ["kasir"])).toBe(false)
    expect(canSeeNavItem(stock!, ["manager"])).toBe(true)
    expect(canSeeNavItem(products!, null)).toBe(false)
    expect(canSeeNavItem(products!, ["kasir"])).toBe(false)
    expect(canSeeNavItem(products!, ["owner"])).toBe(true)
    expect(canSeeNavItem(kasir!, null)).toBe(true)
    expect(canSeeNavItem(kasir!, ["kitchen"])).toBe(true)
  })
})
