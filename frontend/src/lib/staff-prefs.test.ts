import { describe, expect, test } from "bun:test"

import {
  canBeAssignedToSlot,
  dayOffAction,
  dayRoster,
  decidedPrefsDays,
  effectivePreferenceSlots,
  hasShiftAllocation,
  isStaleSystemAssignment,
  prefsDayCaption,
  isPreferenceDeadlinePassed,
  prefsDaysForMonth,
  preferredSlotIdsFromMember,
  preferredSlotIdsToStore,
  resolvePrefsDay,
  slotPreferenceRank,
  staffInitials,
  summarizePrefsMonth,
  summarizeTeamMonth,
  teamMonthDays,
  workingInitials,
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

  test("ketuk tanggal: minta ke depan, cabut yang menunggu, lihat yang sudah diputus", () => {
    const pending = resolvePrefsDay({
      date: "2026-08-19",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [suggest({ workDate: "2026-08-19" })],
      assignments: [],
      slots: [pagi],
    })
    const empty = resolvePrefsDay({
      date: "2026-08-21",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [],
      assignments: [],
      slots: [pagi],
    })
    const approved = resolvePrefsDay({
      date: "2026-08-18",
      inMonth: true,
      staffId: "nia",
      offs: [off({ workDate: "2026-08-18" })],
      suggestions: [],
      assignments: [],
      slots: [pagi],
    })
    expect(dayOffAction(pending, "2026-08-17")).toBe("withdraw")
    expect(dayOffAction(empty, "2026-08-17")).toBe("request")
    expect(dayOffAction(empty, "2026-08-22")).toBe("view")
    expect(dayOffAction(approved, "2026-08-17")).toBe("view")
    expect(prefsDayCaption(pending, "2026-08-17")).toBe("Menunggu")
    expect(prefsDayCaption(empty, "2026-08-17")).toBe("Kerja")
    expect(prefsDayCaption(empty, "2026-08-22")).toBe("—")
    expect(prefsDayCaption(approved, "2026-08-17")).toBe("Libur")
  })

  test("assignment draft dan published tampil kerja", () => {
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
    ).toBe("work")
  })

  test("hari ke depan tanpa assignment default kerja; giliran libur dari usulan", () => {
    const defaultWork = resolvePrefsDay({
      date: "2026-08-21",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [],
      assignments: [],
      slots: [pagi],
      today: "2026-08-17",
    })
    const rotation = resolvePrefsDay({
      date: "2026-08-23",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [],
      assignments: [],
      slots: [pagi],
      proposedOffs: [{ staffId: "nia", workDate: "2026-08-23" }],
      today: "2026-08-17",
    })
    const past = resolvePrefsDay({
      date: "2026-08-10",
      inMonth: true,
      staffId: "nia",
      offs: [],
      suggestions: [],
      assignments: [],
      slots: [pagi],
      today: "2026-08-17",
    })
    expect(defaultWork.kind).toBe("work")
    expect(defaultWork.source).toBe("recommendation")
    expect(rotation.kind).toBe("fair_off")
    expect(prefsDayCaption(rotation, "2026-08-17")).toBe("Giliran")
    expect(past.kind).toBe("empty")
  })
})

describe("staffInitials", () => {
  test("satu kata memakai dua huruf, dua kata memakai inisial", () => {
    expect(staffInitials("Ayu")).toBe("AY")
    expect(staffInitials("Dimas")).toBe("DI")
    expect(staffInitials("Nia Putri")).toBe("NP")
    expect(staffInitials("")).toBe("?")
  })
})

