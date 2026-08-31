import postgres from "postgres"

export type Sql = ReturnType<typeof postgres>

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) throw new Error("DATABASE_URL belum dikonfigurasi.")
  return value
}

export function createSql(): Sql {
  return postgres(databaseUrl(), {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
  })
}
