import { describe, expect, test } from "bun:test"

import {
  describeClockCard,
  groupClockCards,
  listOnDuty,
  onDutyLabel,
  openClockInAt,
} from "@/lib/on-duty"
import { formatOccurredClock } from "@/lib/format"
import type {
  AssignmentRecord,
  AttendanceEventRecord,
  SlotRecord,
  StaffRecord,
} from "@/lib/types"

function person(id: string, name: string, active = true): StaffRecord {
  return {
    id,
    name,
    nickname: name,
    pinHash: "",
    pinSalt: "",
    isActive: active,
    outletId: "main",
    roles: ["kasir"],
  }
}

function punch(
  staffId: string,
  type: AttendanceEventRecord["type"],
  at: number
): AttendanceEventRecord {
  return {
    id: `${staffId}-${type}-${at}`,
    staffId,
    type,
    occurredAt: at,
    recordedAt: at,
    deviceId: "tablet",
    shiftAssignmentId: "",
    outletId: "main",
    note: "",
    actorStaffId: staffId,
    correctsEventId: "",
  }
}

const pagi: SlotRecord = {
  id: "pagi",
  name: "Pagi",
  startMinutes: 420,
  endMinutes: 900,
  sortOrder: 1,
  minStaffCount: 2,
  isActive: true,
  outletId: "main",
}

function assignment(staffId: string): AssignmentRecord {
  return {
    id: `asg-${staffId}`,
    staffId,
    templateId: "pagi",
    workDate: "2026-08-17",
    startMinutes: 420,
    endMinutes: 900,
    dutyRole: "kasir",
    status: "published",
    outletId: "main",
    note: "",
  }
}

describe("openClockInAt", () => {
  test("mengambil clock-in terakhir jika sesi masih terbuka", () => {
    const events = [
      punch("ayu", "clock_in", 100),
      punch("ayu", "clock_out", 200),
      punch("ayu", "clock_in", 300),
    ]
    expect(openClockInAt(events, "ayu")).toBe(300)
  })

  test("null jika sudah pulang atau belum pernah masuk", () => {
    expect(openClockInAt([punch("ayu", "clock_in", 100), punch("ayu", "clock_out", 200)], "ayu")).toBeNull()
    expect(openClockInAt([], "ayu")).toBeNull()
  })
})

describe("listOnDuty", () => {
  const ayu = person("ayu", "Ayu")
  const nia = person("nia", "Nia")
  const raka = person("raka", "Raka")
  const sinta = person("sinta", "Sinta", false)

  test("hanya staff aktif yang sesinya terbuka, urut jam masuk", () => {
    const listed = listOnDuty({
      staff: [raka, ayu, nia, sinta],
      attendance: [
        punch("ayu", "clock_in", 700),
        punch("nia", "clock_in", 500),
        punch("raka", "clock_in", 400),
        punch("raka", "clock_out", 450),
        punch("sinta", "clock_in", 100),
      ],
      assignments: [assignment("ayu")],
      slots: [pagi],
      today: "2026-08-17",
    })
    expect(listed.map((row) => row.staff.id)).toEqual(["nia", "ayu"])
    expect(listed[0]?.clockInAt).toBe(500)
    expect(listed[1]?.slot?.name).toBe("Pagi")
    expect(listed[0]?.assignment).toBeUndefined()
  })

  test("mengikuti peta openByStaff jika diberikan", () => {
    const listed = listOnDuty({
      staff: [ayu, nia],
      attendance: [punch("ayu", "clock_in", 1), punch("nia", "clock_in", 2)],
      assignments: [],
      slots: [],
      today: "2026-08-17",
      openByStaff: new Map([
        ["ayu", true],
        ["nia", false],
      ]),
    })
    expect(listed.map((row) => row.staff.id)).toEqual(["ayu"])
  })
})

describe("groupClockCards", () => {
  test("memisah sedang masuk, belum masuk, dan libur", () => {
    const grouped = groupClockCards([
      { kind: "scheduled" as const, name: "Dimas" },
      { kind: "on_duty" as const, name: "Nia" },
      { kind: "off" as const, name: "Sinta" },
      { kind: "unscheduled" as const, name: "Raka" },
      { kind: "on_duty" as const, name: "Ayu" },
    ])
    expect(grouped.onDuty.map((row) => row.name)).toEqual(["Nia", "Ayu"])
    expect(grouped.waiting.map((row) => row.name)).toEqual(["Dimas", "Raka"])
    expect(grouped.off.map((row) => row.name)).toEqual(["Sinta"])
  })
})

describe("onDutyLabel", () => {
  test("kalimat Indonesia sesuai jumlah", () => {
    expect(onDutyLabel(0)).toBe("Belum ada yang masuk")
    expect(onDutyLabel(1)).toBe("1 staff sedang masuk")
    expect(onDutyLabel(3)).toBe("3 staff sedang masuk")
  })
})

describe("describeClockCard", () => {
  const ayu = person("ayu", "Ayu")
  const jakarta = (isoUtc: string) => Date.parse(isoUtc)

  test("card sedang masuk menampilkan jam clock-in, termasuk sesi semalam", () => {
    const clockInAt = jakarta("2026-08-16T16:00:00.000Z") // 23.00 WIB
    const card = describeClockCard({
      member: ayu,
      today: "2026-08-17",
      slots: [pagi],
      assignments: [assignment("ayu")],
      attendance: [punch("ayu", "clock_in", clockInAt)],
      offs: [],
      onDuty: true,
    })
    expect(card.kind).toBe("on_duty")
    expect(card.clockInAt).toBe(clockInAt)
    expect(formatOccurredClock(card.clockInAt ?? 0)).toBe("23.00")
    expect(card.line).toBe("Pagi 07:00–15:00")
    expect(card.action).toBe("Ketuk untuk pulang")
  })

  test("setelah pulang, card menampilkan jam masuk dan pulang", () => {
    const clockInAt = jakarta("2026-08-17T01:15:00.000Z") // 08.15 WIB
    const clockOutAt = jakarta("2026-08-17T10:05:00.000Z") // 17.05 WIB
    const card = describeClockCard({
      member: ayu,
      today: "2026-08-17",
      slots: [pagi],
      assignments: [assignment("ayu")],
      attendance: [
        punch("ayu", "clock_in", clockInAt),
        punch("ayu", "clock_out", clockOutAt),
      ],
      offs: [],
      onDuty: false,
    })
    expect(card.kind).toBe("scheduled")
    expect(card.clockInAt).toBeNull()
    expect(card.line).toBe("Masuk 08.15 · pulang 17.05")
  })
})
