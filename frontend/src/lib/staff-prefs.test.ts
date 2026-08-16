import { describe, expect, test } from "bun:test"

import {
  decidedPrefsDays,
  isPreferenceDeadlinePassed,
  prefsDaysForMonth,
  resolvePrefsDay,
  summarizePrefsMonth,
  summarizeTeamMonth,
  teamMonthDays,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid, monthStartOf } from "@/lib/time"
import type {
  AssignmentRecord,
  DayOffRecord,
  SlotRecord,
  SuggestionRecord,
} from "@/lib/types"

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

function off(
  extras: Partial<DayOffRecord> & Pick<DayOffRecord, "workDate">
): DayOffRecord {
  return {
    id: `off-${extras.workDate}`,
    staffId: "nia",
    weekStart: "2026-08-17",
    source: "accepted_suggestion",
    note: "",
    ...extras,
  }
}

function suggest(
  extras: Partial<SuggestionRecord> & Pick<SuggestionRecord, "workDate">
): SuggestionRecord {
  return {
    id: `s-${extras.workDate}`,
    staffId: "nia",
    weekStart: "2026-08-17",
    rank: 1,
    note: "",
    status: "suggested",
    alternativeDate: "",
    actorStaffId: "nia",
    ...extras,
  }
}

function work(
  extras: Partial<AssignmentRecord> & Pick<AssignmentRecord, "workDate">
): AssignmentRecord {
  return {
    id: `a-${extras.workDate}`,
    staffId: "nia",
    templateId: "pagi",
    startMinutes: 420,
    endMinutes: 900,
    dutyRole: "barista",
    status: "published",
    outletId: "main",
    note: "",
    ...extras,
  }
}

describe("monthGrid", () => {
  test("Agustus 2026 mulai Senin 27 Juli dan menutup minggu setelah 31", () => {
    const cells = monthGrid("2026-08-17", 1)
    expect(cells[0]).toEqual({ date: "2026-07-27", inMonth: false })
    expect(cells.find((cell) => cell.date === "2026-08-01")).toEqual({
      date: "2026-08-01",
      inMonth: true,
    })
    expect(cells.at(-1)?.date).toBe("2026-09-06")
    expect(cells).toHaveLength(42)
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31)
  })

  test("addMonths loncat ke 1 bulan berikutnya", () => {
    expect(addMonths("2026-08-17", 1)).toBe("2026-09-01")
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01")
    expect(monthStartOf("2026-08-17")).toBe("2026-08-01")
  })
})

describe("resolvePrefsDay", () => {
  test("libur resmi menang dari permintaan dan jadwal kerja", () => {
    const day = resolvePrefsDay({
      date: "2026-08-18",
      inMonth: true,
      staffId: "nia",
      offs: [off({ workDate: "2026-08-18", note: "keluarga", source: "manager" })],
      suggestions: [suggest({ workDate: "2026-08-18", status: "accepted" })],
      assignments: [work({ workDate: "2026-08-18" })],
      slots: [pagi],
    })
    expect(day.kind).toBe("off")
    expect(day.source).toBe("manager")
    expect(day.note).toBe("keluarga")
  })

  test("permintaan yang masih suggested tampil menunggu", () => {
    const day = resolvePrefsDay({
      date: "2026-08-19",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [suggest({ workDate: "2026-08-19", note: "acara" })],
      assignments: [],
      slots: [pagi],
    })
    expect(day.kind).toBe("pending")
    expect(day.note).toBe("acara")
  })

  test("ditolak dengan tawaran tampil di tanggal asli dan tanggal alternatif", () => {
    const declined = suggest({
      workDate: "2026-08-20",
      status: "declined",
      alternativeDate: "2026-08-22",
    })
    const asked = resolvePrefsDay({
      date: "2026-08-20",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [declined],
      assignments: [],
      slots: [pagi],
    })
    const alt = resolvePrefsDay({
      date: "2026-08-22",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [declined],
      assignments: [],
      slots: [pagi],
    })
    expect(asked.kind).toBe("declined")
    expect(asked.alternativeDate).toBe("2026-08-22")
    expect(alt.kind).toBe("offered")
  })

  test("assignment published tampil kerja; draft diabaikan", () => {
    expect(
      resolvePrefsDay({
        date: "2026-08-21",
        inMonth: true,
        staffId: "nia",
        offs: [],
        suggestions: [],
        assignments: [work({ workDate: "2026-08-21" })],
        slots: [pagi],
      }).kind
    ).toBe("work")
    expect(
      resolvePrefsDay({
        date: "2026-08-21",
        inMonth: true,
        staffId: "nia",
        offs: [],
        suggestions: [],
        assignments: [work({ workDate: "2026-08-21", status: "draft" })],
        slots: [pagi],
      }).kind
    ).toBe("empty")
  })
})

describe("summarizePrefsMonth", () => {
  test("menghitung hanya hari di dalam bulan", () => {
    const days = prefsDaysForMonth({
      cells: monthGrid("2026-08-01", 1),
      staffId: "nia",
      offs: [off({ workDate: "2026-08-03" }), off({ workDate: "2026-07-27" })],
      suggestions: [
        suggest({ workDate: "2026-08-10" }),
        suggest({ workDate: "2026-08-12", status: "declined" }),
      ],
      assignments: [work({ workDate: "2026-08-04" }), work({ workDate: "2026-08-05" })],
      slots: [pagi],
    })
    expect(summarizePrefsMonth(days)).toEqual({
      approved: 1,
      pending: 1,
      declined: 1,
      offered: 0,
      workDays: 2,
    })
    expect(decidedPrefsDays(days).map((day) => day.date)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-12",
    ])
  })
})

describe("teamMonthDays", () => {
  test("mengelompokkan approve, pending, dan tolak per hari", () => {
    const days = teamMonthDays({
      cells: [
        { date: "2026-08-18", inMonth: true },
        { date: "2026-08-19", inMonth: true },
      ],
      offs: [
        off({ workDate: "2026-08-18", staffId: "nia" }),
        off({ workDate: "2026-08-18", staffId: "raka", id: "off-raka" }),
      ],
      suggestions: [
        suggest({ workDate: "2026-08-19", staffId: "sinta" }),
        suggest({
          workDate: "2026-08-19",
          staffId: "dimas",
          id: "s-dimas",
          status: "declined",
          alternativeDate: "2026-08-21",
        }),
      ],
    })
    expect(days[0]?.approved.map((row) => row.staffId).sort()).toEqual([
      "nia",
      "raka",
    ])
    expect(days[1]?.pending).toHaveLength(1)
    expect(days[1]?.declined[0]?.alternativeDate).toBe("2026-08-21")
    expect(summarizeTeamMonth(days)).toEqual({
      approved: 2,
      pending: 1,
      declined: 1,
      peopleOff: 2,
    })
  })
})

describe("isPreferenceDeadlinePassed", () => {
  const settings = {
    weekStartsOn: 1,
    preferenceDeadlineWeekday: 3,
    preferenceDeadlineMinutes: 18 * 60,
  }

  test("Senin sebelum deadline Rabu 18.00 masih terbuka", () => {
    expect(
      isPreferenceDeadlinePassed(
        settings,
        new Date("2026-08-17T04:00:00.000Z")
      )
    ).toBe(false)
  })

  test("Rabu setelah 18.00 sudah tutup", () => {
    expect(
      isPreferenceDeadlinePassed(
        settings,
        new Date("2026-08-19T12:00:00.000Z")
      )
    ).toBe(true)
  })
})
