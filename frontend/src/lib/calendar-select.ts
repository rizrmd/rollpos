import { addDays, inSameMonth, monthGrid, weekStartOn } from "@/lib/time"
import { SYSTEM_DRAFT_NOTE } from "@/lib/recommend"
import type { AssignmentRecord } from "@/lib/types"

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
  systemNote = SYSTEM_DRAFT_NOTE
): string[] {
  return [
    ...new Set(
      assignments
        .filter(
          (row) => row.status !== "cancelled" && row.note !== systemNote
        )
        .map((row) => row.workDate)
    ),
  ].sort()
}
