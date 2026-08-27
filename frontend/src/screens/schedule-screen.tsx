import type { Database } from "@/db/database"
import { useRef, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  undoClearManagerAssignedDates,
  upsertStaff,
  type ClearManagerRestore,
} from "@/db/staffing-write"
import {
  isEmptyRosterLock,
  lockedWorkDates,
  monthWeekStarts,
} from "@/lib/calendar-select"
import { formatIsoWeekday, formatMonthYear, WEEKDAY_LONG } from "@/lib/format"
import { floorRolesOf } from "@/lib/permissions"
import { MANAGER_ASSIGN_NOTE } from "@/lib/recommend"
import {
  staffWeekLoad,
  WORKLOAD_BAND_LABEL,
  workloadBand,
  type WorkloadBand,
} from "@/lib/schedule-board"
import {
  defaultTemplateIdsForStaff,
  dayRoster,
  preferredSlotIdsFromMember,
  preferredSlotIdsToStore,
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
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [configuringMember, setConfiguringMember] =
    useState<StaffRecord | null>(null)
  const [undoRestore, setUndoRestore] = useState<ClearManagerRestore | null>(
    null
  )
  const autosaveTimer = useRef<number | null>(null)
  const pendingAutosave = useRef<{
    dates: string[]
    shifts: Record<string, string[]>
  } | null>(null)
  const canResetSelection = Boolean(
    actor &&
    (actor.name.trim().toLowerCase() === "rizky" ||
      actor.nickname.trim().toLowerCase() === "rizky")
  )

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
  const selectedDateSet = new Set(selectedDates)
  const adjustmentActorIds = new Set(
    assignments
      .filter(
        (row) =>
          selectedDateSet.has(row.workDate) &&
          row.status !== "cancelled" &&
          row.note === MANAGER_ASSIGN_NOTE &&
          row.actorStaffId
      )
      .map((row) => row.actorStaffId as string)
  )
  for (const off of offs) {
    if (
      selectedDateSet.has(off.workDate) &&
      isEmptyRosterLock(off) &&
      off.actorStaffId
    ) {
      adjustmentActorIds.add(off.actorStaffId)
    }
  }
  const adjustmentActors = [...adjustmentActorIds].map((id) => {
    const member = staff.find((item) => item.id === id)
    return member ? member.nickname || member.name : "Manager"
  })
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

  async function flushAutosave() {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    const pending = pendingAutosave.current
    pendingAutosave.current = null
    if (!actor || !pending || pending.dates.length === 0) return
    const workingStaffIds = Object.keys(pending.shifts).filter(
      (id) => (pending.shifts[id]?.length ?? 0) > 0
    )
    await guarded(async () => {
      await assignStaffToDates(database, actor, {
        dates: pending.dates,
        workingStaffIds,
        templateIdsByStaff: pending.shifts,
        weekStartsOn,
      })
      await generateFairRemainingWeeks(database, weekStarts)
      setNotice("Perubahan jadwal tersimpan otomatis.")
    })
  }

  function queueAutosave(next: Record<string, string[]>) {
    setShiftByStaff(next)
    pendingAutosave.current = {
      dates: [...selectedDates],
      shifts: next,
    }
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
    }
    autosaveTimer.current = window.setTimeout(() => {
      void flushAutosave()
    }, 350)
  }

  async function resetSelectedDates() {
    if (!actor || selectedDates.length === 0) return
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    pendingAutosave.current = null
    const dates = [...selectedDates]
    await guarded(async () => {
      await clearManagerAssignedDates(database, actor, { dates, weekStartsOn })
      setSelectedDates([])
      setShiftByStaff({})
      setNotice(`${dates.length} tanggal dikembalikan ke jadwal otomatis.`)
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
    const restore: ClearManagerRestore = {}
    await guarded(async () => {
      const cleared = await clearManagerAssignedDates(
        database,
        actor,
        { dates: [date], weekStartsOn },
        { restore }
      )
      setClearingDate(null)
      setUndoRestore(restore)
      setNotice(
        cleared > 0
          ? `${formatIsoWeekday(date)} dikembalikan ke jadwal otomatis.`
          : `${formatIsoWeekday(date)} sudah tidak dikunci manager.`
      )
    })
  }

  async function clearAllLockedDates() {
    if (!actor || locked.length === 0) return
    const restore: ClearManagerRestore = {}
    await guarded(async () => {
      const cleared = await clearManagerAssignedDates(
        database,
        actor,
        { dates: locked, weekStartsOn },
        { restore }
      )
      setConfirmClearAll(false)
      setClearingDate(null)
      setUndoRestore(restore)
      setNotice(
        cleared > 0
          ? `${cleared} penetapan manager pada ${locked.length} tanggal dikembalikan ke jadwal otomatis.`
          : "Tidak ada penetapan manager yang perlu dihapus."
      )
    })
  }

  async function undoClearLockedDates() {
    if (!actor || !undoRestore) return
    const dates = undoRestore.dates ?? []
    await guarded(async () => {
      await undoClearManagerAssignedDates(database, actor, undoRestore, {
        dates,
        weekStartsOn,
      })
      setUndoRestore(null)
      setNotice("Penetapan manager berhasil dikembalikan.")
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
        auditStaff={staff}
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
                <button
                  type="button"
                  className="rounded-sm text-left underline decoration-muted-foreground/50 underline-offset-4 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setConfiguringMember(load.member)}
                >
                  {load.member.name}
                </button>
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

      <GlobalScheduleDialog
        key={configuringMember?.id ?? "closed"}
        member={configuringMember}
        slots={activeSlots}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setConfiguringMember(null)
        }}
        onSave={async (preferredTemplateIds, defaultDayOffWeekdays) => {
          if (!actor || !configuringMember) return
          await guarded(async () => {
            await upsertStaff(database, actor, {
              id: configuringMember.id,
              name: configuringMember.name,
              nickname: configuringMember.nickname,
              isActive: configuringMember.isActive,
              roles: configuringMember.roles,
              includeInAttendance: isIncludedInAttendance(configuringMember),
              preferredTemplateIds,
              defaultDayOffWeekdays,
            })
            setConfiguringMember(null)
          }, `Konfigurasi jadwal ${configuringMember.name} tersimpan.`)
        }}
      />

      <DateAssignDialog
        open={Boolean(actor) && selectedDates.length > 0}
        loads={loads}
        slots={activeSlots}
        shiftByStaff={shiftByStaff}
        adjustedBy={adjustmentActors}
        busy={busy}
        onToggle={(staffId) => {
          const next = { ...shiftByStaff }
          if ((next[staffId]?.length ?? 0) > 0) {
            delete next[staffId]
          } else {
            const defaults = defaultShiftsFor(staffId)
            if (defaults.length > 0) next[staffId] = defaults
          }
          queueAutosave(next)
        }}
        onToggleShift={(staffId, templateId) => {
          queueAutosave(
            toggleStaffTemplateIds(shiftByStaff, staffId, templateId)
          )
        }}
        onSelectAll={() => {
          const next: Record<string, string[]> = {}
          for (const member of activeStaff) {
            const ids = defaultShiftsFor(member.id)
            if (ids.length > 0) next[member.id] = ids
          }
          queueAutosave(next)
        }}
        onClearAll={() => queueAutosave({})}
        canReset={canResetSelection}
        onReset={() => void resetSelectedDates()}
        onOpenChange={(open) => {
          if (!open) {
            void flushAutosave()
            setSelectedDates([])
            setShiftByStaff({})
          }
        }}
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
          {confirmClearAll ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Hapus penetapan manager pada {locked.length} tanggal?
            </p>
          ) : null}
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
            {undoRestore ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={busy}
                onClick={() => void undoClearLockedDates()}
              >
                Undo
              </Button>
            ) : null}
            {locked.length > 0 ? (
              <Button
                type="button"
                variant={confirmClearAll ? "destructive" : "outline"}
                size="touch"
                disabled={busy}
                onClick={() => {
                  if (confirmClearAll) {
                    void clearAllLockedDates()
                    return
                  }
                  setClearingDate(null)
                  setConfirmClearAll(true)
                }}
              >
                {confirmClearAll ? "Hapus semua" : "Clear all"}
              </Button>
            ) : null}
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

function GlobalScheduleDialog({
  member,
  slots,
  busy,
  onOpenChange,
  onSave,
}: {
  member: StaffRecord | null
  slots: SlotRecord[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (
    preferredTemplateIds: string[],
    defaultDayOffWeekdays: number[]
  ) => Promise<void>
}) {
  const [preferred, setPreferred] = useState<string[]>(() =>
    member ? preferredSlotIdsFromMember(member, slots) : []
  )
  const [daysOff, setDaysOff] = useState<number[]>(
    member?.defaultDayOffWeekdays ?? []
  )

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {member ? `Konfigurasi jadwal ${member.name}` : "Konfigurasi jadwal"}
          </DialogTitle>
          <DialogDescription>
            Pengaturan global ini dipakai saat jadwal otomatis dibuat.
          </DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Jadwal default</legend>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <label
                key={slot.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={preferred.includes(slot.id)}
                  onCheckedChange={(checked) =>
                    setPreferred((current) =>
                      checked === true
                        ? [...new Set([...current, slot.id])]
                        : current.filter((id) => id !== slot.id)
                    )
                  }
                />
                {slot.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Hari libur default
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LONG.map((day, weekday) => (
              <label
                key={day}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={daysOff.includes(weekday)}
                  onCheckedChange={(checked) =>
                    setDaysOff((current) =>
                      checked === true
                        ? [...new Set([...current, weekday])]
                        : current.filter((item) => item !== weekday)
                    )
                  }
                />
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            disabled={busy || !member}
            onClick={() =>
              void onSave(
                preferredSlotIdsToStore(preferred, slots),
                [...daysOff].sort((a, b) => a - b)
              )
            }
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  loads,
  slots,
  shiftByStaff,
  adjustedBy,
  busy,
  onToggle,
  onToggleShift,
  onSelectAll,
  onClearAll,
  canReset,
  onReset,
  onOpenChange,
}: {
  open: boolean
  loads: {
    member: StaffRecord
    workDays: number
    hours: number
    band: WorkloadBand
  }[]
  slots: SlotRecord[]
  shiftByStaff: Record<string, string[]>
  adjustedBy: string[]
  busy: boolean
  onToggle: (staffId: string) => void
  onToggleShift: (staffId: string, templateId: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  canReset: boolean
  onReset: () => void
  onOpenChange: (open: boolean) => void
}) {
  const pageSize = 4
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(loads.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleLoads = loads.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Siapa kerja</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onSelectAll}
          >
            Semua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClearAll}
          >
            Kosongkan
          </Button>
        </div>
        <ul className="grid gap-2">
          {visibleLoads.map((load) => {
            const templateIds = shiftByStaff[load.member.id] ?? []
            const working = templateIds.length > 0
            return (
              <li
                key={load.member.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border px-3 py-2",
                  working ? "bg-primary/10" : "bg-background"
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggle(load.member.id)}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-2 text-left",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {load.member.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
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
                  <div className="flex gap-1">
                    {slots.map((slot) => {
                      const selected = templateIds.includes(slot.id)
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={busy}
                          onClick={() => onToggleShift(load.member.id, slot.id)}
                          className={cn(
                            "min-h-9 min-w-14 border px-2 py-1.5 text-center text-xs font-medium",
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
        {pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Sebelumnya
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentPage + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </Button>
          </div>
        ) : null}
        {adjustedBy.length > 0 || canReset ? (
          <DialogFooter>
            {adjustedBy.length > 0 ? (
              <p className="mr-auto self-center bg-amber-100 px-2 py-1 text-left text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Disesuaikan manual oleh {adjustedBy.join(", ")}
              </p>
            ) : null}
            {canReset ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={busy}
                onClick={onReset}
              >
                Reset
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
