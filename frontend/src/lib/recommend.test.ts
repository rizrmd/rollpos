import { describe, expect, test } from "bun:test"

import {
  hasConsecutiveShifts,
  historyWorkDatesFrom,
  recommendSchedule,
  slotsTouch,
  weekHasActiveAssignments,
} from "@/lib/recommend"
import { addDays, weekDates } from "@/lib/time"
import type {
  AssignmentRecord,
  OutletSettingsRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

const weekStart = "2026-08-17"
const dates = weekDates(weekStart)

const settings: OutletSettingsRecord = {
  id: "s1",
  outletId: "main",
  openMinutes: 420,
  closeMinutes: 1320,
  weekStartsOn: 1,
  preferenceDeadlineWeekday: 3,
  preferenceDeadlineMinutes: 1080,
  maxConsecutiveWorkDays: 6,
  targetDaysOffPerWeek: 1,
  targetHoursPerWeek: 0,
  hoursSkewPercent: 25,
  weekendFairnessEnabled: true,
  graceLateMinutes: 10,
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

const sore: SlotRecord = {
  id: "sore",
  name: "Sore",
  startMinutes: 900,
  endMinutes: 1320,
  sortOrder: 2,
  minStaffCount: 2,
  isActive: true,
  outletId: "main",
}

function person(
  id: string,
  roles: StaffRecord["roles"] = ["barista"]
): StaffRecord {
  return {
    id,
    name: id,
    nickname: id,
    pinHash: "",
    pinSalt: "",
    isActive: true,
    outletId: "main",
    roles,
    preferredTemplateIds: ["pagi", "sore"],
  }
}

const crew = [
  person("ayu", ["owner", "barista"]),
  person("dimas", ["kasir", "manager"]),
  person("nia", ["barista", "kitchen"]),
  person("raka", ["kasir", "kitchen"]),
  person("sinta", ["barista"]),
]

function run(extras: Partial<Parameters<typeof recommendSchedule>[0]> = {}) {
  return recommendSchedule({
    settings,
    staff: crew,
    slots: [pagi, sore],
    requirements: [],
    assignments: [],
    offs: [],
    suggestions: [],
    preferences: [],
    weekStart,
    ...extras,
  })
}

describe("recommendSchedule fair default", () => {
  test("hari libur default staf dipakai saat generate", () => {
    const staff = crew.map((member) =>
      member.id === "nia" ? { ...member, defaultDayOffWeekdays: [3] } : member
    )
    const result = run({ staff })

    expect(
      result.offs.some(
        (row) => row.staffId === "nia" && row.workDate === "2026-08-19"
      )
    ).toBe(true)
    expect(
      result.assignments.some(
        (row) => row.staffId === "nia" && row.workDate === "2026-08-19"
      )
    ).toBe(false)
  })

  test("setiap staff dapat target libur dan hari sisanya jadi kerja", () => {
    const result = run()
    for (const member of crew) {
      const offs = result.offs.filter((row) => row.staffId === member.id)
      const workDays = new Set(
        result.assignments
          .filter((row) => row.staffId === member.id)
          .map((row) => row.workDate)
      )
      expect(offs).toHaveLength(1)
      expect(workDays.size).toBe(6)
      expect(offs[0] && workDays.has(offs[0].workDate)).toBe(false)
    }
  })

  test("libur tidak menumpuk sampai coverage pecah", () => {
    const result = run()
    for (const date of dates) {
      const offCount = result.offs.filter((row) => row.workDate === date).length
      const working = new Set(
        result.assignments
          .filter((row) => row.workDate === date)
          .map((row) => row.staffId)
      )
      expect(offCount).toBeLessThanOrEqual(1)
      expect(working.size).toBeGreaterThanOrEqual(4)
      expect(
        result.assignments.filter(
          (row) => row.workDate === date && row.templateId === "pagi"
        ).length
      ).toBeGreaterThanOrEqual(2)
      expect(
        result.assignments.filter(
          (row) => row.workDate === date && row.templateId === "sore"
        ).length
      ).toBeGreaterThanOrEqual(2)
    }
  })

  test("permintaan libur diterima jika coverage aman", () => {
    const suggestions: SuggestionRecord[] = [
      {
        id: "s-nia",
        staffId: "nia",
        weekStart,
        workDate: "2026-08-19",
        rank: 1,
        note: "",
        status: "suggested",
        alternativeDate: "",
        actorStaffId: "nia",
      },
    ]
    const result = run({ suggestions })
    expect(result.grantedSuggestionIds).toEqual(["s-nia"])
    expect(
      result.offs.some(
        (row) =>
          row.staffId === "nia" &&
          row.workDate === "2026-08-19" &&
          row.source === "accepted_suggestion"
      )
    ).toBe(true)
    expect(
      result.assignments.some(
        (row) => row.staffId === "nia" && row.workDate === "2026-08-19"
      )
    ).toBe(false)
  })

  test("weekend fairness mengutamakan libur bagi yang sering jaga weekend", () => {
    const history = {
      ayu: ["2026-08-01", "2026-08-02", "2026-08-08", "2026-08-09"],
      dimas: ["2026-08-01", "2026-08-02", "2026-08-08", "2026-08-09"],
      nia: ["2026-08-03", "2026-08-04"],
      raka: ["2026-08-05", "2026-08-06"],
      sinta: ["2026-08-07"],
    }
    const result = run({ historyWorkDates: history })
    const weekendOff = (id: string) =>
      result.offs.some(
        (row) =>
          row.staffId === id &&
          (row.workDate === "2026-08-22" || row.workDate === "2026-08-23")
      )
    expect(weekendOff("ayu") || weekendOff("dimas")).toBe(true)
    expect(weekendOff("nia") && weekendOff("raka") && weekendOff("sinta")).toBe(
      false
    )
  })

  test("slotsTouch hanya jika jam nyambung atau overlap", () => {
    expect(slotsTouch(pagi, sore)).toBe(true)
    expect(
      slotsTouch(pagi, {
        ...sore,
        id: "malam",
        startMinutes: 960,
        endMinutes: 1320,
      })
    ).toBe(false)
  })

  test("tidak menugaskan dua shift berturut-turut", () => {
    expect(slotsTouch(pagi, sore)).toBe(true)
    const result = run()
    expect(hasConsecutiveShifts(result.assignments, [pagi, sore])).toBe(false)
    for (const member of crew) {
      const byDate = new Map<string, string[]>()
      for (const row of result.assignments.filter(
        (item) => item.staffId === member.id
      )) {
        const list = byDate.get(row.workDate) ?? []
        list.push(row.templateId)
        byDate.set(row.workDate, list)
      }
      for (const ids of byDate.values()) {
        expect(ids.includes("pagi") && ids.includes("sore")).toBe(false)
      }
    }
  })

  test("pembagian shift hanya mengisi shift yang dicentang", () => {
    const staff = crew.map((member) =>
      member.id === "nia"
        ? { ...member, preferredTemplateIds: ["pagi"] }
        : member
    )
    const result = run({ staff })
    const nia = result.assignments.filter((row) => row.staffId === "nia")
    expect(nia.length).toBeGreaterThan(0)
    expect(nia.every((row) => row.templateId === "pagi")).toBe(true)
  })

  test("pembagian minggu menimpa pembagian tetap di profil", () => {
    const staff = crew.map((member) =>
      member.id === "nia"
        ? { ...member, preferredTemplateIds: ["pagi"] }
        : member
    )
    const result = run({
      staff,
      preferences: [
        {
          id: "p-nia",
          staffId: "nia",
          weekStart,
          note: "",
          status: "submitted",
          slots: [{ templateId: "sore", rank: 1 }],
        },
      ],
    })
    const nia = result.assignments.filter((row) => row.staffId === "nia")
    expect(nia.length).toBeGreaterThan(0)
    expect(nia.every((row) => row.templateId === "sore")).toBe(true)
  })

  test("pembagian kosong tidak di-assign sama sekali", () => {
    const staff = crew.map((member) =>
      member.id === "nia" ? { ...member, preferredTemplateIds: [] } : member
    )
    const result = run({ staff })
    expect(result.assignments.some((row) => row.staffId === "nia")).toBe(false)
    expect(result.offs.some((row) => row.staffId === "nia")).toBe(false)
  })

  test("sore kemarin tidak dilanjutkan pagi hari ini", () => {
    const result = run()
    for (const member of crew) {
      const mine = result.assignments.filter((row) => row.staffId === member.id)
      const backToBack = mine.some(
        (row) =>
          row.templateId === "sore" &&
          mine.some(
            (next) =>
              next.templateId === "pagi" &&
              next.workDate === addDays(row.workDate, 1)
          )
      )
      expect(backToBack).toBe(false)
    }
  })

  test("historyWorkDatesFrom mengabaikan cancelled dan minggu berjalan", () => {
    const rows: AssignmentRecord[] = [
      {
        id: "1",
        staffId: "ayu",
        templateId: "pagi",
        workDate: "2026-08-10",
        startMinutes: 420,
        endMinutes: 900,
        dutyRole: "barista",
        status: "published",
        outletId: "main",
        note: "",
      },
      {
        id: "2",
        staffId: "ayu",
        templateId: "pagi",
        workDate: "2026-08-17",
        startMinutes: 420,
        endMinutes: 900,
        dutyRole: "barista",
        status: "draft",
        outletId: "main",
        note: "",
      },
      {
        id: "3",
        staffId: "ayu",
        templateId: "pagi",
        workDate: "2026-08-09",
        startMinutes: 420,
        endMinutes: 900,
        dutyRole: "barista",
        status: "cancelled",
        outletId: "main",
        note: "",
      },
    ]
    expect(historyWorkDatesFrom(rows, weekStart)).toEqual({
      ayu: ["2026-08-10"],
    })
    expect(weekHasActiveAssignments(rows, weekStart)).toBe(true)
    expect(weekHasActiveAssignments(rows, "2026-08-24")).toBe(false)
  })

  test("tanggal terkunci tidak diisi ulang dan jadi beban saat generate sisa", () => {
    const locked = "2026-08-17"
    const pinned: AssignmentRecord[] = [
      {
        id: "pin-ayu",
        staffId: "ayu",
        templateId: "pagi",
        workDate: locked,
        startMinutes: 420,
        endMinutes: 900,
        dutyRole: "barista",
        status: "published",
        outletId: "main",
        note: "ditetapkan manager",
      },
      {
        id: "pin-dimas",
        staffId: "dimas",
        templateId: "sore",
        workDate: locked,
        startMinutes: 900,
        endMinutes: 1320,
        dutyRole: "kasir",
        status: "published",
        outletId: "main",
        note: "ditetapkan manager",
      },
    ]
    const result = run({
      assignments: pinned,
      lockedDates: [locked],
    })
    expect(result.assignments.some((row) => row.workDate === locked)).toBe(
      false
    )
    const otherDays = result.assignments.filter(
      (row) => row.workDate !== locked
    )
    expect(otherDays.length).toBeGreaterThan(0)
    expect(new Set(otherDays.map((row) => row.workDate)).has(locked)).toBe(
      false
    )
    const ayuDays = new Set(
      result.assignments
        .filter((row) => row.staffId === "ayu")
        .map((row) => row.workDate)
    )
    expect(ayuDays.has(locked)).toBe(false)
    expect(result.offs.some((row) => row.workDate === locked)).toBe(false)
  })
})
