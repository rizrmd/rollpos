import type { Database } from "@/db/database"
import { useMemo, useState } from "react"
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
import {
  acceptSuggestion,
  addOfficialOff,
  applyRecommendationDraft,
  cancelAssignment,
  declineSuggestion,
  publishWeek,
  removeOfficialOff,
  upsertAssignment,
} from "@/db/staffing-write"
import { MonthApprovals } from "@/screens/month-approvals"
import {
  formatIsoWeekday,
  formatIsoWeekdayShort,
  formatWeekRange,
  preferenceDeadlineLabel,
} from "@/lib/format"
import { floorRolesOf } from "@/lib/permissions"
import { recommendSchedule } from "@/lib/recommend"
import {
  alternativeOffDate,
  cellCoverage,
  dayHeat,
  groupWarnings,
  pickBoardWeekStart,
  staffWeekLoad,
  summarizeRecommendation,
  unscheduledOnDate,
  weekRelation,
  type CoverageTone,
  type DayHeat,
} from "@/lib/schedule-board"
import { addDays, formatMinutes, monthStartOf, todayJakarta, weekDates, weekStartOn } from "@/lib/time"
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

const WEEK_LABEL: Record<ReturnType<typeof weekRelation>, string> = {
  past: "minggu lalu",
  current: "minggu ini",
  next: "minggu depan",
  future: "minggu lain",
}

const TONE_CLASS: Record<CoverageTone, string> = {
  ok: "border-emerald-700/20 bg-emerald-50 dark:bg-emerald-950/30",
  tight: "border-amber-700/25 bg-amber-50 dark:bg-amber-950/30",
  short: "border-destructive/40 bg-destructive/10",
}

