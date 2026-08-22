import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
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
import type { Database } from "@/db/database"
import { replaceAssignment } from "@/db/staffing-write"
import {
  formatIsoWeekday,
  formatMonthYear,
  weekdayHeaders,
} from "@/lib/format"
import { canManage, floorRolesOf } from "@/lib/permissions"
import { lockedWorkDates } from "@/lib/calendar-select"
import {
  historyWorkDatesFrom,
  recommendSchedule,
  weekHasActiveAssignments,
} from "@/lib/recommend"
import {
  replacementOptions,
  WORKLOAD_BAND_LABEL,
  type ReplacementOption,
} from "@/lib/schedule-board"
import {
  dayRoster,
  workingInitials,
  type DayRoster,
  type PrefsDay,
  type RosterPerson,
} from "@/lib/staff-prefs"
import {
  addMonths,
  monthGrid,
  monthStartOf,
  todayJakarta,
  weekDates,
  weekStartOn,
} from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  isIncludedInAttendance,
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

type ReplaceTarget = {
  person: RosterPerson
  slotId: string
  slotName: string
}

type PendingReplace = {
  workDate: string
  fromStaffId: string
  toStaffId: string
  templateId: string
  keep: {
    staffId: string
    templateId: string
    startMinutes: number
    endMinutes: number
    dutyRole: string
  }[]
  fromName: string
  toName: string
}

export function PrefsScreen({
  database,
  actor,
  onNeedManager,
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
  database: Database
  actor: StaffRecord | null
  onNeedManager: () => void
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
  const [replacing, setReplacing] = useState<ReplaceTarget | null>(null)
  const [pending, setPending] = useState<PendingReplace | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeStaff = staff.filter(
    (member) =>
      member.isActive && !isStaffDeleted(member) && isIncludedInAttendance(member)
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
      const weekDays = weekDates(weekStart)
      const lockedDates = lockedWorkDates(
        assignments.filter(
          (row) =>
            row.status !== "cancelled" &&
            row.workDate >= weekStart &&
            row.workDate <= weekDays[6]
        ),
        undefined,
        offs
      )
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
        lockedDates,
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
  const pickedWeekStart = picked
    ? weekStartOn(picked.date, weekStartsOn)
    : ""
  const options =
    replacing && picked
      ? replacementOptions({
          staff: activeStaff,
          slots: activeSlots,
          date: picked.date,
          slotId: replacing.slotId,
          fromStaffId: replacing.person.staffId,
          assignments,
          offs,
          proposedAssignments: proposed.assignments,
          dates: weekDates(pickedWeekStart),
          skewPercent: settings?.hoursSkewPercent ?? 25,
        })
      : []

  function keepForDate(date: string): PendingReplace["keep"] {
    const day = dayRoster({
      date,
      staff: activeStaff,
      slots: activeSlots,
      assignments,
      offs,
      proposedAssignments: proposed.assignments,
      suggestions,
    })
    return day.slots.flatMap((slot) => {
      const template = activeSlots.find((item) => item.id === slot.slotId)
      return slot.people.map((person) => {
        const stored = assignments.find(
          (row) =>
            row.staffId === person.staffId &&
            row.templateId === slot.slotId &&
            row.workDate === date &&
            row.status !== "cancelled"
        )
        const member = activeStaff.find((item) => item.id === person.staffId)
        return {
          staffId: person.staffId,
          templateId: slot.slotId,
          startMinutes: stored?.startMinutes ?? template?.startMinutes ?? 0,
          endMinutes: stored?.endMinutes ?? template?.endMinutes ?? 0,
          dutyRole:
            stored?.dutyRole ||
            (member ? (floorRolesOf(member.roles)[0] ?? "") : ""),
        }
      })
    })
  }

  async function applyReplace(payload: PendingReplace, manager: StaffRecord) {
    try {
      setError(null)
      await replaceAssignment(database, manager, payload)
      setNotice(`${payload.toName} menggantikan ${payload.fromName}.`)
      setPending(null)
      setReplacing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function chooseReplacement(option: ReplacementOption) {
    if (!picked || !replacing) return
    const payload: PendingReplace = {
      workDate: picked.date,
      fromStaffId: replacing.person.staffId,
      toStaffId: option.staffId,
      templateId: replacing.slotId,
      keep: keepForDate(picked.date),
      fromName: replacing.person.name,
      toName: option.name,
    }
    if (!actor || !canManage(actor.roles)) {
      setPending(payload)
      onNeedManager()
      return
    }
    void applyReplace(payload, actor)
  }

  useEffect(() => {
    if (!pending || !actor || !canManage(actor.roles)) return
    let cancelled = false
    void (async () => {
      try {
        setError(null)
        await replaceAssignment(database, actor, pending)
        if (cancelled) return
        setNotice(`${pending.toName} menggantikan ${pending.fromName}.`)
        setPending(null)
        setReplacing(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setPending(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [actor, pending, database])

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
      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />
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
          {roster ? (
            <DayRosterList
              roster={roster}
              onPickPerson={(person, slotId, slotName) => {
                setNotice(null)
                setError(null)
                setReplacing({ person, slotId, slotName })
              }}
            />
          ) : null}
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

      <Dialog
        open={Boolean(replacing)}
        onOpenChange={(open) => {
          if (!open) {
            setReplacing(null)
            setPending(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {replacing
                ? `Pengganti ${replacing.person.name}`
                : "Pengganti"}
            </DialogTitle>
            <DialogDescription>
              {replacing
                ? `${replacing.slotName}${picked ? ` · ${formatIsoWeekday(picked.date)}` : ""}. Pilih yang available — longgar lebih adil.`
                : "Pilih orang yang available."}
            </DialogDescription>
          </DialogHeader>
          {options.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {options.map((option) => (
                <li key={option.staffId}>
                  <button
                    type="button"
                    onClick={() => chooseReplacement(option)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span>
                      <span className="block font-medium">{option.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {option.workDays} hari · {option.hours.toFixed(1)} jam
                      </span>
                    </span>
                    {WORKLOAD_BAND_LABEL[option.band] ? (
                      <Badge
                        variant={
                          option.band === "padat"
                            ? "destructive"
                            : option.band === "longgar"
                              ? "secondary"
                              : "outline"
                        }
                        className={
                          option.band === "longgar"
                            ? "border-emerald-700/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : undefined
                        }
                      >
                        {WORKLOAD_BAND_LABEL[option.band]}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tidak ada yang available.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DayRosterList({
  roster,
  onPickPerson,
}: {
  roster: DayRoster
  onPickPerson: (person: RosterPerson, slotId: string, slotName: string) => void
}) {
  const hasWorkers = roster.slots.some((slot) => slot.people.length > 0)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <section aria-label="Roster shift">
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
                      <li key={person.staffId}>
                        <button
                          type="button"
                          onClick={() =>
                            onPickPerson(person, slot.slotId, slot.slotName)
                          }
                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left font-medium hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {person.name}
                        </button>
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
