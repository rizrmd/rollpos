import { useRef, useState, type PointerEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  datesInMonth,
  datesInRange,
  isEmptyRosterLock,
  lockedWorkDates,
} from "@/lib/calendar-select"
import { SYSTEM_DRAFT_NOTE } from "@/lib/recommend"
import { formatIsoWeekday, formatMonthYear, weekdayHeaders } from "@/lib/format"
import {
  dayRoster,
  OFF_SOURCE_LABEL,
  summarizeTeamMonth,
  teamMonthDays,
  visibleStaffInitials,
  workingInitials,
  type TeamDayStatus,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  AssignmentRecord,
  DayOffRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

export function MonthApprovals({
  monthCursor,
  onMonthChange,
  weekStartsOn,
  today,
  staff,
  slots = [],
  assignments = [],
  offs,
  suggestions,
  selectedDates = [],
  onSelectDates,
}: {
  monthCursor: string
  onMonthChange: (next: string) => void
  weekStartsOn: number
  today: string
  staff: StaffRecord[]
  slots?: SlotRecord[]
  assignments?: AssignmentRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  selectedDates?: string[]
  onSelectDates?: (dates: string[]) => void
}) {
  const cells = monthGrid(monthCursor, weekStartsOn)
  const days = teamMonthDays({ cells, offs, suggestions })
  const summary = summarizeTeamMonth(days)
  const headers = weekdayHeaders(weekStartsOn)
  const visibleIds = new Set(staff.map((member) => member.id))
  const lockedDates = new Set(lockedWorkDates(assignments, undefined, offs))
  const approvedRows = days
    .filter((day) => day.inMonth && day.approved.length > 0)
    .flatMap((day) =>
      day.approved
        .filter((row) => visibleIds.has(row.staffId))
        .map((row) => ({
          date: day.date,
          ...row,
        }))
    )
  const [dragOrigin, setDragOrigin] = useState<string | null>(null)
  const [dragHover, setDragHover] = useState<string | null>(null)
  const [detailDate, setDetailDate] = useState<string | null>(null)
  const preview = dragOrigin
    ? new Set(
        datesInMonth(
          datesInRange(dragOrigin, dragHover ?? dragOrigin),
          monthCursor
        )
      )
    : new Set(selectedDates)
  const selectable = Boolean(onSelectDates)

  function dateFromPoint(clientX: number, clientY: number): string | null {
    const el = document.elementFromPoint(clientX, clientY)
    const node = el?.closest("[data-cal-date]")
    return node?.getAttribute("data-cal-date") ?? null
  }

  function finishDrag() {
    if (!dragOrigin || !onSelectDates) {
      setDragOrigin(null)
      setDragHover(null)
      return
    }
    const dates = datesInMonth(
      datesInRange(dragOrigin, dragHover ?? dragOrigin),
      monthCursor
    )
    setDragOrigin(null)
    setDragHover(null)
    if (dates.length > 0) onSelectDates(dates)
  }

  function detailDay(day: TeamDayStatus | undefined) {
    if (!day || !day.inMonth) return null
    const managerAssignments = assignments.filter(
      (row) =>
        row.workDate === day.date &&
        row.status !== "cancelled" &&
        row.note !== SYSTEM_DRAFT_NOTE
    )
    const lockedByManager =
      managerAssignments.length > 0 ||
      offs.some((row) => row.workDate === day.date && isEmptyRosterLock(row))
    if (!lockedByManager) return null

    return {
      day,
      people: managerAssignments.map((row) => ({
        staffId: row.staffId,
        name:
          staff.find((member) => member.id === row.staffId)?.name ??
          row.staffId,
        slotName: slots.find((slot) => slot.id === row.templateId)?.name ?? "-",
      })),
    }
  }

  const detail = detailDay(days.find((day) => day.date === detailDate))

  function calendarClick(day: TeamDayStatus, pointerMoved: boolean) {
    if (lockedDates.has(day.date)) {
      if (!pointerMoved) setDetailDate(day.date)
      return
    }
    if (!selectable || !day.inMonth) return
    onSelectDates?.([day.date])
  }

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
          <p className="text-base font-medium">
            {formatMonthYear(monthCursor)}
          </p>
          <p className="text-sm text-muted-foreground">
            {selectable
              ? "Seret tanggal untuk menentukan siapa kerja"
              : `${summary.approved} libur disetujui · ${summary.peopleOff} staff`}
            {!selectable && summary.pending > 0
              ? ` · ${summary.pending} menunggu`
              : ""}
            {!selectable && summary.declined > 0
              ? ` · ${summary.declined} ditolak`
              : ""}
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

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetailDate(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Detail tanggal</DialogTitle>
            <DialogDescription>
              {detail ? formatIsoWeekday(detail.day.date) : ""} · ditetapkan
              manager
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="flex flex-col gap-3">
              {detail.people.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {detail.people.map((person) => (
                    <li
                      key={`${person.staffId}-${person.slotName}`}
                      className="rounded-lg border bg-muted/30 px-3 py-2"
                    >
                      <p className="font-medium">{person.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {person.slotName}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-muted-foreground">
                  Tidak ada yang masuk pada tanggal ini.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Tanggal ini dikunci untuk pengisian otomatis.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setDetailDate(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {headers.map((label) => (
            <div key={label} className="px-1 py-2">
              {label}
            </div>
          ))}
        </div>
        <ol
          className={cn(
            "grid grid-cols-7",
            selectable ? "touch-none select-none" : ""
          )}
          onPointerMove={(event) => {
            if (!dragOrigin) return
            const date = dateFromPoint(event.clientX, event.clientY)
            if (date) setDragHover(date)
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {days.map((day) => (
            <li
              key={day.date}
              className="min-h-[4.5rem] border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0"
            >
              <MonthDayCell
                day={day}
                today={today}
                staff={staff}
                selected={day.inMonth && preview.has(day.date)}
                selectable={selectable}
                initials={workingInitials(
                  dayRoster({
                    date: day.date,
                    staff,
                    slots,
                    assignments,
                    offs,
                    suggestions,
                  })
                )}
                onOpenDetail={
                  day.inMonth && lockedDates.has(day.date)
                    ? () => setDetailDate(day.date)
                    : undefined
                }
                onClick={(pointerMoved) => calendarClick(day, pointerMoved)}
                onPointerDown={(event) => {
                  if (!selectable || !day.inMonth) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDragOrigin(day.date)
                  setDragHover(day.date)
                }}
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
                <Badge variant="secondary">
                  {OFF_SOURCE_LABEL[row.source]}
                </Badge>
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
  initials,
  selected,
  selectable,
  onPointerDown,
  onOpenDetail,
  onClick,
}: {
  day: TeamDayStatus
  today: string
  staff: StaffRecord[]
  initials: string[]
  selected: boolean
  selectable: boolean
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onOpenDetail?: () => void
  onClick: (pointerMoved: boolean) => void
}) {
  const isToday = day.date === today
  const offInitials = visibleStaffInitials(
    staff,
    day.approved.map((row) => row.staffId)
  )
  const pendingNames = day.pending.flatMap((row) => {
    const member = staff.find((item) => item.id === row.staffId)
    return member ? [member.nickname || member.name] : []
  })
  const origin = useRef<{ x: number; y: number } | null>(null)
  const pointerMoved = useRef(false)
  const body = (
    <>
      <span className="text-xs font-medium">{Number(day.date.slice(8))}</span>
      {day.inMonth && initials.length > 0 ? (
        <span className="text-[0.65rem] leading-tight font-medium tracking-wide">
          {initials.join(" ")}
        </span>
      ) : null}
      {day.inMonth && offInitials.length > 0 ? (
        <span className="text-[0.65rem] leading-tight text-muted-foreground">
          libur {offInitials.join(" ")}
        </span>
      ) : null}
      {day.inMonth && pendingNames.length > 0 ? (
        <span className="text-[0.65rem] leading-tight text-amber-800 dark:text-amber-200">
          minta {pendingNames.slice(0, 2).join(", ")}
        </span>
      ) : null}
    </>
  )

  if (onOpenDetail) {
    return (
      <button
        type="button"
        data-cal-date={day.inMonth ? day.date : undefined}
        disabled={!day.inMonth}
        onClick={onOpenDetail}
        className={cn(
          "flex h-full min-h-[4.5rem] w-full cursor-pointer flex-col gap-0.5 p-1.5 text-left hover:bg-muted/60",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          day.inMonth ? "" : "bg-muted/20 text-muted-foreground/60",
          isToday ? "ring-2 ring-ring ring-inset" : ""
        )}
      >
        {body}
      </button>
    )
  }

  if (selectable) {
    return (
      <button
        type="button"
        data-cal-date={day.inMonth ? day.date : undefined}
        disabled={!day.inMonth}
        onPointerDown={(event) => {
          origin.current = { x: event.clientX, y: event.clientY }
          pointerMoved.current = false
          onPointerDown(event)
        }}
        onPointerMove={(event) => {
          if (!origin.current || pointerMoved.current) return
          const moved =
            Math.abs(event.clientX - origin.current.x) > 4 ||
            Math.abs(event.clientY - origin.current.y) > 4
          if (moved) pointerMoved.current = true
        }}
        onPointerCancel={() => {
          origin.current = null
        }}
        onClick={() => {
          onClick(pointerMoved.current)
        }}
        className={cn(
          "flex h-full min-h-[4.5rem] w-full flex-col gap-0.5 p-1.5 text-left",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          day.inMonth ? "" : "bg-muted/20 text-muted-foreground/60",
          isToday ? "ring-2 ring-ring ring-inset" : "",
          selected
            ? "bg-primary/15 ring-2 ring-primary ring-inset dark:bg-primary/25"
            : ""
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
        day.inMonth ? "" : "bg-muted/20 text-muted-foreground/60",
        isToday ? "ring-2 ring-ring ring-inset" : ""
      )}
    >
      {body}
    </div>
  )
}

function nameOf(staff: StaffRecord[], id: string): string {
  return staff.find((item) => item.id === id)?.name ?? id
}
