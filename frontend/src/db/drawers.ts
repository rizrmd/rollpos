import {
  persistentOperation,
  addRow,
  cellNum,
  cellStr,
  listRows,
  transact,
  type Database,
  TABLES,
  updateRow,
} from "./database"

export type DrawerSessionStatus = "OPEN" | "CLOSED"

export type DrawerSession = {
  id: string
  actorStaffId: string
  openedAt: number
  status: DrawerSessionStatus
  expectedCash?: number
  actualCash?: number
  discrepancy?: number
  closedAt?: number
}

export async function loadOpenDrawerSession(
  database: Database,
  actorStaffId: string
): Promise<DrawerSession | undefined> {
  await database.ready
  const staffId = actorStaffId.trim()
  if (!staffId) return undefined
  const row = listRows(database, TABLES.drawerSessions).find(
    (item) =>
      cellStr(item, "actorStaffId") === staffId &&
      cellStr(item, "status") === "OPEN"
  )
  return row ? drawerSessionFromRow(row) : undefined
}

export const openDrawerSession = persistentOperation(async function (
  database: Database,
  input: { actorStaffId: string; openedAt?: number }
): Promise<DrawerSession> {
  await database.ready
  const actorStaffId = input.actorStaffId.trim()
  if (!actorStaffId) throw new Error("Staff aktif wajib tercatat.")
  const openedAt = input.openedAt ?? Date.now()
  let id = ""
  transact(database, () => {
    const alreadyOpen = listRows(database, TABLES.drawerSessions).some(
      (item) =>
        cellStr(item, "actorStaffId") === actorStaffId &&
        cellStr(item, "status") === "OPEN"
    )
    if (alreadyOpen) {
      throw new Error("Staff ini sudah memiliki sesi laci aktif.")
    }
    id = addRow(database, TABLES.drawerSessions, {
      actorStaffId,
      openedAt,
      status: "OPEN",
      createdAt: openedAt,
      updatedAt: openedAt,
    })
  })
  return { id, actorStaffId, openedAt, status: "OPEN" }
})

export async function getDrawerExpectedCash(
  database: Database,
  drawerSessionId: string
): Promise<number> {
  await database.ready
  const sessionId = drawerSessionId.trim()
  if (!sessionId || !database.store.hasRow(TABLES.drawerSessions, sessionId)) {
    throw new Error("Sesi laci tidak ditemukan.")
  }
  return listRows(database, TABLES.payments)
    .filter(
      (payment) =>
        cellStr(payment, "drawerSessionId") === sessionId &&
        cellStr(payment, "method") === "CASH"
    )
    .reduce(
      (total, payment) =>
        total + cellNum(payment, "amount") - cellNum(payment, "change"),
      0
    )
}

export const closeDrawerSession = persistentOperation(async function (
  database: Database,
  input: { sessionId: string; actualCash: number; closedAt?: number }
): Promise<DrawerSession> {
  await database.ready
  const sessionId = input.sessionId.trim()
  const actualCash = Number(input.actualCash)
  if (!sessionId) throw new Error("Sesi laci wajib dipilih.")
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    throw new Error("Cash count tidak valid.")
  }

  const expectedCash = await getDrawerExpectedCash(database, sessionId)
  const discrepancy = actualCash - expectedCash
  const closedAt = input.closedAt ?? Date.now()
  let closed!: DrawerSession

  transact(database, () => {
    const row = database.store.getRow(TABLES.drawerSessions, sessionId)
    if (!database.store.hasRow(TABLES.drawerSessions, sessionId)) {
      throw new Error("Sesi laci tidak ditemukan.")
    }
    if (cellStr(row, "status") !== "OPEN") {
      throw new Error("Sesi laci ini sudah ditutup.")
    }
    updateRow(database, TABLES.drawerSessions, sessionId, {
      status: "CLOSED",
      expectedCash,
      actualCash,
      discrepancy,
      closedAt,
      updatedAt: closedAt,
    })
    closed = {
      id: sessionId,
      actorStaffId: cellStr(row, "actorStaffId"),
      openedAt: cellNum(row, "openedAt"),
      status: "CLOSED",
      expectedCash,
      actualCash,
      discrepancy,
      closedAt,
    }
  })

  return closed
})

function drawerSessionFromRow(
  row: ReturnType<typeof listRows>[number]
): DrawerSession {
  return {
    id: row.id,
    actorStaffId: cellStr(row, "actorStaffId"),
    openedAt: cellNum(row, "openedAt"),
    status: cellStr(row, "status") as DrawerSessionStatus,
    ...(cellStr(row, "status") === "CLOSED"
      ? {
          expectedCash: cellNum(row, "expectedCash"),
          actualCash: cellNum(row, "actualCash"),
          discrepancy: cellNum(row, "discrepancy"),
          closedAt: cellNum(row, "closedAt"),
        }
      : {}),
  }
}
