import path from "node:path"

import { createApi } from "./app"

const api = createApi()
const production = process.env.NODE_ENV === "production"
const dist = path.resolve(import.meta.dir, "../dist")

if (!production) {
  const vite = Bun.spawn(
    ["bun", "x", "vite", "--host", "0.0.0.0", "--port", "5173"],
    {
      cwd: path.resolve(import.meta.dir, ".."),
      stdout: "inherit",
      stderr: "inherit",
    }
  )
  process.on("SIGINT", () => vite.kill())
}

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: "0.0.0.0",
  async fetch(request) {
    const response = await api(request)
    if (response) return response
    if (!production) {
      const url = new URL(request.url)
      url.host = "127.0.0.1:5173"
      return fetch(new Request(url, request))
    }
    const url = new URL(request.url)
    const requested = path.join(
      dist,
      url.pathname === "/" ? "index.html" : url.pathname
    )
    const file = Bun.file(requested)
    if (await file.exists()) return new Response(file)
    return new Response(Bun.file(path.join(dist, "index.html")))
  },
})

console.info(`RollPOS server aktif pada port ${process.env.PORT ?? 3000}`)
