import { describe, expect, test } from "bun:test"

import {
  NAV_ITEMS,
  canSeeNavItem,
  flattenNavEntries,
  isNavBranch,
  isSidebarDefaultOpen,
  visibleNavGroups,
} from "@/lib/nav"

const manageIds = ["stock", "products", "week", "staff", "reports", "settings"] as const
const publicIds = ["kasir", "orders", "clock", "prefs", "pin"] as const

describe("visibleNavGroups", () => {
  test("label grup memakai bahasa kasir, bukan Inti/Operasi/Tim", () => {
    const titles = visibleNavGroups(["owner"]).map((group) => group.title)
    expect(titles).toEqual(["Harian", "Toko", "Karyawan", "Bisnis"])
    expect(titles).not.toContain("Inti")
    expect(titles).not.toContain("Operasi")
    expect(titles).not.toContain("Tim")
  })

  test("tanpa role, menu manage tidak tampil sama sekali", () => {
    const ids = visibleNavGroups(null).flatMap((group) =>
      flattenNavEntries(group.items).map((item) => item.id)
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
        flattenNavEntries(group.items).map((item) => item.id)
      )
      expect(ids).toEqual([...publicIds])
    }
  })

  test("owner dan manager melihat semua menu", () => {
    for (const role of ["owner", "manager"] as const) {
      const ids = visibleNavGroups([role]).flatMap((group) =>
        flattenNavEntries(group.items).map((item) => item.id)
      )
      expect(ids).toEqual(NAV_ITEMS.map((item) => item.id))
    }
  })

  test("Karyawan menampilkan Absensi, Shift & libur, dan Ubah PIN langsung", () => {
    const karyawan = visibleNavGroups(null).find((group) => group.id === "tim")
    expect(karyawan).toBeDefined()
    expect(karyawan!.title).toBe("Karyawan")
    expect(
      karyawan!.items.some((entry) => isNavBranch(entry) && entry.id === "prefs-menu")
    ).toBe(false)
    expect(karyawan!.items.some((entry) => isNavBranch(entry))).toBe(false)
    const ids = flattenNavEntries(karyawan!.items).map((item) => item.id)
    const labels = flattenNavEntries(karyawan!.items).map((item) => item.label)
    expect(ids).toEqual(["clock", "prefs", "pin"])
    expect(labels).toEqual(["Absensi", "Shift & libur", "Ubah PIN"])
    expect(labels).not.toContain("Masuk")
    expect(labels).not.toContain("Hari ini")
    expect(labels).not.toContain("Preferensi")
  })

  test("Harian tidak lagi berisi Masuk atau Hari ini", () => {
    const harian = visibleNavGroups(null).find((group) => group.id === "inti")
    expect(harian).toBeDefined()
    const ids = flattenNavEntries(harian!.items).map((item) => item.id)
    const labels = flattenNavEntries(harian!.items).map((item) => item.label)
    expect(ids).toEqual(["kasir"])
    expect(labels).not.toContain("Masuk")
    expect(labels).not.toContain("Hari ini")
    expect(labels).not.toContain("Absensi")
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

describe("isSidebarDefaultOpen", () => {
  test("tertutup di kasir dan menu, terbuka di halaman lain", () => {
    expect(isSidebarDefaultOpen("kasir")).toBe(false)
    expect(isSidebarDefaultOpen("menu")).toBe(false)
    expect(isSidebarDefaultOpen("clock")).toBe(true)
    expect(isSidebarDefaultOpen("products")).toBe(true)
    expect(isSidebarDefaultOpen("pin")).toBe(true)
    expect(isSidebarDefaultOpen("prefs")).toBe(true)
  })
})
