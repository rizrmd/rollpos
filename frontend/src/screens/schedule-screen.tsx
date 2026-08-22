import type { Database } from "@/db/database"
import { useState } from "react"

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
  clearManagerAssignedDates,
  generateFairRemainingWeeks,
} from "@/db/staffing-write"
import { lockedWorkDates, monthWeekStarts } from "@/lib/calendar-select"
import {
  formatIsoWeekday,
  formatMonthYear,
  formatSelectedDates,
} from "@/lib/format"
import { floorRolesOf } from "@/lib/permissions"
import {
  staffWeekLoad,
  WORKLOAD_BAND_LABEL,
  workloadBand,
  type WorkloadBand,
} from "@/lib/schedule-board"
import {
  defaultTemplateIdsForStaff,
  dayRoster,
  templateIdsByStaffOnDates,
  toggleStaffTemplateIds,
} from "@/lib/staff-prefs"
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

export function ScheduleScreen({
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
  const [shiftByStaff, setShiftByStaff] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockedDetailOpen, setLockedDetailOpen] = useState(false)
  const [clearingDate, setClearingDate] = useState<string | null>(null)

  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const activeStaff = staff.filter(
    (member) =>
      member.isActive &&
      !isStaffDeleted(member) &&
      isIncludedInAttendance(member)
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
  const locked = lockedWorkDates(monthAssignments, undefined, offs)
  const lockedDetails = locked.map((date) => ({
    date,
    workers: dayRoster({
      date,
      staff: activeStaff,
      slots: activeSlots,
      assignments: monthAssignments,
      offs,
      suggestions,
    }).slots.flatMap((slot) =>
      slot.people.map((person) => ({
        slotName: slot.slotName,
        person,
      }))
    ),
  }))
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
  const loads = activeStaff.map((member) => {
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
      band: workloadBand(
        load.hours,
        peerHours,
        settings?.hoursSkewPercent ?? 25
      ),
    }
  })

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
    setSelectedDates(sorted)
    setShiftByStaff(templateIdsByStaffOnDates(monthAssignments, sorted))
  }

  function defaultShiftsFor(staffId: string): string[] {
    const member = activeStaff.find((item) => item.id === staffId)
    if (!member) return []
    const date = selectedDates[0] ?? todayJakarta()
    return defaultTemplateIdsForStaff(
      member,
      activeSlots,
      preferences,
      weekStartOn(date, weekStartsOn)
    )
  }

  async function saveSelection() {
    if (!actor || selectedDates.length === 0) return
    const workingStaffIds = Object.keys(shiftByStaff).filter(
      (id) => (shiftByStaff[id]?.length ?? 0) > 0
    )
    await guarded(async () => {
      await assignStaffToDates(database, actor, {
        dates: selectedDates,
        workingStaffIds,
        templateIdsByStaff: shiftByStaff,
        weekStartsOn,
      })
      const generated = await generateFairRemainingWeeks(database, weekStarts)
      setSelectedDates([])
      setShiftByStaff({})
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

  async function clearLockedDate(date: string) {
    if (!actor || clearingDate !== date) return
    await guarded(async () => {
      const cleared = await clearManagerAssignedDates(database, actor, {
        dates: [date],
        weekStartsOn,
      })
      setClearingDate(null)
      setNotice(
        cleared > 0
          ? `${formatIsoWeekday(date)} dikembalikan ke jadwal otomatis.`
          : `${formatIsoWeekday(date)} sudah tidak dikunci manager.`
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
          <Button
            type="button"
            variant="ghost"
            className="h-auto px-2 py-1 text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setLockedDetailOpen(true)}
          >
            {locked.length} tanggal sudah ditetapkan manager
          </Button>
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
            <li
              key={load.member.id}
              className="border bg-card px-3 py-2 text-sm"
            >
              <p className="flex items-center justify-between gap-2 font-medium">
                <span>{load.member.name}</span>
                <BandBadge band={load.band} />
              </p>
              <p className="text-muted-foreground">
                {load.workDays} hari · {load.hours.toFixed(1)} jam ·{" "}
                {load.offDays} libur
              </p>
            </li>
          ))}
        </ul>
      </section>

      <DateAssignDialog
        open={Boolean(actor) && selectedDates.length > 0}
        dates={selectedDates}
        loads={loads}
        slots={activeSlots}
        shiftByStaff={shiftByStaff}
        busy={busy}
        onToggle={(staffId) => {
          setShiftByStaff((current) => {
            if ((current[staffId]?.length ?? 0) > 0) {
              const rest = { ...current }
              delete rest[staffId]
              return rest
            }
            const next = defaultShiftsFor(staffId)
            return next.length > 0 ? { ...current, [staffId]: next } : current
          })
        }}
        onToggleShift={(staffId, templateId) => {
          setShiftByStaff((current) =>
            toggleStaffTemplateIds(current, staffId, templateId)
          )
        }}
        onSelectAll={() => {
          const next: Record<string, string[]> = {}
          for (const member of activeStaff) {
            const ids = defaultShiftsFor(member.id)
            if (ids.length > 0) next[member.id] = ids
          }
          setShiftByStaff(next)
        }}
        onClearAll={() => setShiftByStaff({})}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDates([])
            setShiftByStaff({})
          }
        }}
        onSave={() => void saveSelection()}
      />

      <Dialog open={lockedDetailOpen} onOpenChange={setLockedDetailOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Tanggal ditetapkan manager</DialogTitle>
            <DialogDescription>
              {locked.length} tanggal di {formatMonthYear(monthCursor)} tidak
              diisi ulang oleh sistem.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {lockedDetails.map(({ date, workers }) => (
              <li
                key={date}
                className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatIsoWeekday(date)}</p>
                    {workers.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                        {workers.map(({ slotName, person }) => (
                          <li key={`${date}-${slotName}-${person.staffId}`}>
                            {person.name} · {slotName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        Tidak ada yang masuk
                      </p>
                    )}
                  </div>
                  {clearingDate === date ? (
                    <span className="text-xs font-medium text-destructive">
                      Hapus jadwal tanggal ini?
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (clearingDate === date) {
                        void clearLockedDate(date)
                        return
                      }
                      setClearingDate(date)
                    }}
                  >
                    {clearingDate === date ? "Hapus" : "Clear"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => {
                setLockedDetailOpen(false)
                setClearingDate(null)
              }}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BandBadge({ band }: { band: WorkloadBand }) {
  const label = WORKLOAD_BAND_LABEL[band]
  if (!label) return null
  return (
    <Badge
      variant={
        band === "padat"
          ? "destructive"
          : band === "longgar"
            ? "secondary"
            : "outline"
      }
      className={
        band === "longgar"
          ? "border-emerald-700/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : undefined
      }
    >
      {label}
    </Badge>
  )
}

function DateAssignDialog({
  open,
  dates,
  loads,
  slots,
  shiftByStaff,
  busy,
  onToggle,
  onToggleShift,
  onSelectAll,
  onClearAll,
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
  slots: SlotRecord[]
  shiftByStaff: Record<string, string[]>
  busy: boolean
  onToggle: (staffId: string) => void
  onToggleShift: (staffId: string, templateId: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Siapa kerja</DialogTitle>
          <DialogDescription>
            {formatSelectedDates(dates)}. Pilih shift tiap orang; tanpa shift =
            libur. Kosongkan semua = tidak ada yang masuk hari itu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
          >
            Semua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearAll}
          >
            Kosongkan
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {loads.map((load) => {
            const templateIds = shiftByStaff[load.member.id] ?? []
            const working = templateIds.length > 0
            return (
              <li
                key={load.member.id}
                className={cn(
                  "border px-3 py-2.5",
                  working ? "bg-primary/10" : "bg-background"
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(load.member.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 text-left",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  )}
                >
                  <span>
                    <span className="block font-medium">
                      {load.member.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {floorRolesOf(load.member.roles).join(" · ") || "—"}
                      {` · ${load.workDays} hari · ${load.hours.toFixed(1)} jam`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <BandBadge band={load.band} />
                    {working ? null : (
                      <span className="text-sm font-medium">libur</span>
                    )}
                  </span>
                </button>
                {slots.length > 0 ? (
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {slots.map((slot) => {
                      const selected = templateIds.includes(slot.id)
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => onToggleShift(load.member.id, slot.id)}
                          className={cn(
                            "min-h-10 border px-2.5 py-2 text-center text-xs font-medium",
                            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {slot.name}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
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
          <Button type="button" size="touch" disabled={busy} onClick={onSave}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
