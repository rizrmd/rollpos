import { describe, expect, test } from "bun:test"

import { addRow, createRollposDatabase, listRows, TABLES } from "@/db/database"
import {
  clearAttendanceForDate,
  clearManagerAssignedDates,
} from "@/db/staffing-write"

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

describe("clearManagerAssignedDates", () => {
  test("melepas penetapan manager dan lock kosong saja", async () => {
    const database = createRollposDatabase({ inMemory: true })
    addStaff(database, "manager", ["manager"])
    const manager = {
      id: "manager",
      name: "manager",
      nickname: "manager",
      pinHash: "",
      pinSalt: "",
      isActive: true,
      outletId: "outlet-default",
      roles: ["manager"],
    }
    addAssignment(database, "manager-assignment", "2026-08-22", "manager")
    addAssignment(database, "system-assignment", "2026-08-22", "usulan sistem")
    addAssignment(database, "other-date", "2026-08-23", "manager")
    addRow(database, TABLES.scheduledDaysOff, {
      staffId: "__empty_roster__",
      workDate: "2026-08-22",
      weekStart: "2026-08-17",
      source: "manager",
      note: "manager",
      createdAt: 1,
    })

    expect(
      await clearManagerAssignedDates(database, manager, {
        dates: ["2026-08-22"],
        weekStartsOn: 1,
      })
    ).toBe(2)

    const rows = listRows(database, TABLES.shiftAssignments).sort(
      (a, b) => a.id.localeCompare(b.id)
    )
    expect(
      rows.map((row) => [row.workDate, row.note, row.status] as const)
    ).toEqual([
      ["2026-08-22", "manager", "cancelled"],
      ["2026-08-22", "usulan sistem", "published"],
      ["2026-08-23", "manager", "published"],
    ])
    expect(listRows(database, TABLES.scheduledDaysOff)).toHaveLength(0)
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

function addStaff(
  database: ReturnType<typeof createRollposDatabase>,
  id: string,
  roles: string[]
) {
  const staffId = addRow(database, TABLES.staffMembers, {
    name: id,
    nickname: id,
    pinHash: "",
    pinSalt: "",
    isActive: true,
    outletId: "outlet-default",
    createdAt: 1,
    updatedAt: 1,
  })
  for (const role of roles) {
    addRow(database, TABLES.staffMemberRoles, {
      staffId,
      role,
      createdAt: 1,
    })
  }
}

function addAssignment(
  database: ReturnType<typeof createRollposDatabase>,
  _id: string,
  workDate: string,
  note: string
) {
  addRow(database, TABLES.shiftAssignments, {
    id,
    staffId: "manager",
    templateId: "shift-1",
    workDate,
    startMinutes: 0,
    endMinutes: 60,
    dutyRole: "",
    status: "published",
    outletId: "outlet-default",
    note,
    createdAt: 1,
    updatedAt: 1,
  })
}
