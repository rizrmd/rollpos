import { describe, expect, test } from "bun:test"

import {
  datesInMonth,
  datesInRange,
  datesOnWeekdayInMonth,
  EMPTY_ROSTER_STAFF_ID,
  lockedWorkDates,
  monthWeekStarts,
} from "@/lib/calendar-select"
import { SYSTEM_DRAFT_NOTE } from "@/lib/recommend"
import type { AssignmentRecord } from "@/lib/types"

function assignment(
  workDate: string,
  extras: Partial<AssignmentRecord> = {}
): AssignmentRecord {
  return {
    id: `${workDate}-${extras.staffId ?? "x"}`,
    staffId: extras.staffId ?? "ayu",
    templateId: "pagi",
    workDate,
    startMinutes: 420,
    endMinutes: 900,
    dutyRole: "barista",
    status: extras.status ?? "published",
    outletId: "main",
    note: extras.note ?? "",
  }
}

describe("calendar select", () => {
  test("datesInRange inklusif dan dinormalisasi mundur", () => {
    expect(datesInRange("2026-08-17", "2026-08-19")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ])
    expect(datesInRange("2026-08-19", "2026-08-17")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ])
    expect(datesInRange("2026-08-17", "2026-08-17")).toEqual(["2026-08-17"])
  })

  test("datesInMonth membuang sel di luar bulan", () => {
    expect(
      datesInMonth(
        ["2026-07-31", "2026-08-01", "2026-08-31", "2026-09-01"],
        "2026-08-01"
      )
    ).toEqual(["2026-08-01", "2026-08-31"])
  })

  test("datesOnWeekdayInMonth mengambil semua tanggal pada hari yang dipilih", () => {
    expect(datesOnWeekdayInMonth("2026-08-01", 1, 1)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ])
    expect(datesOnWeekdayInMonth("2026-08-01", 1, 0)).toEqual([
      "2026-08-02",
      "2026-08-09",
      "2026-08-16",
      "2026-08-23",
      "2026-08-30",
    ])
  })

  test("monthWeekStarts hanya minggu yang memuat tanggal dalam bulan", () => {
    expect(monthWeekStarts("2026-08-01", 1)).toEqual([
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ])
  })

  test("lockedWorkDates mengabaikan usulan sistem dan yang dibatalkan", () => {
    expect(
      lockedWorkDates([
        assignment("2026-08-17", { note: "ditetapkan manager" }),
        assignment("2026-08-18", { note: SYSTEM_DRAFT_NOTE }),
        assignment("2026-08-19", { status: "cancelled", note: "" }),
        assignment("2026-08-20", { note: "" }),
      ])
    ).toEqual(["2026-08-17", "2026-08-20"])
  })

  test("lockedWorkDates mengunci hari yang dikosongkan manager", () => {
    expect(
      lockedWorkDates([], SYSTEM_DRAFT_NOTE, [
        {
          staffId: EMPTY_ROSTER_STAFF_ID,
          workDate: "2026-08-17",
          source: "manager",
        },
        {
          staffId: "nia",
          workDate: "2026-08-18",
          source: "manager",
        },
      ])
    ).toEqual(["2026-08-17"])
  })
})
