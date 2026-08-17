import { describe, expect, test } from "bun:test"

import { capitalizePersonName } from "@/lib/format"

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
