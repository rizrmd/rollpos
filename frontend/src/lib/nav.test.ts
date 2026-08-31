import { describe, expect, test } from "bun:test"

import {
  NAV_ITEMS,
  PAGE_PATH,
  canSeeNavItem,
  flattenNavEntries,
  isNavBranch,
  isSidebarDefaultOpen,
  normalizePath,
  pageFromPath,
  pageTitle,
  pathForPage,
  shouldHandleInAppClick,
  visibleNavGroups,
} from "@/lib/nav"

const visibleManageIds = [
  "stock",
  "products",
  "week",
  "staff",
  "reports",
  "settings",
] as const
const manageIds = ["prefs", ...visibleManageIds] as const
const publicIds = ["kasir", "orders", "kitchen", "clock", "pin"] as const

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

  test("owner dan manager hanya melihat Jadwal tanpa menu Shift Kerja", () => {
    for (const role of ["owner", "manager"] as const) {
      const ids = visibleNavGroups([role]).flatMap((group) =>
        flattenNavEntries(group.items).map((item) => item.id)
      )
      expect(ids).toEqual(
        NAV_ITEMS.filter((item) => item.id !== "prefs").map((item) => item.id)
      )
      expect(ids).toContain("week")
      expect(ids).not.toContain("prefs")
    }
  })

  test("Karyawan hanya menampilkan Absensi dan Ubah PIN langsung", () => {
    const karyawan = visibleNavGroups(null).find((group) => group.id === "tim")
    expect(karyawan).toBeDefined()
    expect(karyawan!.title).toBe("Karyawan")
    expect(
      karyawan!.items.some(
        (entry) => isNavBranch(entry) && entry.id === "prefs-menu"
      )
    ).toBe(false)
    expect(karyawan!.items.some((entry) => isNavBranch(entry))).toBe(false)
    const ids = flattenNavEntries(karyawan!.items).map((item) => item.id)
    const labels = flattenNavEntries(karyawan!.items).map((item) => item.label)
    expect(ids).toEqual(["clock", "pin"])
    expect(labels).toEqual(["Absensi", "Ubah PIN"])
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

describe("path per screen", () => {
  test("setiap screen punya path unik", () => {
    const paths = Object.values(PAGE_PATH)
    expect(new Set(paths).size).toBe(paths.length)
    expect(PAGE_PATH.menu).toBe("/")
    expect(PAGE_PATH.kasir).toBe("/kasir")
    expect(PAGE_PATH.clock).toBe("/absensi")
    expect(PAGE_PATH.orders).toBe("/pesanan")
    expect(PAGE_PATH.kitchen).toBe("/dapur")
    expect(PAGE_PATH.products).toBe("/katalog")
    expect(PAGE_PATH.stock).toBe("/stok")
    expect(PAGE_PATH.prefs).toBe("/shift")
    expect(PAGE_PATH.pin).toBe("/pin")
    expect(PAGE_PATH.week).toBe("/jadwal")
    expect(PAGE_PATH.staff).toBe("/staff")
    expect(PAGE_PATH.reports).toBe("/laporan")
    expect(PAGE_PATH.settings).toBe("/outlet")
  })

  test("pathForPage dan pageFromPath bolak-balik untuk path kanonik", () => {
    for (const page of Object.keys(PAGE_PATH) as (keyof typeof PAGE_PATH)[]) {
      const path = pathForPage(page)
      expect(pageFromPath(path)).toBe(page)
    }
  })

  test("menerima alias bahasa Inggris/lama dan trailing slash", () => {
    expect(pageFromPath("/clock")).toBe("clock")
    expect(pageFromPath("/week/")).toBe("week")
    expect(pageFromPath("/menu")).toBe("menu")
    expect(pageFromPath("/settings")).toBe("settings")
    expect(pageFromPath("/products")).toBe("products")
    expect(normalizePath("/Jadwal/")).toBe("/jadwal")
    expect(pageFromPath("/tidak-ada")).toBeNull()
    expect(pageFromPath("/staff")).toBe("staff")
    expect(pageFromPath("/orang")).toBe("staff")
  })

  test("judul tab browser memakai label screen", () => {
    expect(pageTitle("menu")).toBe("Roll n Brew")
    expect(pageTitle("clock")).toBe("Absensi · Roll n Brew")
    expect(pageTitle("prefs")).toBe("Shift Kerja · Roll n Brew")
    expect(pageTitle("week")).toBe("Jadwal · Roll n Brew")
    expect(pageTitle("staff")).toBe("Staff · Roll n Brew")
  })

  test("klik biasa ditangani in-app, modifier tetap ke browser", () => {
    const base = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }
    expect(shouldHandleInAppClick(base)).toBe(true)
    expect(shouldHandleInAppClick({ ...base, ctrlKey: true })).toBe(false)
    expect(shouldHandleInAppClick({ ...base, button: 1 })).toBe(false)
  })
})
