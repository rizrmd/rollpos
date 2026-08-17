import type { Database } from "@/db/database"
import { useMemo, useState } from "react"

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
import {
  assignStaffToDates,
  generateFairRemainingWeeks,
} from "@/db/staffing-write"
import { lockedWorkDates, monthWeekStarts } from "@/lib/calendar-select"
import { formatSelectedDates } from "@/lib/format"
import { floorRolesOf } from "@/lib/permissions"
import {
  staffWeekLoad,
  WORKLOAD_BAND_LABEL,
  workloadBand,
  type WorkloadBand,
} from "@/lib/schedule-board"
import { MonthApprovals } from "@/screens/month-approvals"
import { monthGrid, monthStartOf, todayJakarta, weekStartOn } from "@/lib/time"
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
import { detectWarnings } from "@/lib/warnings"

export function WeekScreen({
  database,
  actor,
  settings,
  staff,
  slots,
  requirements,
  assignments,
  suggestions,
  offs,
  preferences,
  thisWeekStart,
}: {
  database: Database
  actor: StaffRecord | null
  settings: OutletSettingsRecord | null
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  assignments: AssignmentRecord[]
  suggestions: SuggestionRecord[]
  offs: DayOffRecord[]
  preferences: PreferenceRecord[]
  thisWeekStart: string
  upcomingWeekStart: string
}) {
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const [monthCursor, setMonthCursor] = useState(() =>
    monthStartOf(thisWeekStart)
  )
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [workingIds, setWorkingIds] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const activeStaff = staff.filter(
    (member) =>
      member.isActive && !isStaffDeleted(member) && isIncludedInAttendance(member)
  )
  const monthDates = monthGrid(monthCursor, weekStartsOn)
    .filter((cell) => cell.inMonth)
    .map((cell) => cell.date)
  const weekStarts = monthWeekStarts(monthCursor, weekStartsOn).filter(
    (start) => start >= thisWeekStart
  )
  const monthAssignments = assignments.filter(
    (row) =>
      row.status !== "cancelled" &&
      row.workDate >= (monthDates[0] ?? "") &&
      row.workDate <= (monthDates[monthDates.length - 1] ?? "")
  )
  const locked = lockedWorkDates(monthAssignments)
  const published = monthAssignments.some((row) => row.status === "published")
  const warnings = settings
    ? detectWarnings({
        settings,
        staff,
        slots: activeSlots,
        requirements,
        assignments,
        offs,
        suggestions,
        weekStart: weekStartOn(monthCursor, weekStartsOn),
        published,
      })
    : []

  const loads = useMemo(() => {
    const peerHours = activeStaff.map((member) => {
      const load = staffWeekLoad({
        member,
        dates: monthDates,
        assignments: monthAssignments,
        offs,
        suggestions,
        preferences,
        warnings,
        weekStart: weekStartOn(monthCursor, weekStartsOn),
      })
      return load.hours
    })
    return activeStaff.map((member) => {
      const load = staffWeekLoad({
        member,
        dates: monthDates,
        assignments: monthAssignments,
        offs,
        suggestions,
        preferences,
        warnings,
        weekStart: weekStartOn(monthCursor, weekStartsOn),
      })
      return {
        member,
        ...load,
        band: workloadBand(load.hours, peerHours, settings?.hoursSkewPercent ?? 25),
      }
    })
  }, [
    activeStaff,
    monthAssignments,
    monthCursor,
    monthDates,
    offs,
    preferences,
    settings?.hoursSkewPercent,
    suggestions,
    warnings,
    weekStartsOn,
  ])

  async function guarded(action: () => Promise<void>, ok?: string) {
    try {
      setError(null)
      setBusy(true)
      await action()
      if (ok) setNotice(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function openSelection(dates: string[]) {
    const sorted = [...dates].sort()
    const already = new Set(
      monthAssignments
        .filter((row) => sorted.includes(row.workDate))
        .map((row) => row.staffId)
    )
    setSelectedDates(sorted)
    setWorkingIds(
      already.size > 0
        ? activeStaff.filter((member) => already.has(member.id)).map((row) => row.id)
        : []
    )
  }

  async function saveSelection() {
    if (!actor || selectedDates.length === 0) return
    await guarded(async () => {
      await assignStaffToDates(database, actor, {
        dates: selectedDates,
        workingStaffIds: workingIds,
        weekStartsOn,
      })
      const generated = await generateFairRemainingWeeks(database, weekStarts)
      setSelectedDates([])
      setWorkingIds([])
      setNotice(
        generated > 0
          ? `${selectedDates.length} tanggal ditetapkan. Sisa minggu diisi otomatis yang paling adil.`
          : `${selectedDates.length} tanggal ditetapkan.`
      )
    })
  }

  async function generateRemaining() {
    if (!actor) return
    await guarded(async () => {
      const generated = await generateFairRemainingWeeks(database, weekStarts)
      setNotice(
        generated > 0
          ? "Sisa tanggal diisi otomatis menurut beban yang paling adil."
          : "Tidak ada tanggal sisa yang perlu diisi."
      )
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />

      <MonthApprovals
        monthCursor={monthCursor}
        onMonthChange={(next) => {
          setMonthCursor(next)
          setSelectedDates([])
        }}
        weekStartsOn={weekStartsOn}
        today={todayJakarta()}
        staff={activeStaff}
        slots={activeSlots}
        assignments={assignments}
        offs={offs}
        suggestions={suggestions}
        selectedDates={selectedDates}
        onSelectDates={actor ? openSelection : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="touch"
          disabled={!actor || busy || weekStarts.length === 0}
          onClick={() => void generateRemaining()}
        >
          Generate sisa secara adil
        </Button>
        {locked.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {locked.length} tanggal sudah ditetapkan manager
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tanggal yang tidak dipilih akan diisi sistem.
          </p>
        )}
      </div>

      <section aria-labelledby="beban-staff">
        <h3 id="beban-staff" className="mb-2 text-sm font-medium">
          Beban staff bulan ini
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {loads.map((load) => (
            <li key={load.member.id} className="border bg-card px-3 py-2 text-sm">
              <p className="flex items-center justify-between gap-2 font-medium">
                <span>{load.member.name}</span>
                <BandBadge band={load.band} />
              </p>
              <p className="text-muted-foreground">
                {load.workDays} hari · {load.hours.toFixed(1)} jam · {load.offDays}{" "}
                libur
              </p>
            </li>
          ))}
        </ul>
      </section>

      <DateAssignDialog
        open={Boolean(actor) && selectedDates.length > 0}
        dates={selectedDates}
        loads={loads}
        workingIds={workingIds}
        busy={busy}
        onToggle={(staffId) => {
          setWorkingIds((current) =>
            current.includes(staffId)
              ? current.filter((id) => id !== staffId)
              : [...current, staffId]
          )
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDates([])
            setWorkingIds([])
          }
        }}
        onSave={() => void saveSelection()}
      />
    </div>
  )
}

function BandBadge({ band }: { band: WorkloadBand }) {
  return (
    <Badge
      variant={
        band === "padat" ? "destructive" : band === "longgar" ? "secondary" : "outline"
      }
      className={
        band === "longgar"
          ? "border-emerald-700/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : undefined
      }
    >
      {WORKLOAD_BAND_LABEL[band]}
    </Badge>
  )
}

function DateAssignDialog({
  open,
  dates,
  loads,
  workingIds,
  busy,
  onToggle,
  onOpenChange,
  onSave,
}: {
  open: boolean
  dates: string[]
  loads: {
    member: StaffRecord
    workDays: number
    hours: number
    band: WorkloadBand
  }[]
  workingIds: string[]
  busy: boolean
  onToggle: (staffId: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Siapa kerja</DialogTitle>
          <DialogDescription>
            {formatSelectedDates(dates)}. Centang yang kerja; sisanya diisi
            otomatis yang paling adil.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {loads.map((load) => {
            const checked = workingIds.includes(load.member.id)
            return (
              <li key={load.member.id}>
                <button
                  type="button"
                  onClick={() => onToggle(load.member.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border px-3 py-2.5 text-left",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    checked ? "bg-primary/10" : "bg-background hover:bg-muted"
                  )}
                >
                  <span>
                    <span className="block font-medium">{load.member.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {floorRolesOf(load.member.roles).join(" · ") || "—"}
                      {` · ${load.workDays} hari · ${load.hours.toFixed(1)} jam`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <BandBadge band={load.band} />
                    <span className="text-sm font-medium">
                      {checked ? "kerja" : "libur"}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="touch"
            disabled={busy}
            onClick={onSave}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
