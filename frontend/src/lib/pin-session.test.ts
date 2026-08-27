import { describe, expect, test } from "bun:test"

import {
  clearPinSession,
  PIN_SESSION_DURATION_MS,
  readPinSession,
  savePinSession,
} from "./pin-session"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

describe("sesi PIN", () => {
  test("mengingat staff selama enam jam", () => {
    const storage = memoryStorage()
    const now = 1_000

    savePinSession("owner-1", storage, now)

    expect(readPinSession(storage, now + PIN_SESSION_DURATION_MS - 1)).toBe(
      "owner-1"
    )
    expect(readPinSession(storage, now + PIN_SESSION_DURATION_MS)).toBeNull()
  })

  test("menghapus sesi saat dikunci", () => {
    const storage = memoryStorage()
    savePinSession("owner-1", storage)

    clearPinSession(storage)

    expect(readPinSession(storage)).toBeNull()
  })

  test("mengabaikan data sesi yang rusak", () => {
    const storage = memoryStorage()
    storage.setItem("rollpos:pin-session", "bukan-json")

    expect(readPinSession(storage)).toBeNull()
    expect(storage.length).toBe(0)
  })
})
