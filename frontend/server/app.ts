import { createSql, type Sql } from "./db/client"
import { InventoryRepository } from "./inventory/repository"
import { ValidationError, type ReceiveInput } from "./inventory/types"

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export function createApi(sql?: Sql) {
  let database = sql
  if (!database) {
    try {
      database = createSql()
    } catch {
      database = undefined
    }
  }
  const inventory = database ? new InventoryRepository(database) : null
  return async function api(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith("/api/")) return null
    if (request.method === "GET" && url.pathname === "/api/health") {
      if (!database) {
        return json({ status: "degraded", database: "unavailable" }, 503)
      }
      try {
        await database`SELECT 1`
        return json({ status: "ok", database: "ok" })
      } catch {
        return json({ status: "degraded", database: "unavailable" }, 503)
      }
    }
    if (!inventory) {
      return json(
        {
          error:
            "Inventory unavailable. Please check the connection and try again.",
        },
        503
      )
    }
    try {
      if (request.method === "GET" && url.pathname === "/api/inventory")
        return json(await inventory.list())
      const detail = url.pathname.match(/^\/api\/inventory\/([^/]+)$/)
      if (request.method === "GET" && detail) {
        const item = await inventory.get(detail[1]!)
        return item
          ? json(item)
          : json({ error: "Inventory item tidak ditemukan." }, 404)
      }
      const lots = url.pathname.match(/^\/api\/inventory\/([^/]+)\/lots$/)
      if (request.method === "GET" && lots) {
        const item = await inventory.get(lots[1]!)
        return item
          ? json(await inventory.lots(lots[1]!))
          : json({ error: "Inventory item tidak ditemukan." }, 404)
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/inventory/receive"
      ) {
        const body = (await request.json()) as ReceiveInput
        return json(await inventory.receive(body), 201)
      }
      return json({ error: "Endpoint tidak ditemukan." }, 404)
    } catch (error) {
      if (error instanceof ValidationError)
        return json({ error: error.message }, 400)
      console.error("Inventory request failed.")
      return json(
        {
          error:
            "Inventory unavailable. Please check the connection and try again.",
        },
        503
      )
    }
  }
}
