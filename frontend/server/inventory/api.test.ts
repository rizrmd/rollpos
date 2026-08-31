import { describe, expect, test } from "bun:test"

import { createApi } from "../app"
import { InventoryRepository } from "./repository"

type State = {
  balance: number
  lots: Record<string, unknown>[]
  movements: Record<string, unknown>[]
}

function fakeSql(options?: { failMovement?: boolean }) {
  const state: State = { balance: 4, lots: [], movements: [] }
  const run = async (
    parts: TemplateStringsArray | string,
    ...values: unknown[]
  ) => {
    const query = typeof parts === "string" ? parts : parts.join("?")
    if (query.includes("SELECT id, base_unit, is_active"))
      return [{ id: "strawberry", base_unit: "kg", is_active: true }]
    if (query.includes("INSERT INTO inventory_lots")) {
      const lot = { id: `lot-${state.lots.length + 1}`, quantity: values[2] }
      state.lots.push(lot)
      return [lot]
    }
    if (query.includes("INSERT INTO inventory_stock_movements")) {
      if (options?.failMovement) throw new Error("movement gagal")
      state.movements.push({ type: "RECEIVE", quantity: values[2] })
      state.balance += Number(values[2])
      return []
    }
    if (query.includes("FROM inventory_lots")) return state.lots
    return []
  }
  const sql = Object.assign(run, {
    unsafe: async (query: string, values?: unknown[]) => {
      if (query.includes("WHERE i.id"))
        return values?.[0] === "strawberry"
          ? [
              {
                id: "strawberry",
                name: "Strawberry",
                baseUnit: "kg",
                balance: state.balance,
              },
            ]
          : []
      return [
        {
          id: "strawberry",
          name: "Strawberry",
          baseUnit: "kg",
          minimumStock: 2,
          isActive: true,
          balance: state.balance,
        },
      ]
    },
    begin: async (work: (tx: typeof run) => Promise<unknown>) => {
      const snapshot = structuredClone(state)
      try {
        return await work(run)
      } catch (error) {
        state.balance = snapshot.balance
        state.lots = snapshot.lots
        state.movements = snapshot.movements
        throw error
      }
    },
  })
  return { sql, state }
}

const receive = {
  inventoryItemId: "strawberry",
  quantity: 2,
  unit: "kg",
  receivedDate: "2026-09-01",
  expiryDate: "2026-09-10",
  lotCode: "2026-09-01-001",
  containerCode: "A.1",
  actorStaffId: "owner-1",
}

describe("inventory repository", () => {
  test("receive membuat satu lot, satu movement, dan menambah saldo", async () => {
    const { sql, state } = fakeSql()
    await new InventoryRepository(sql as never).receive(receive)
    expect(state.lots).toHaveLength(1)
    expect(state.movements).toHaveLength(1)
    expect(state.movements[0]?.type).toBe("RECEIVE")
    expect(state.balance).toBe(6)
  })

  test("movement gagal me-rollback lot", async () => {
    const { sql, state } = fakeSql({ failMovement: true })
    await expect(
      new InventoryRepository(sql as never).receive(receive)
    ).rejects.toThrow("movement gagal")
    expect(state.lots).toHaveLength(0)
    expect(state.movements).toHaveLength(0)
    expect(state.balance).toBe(4)
  })
})

describe("inventory API", () => {
  test("GET inventory, GET detail/lots, dan POST receive", async () => {
    const { sql } = fakeSql()
    const api = createApi(sql as never)
    expect(
      (await (await api(new Request("http://local/api/inventory")))!.json())[0]
        .name
    ).toBe("Strawberry")
    expect(
      (
        await (await api(
          new Request("http://local/api/inventory/strawberry")
        ))!.json()
      ).balance
    ).toBe(4)
    expect(
      await (await api(
        new Request("http://local/api/inventory/strawberry/lots")
      ))!.json()
    ).toEqual([])
    const response = await api(
      new Request("http://local/api/inventory/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(receive),
      })
    )
    expect(response?.status).toBe(201)
    expect(
      (
        await (await api(
          new Request("http://local/api/inventory/strawberry")
        ))!.json()
      ).balance
    ).toBe(6)
  })
})
