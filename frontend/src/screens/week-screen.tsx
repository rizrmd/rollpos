import type { Database } from "@/db/database"
import { useEffect, useMemo, useState } from "react"

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
  acceptSuggestion,
  applyRecommendationDraft,
  cancelAssignment,
  declineSuggestion,
  publishWeek,
  upsertAssignment,
} from "@/db/staffing-write"
import { formatIsoWeekday, formatIsoWeekdayShort, formatWeekRange } from "@/lib/format"
import { floorRolesOf } from "@/lib/permissions"
import { recommendSchedule } from "@/lib/recommend"
import { addDays, formatMinutes, slotHours, weekDates } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  AssignmentRecord,
  DayOffRecord,
  OutletSettingsRecord,
  PreferenceRecord,
  RoleRequirementRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
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
  weekStart: initialWeekStart,
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
  weekStart: string
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart)
  const [notice, setNotice] = useState<string | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [recommendOpen, setRecommendOpen] = useState(false)
  const [cell, setCell] = useState<{ date: string; slot: SlotRecord } | null>(null)

  useEffect(() => {
    setWeekStart(initialWeekStart)
  }, [initialWeekStart])

  const dates = weekDates(weekStart)
  const activeSlots = slots.filter((slot) => slot.isActive)
  const weekAssignments = assignments.filter(
    (row) =>
      row.workDate >= weekStart &&
      row.workDate <= dates[6] &&
      row.status !== "cancelled"
  )
  const published = weekAssignments.some((row) => row.status === "published")
  const pendingSuggest = suggestions.filter(
    (row) => row.weekStart === weekStart && row.status === "suggested"
  )
  const warnings = settings
    ? detectWarnings({
        settings,
        staff,
        slots: activeSlots,
        requirements,
        assignments,
        offs,
        suggestions,
        weekStart,
        published,
      })
    : []
  const understaffed = warnings.filter((item) => item.code === "understaffed").length

  async function runRecommend() {
    if (!settings || !actor) return
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
    })
    await applyRecommendationDraft(
      database,
      actor,
      weekStart,
      result.assignments,
      result.offs
    )
    setNotice("Draft rekomendasi diterapkan. Cek papan lalu publish.")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          aria-label="Minggu sebelumnya"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          Sebelumnya
        </Button>
        <p className="min-w-40 flex-1 text-center text-sm font-medium">
          {formatWeekRange(weekStart)}
          <span className="block text-muted-foreground">
            {weekStart === initialWeekStart ? "minggu ini" : ""}{" "}
            {published ? "· terbit" : "· draft"}
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="touch"
          aria-label="Minggu berikutnya"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
        >
          Berikutnya
        </Button>
      </div>

      <LiveNotice message={notice} />

      {actor ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="touch" onClick={() => setInboxOpen(true)}>
            Inbox libur
            {pendingSuggest.length > 0 ? ` (${pendingSuggest.length})` : ""}
          </Button>
          <Button type="button" variant="outline" size="touch" onClick={() => setRecommendOpen(true)}>
            Isi otomatis
          </Button>
          <Button type="button" size="touch" onClick={() => setPublishOpen(true)}>
            Publish…
          </Button>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {warnings.slice(0, 6).map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}

      <ol className="flex gap-3 overflow-x-auto pb-2">
        {dates.map((date) => (
          <li
            key={date}
            className="w-[16rem] shrink-0 rounded-2xl border bg-card p-3"
          >
            <h3 className="mb-3 font-medium">{formatIsoWeekday(date)}</h3>
            <div className="flex flex-col gap-2">
              {activeSlots.map((slot) => {
                const filled = weekAssignments.filter(
                  (row) => row.templateId === slot.id && row.workDate === date
                )
                const ok = filled.length >= slot.minStaffCount
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!actor}
                    onClick={() => setCell({ date, slot })}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left",
                      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      ok
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : "bg-destructive/10"
                    )}
                  >
                    <span className="flex items-center justify-between text-sm font-medium">
                      {slot.name}
                      <span>
                        {filled.length}/{slot.minStaffCount}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
                    </span>
                    <ul className="mt-1 text-sm">
                      {filled.map((row) => (
                        <li key={row.id}>
                          {staff.find((item) => item.id === row.staffId)?.nickname ??
                            row.staffId}
                          {row.dutyRole ? ` · ${row.dutyRole}` : ""}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
              <p className="text-xs text-muted-foreground">
                Libur:{" "}
                {offs
                  .filter((row) => row.workDate === date)
                  .map(
                    (row) =>
                      staff.find((item) => item.id === row.staffId)?.nickname ??
                      row.staffId
                  )
                  .join(", ") || "—"}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="beban-staff">
        <h3 id="beban-staff" className="mb-2 text-sm font-medium">
          Beban staff
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {staff
            .filter((member) => member.isActive)
            .map((member) => {
              const mine = weekAssignments.filter((row) => row.staffId === member.id)
              const hours = mine.reduce(
                (sum, row) => sum + slotHours(row.startMinutes, row.endMinutes),
                0
              )
              const offDays = offs.filter(
                (row) => row.staffId === member.id && dates.includes(row.workDate)
              ).length
              return (
                <li key={member.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-muted-foreground">
                    {new Set(mine.map((row) => row.workDate)).size} hari · {hours.toFixed(1)} jam ·{" "}
                    {offDays} libur
                  </p>
                </li>
              )
            })}
        </ul>
      </section>

      <AssignDialog
        open={Boolean(cell && actor)}
        cell={cell}
        staff={staff}
        assignments={weekAssignments}
        offs={offs}
        onOpenChange={(open) => {
          if (!open) setCell(null)
        }}
        onAdd={async (member) => {
          if (!actor || !cell) return
          await upsertAssignment(database, actor, {
            staffId: member.id,
            templateId: cell.slot.id,
            workDate: cell.date,
            startMinutes: cell.slot.startMinutes,
            endMinutes: cell.slot.endMinutes,
            dutyRole: floorRolesOf(member.roles)[0] ?? "",
          })
        }}
        onRemove={async (assignmentId) => {
          if (!actor) return
          await cancelAssignment(database, actor, assignmentId)
        }}
      />

      <Dialog open={inboxOpen} onOpenChange={setInboxOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Inbox libur</DialogTitle>
            <DialogDescription>
              Permintaan minggu {formatWeekRange(weekStart)}. Belum libur resmi.
            </DialogDescription>
          </DialogHeader>
          {pendingSuggest.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada permintaan terbuka.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-3 overflow-auto">
              {dates.map((date) => {
                const rows = pendingSuggest.filter((row) => row.workDate === date)
                if (rows.length === 0) return null
                return (
                  <li key={date}>
                    <p className="mb-2 text-sm font-medium">
                      {formatIsoWeekday(date)}
                      {rows.length > 1 ? (
                        <Badge variant="destructive" className="ml-2">
                          {rows.length}
                        </Badge>
                      ) : null}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {rows.map((row) => (
                        <li key={row.id} className="rounded-lg border px-3 py-2">
                          <p className="font-medium">
                            {staff.find((item) => item.id === row.staffId)?.name}
                          </p>
                          {row.note ? (
                            <p className="text-sm text-muted-foreground">{row.note}</p>
                          ) : null}
                          {actor ? (
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                size="touch"
                                onClick={() => void acceptSuggestion(database, actor, row.id)}
                              >
                                Terima
                              </Button>
                              <Button
                                type="button"
                                size="touch"
                                variant="outline"
                                onClick={() => void declineSuggestion(database, actor, row.id)}
                              >
                                Tolak
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={recommendOpen} onOpenChange={setRecommendOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Isi otomatis draft?</DialogTitle>
            <DialogDescription>
              Mesin akan menimpa draft minggu ini. Absensi tidak berubah.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setRecommendOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              size="touch"
              onClick={async () => {
                await runRecommend()
                setRecommendOpen(false)
              }}
            >
              Terapkan draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Publish {formatWeekRange(weekStart)}?</DialogTitle>
            <DialogDescription>
              {understaffed > 0
                ? `${understaffed} sel masih kurang orang. Staff akan melihat jadwal ini di Hari ini.`
                : "Staff akan melihat jadwal ini di halaman Hari ini."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setPublishOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              size="touch"
              onClick={async () => {
                if (!actor) return
                await publishWeek(database, actor, weekStart)
                setPublishOpen(false)
                setNotice("Minggu dipublish.")
              }}
            >
              {understaffed > 0 ? "Publish tetap" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AssignDialog({
  open,
  cell,
  staff,
  assignments,
  offs,
  onOpenChange,
  onAdd,
  onRemove,
}: {
  open: boolean
  cell: { date: string; slot: SlotRecord } | null
  staff: StaffRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  onOpenChange: (open: boolean) => void
  onAdd: (member: StaffRecord) => Promise<void>
  onRemove: (assignmentId: string) => Promise<void>
}) {
  const filled = useMemo(() => {
    if (!cell) return []
    return assignments.filter(
      (row) => row.templateId === cell.slot.id && row.workDate === cell.date
    )
  }, [assignments, cell])
  const filledIds = new Set(filled.map((row) => row.staffId))
  const available = staff.filter((member) => {
    if (!cell || !member.isActive) return false
    if (filledIds.has(member.id)) return false
    if (offs.some((row) => row.staffId === member.id && row.workDate === cell.date)) {
      return false
    }
    return true
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {cell ? `${formatIsoWeekdayShort(cell.date)} · ${cell.slot.name}` : "Isi shift"}
          </DialogTitle>
          <DialogDescription>
            {cell
              ? `${formatMinutes(cell.slot.startMinutes)}–${formatMinutes(cell.slot.endMinutes)} · butuh ${cell.slot.minStaffCount}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {filled.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span>
                {staff.find((item) => item.id === row.staffId)?.name}
                {row.dutyRole ? ` · ${row.dutyRole}` : ""}
              </span>
              <Button type="button" variant="outline" size="touch" onClick={() => void onRemove(row.id)}>
                Hapus
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-2 text-sm font-medium">Tambah orang</p>
          <div className="flex flex-wrap gap-2">
            {available.map((member) => (
              <Button
                key={member.id}
                type="button"
                variant="outline"
                size="touch"
                onClick={() => void onAdd(member)}
              >
                {member.nickname}
              </Button>
            ))}
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada yang tersedia.</p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