const HEAT_CLASS: Record<DayHeat, string> = {
  cool: "",
  warm: "border-amber-700/30 bg-amber-50/70 dark:bg-amber-950/20",
  hot: "border-destructive/40 bg-destructive/5",
}

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
  upcomingWeekStart,
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
  const [weekStart, setWeekStart] = useState(() =>
    pickBoardWeekStart({
      thisWeekStart,
      upcomingWeekStart,
      assignments,
      suggestions,
    })
  )
  const [boardView, setBoardView] = useState<"week" | "month">("week")
  const [monthCursor, setMonthCursor] = useState(() => monthStartOf(thisWeekStart))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [recommendOpen, setRecommendOpen] = useState(false)
  const [cell, setCell] = useState<{ date: string; slot: SlotRecord } | null>(
    null
  )
  const [daySheet, setDaySheet] = useState<string | null>(null)

  const dates = weekDates(weekStart)
  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const activeStaff = staff.filter((member) => member.isActive)
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
  const counts = groupWarnings(warnings)
  const relation = weekRelation(weekStart, thisWeekStart)
  const minCoverage = activeSlots.reduce(
    (sum, slot) => sum + slot.minStaffCount,
    0
  )

  const recommendPreview =
    settings && recommendOpen
      ? (() => {
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
          return {
            result,
            summary: summarizeRecommendation({
              proposedAssignments: result.assignments,
              proposedOffs: result.offs,
              grantedSuggestionIds: result.grantedSuggestionIds,
              recommendedDayOff: result.recommendedDayOff,
              currentAssignments: weekAssignments,
            }),
          }
        })()
      : null

  async function guarded(action: () => Promise<void>, ok?: string) {
    try {
      setError(null)
      await action()
      if (ok) setNotice(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function runRecommend() {
    if (!settings || !actor || !recommendPreview) return
    await applyRecommendationDraft(
      database,
      actor,
      weekStart,
      recommendPreview.result.assignments,
      recommendPreview.result.offs
    )
    setNotice("Draft rekomendasi diterapkan. Cek papan lalu publish.")
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={boardView === "week" ? "secondary" : "outline"}
            aria-pressed={boardView === "week"}
            onClick={() => setBoardView("week")}
          >
            Minggu
          </Button>
          <Button
            type="button"
            size="sm"
            variant={boardView === "month" ? "secondary" : "outline"}
            aria-pressed={boardView === "month"}
            onClick={() => {
              setMonthCursor(monthStartOf(weekStart))
              setBoardView("month")
            }}
          >
            Bulan
          </Button>
        </div>
        {boardView === "week" ? (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                aria-label="Minggu sebelumnya"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-base font-medium">{formatWeekRange(weekStart)}</p>
                <p className="text-sm text-muted-foreground">
                  {WEEK_LABEL[relation]} · {published ? "terbit" : "draft"}
                  {settings
                    ? ` · pref tutup ${preferenceDeadlineLabel(
                        settings.preferenceDeadlineWeekday,
                        settings.preferenceDeadlineMinutes
                      )}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                aria-label="Minggu berikutnya"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={relation === "current" ? "secondary" : "outline"}
                onClick={() => setWeekStart(thisWeekStart)}
              >
                Minggu ini
              </Button>
              <Button
                type="button"
                size="sm"
                variant={relation === "next" ? "secondary" : "outline"}
                onClick={() => setWeekStart(upcomingWeekStart)}
              >
                Minggu depan
                {suggestions.some(
                  (row) =>
                    row.weekStart === upcomingWeekStart && row.status === "suggested"
                )
                  ? ` · ${
                      suggestions.filter(
                        (row) =>
                          row.weekStart === upcomingWeekStart &&
                          row.status === "suggested"
                      ).length
                    }`
                  : ""}
              </Button>
            </div>
          </>
        ) : null}
      </header>

      <LiveNotice message={notice} />
      <LiveNotice message={error} tone="error" />

      {boardView === "week" ? (
        <p className="text-sm text-muted-foreground">
          {counts.understaffed > 0
            ? `${counts.understaffed} sel kurang`
            : "Semua sel aman"}
          {" · "}
          {counts.pileup > 0
            ? `${counts.pileup} hari panas`
            : "libur tidak menumpuk"}
          {" · "}
          {counts.noOff > 0
            ? `${counts.noOff} orang belum libur`
            : "libur sudah dibagi"}
        </p>
      ) : null}

      {actor ? (
        <ol className="grid gap-2 sm:grid-cols-3">
          <li>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="h-full w-full flex-col items-start gap-1 py-3"
              onClick={() => setInboxOpen(true)}
            >
              <span className="text-xs text-muted-foreground">1 · Putuskan</span>
              <span>
                Inbox libur
                {pendingSuggest.length > 0 ? ` (${pendingSuggest.length})` : ""}
              </span>
            </Button>
          </li>
          <li>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="h-full w-full flex-col items-start gap-1 py-3"
              onClick={() => setRecommendOpen(true)}
            >
              <span className="text-xs text-muted-foreground">2 · Isi draft</span>
              <span>Isi otomatis</span>
            </Button>
          </li>
          <li>
            <Button
              type="button"
              size="touch"
              className="h-full w-full flex-col items-start gap-1 py-3"
              onClick={() => setPublishOpen(true)}
            >
              <span className="text-xs text-primary-foreground/80">
                3 · Terbitkan
              </span>
              <span>Publish…</span>
            </Button>
          </li>
        </ol>
      ) : null}

      {boardView === "month" ? (
        <MonthApprovals
          monthCursor={monthCursor}
          onMonthChange={setMonthCursor}
          weekStartsOn={settings?.weekStartsOn ?? 1}
          today={todayJakarta()}
          staff={activeStaff}
          offs={offs}
          suggestions={suggestions}
          onPickDate={(date) => {
            setWeekStart(weekStartOn(date, settings?.weekStartsOn ?? 1))
            setBoardView("week")
          }}
        />
      ) : null}

      {boardView === "week" && warnings.length > 0 ? (
        <details className="rounded-none border bg-muted/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            {warnings.length} peringatan — ketuk untuk detail
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {warnings.slice(0, 12).map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                {humanWarning(warning.message)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {boardView === "week" ? (
      <>
      <ol className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
        {dates.map((date) => {
          const daySuggest = pendingSuggest.filter((row) => row.workDate === date)
          const dayOffs = offs.filter((row) => row.workDate === date)
          const heat = dayHeat(daySuggest.length, activeStaff.length, minCoverage)
          const open = unscheduledOnDate(activeStaff, date, weekAssignments, offs)
          return (
            <li
              key={date}
              className={cn(
                "w-[13.5rem] shrink-0 snap-start border bg-card p-3",
                HEAT_CLASS[heat]
              )}
            >
              <button
                type="button"
                className="mb-3 flex w-full items-start justify-between gap-2 text-left"
                onClick={() => setDaySheet(date)}
              >
                <span>
                  <span className="block font-medium">
                    {formatIsoWeekdayShort(date)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    ketuk hari
                  </span>
                </span>
                {heat === "hot" ? (
                  <Badge variant="destructive">panas {daySuggest.length}</Badge>
                ) : heat === "warm" ? (
                  <Badge variant="outline">minta {daySuggest.length}</Badge>
                ) : null}
              </button>

              <div className="flex flex-col gap-2">
                {activeSlots.map((slot) => {
                  const filled = weekAssignments.filter(
                    (row) => row.templateId === slot.id && row.workDate === date
                  )
                  const cover = cellCoverage(filled, slot, requirements)
                  const cellWarn = warnings.some(
                    (row) =>
                      row.workDate === date &&
                      row.templateId === slot.id &&
                      row.code === "understaffed"
                  )
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!actor}
                      onClick={() => setCell({ date, slot })}
                      className={cn(
                        "border px-3 py-2 text-left",
                        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        TONE_CLASS[cover.tone]
                      )}
                    >
                      <span className="flex items-center justify-between text-sm font-medium">
                        <span>
                          {slot.name}
                          {cellWarn ? (
                            <span className="ml-1 text-destructive">•</span>
                          ) : null}
                        </span>
                        <span>
                          {cover.filled}/{cover.min}
                          {cover.tone === "ok"
                            ? " ✓"
                            : cover.tone === "short"
                              ? " !"
                              : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatMinutes(slot.startMinutes)}–
                        {formatMinutes(slot.endMinutes)}
                        {cover.roles.length > 0
                          ? ` · ${cover.roles
                              .map((row) => `${row.role} ${row.have}/${row.min}`)
                              .join(" · ")}`
                          : ""}
                      </span>
                      <ul className="mt-1 text-sm">
                        {filled.map((row) => (
                          <li key={row.id}>
                            {nick(staff, row.staffId)}
                            {row.dutyRole ? ` · ${row.dutyRole}` : ""}
                          </li>
                        ))}
                        {filled.length === 0 ? (
                          <li className="text-muted-foreground">kosong</li>
                        ) : null}
                      </ul>
                    </button>
                  )
                })}

                <p className="text-xs text-muted-foreground">
                  Libur:{" "}
                  {dayOffs
                    .map((row) => nick(staff, row.staffId))
                    .join(", ") || "—"}
                </p>
                {daySuggest.length > 0 ? (
                  <p className="text-xs">
                    Minta:{" "}
                    {daySuggest
                      .map((row) => nick(staff, row.staffId))
                      .join(", ")}
                  </p>
                ) : null}
                {open.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Belum diisi: {open.map((row) => row.nickname).join(", ")}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      <section aria-labelledby="beban-staff">
        <h3 id="beban-staff" className="mb-2 text-sm font-medium">
          Beban staff
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {activeStaff.map((member) => {
            const load = staffWeekLoad({
              member,
              dates,
              assignments: weekAssignments,
              offs,
              suggestions,
              preferences,
              warnings,
              weekStart,
            })
            const preferred = activeSlots.find(
              (slot) => slot.id === load.preferredSlotId
            )
            return (
              <li key={member.id} className="border bg-card px-3 py-2 text-sm">
                <p className="font-medium">{member.name}</p>
                <p className="text-muted-foreground">
                  {load.workDays} hari · {load.hours.toFixed(1)} jam ·{" "}
                  {load.offDays} libur
                  {load.consecutive > 1 ? ` · ${load.consecutive} beruntun` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {preferred ? `mau ${preferred.name}` : "pref belum diisi"}
                  {load.suggestDates.length > 0
                    ? ` · minta ${load.suggestDates
                        .map((date) => formatIsoWeekdayShort(date))
                        .join(", ")}`
                    : ""}
                </p>
                {load.warningCodes.length > 0 ? (
                  <p className="mt-1 text-xs text-destructive">
                    {load.warningCodes
                      .map((code) => WARNING_CHIP[code] ?? code)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
      </>
      ) : null}

      <AssignDialog
        open={Boolean(cell && actor)}
        cell={cell}
        staff={activeStaff}
        slots={activeSlots}
        assignments={weekAssignments}
        offs={offs}
        requirements={requirements}
        onOpenChange={(open) => {
          if (!open) setCell(null)
        }}
        onAdd={async (member, slot, allSlots) => {
          if (!actor || !cell) return
          const targets = allSlots ? activeSlots : [slot]
          await guarded(async () => {
            for (const item of targets) {
              await upsertAssignment(database, actor, {
                staffId: member.id,
                templateId: item.id,
                workDate: cell.date,
                startMinutes: item.startMinutes,
                endMinutes: item.endMinutes,
                dutyRole: floorRolesOf(member.roles)[0] ?? "",
              })
            }
          })
        }}
        onRole={async (row, dutyRole) => {
          if (!actor) return
          await guarded(() =>
            upsertAssignment(database, actor, {
              staffId: row.staffId,
              templateId: row.templateId,
              workDate: row.workDate,
              startMinutes: row.startMinutes,
              endMinutes: row.endMinutes,
              dutyRole,
              status: row.status,
              note: row.note,
            })
          )
        }}
        onRemove={async (assignmentId) => {
          if (!actor) return
          await guarded(() => cancelAssignment(database, actor, assignmentId))
        }}
        onOff={async (member) => {
          if (!actor || !cell) return
          await guarded(async () => {
            await addOfficialOff(database, actor, {
              staffId: member.id,
              workDate: cell.date,
              weekStart,
              source: "manager",
            })
            setCell(null)
          }, `${member.nickname} libur ${formatIsoWeekdayShort(cell.date)}.`)
        }}
      />

      <DaySheet
        date={daySheet}
        staff={activeStaff}
        assignments={weekAssignments}
        offs={offs}
        suggestions={pendingSuggest}
        onOpenChange={(open) => {
          if (!open) setDaySheet(null)
        }}
        onOff={async (member) => {
          if (!actor || !daySheet) return
          await guarded(
            () =>
              addOfficialOff(database, actor, {
                staffId: member.id,
                workDate: daySheet,
                weekStart,
                source: "manager",
              }),
            `${member.nickname} libur ${formatIsoWeekdayShort(daySheet)}.`
          )
        }}
        onClearOff={async (offId) => {
          if (!actor) return
          await guarded(() => removeOfficialOff(database, actor, offId))
        }}
        canEdit={Boolean(actor)}
      />

      <Dialog open={inboxOpen} onOpenChange={setInboxOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>Inbox libur</DialogTitle>
            <DialogDescription>
              Permintaan {formatWeekRange(weekStart)}. Belum jadi libur resmi.
            </DialogDescription>
          </DialogHeader>
          {pendingSuggest.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada permintaan terbuka.
            </p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-3 overflow-auto">
              {dates.map((date) => {
                const rows = pendingSuggest.filter((row) => row.workDate === date)
                if (rows.length === 0) return null
                const heat = dayHeat(rows.length, activeStaff.length, minCoverage)
                return (
                  <li key={date}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                      {formatIsoWeekday(date)}
                      {heat === "hot" ? (
                        <Badge variant="destructive">
                          panas {rows.length}
                        </Badge>
                      ) : rows.length > 1 ? (
                        <Badge variant="outline">{rows.length} orang</Badge>
                      ) : (
                        <Badge variant="secondary">longgar</Badge>
                      )}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {rows.map((row) => {
                        const alt = alternativeOffDate({
                          dates,
                          requested: date,
                          staffId: row.staffId,
                          suggestions: pendingSuggest,
                          offs,
                        })
                        return (
                          <li key={row.id} className="border px-3 py-2">
                            <p className="font-medium">
                              {nameOf(staff, row.staffId)}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                #{row.rank}
                              </span>
                            </p>
                            {row.note ? (
                              <p className="text-sm text-muted-foreground">
                                {row.note}
                              </p>
                            ) : null}
                            {actor ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="touch"
                                  onClick={() =>
                                    void guarded(() =>
                                      acceptSuggestion(database, actor, row.id)
                                    )
                                  }
                                >
                                  Terima
                                </Button>
                                <Button
                                  type="button"
                                  size="touch"
                                  variant="outline"
                                  onClick={() =>
                                    void guarded(() =>
                                      declineSuggestion(database, actor, row.id)
                                    )
                                  }
                                >
                                  Tolak
                                </Button>
                                {alt ? (
                                  <Button
                                    type="button"
                                    size="touch"
                                    variant="outline"
                                    onClick={() =>
                                      void guarded(async () => {
                                        await declineSuggestion(
                                          database,
                                          actor,
                                          row.id,
                                          alt
                                        )
                                        setNotice(
                                          `Tawarkan ${formatIsoWeekdayShort(alt)} ke ${nick(staff, row.staffId)}.`
                                        )
                                      })
                                    }
                                  >
                                    Tawarkan {formatIsoWeekdayShort(alt)}
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={recommendOpen} onOpenChange={setRecommendOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Isi otomatis draft?</DialogTitle>
            <DialogDescription>
              Pratinjau mesin. Absensi tidak berubah. Draft minggu ini ditimpa.
            </DialogDescription>
          </DialogHeader>
          {recommendPreview ? (
            <ul className="flex flex-col gap-1 text-sm">
              <li>{recommendPreview.summary.assignmentCount} penugasan baru</li>
              <li>{recommendPreview.summary.offCount} hari libur diusulkan</li>
              <li>
                {recommendPreview.summary.grantedCount} permintaan libur bisa
                diterima
              </li>
              <li>
                {recommendPreview.summary.alternativeCount} orang dapat hari
                alternatif
              </li>
              {recommendPreview.summary.replaces > 0 ? (
                <li className="text-muted-foreground">
                  Menimpa {recommendPreview.summary.replaces} assignment draft
                  yang ada.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Menghitung…</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setRecommendOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="touch"
              onClick={async () => {
                await guarded(runRecommend)
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
              {counts.understaffed > 0
                ? `${counts.understaffed} sel masih kurang orang. Staff akan melihat jadwal ini di Hari ini.`
                : "Staff akan melihat jadwal ini di halaman Hari ini."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setPublishOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="touch"
              onClick={() =>
                void guarded(async () => {
                  if (!actor) return
                  await publishWeek(database, actor, weekStart)
                  setPublishOpen(false)
                  setNotice("Minggu dipublish.")
                })
              }
            >
              {counts.understaffed > 0 ? "Publish tetap" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const WARNING_CHIP: Partial<Record<ScheduleWarningCode, string>> = {
  no_off: "belum libur",
  consecutive: "beruntun",
  hours_skew: "jam timpang",
  weekend_unfair: "weekend",
  unscheduled: "belum diisi",
}

type ScheduleWarningCode =
  | "understaffed"
  | "no_off"
  | "consecutive"
  | "hours_skew"
  | "off_pileup"
  | "weekend_unfair"
  | "unscheduled"

function humanWarning(message: string): string {
  return message.replace(/\d{4}-\d{2}-\d{2}/g, (iso) =>
    formatIsoWeekdayShort(iso)
  )
}

function nick(staff: StaffRecord[], id: string): string {
  return staff.find((item) => item.id === id)?.nickname ?? id
}

function nameOf(staff: StaffRecord[], id: string): string {
  return staff.find((item) => item.id === id)?.name ?? id
}

function AssignDialog({
  open,
  cell,
  staff,
  slots,
  assignments,
  offs,
  requirements,
  onOpenChange,
  onAdd,
  onRole,
  onRemove,
  onOff,
}: {
  open: boolean
  cell: { date: string; slot: SlotRecord } | null
  staff: StaffRecord[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  requirements: RoleRequirementRecord[]
  onOpenChange: (open: boolean) => void
  onAdd: (member: StaffRecord, slot: SlotRecord, allSlots: boolean) => Promise<void>
  onRole: (row: AssignmentRecord, dutyRole: string) => Promise<void>
  onRemove: (assignmentId: string) => Promise<void>
  onOff: (member: StaffRecord) => Promise<void>
}) {
  const filled = useMemo(() => {
    if (!cell) return []
    return assignments.filter(
      (row) => row.templateId === cell.slot.id && row.workDate === cell.date
    )
  }, [assignments, cell])
  const filledIds = new Set(filled.map((row) => row.staffId))
  const cover = cell
    ? cellCoverage(filled, cell.slot, requirements)
    : null
  const available = staff.filter((member) => {
    if (!cell) return false
    if (filledIds.has(member.id)) return false
    if (offs.some((row) => row.staffId === member.id && row.workDate === cell.date)) {
      return false
    }
    return true
  })
  const offable = staff.filter((member) => {
    if (!cell) return false
    return !offs.some(
      (row) => row.staffId === member.id && row.workDate === cell.date
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {cell
              ? `${formatIsoWeekdayShort(cell.date)} · ${cell.slot.name}`
              : "Isi shift"}
          </DialogTitle>
          <DialogDescription>
            {cell
              ? `${formatMinutes(cell.slot.startMinutes)}–${formatMinutes(cell.slot.endMinutes)} · butuh ${cell.slot.minStaffCount}${
                  cover && cover.roles.length > 0
                    ? ` · ${cover.roles
                        .map((row) => `${row.role} ${row.have}/${row.min}`)
                        .join(" · ")}`
                    : ""
                }`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {filled.map((row) => {
            const member = staff.find((item) => item.id === row.staffId)
            const roles = member ? floorRolesOf(member.roles) : []
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 border px-3 py-2"
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{member?.name ?? row.staffId}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onRemove(row.id)}
                  >
                    Hapus
                  </Button>
                </span>
                {roles.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {roles.map((role) => (
                      <Button
                        key={role}
                        type="button"
                        size="xs"
                        variant={row.dutyRole === role ? "secondary" : "outline"}
                        onClick={() => void onRole(row, role)}
                      >
                        {role}
                      </Button>
                    ))}
                  </div>
                ) : row.dutyRole ? (
                  <span className="text-xs text-muted-foreground">
                    {row.dutyRole}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div>
          <p className="mb-2 text-sm font-medium">Tambah orang</p>
          <div className="flex flex-wrap gap-2">
            {available.map((member) => (
              <div key={member.id} className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => cell && void onAdd(member, cell.slot, false)}
                >
                  {member.nickname}
                </Button>
                {slots.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    title="Semua shift hari ini"
                    onClick={() => cell && void onAdd(member, cell.slot, true)}
                  >
                    semua
                  </Button>
                ) : null}
              </div>
            ))}
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada yang tersedia.
              </p>
            ) : null}
          </div>
        </div>
        {offable.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Tandai libur resmi</p>
            <div className="flex flex-wrap gap-2">
              {offable.map((member) => (
                <Button
                  key={member.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onOff(member)}
                >
                  {member.nickname}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DaySheet({
  date,
  staff,
  assignments,
  offs,
  suggestions,
  canEdit,
  onOpenChange,
  onOff,
  onClearOff,
}: {
  date: string | null
  staff: StaffRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  canEdit: boolean
  onOpenChange: (open: boolean) => void
  onOff: (member: StaffRecord) => Promise<void>
  onClearOff: (offId: string) => Promise<void>
}) {
  const dayOffs = date ? offs.filter((row) => row.workDate === date) : []
  const daySuggest = date
    ? suggestions.filter((row) => row.workDate === date)
    : []
  const open = date ? unscheduledOnDate(staff, date, assignments, offs) : []

  return (
    <Dialog open={Boolean(date)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{date ? formatIsoWeekday(date) : "Hari"}</DialogTitle>
          <DialogDescription>
            Libur resmi, permintaan, dan orang yang belum diisi.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <section>
            <h4 className="mb-1 font-medium">Libur resmi</h4>
            {dayOffs.length === 0 ? (
              <p className="text-muted-foreground">Belum ada.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {dayOffs.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{nameOf(staff, row.staffId)}</span>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void onClearOff(row.id)}
                      >
                        Batal
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4 className="mb-1 font-medium">Permintaan</h4>
            {daySuggest.length === 0 ? (
              <p className="text-muted-foreground">Tidak ada.</p>
            ) : (
              <ul>
                {daySuggest.map((row) => (
                  <li key={row.id}>
                    {nameOf(staff, row.staffId)}
                    {row.note ? ` · ${row.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4 className="mb-1 font-medium">Belum diisi</h4>
            {open.length === 0 ? (
              <p className="text-muted-foreground">Semua sudah kerja atau libur.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {open.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{member.name}</span>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void onOff(member)}
                      >
                        Liburkan
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
