import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

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
  formatIsoWeekday,
  formatMonthYear,
  weekdayHeaders,
} from "@/lib/format"
import {
  historyWorkDatesFrom,
  recommendSchedule,
  weekHasActiveAssignments,
} from "@/lib/recommend"
import {
  dayRoster,
  workingInitials,
  type DayRoster,
  type PrefsDay,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid, monthStartOf, todayJakarta, weekStartOn } from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  isStaffDeleted,
  type AssignmentRecord,
  type DayOffRecord,
  type OutletSettingsRecord,
  type PreferenceRecord,
  type RoleRequirementRecord,
  type SlotRecord,
  type StaffRecord,
  type SuggestionRecord,
} from "@/lib/types"

const KIND_CLASS = {
  work: "border-border bg-muted/60",
  empty: "border-border bg-card",
}

export function PrefsScreen({
  staff,
  slots,
  suggestions,
  assignments,
  offs,
  settings,
  preferences = [],
  requirements = [],
  today = todayJakarta(),
}: {
  staff: StaffRecord[]
  slots: SlotRecord[]
  suggestions: SuggestionRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  settings: OutletSettingsRecord | null
  preferences?: PreferenceRecord[]
  requirements?: RoleRequirementRecord[]
  today?: string
}) {
  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const [monthCursor, setMonthCursor] = useState(() => monthStartOf(today))
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const activeStaff = staff.filter(
    (member) => member.isActive && !isStaffDeleted(member)
  )

  const cells = useMemo(
    () => monthGrid(monthCursor, weekStartsOn),
    [monthCursor, weekStartsOn]
  )
  const proposed = useMemo(() => {
    if (!settings) {
      return { assignments: [], offs: [] }
    }
    const weekStarts = [
      ...new Set(cells.map((cell) => weekStartOn(cell.date, weekStartsOn))),
    ]
    const history = historyWorkDatesFrom(assignments, today)
    const nextAssignments: {
      staffId: string
      workDate: string
      templateId: string
    }[] = []
    const nextOffs: { staffId: string; workDate: string }[] = []
    for (const weekStart of weekStarts) {
      if (weekStart < weekStartOn(today, weekStartsOn)) continue
      if (weekHasActiveAssignments(assignments, weekStart)) continue
      const result = recommendSchedule({
        settings,
        staff,
        slots: activeSlots,
        requirements,
        assignments,
        offs,
        suggestions,
        preferences,
        weekStart,
        historyWorkDates: history,
      })
      nextAssignments.push(...result.assignments)
      nextOffs.push(
        ...result.offs.filter((row) => row.source === "recommendation")
      )
    }
    return { assignments: nextAssignments, offs: nextOffs }
  }, [
    settings,
    cells,
    weekStartsOn,
    assignments,
    today,
    staff,
    activeSlots,
    requirements,
    offs,
    suggestions,
    preferences,
  ])
  const days = useMemo(
    () => cells.map((cell) => publicPrefsDay(cell)),
    [cells]
  )
  const headers = weekdayHeaders(weekStartsOn)
  const picked = pickedDate
    ? (days.find((day) => day.date === pickedDate) ?? null)
    : null
  const roster = picked
    ? dayRoster({
        date: picked.date,
        staff: activeStaff,
        slots: activeSlots,
        assignments,
        offs,
        proposedAssignments: proposed.assignments,
        suggestions,
      })
    : null
  const initialsByDate = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const day of days) {
      if (!day.inMonth) continue
      map.set(
        day.date,
        workingInitials(
          dayRoster({
            date: day.date,
            staff: activeStaff,
            slots: activeSlots,
            assignments,
            offs,
            proposedAssignments: proposed.assignments,
            suggestions,
          })
        )
      )
    }
    return map
  }, [
    days,
    activeStaff,
    activeSlots,
    assignments,
    offs,
    proposed.assignments,
    suggestions,
  ])

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3" aria-labelledby="kalender-bulan">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            aria-label="Bulan sebelumnya"
            onClick={() => setMonthCursor((current) => addMonths(current, -1))}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <h2 id="kalender-bulan" className="text-base font-medium">
              {formatMonthYear(monthCursor)}
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            aria-label="Bulan berikutnya"
            onClick={() => setMonthCursor((current) => addMonths(current, 1))}
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
            {days.map((day) => {
              const isToday = day.date === today
              const initials = initialsByDate.get(day.date) ?? []
              return (
                <li
                  key={day.date}
                  className="min-h-16 border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0"
                >
                  <button
                    type="button"
                    onClick={() => setPickedDate(day.date)}
                    className={cn(
                      "flex h-full min-h-16 w-full flex-col gap-0.5 p-1.5 text-left",
                      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      day.inMonth
                        ? initials.length > 0
                          ? KIND_CLASS.work
                          : KIND_CLASS.empty
                        : "bg-muted/20 text-muted-foreground/60",
                      isToday ? "ring-2 ring-ring ring-inset" : ""
                    )}
                  >
                    <span className="text-xs font-medium">
                      {Number(day.date.slice(8))}
                    </span>
                    {day.inMonth && initials.length > 0 ? (
                      <span className="text-[0.65rem] leading-tight font-medium tracking-wide">
                        {initials.join(" ")}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <Dialog
        open={Boolean(picked)}
        onOpenChange={(open) => {
          if (!open) setPickedDate(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {picked ? formatIsoWeekday(picked.date) : "Tanggal"}
            </DialogTitle>
            {picked && picked.date < today ? (
              <DialogDescription>Sudah lewat</DialogDescription>
            ) : null}
          </DialogHeader>
          {roster ? <DayRosterList roster={roster} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setPickedDate(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DayRosterList({ roster }: { roster: DayRoster }) {
  const hasWorkers = roster.slots.some((slot) => slot.people.length > 0)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <section aria-labelledby="siapa-kerja">
        <h3 id="siapa-kerja" className="mb-2 font-medium">
          Siapa kerja
        </h3>
        {hasWorkers ? (
          <ul className="grid grid-cols-2 gap-2">
            {roster.slots.map((slot) => (
              <li
                key={slot.slotId}
                className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {slot.slotName}
                </p>
                {slot.people.length === 0 ? (
                  <p className="text-muted-foreground">kosong</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {slot.people.map((person) => (
                      <li
                        key={person.staffId}
                        className="rounded-md border bg-background px-2.5 py-1.5 font-medium"
                      >
                        {person.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-muted-foreground">
            Belum ada yang dijadwalkan.
          </p>
        )}
      </section>
      {roster.off.length > 0 ? (
        <p className="text-muted-foreground">
          Libur: {roster.off.map((row) => row.nickname).join(", ")}
        </p>
      ) : null}
      {roster.pending.length > 0 ? (
        <p className="text-muted-foreground">
          Minta libur: {roster.pending.map((row) => row.nickname).join(", ")}
        </p>
      ) : null}
    </div>
  )
}

function publicPrefsDay(cell: { date: string; inMonth: boolean }): PrefsDay {
  return {
    date: cell.date,
    inMonth: cell.inMonth,
    kind: "empty",
    label: "",
    note: "",
    alternativeDate: "",
    source: "",
    slotNames: [],
    suggestionId: "",
  }
}
