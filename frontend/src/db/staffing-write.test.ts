import { describe, expect, test } from "bun:test"

import { addRow, createRollposDatabase, listRows, TABLES } from "@/db/database"
import { clearAttendanceForDate } from "@/db/staffing-write"

describe("clearAttendanceForDate", () => {
  test("menghapus semua event pada tanggal Jakarta yang dipilih saja", async () => {
    const database = createRollposDatabase({ inMemory: true })
    addAttendance(database, "2026-08-21T16:59:00.000Z") // 21 Agu 23.59 WIB
    addAttendance(database, "2026-08-21T17:00:00.000Z") // 22 Agu 00.00 WIB
    addAttendance(database, "2026-08-22T16:59:00.000Z") // 22 Agu 23.59 WIB
    addAttendance(database, "2026-08-22T17:00:00.000Z") // 23 Agu 00.00 WIB

    expect(await clearAttendanceForDate(database, "2026-08-22")).toBe(2)
    expect(
      listRows(database, TABLES.attendanceEvents).map((row) => row.occurredAt)
    ).toEqual([
      Date.parse("2026-08-21T16:59:00.000Z"),
      Date.parse("2026-08-22T17:00:00.000Z"),
    ])
  })
})

function addAttendance(
  database: ReturnType<typeof createRollposDatabase>,
  occurredAt: string
) {
  addRow(database, TABLES.attendanceEvents, {
    staffId: "staff-1",
    type: "clock_in",
    occurredAt: Date.parse(occurredAt),
    recordedAt: Date.parse(occurredAt),
    deviceId: "test",
    shiftAssignmentId: "",
    outletId: "outlet-default",
    note: "",
    actorStaffId: "staff-1",
    correctsEventId: "",
  })
}
