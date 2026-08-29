import {
  addDays,
  inSameMonth,
  monthGrid,
  weekdayOf,
  weekStartOn,
} from "@/lib/time"
import { SYSTEM_DRAFT_NOTE } from "@/lib/recommend"
import type { AssignmentRecord, DayOffRecord } from "@/lib/types"

/** Penanda tanggal yang dikunci manager tanpa ada yang masuk. */
export const EMPTY_ROSTER_STAFF_ID = "__empty_roster__"

export function isEmptyRosterLock(
  off: Pick<DayOffRecord, "staffId" | "source">
): boolean {
  return off.staffId === EMPTY_ROSTER_STAFF_ID && off.source === "manager"
}

/** Rentang inklusif, urutan mundur tetap dinormalisasi. */
export function datesInRange(start: string, end: string): string[] {
  const [from, to] = start <= end ? [start, end] : [end, start]
  const dates: string[] = []
  let cursor = from
  while (cursor <= to) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
    if (dates.length > 62) break
  }
  return dates
}

export function datesInMonth(dates: string[], monthCursor: string): string[] {
  return dates.filter((date) => inSameMonth(date, monthCursor))
}

/** Semua tanggal pada weekday tertentu di dalam bulan yang tampil. */
export function datesOnWeekdayInMonth(
  monthCursor: string,
  weekStartsOn: number,
  weekday: number
): string[] {
  return monthGrid(monthCursor, weekStartsOn)
    .filter((cell) => cell.inMonth && weekdayOf(cell.date) === weekday)
    .map((cell) => cell.date)
}

/** Awal minggu yang memuat tanggal dalam bulan yang tampil. */
export function monthWeekStarts(
  monthCursor: string,
  weekStartsOn: number
): string[] {
  const seen = new Set<string>()
  const starts: string[] = []
  for (const cell of monthGrid(monthCursor, weekStartsOn)) {
    if (!cell.inMonth) continue
    const start = weekStartOn(cell.date, weekStartsOn)
    if (seen.has(start)) continue
    seen.add(start)
    starts.push(start)
  }
  return starts
}

/** Tanggal yang sudah ditetapkan manager — tidak diisi ulang oleh usulan sistem. */
export function lockedWorkDates(
  assignments: AssignmentRecord[],
  systemNote = SYSTEM_DRAFT_NOTE,
  offs: Pick<DayOffRecord, "staffId" | "workDate" | "source">[] = []
): string[] {
  const dates = new Set(
    assignments
      .filter((row) => row.status !== "cancelled" && row.note !== systemNote)
      .map((row) => row.workDate)
  )
  for (const off of offs) {
    if (isEmptyRosterLock(off)) dates.add(off.workDate)
  }
  return [...dates].sort()
}
