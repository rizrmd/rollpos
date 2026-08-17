import { describe, expect, test } from "bun:test"

import {
  alternativeOffDate,
  cellCoverage,
  coverageTone,
  dayHeat,
  groupWarnings,
  pickBoardWeekStart,
  staffWeekLoad,
  summarizeRecommendation,
  unscheduledOnDate,
  weekRelation,
} from "@/lib/schedule-board"
import type {
  AssignmentRecord,
  DayOffRecord,
  ScheduleWarning,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

const slot = {
  id: "pagi",
  name: "Pagi",
  startMinutes: 420,
  endMinutes: 900,
  sortOrder: 1,
  minStaffCount: 2,
  isActive: true,
  outletId: "main",
} satisfies SlotRecord

function person(id: string, name = id): StaffRecord {
  return {
    id,
    name,
    nickname: name,
    pinHash: "",
    pinSalt: "",
    isActive: true,
    outletId: "main",
    roles: ["barista"],
  }
}

function assignment(
  staffId: string,
  extras: Partial<AssignmentRecord> = {}
): AssignmentRecord {
  return {
    id: `${staffId}-a`,
    staffId,
    templateId: "pagi",
    workDate: "2026-08-17",
    startMinutes: 420,
    endMinutes: 900,
    dutyRole: "barista",
    status: "draft",
    outletId: "main",
    note: "",
    ...extras,
  }
}

describe("schedule board helpers", () => {
  test("coverage is short, tight, or ok", () => {
    expect(coverageTone(0, 2, false)).toBe("short")
    expect(coverageTone(2, 2, false)).toBe("tight")
    expect(coverageTone(3, 2, false)).toBe("ok")
    expect(coverageTone(3, 2, true)).toBe("short")
  })

  test("cell coverage flags a missing role even when headcount is enough", () => {
    const result = cellCoverage(
      [assignment("ayu"), assignment("nia", { dutyRole: "barista" })],
      slot,
      [{ id: "r1", templateId: "pagi", role: "kasir", minCount: 1 }]
    )
    expect(result.tone).toBe("short")
    expect(result.roles[0]).toEqual({ role: "kasir", have: 0, min: 1 })
  })

  test("day heat matches pileup vs a couple of requests", () => {
    expect(dayHeat(0, 5, 4)).toBe("cool")
    expect(dayHeat(1, 5, 4)).toBe("cool")
    expect(dayHeat(2, 5, 4)).toBe("hot")
    expect(dayHeat(2, 8, 4)).toBe("warm")
  })

  test("board opens next week after this week is published", () => {
    expect(
      pickBoardWeekStart({
        thisWeekStart: "2026-08-17",
        upcomingWeekStart: "2026-08-24",
        assignments: [assignment("ayu", { status: "published" })],
        suggestions: [],
      })
    ).toBe("2026-08-24")
    expect(
      pickBoardWeekStart({
        thisWeekStart: "2026-08-17",
        upcomingWeekStart: "2026-08-24",
        assignments: [],
        suggestions: [],
      })
    ).toBe("2026-08-17")
  })

  test("week relation labels current next past future", () => {
    expect(weekRelation("2026-08-17", "2026-08-17")).toBe("current")
    expect(weekRelation("2026-08-24", "2026-08-17")).toBe("next")
    expect(weekRelation("2026-08-10", "2026-08-17")).toBe("past")
    expect(weekRelation("2026-08-31", "2026-08-17")).toBe("future")
  })

  test("alternative off prefers the coolest free day", () => {
    const suggestions: SuggestionRecord[] = [
      {
        id: "s1",
        staffId: "nia",
        weekStart: "2026-08-17",
        workDate: "2026-08-23",
        rank: 1,
        note: "",
        status: "suggested",
        alternativeDate: "",
        actorStaffId: "nia",
      },
      {
        id: "s2",
        staffId: "dimas",
        weekStart: "2026-08-17",
        workDate: "2026-08-23",
        rank: 1,
        note: "",
        status: "suggested",
        alternativeDate: "",
        actorStaffId: "dimas",
      },
    ]
    const offs: DayOffRecord[] = [
      {
        id: "o1",
        staffId: "nia",
        workDate: "2026-08-18",
        weekStart: "2026-08-17",
        source: "manager",
        note: "",
      },
    ]
    expect(
      alternativeOffDate({
        dates: [
          "2026-08-17",
          "2026-08-18",
          "2026-08-19",
          "2026-08-23",
        ],
        requested: "2026-08-23",
        staffId: "nia",
        suggestions,
        offs,
      })
    ).toBe("2026-08-17")
  })

  test("staff load counts hours offs and warnings", () => {
    const load = staffWeekLoad({
      member: person("ayu", "Ayu"),
      dates: ["2026-08-17", "2026-08-18"],
      assignments: [
        assignment("ayu"),
        assignment("ayu", {
          id: "ayu-b",
          workDate: "2026-08-18",
          startMinutes: 900,
          endMinutes: 1320,
        }),
      ],
      offs: [],
      suggestions: [],
      preferences: [
        {
          id: "p1",
          staffId: "ayu",
          weekStart: "2026-08-17",
          note: "",
          status: "submitted",
          slots: [{ templateId: "pagi", rank: 1 }],
        },
      ],
      warnings: [
        {
          code: "no_off",
          staffId: "ayu",
          message: "belum libur",
        },
      ],
      weekStart: "2026-08-17",
    })
    expect(load.workDays).toBe(2)
    expect(load.hours).toBe(15)
    expect(load.preferredSlotId).toBe("pagi")
    expect(load.warningCodes).toEqual(["no_off"])
  })

  test("preferredSlotId jatuh ke preferensi profil jika minggu kosong", () => {
    const load = staffWeekLoad({
      member: { ...person("ayu", "Ayu"), preferredTemplateIds: ["sore"] },
      dates: ["2026-08-17"],
      assignments: [],
      offs: [],
      suggestions: [],
      preferences: [],
      warnings: [],
      weekStart: "2026-08-17",
    })
    expect(load.preferredSlotId).toBe("sore")
  })

  test("recommendation summary counts replacements and alternatives", () => {
    const summary = summarizeRecommendation({
      proposedAssignments: [
        {
          staffId: "ayu",
          templateId: "pagi",
          workDate: "2026-08-17",
          startMinutes: 420,
          endMinutes: 900,
          dutyRole: "barista",
        },
      ],
      proposedOffs: [
        {
          staffId: "nia",
          workDate: "2026-08-18",
          weekStart: "2026-08-17",
          source: "accepted_suggestion",
        },
      ],
      grantedSuggestionIds: ["s1"],
      recommendedDayOff: [
        { staffId: "nia", workDate: "2026-08-18" },
        { staffId: "dimas", workDate: "2026-08-20" },
      ],
      currentAssignments: [assignment("ayu"), assignment("raka")],
    })
    expect(summary.assignmentCount).toBe(1)
    expect(summary.grantedCount).toBe(1)
    expect(summary.alternativeCount).toBe(1)
    expect(summary.replaces).toBe(2)
  })

  test("unscheduled people are neither working nor off", () => {
    const open = unscheduledOnDate(
      [person("ayu"), person("nia"), person("sinta")],
      "2026-08-17",
      [assignment("ayu")],
      [
        {
          id: "o1",
          staffId: "nia",
          workDate: "2026-08-17",
          weekStart: "2026-08-17",
          source: "manager",
          note: "",
        },
      ]
    )
    expect(open.map((row) => row.id)).toEqual(["sinta"])
  })

  test("groupWarnings counts codes used in the toolbar", () => {
    const warnings: ScheduleWarning[] = [
      { code: "understaffed", message: "a" },
      { code: "understaffed", message: "b" },
      { code: "no_off", message: "c" },
      { code: "hours_skew", message: "d" },
    ]
    expect(groupWarnings(warnings)).toMatchObject({
      understaffed: 2,
      noOff: 1,
      other: 1,
    })
  })
})
