import { ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  formatIsoWeekday,
  formatMonthYear,
  weekdayHeaders,
} from "@/lib/format"
import {
  OFF_SOURCE_LABEL,
  summarizeTeamMonth,
  teamMonthDays,
  type TeamDayStatus,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  DayOffRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

export function MonthApprovals({
  monthCursor,
  onMonthChange,
  weekStartsOn,
  today,
  staff,
  offs,
  suggestions,
  onPickDate,
}: {
  monthCursor: string
  onMonthChange: (next: string) => void
  weekStartsOn: number
  today: string
  staff: StaffRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  onPickDate?: (date: string) => void
}) {
  const cells = monthGrid(monthCursor, weekStartsOn)
  const days = teamMonthDays({ cells, offs, suggestions })
  const summary = summarizeTeamMonth(days)
  const headers = weekdayHeaders(weekStartsOn)
  const approvedRows = days
    .filter((day) => day.inMonth && day.approved.length > 0)
    .flatMap((day) =>
      day.approved.map((row) => ({
        date: day.date,
        ...row,
      }))
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          aria-label="Bulan sebelumnya"
          onClick={() => onMonthChange(addMonths(monthCursor, -1))}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-base font-medium">{formatMonthYear(monthCursor)}</p>
          <p className="text-sm text-muted-foreground">
            {summary.approved} libur disetujui · {summary.peopleOff} orang
            {summary.pending > 0 ? ` · ${summary.pending} menunggu` : ""}
            {summary.declined > 0 ? ` · ${summary.declined} ditolak` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          aria-label="Bulan berikutnya"
          onClick={() => onMonthChange(addMonths(monthCursor, 1))}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="overflow-hidden border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {headers.map((label) => (
            <div key={label} className="px-1 py-2">
              {label}
            </div>
          ))}
        </div>
        <ol className="grid grid-cols-7">
          {days.map((day) => (
            <li
              key={day.date}
              className="min-h-[4.5rem] border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0"
            >
              <MonthDayCell
                day={day}
                today={today}
                staff={staff}
                onPickDate={onPickDate}
              />
            </li>
          ))}
        </ol>
      </div>

      <section aria-labelledby="daftar-approve">
        <h3 id="daftar-approve" className="mb-2 text-sm font-medium">
          Yang disetujui bulan ini
        </h3>
        {approvedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada libur resmi di {formatMonthYear(monthCursor)}.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {approvedRows.map((row) => (
              <li
                key={`${row.date}-${row.staffId}-${row.source}`}
                className="flex items-start justify-between gap-3 border bg-card px-3 py-2"
              >
                <span>
                  <span className="block font-medium">
                    {nameOf(staff, row.staffId)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatIsoWeekday(row.date)}
                    {row.note ? ` · ${row.note}` : ""}
                  </span>
                </span>
                <Badge variant="secondary">{OFF_SOURCE_LABEL[row.source]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MonthDayCell({
  day,
  today,
  staff,
  onPickDate,
}: {
  day: TeamDayStatus
  today: string
  staff: StaffRecord[]
  onPickDate?: (date: string) => void
}) {
  const isToday = day.date === today
  const tone =
    day.approved.length > 0
      ? "border-emerald-700/20 bg-emerald-50 dark:bg-emerald-950/30"
      : day.pending.length > 0
        ? "border-amber-700/25 bg-amber-50 dark:bg-amber-950/20"
        : ""
  const names = day.approved.map((row) => nick(staff, row.staffId))
  const pendingNames = day.pending.map((row) => nick(staff, row.staffId))
  const body = (
    <>
      <span className="text-xs font-medium">{Number(day.date.slice(8))}</span>
      {day.inMonth && names.length > 0 ? (
        <span className="text-[0.65rem] leading-tight">
          {names.slice(0, 3).join(", ")}
          {names.length > 3 ? ` +${names.length - 3}` : ""}
        </span>
      ) : null}
      {day.inMonth && pendingNames.length > 0 ? (
        <span className="text-[0.65rem] leading-tight text-amber-800 dark:text-amber-200">
          minta {pendingNames.slice(0, 2).join(", ")}
        </span>
      ) : null}
    </>
  )

  if (onPickDate) {
    return (
      <button
        type="button"
        onClick={() => onPickDate(day.date)}
        className={cn(
          "flex h-full min-h-[4.5rem] w-full flex-col gap-0.5 p-1.5 text-left",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          day.inMonth ? tone : "bg-muted/20 text-muted-foreground/60",
          isToday ? "ring-2 ring-ring ring-inset" : ""
        )}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[4.5rem] flex-col gap-0.5 p-1.5",
        day.inMonth ? tone : "bg-muted/20 text-muted-foreground/60",
        isToday ? "ring-2 ring-ring ring-inset" : ""
      )}
    >
      {body}
    </div>
  )
}

function nick(staff: StaffRecord[], id: string): string {
  return staff.find((item) => item.id === id)?.nickname ?? id
}

function nameOf(staff: StaffRecord[], id: string): string {
  return staff.find((item) => item.id === id)?.name ?? id
}
