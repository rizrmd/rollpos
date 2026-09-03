import {
  addRow,
  cellNum,
  cellStr,
  listRows,
  transact,
  type Database,
  TABLES,
} from "./database"

export type DrawerSessionStatus = "OPEN"

export type DrawerSession = {
  id: string
  actorStaffId: string
  openedAt: number
  status: DrawerSessionStatus
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

export async function openDrawerSession(
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
}

function drawerSessionFromRow(
  row: ReturnType<typeof listRows>[number]
): DrawerSession {
  return {
    id: row.id,
    actorStaffId: cellStr(row, "actorStaffId"),
    openedAt: cellNum(row, "openedAt"),
    status: cellStr(row, "status") as DrawerSessionStatus,
  }
}