describe("dayRoster", () => {
  test("mengelompokkan siapa kerja per slot dan siapa libur", () => {
    const staff = [
      {
        id: "ayu",
        name: "Ayu",
        nickname: "Ayu",
        pinHash: "",
        pinSalt: "",
        isActive: true,
        outletId: "main",
        roles: ["barista" as const],
      },
      {
        id: "nia",
        name: "Nia",
        nickname: "Nia",
        pinHash: "",
        pinSalt: "",
        isActive: true,
        outletId: "main",
        roles: ["barista" as const],
      },
    ]
    const sore = { ...pagi, id: "sore", name: "Sore", sortOrder: 2 }
    const roster = dayRoster({
      date: "2026-08-21",
      staff,
      slots: [pagi, sore],
      assignments: [
        work({ workDate: "2026-08-21", staffId: "ayu" }),
        work({
          id: "a-nia-sore",
          workDate: "2026-08-21",
          staffId: "nia",
          templateId: "sore",
        }),
      ],
      offs: [off({ workDate: "2026-08-21", staffId: "raka" })],
      suggestions: [suggest({ workDate: "2026-08-21", staffId: "sinta" })],
    })
    expect(roster.slots[0]?.people.map((row) => row.nickname)).toEqual(["Ayu"])
    expect(roster.slots[1]?.people.map((row) => row.nickname)).toEqual(["Nia"])
    expect(roster.off.map((row) => row.staffId)).toEqual(["raka"])
    expect(roster.pending.map((row) => row.staffId)).toEqual(["sinta"])
  })

  test("pakai usulan sistem jika belum ada assignment tersimpan", () => {
    const roster = dayRoster({
      date: "2026-08-21",
      staff: [
        {
          id: "nia",
          name: "Nia",
          nickname: "Nia",
          pinHash: "",
          pinSalt: "",
          isActive: true,
          outletId: "main",
          roles: ["barista"],
        },
      ],
      slots: [pagi],
      assignments: [],
      offs: [],
      proposedAssignments: [
        { staffId: "nia", workDate: "2026-08-21", templateId: "pagi" },
      ],
    })
    expect(roster.slots[0]?.people[0]?.nickname).toBe("Nia")
    expect(workingInitials(roster)).toEqual(["NI"])
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

describe("pembagian shift profil", () => {
  const nia = {
    id: "nia",
    name: "Nia",
    nickname: "Nia",
    pinHash: "",
    pinSalt: "",
    isActive: true,
    outletId: "main",
    roles: ["barista"] as const,
    preferredTemplateIds: ["pagi"],
  }

  test("profil dipakai jika tidak ada preferensi minggu", () => {
    expect(effectivePreferenceSlots(nia, [], "2026-08-17")).toEqual([
      { templateId: "pagi", rank: 1 },
    ])
    expect(slotPreferenceRank(nia, "pagi", [], "2026-08-17")).toBe(1)
    expect(slotPreferenceRank(nia, "sore", [], "2026-08-17")).toBe(99)
  })

  test("preferensi minggu menimpa profil", () => {
    const week = [
      {
        id: "p1",
        staffId: "nia",
        weekStart: "2026-08-17",
        note: "",
        status: "submitted" as const,
        slots: [{ templateId: "sore", rank: 1 }],
      },
    ]
    expect(slotPreferenceRank(nia, "sore", week, "2026-08-17")).toBe(1)
    expect(slotPreferenceRank(nia, "pagi", week, "2026-08-17")).toBe(99)
  })

  test("owner/manager tidak perlu slot: checkbox absensi yang menentukan jadwal", () => {
    const owner = {
      ...nia,
      roles: ["owner"] as const,
      preferredTemplateIds: [],
      includeInAttendance: true,
    }
    expect(hasShiftAllocation(owner, [], "2026-08-17")).toBe(true)
    expect(canBeAssignedToSlot(owner, "pagi", [], "2026-08-17")).toBe(true)
    expect(canBeAssignedToSlot(owner, "sore", [], "2026-08-17")).toBe(true)

    const excluded = { ...owner, includeInAttendance: false }
    expect(hasShiftAllocation(excluded, [], "2026-08-17")).toBe(false)
    expect(canBeAssignedToSlot(excluded, "pagi", [], "2026-08-17")).toBe(false)
  })

  test("kosong berarti tidak di-assign; hanya shift yang dicentang yang boleh diisi", () => {
    const none = { ...nia, preferredTemplateIds: [] }
    expect(hasShiftAllocation(none, [], "2026-08-17")).toBe(false)
    expect(canBeAssignedToSlot(none, "pagi", [], "2026-08-17")).toBe(false)
    expect(canBeAssignedToSlot(nia, "pagi", [], "2026-08-17")).toBe(true)
    expect(canBeAssignedToSlot(nia, "sore", [], "2026-08-17")).toBe(false)
    expect(
      isStaleSystemAssignment(
        {
          staffId: "nia",
          templateId: "pagi",
          status: "published",
          note: "usulan sistem",
        },
        [none],
        [],
        "2026-08-17",
        "usulan sistem"
      )
    ).toBe(true)
    expect(
      isStaleSystemAssignment(
        {
          staffId: "nia",
          templateId: "pagi",
          status: "published",
          note: "usulan sistem",
        },
        [nia],
        [],
        "2026-08-17",
        "usulan sistem"
      )
    ).toBe(false)
  })

  test("form menampilkan persis yang tersimpan, termasuk uncentang semua", () => {
    const slots = [{ id: "pagi" }, { id: "sore" }]
    expect(preferredSlotIdsFromMember(undefined, slots)).toEqual([])
    expect(
      preferredSlotIdsFromMember({ ...nia, preferredTemplateIds: [] }, slots)
    ).toEqual([])
    expect(preferredSlotIdsToStore([], slots)).toEqual([])

    expect(preferredSlotIdsToStore(["pagi"], slots)).toEqual(["pagi"])
    const saved = preferredSlotIdsFromMember(
      { ...nia, preferredTemplateIds: ["pagi"] },
      slots
    )
    expect(saved).toEqual(["pagi"])
    expect(preferredSlotIdsToStore(saved, slots)).toEqual(["pagi"])

    const both = preferredSlotIdsFromMember(
      { ...nia, preferredTemplateIds: ["pagi", "sore"] },
      slots
    )
    expect(both).toEqual(["pagi", "sore"])
    expect(preferredSlotIdsToStore(both, slots)).toEqual(["pagi", "sore"])
    expect(preferredSlotIdsToStore(["pagi", "sore"], slots)).toEqual(["pagi", "sore"])
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
