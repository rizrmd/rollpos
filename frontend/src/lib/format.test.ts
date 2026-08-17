import { describe, expect, test } from "bun:test"

import { capitalizePersonName, formatSelectedDates } from "@/lib/format"

describe("capitalizePersonName", () => {
  test("kapitalisasi huruf pertama setiap kata", () => {
    expect(capitalizePersonName("rizky")).toBe("Rizky")
    expect(capitalizePersonName("rizky rahman")).toBe("Rizky Rahman")
    expect(capitalizePersonName("rizky  rahman")).toBe("Rizky  Rahman")
  })

  test("mempertahankan spasi di ujung dan huruf setelah huruf pertama", () => {
    expect(capitalizePersonName("rizky ")).toBe("Rizky ")
    expect(capitalizePersonName(" rizky")).toBe(" Rizky")
    expect(capitalizePersonName("RIZKY")).toBe("RIZKY")
    expect(capitalizePersonName("")).toBe("")
  })

  test("kapitalisasi setelah tanda hubung atau apostrof", () => {
    expect(capitalizePersonName("jean-pierre")).toBe("Jean-Pierre")
    expect(capitalizePersonName("d'angelo")).toBe("D'Angelo")
  })
})

describe("formatSelectedDates", () => {
  test("satu tanggal memakai hari lengkap", () => {
    expect(formatSelectedDates(["2026-08-17"])).toBe("Senin, 17 Agu")
  })

  test("rentang menampilkan jumlah hari yang dipilih", () => {
    expect(
      formatSelectedDates(["2026-08-19", "2026-08-17", "2026-08-18"])
    ).toBe("Sen 17 – Rab 19 · 3 hari")
  })
})
