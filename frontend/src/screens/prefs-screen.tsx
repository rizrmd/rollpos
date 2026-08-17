import type { Database } from "@/db/database"
import { useMemo, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { LiveNotice } from "@/components/page-header"
import { PinDialog } from "@/components/pin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  authenticateStaff,
  requestDayOff,
  withdrawDayOffRequest,
} from "@/db/staffing-write"
import {
  formatIsoWeekday,
  formatIsoWeekdayShort,
  formatMonthYear,
  weekdayHeaders,
} from "@/lib/format"
import {
  historyWorkDatesFrom,
  recommendSchedule,
  weekHasActiveAssignments,
} from "@/lib/recommend"
import {
  dayOffAction,
  dayRoster,
  decidedPrefsDays,
  OFF_SOURCE_LABEL,
  prefsDayCaption,
  prefsDaysForMonth,
  workingInitials,
  type DayRoster,
  type PrefsDay,
  type PrefsDayKind,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid, monthStartOf, todayJakarta, weekStartOn } from "@/lib/time"
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

const KIND_CLASS: Record<PrefsDayKind, string> = {
  off: "border-emerald-700/30 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50",
  pending:
    "border-amber-700/30 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  declined:
    "border-destructive/30 bg-destructive/10 text-destructive",
  offered:
    "border-sky-700/30 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50",
  work: "border-border bg-muted/60",
  fair_off:
    "border-emerald-700/20 bg-emerald-50/60 text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-50",
  empty: "border-border bg-card",
}

export function PrefsScreen({
  database,
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
  const [pendingWho, setPendingWho] = useState<StaffRecord | null>(null)
  const [who, setWho] = useState<StaffRecord | null>(null)
  const [monthCursor, setMonthCursor] = useState(() => monthStartOf(today))
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeStaff = staff.filter((member) => member.isActive)

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
  const days = useMemo(() => {
    if (!who) {
      return cells.map((cell) => publicPrefsDay(cell))
    }
    return prefsDaysForMonth({
      cells,
      staffId: who.id,
      offs,
      suggestions,
      assignments,
      slots: activeSlots,
      proposedAssignments: proposed.assignments,
      proposedOffs: proposed.offs,
      today,
    })
  }, [who, cells, offs, suggestions, assignments, activeSlots, proposed, today])
  const summary = {
    approved: days.filter((day) => day.inMonth && day.kind === "off").length,
    pending: days.filter((day) => day.inMonth && day.kind === "pending").length,
    declined: days.filter((day) => day.inMonth && day.kind === "declined").length,
    workDays: days.filter((day) => day.inMonth && day.kind === "work").length,
  }
  const decided = decidedPrefsDays(days)
  const headers = weekdayHeaders(weekStartsOn)
  const picked = pickedDate
    ? (days.find((day) => day.date === pickedDate) ?? null)
    : null
  const action = picked ? dayOffAction(picked, today) : "view"
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

  async function guarded(run: () => Promise<void>, ok?: string) {
    try {
      setError(null)
      await run()
      if (ok) setNotice(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Shift & libur</h1>
        <p className="text-sm text-muted-foreground">
          Kalender langsung tampil. Inisial = siapa yang masuk. Ketuk tanggal
          untuk detail atau minta libur.
        </p>
      </header>

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
            <p className="text-sm text-muted-foreground">
              {who
                ? `${who.nickname} · ${summary.approved} disetujui${
                    summary.pending > 0 ? ` · ${summary.pending} menunggu` : ""
                  }${
                    summary.declined > 0 ? ` · ${summary.declined} ditolak` : ""
                  }${
                    summary.workDays > 0 ? ` · ${summary.workDays} hari kerja` : ""
                  }`
                : "Inisial = siapa yang masuk"}
            </p>
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

        {who ? (
          <ol className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
            <Legend swatch={KIND_CLASS.off}>Libur</Legend>
            <Legend swatch={KIND_CLASS.pending}>Menunggu</Legend>
            <Legend swatch={KIND_CLASS.declined}>Ditolak</Legend>
            <Legend swatch={KIND_CLASS.offered}>Tawaran</Legend>
            <Legend swatch={KIND_CLASS.work}>Kerja</Legend>
            <Legend swatch={KIND_CLASS.fair_off}>Giliran</Legend>
          </ol>
        ) : null}

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
              const status =
                !who || day.kind === "work" || day.kind === "empty"
                  ? ""
                  : prefsDayCaption(day, today)
              return (
                <li
                  key={day.date}
                  className="min-h-16 border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPickedDate(day.date)
                      setNote(day.kind === "pending" ? day.note : "")
                      setError(null)
                    }}
                    className={cn(
                      "flex h-full min-h-16 w-full flex-col gap-0.5 p-1.5 text-left",
                      "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      day.inMonth
                        ? who
                          ? KIND_CLASS[day.kind]
                          : initials.length > 0
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
                    {day.inMonth && status ? (
                      <span className="text-[0.65rem] leading-tight">
                        {status}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Minta libur sebagai</CardTitle>
          <CardDescription>
            Kalender sudah tampil. PIN hanya untuk minta atau cabut libur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {activeStaff.map((member) => (
              <Button
                key={member.id}
                type="button"
                size="touch"
                variant={who?.id === member.id ? "default" : "outline"}
                aria-pressed={who?.id === member.id}
                onClick={() => {
                  setNotice(null)
                  setError(null)
                  setPendingWho(member)
                }}
              >
                {member.nickname}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {who && decided.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada permintaan di {formatMonthYear(monthCursor)}. Ketuk tanggal
          untuk melihat siapa kerja, atau minta libur.
        </p>
      ) : null}
      {who && decided.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {decided.map((day) => (
            <li key={`${day.date}-${day.kind}`}>
              <button
                type="button"
                onClick={() => {
                  setPickedDate(day.date)
                  setNote(day.kind === "pending" ? day.note : "")
                  setError(null)
                }}
                className="flex w-full items-start justify-between gap-3 border bg-card px-3 py-2 text-left"
              >
                <span>
                  <span className="block font-medium">
                    {formatIsoWeekday(day.date)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {decisionDetail(day)}
                  </span>
                </span>
                <Badge
                  variant={
                    day.kind === "off"
                      ? "secondary"
                      : day.kind === "declined"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {day.label}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={Boolean(picked)}
        onOpenChange={(open) => {
          if (!open) setPickedDate(null)
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {picked ? formatIsoWeekday(picked.date) : "Tanggal"}
            </DialogTitle>
            <DialogDescription>
              {picked ? dialogDescription(picked, today) : ""}
            </DialogDescription>
          </DialogHeader>
          {roster ? (
            <DayRosterList roster={roster} viewerId={who?.id} />
          ) : null}
          {picked && !who && action === "request" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Pilih nama, lalu masukkan PIN untuk minta libur tanggal ini.
              </p>
              <div className="flex flex-wrap gap-2">
                {activeStaff.map((member) => (
                  <Button
                    key={member.id}
                    type="button"
                    size="touch"
                    variant="outline"
                    onClick={() => {
                      setError(null)
                      setPendingWho(member)
                    }}
                  >
                    {member.nickname}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {picked && who && action === "request" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="off-note">Catatan (opsional)</Label>
              <Textarea
                id="off-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
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
            {picked && who && action === "request" ? (
              <Button
                type="button"
                size="touch"
                onClick={() =>
                  void guarded(async () => {
                    await requestDayOff(
                      database,
                      who.id,
                      picked.date,
                      weekStartsOn,
                      note
                    )
                    setPickedDate(null)
                  }, `Diminta ${formatIsoWeekdayShort(picked.date)}. Menunggu manager.`)
                }
              >
                Minta libur
              </Button>
            ) : null}
            {picked && who && action === "withdraw" ? (
              <Button
                type="button"
                size="touch"
                variant="destructive"
                onClick={() =>
                  void guarded(async () => {
                    await withdrawDayOffRequest(
                      database,
                      who.id,
                      picked.suggestionId
                    )
                    setPickedDate(null)
                  }, `Permintaan ${formatIsoWeekdayShort(picked.date)} dicabut.`)
                }
              >
                Cabut permintaan
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinDialog
        open={Boolean(pendingWho)}
        title={pendingWho ? `PIN ${pendingWho.name}` : "PIN"}
        description="Hanya pemilik PIN ini yang boleh minta atau cabut libur."
        onOpenChange={(open) => {
          if (!open) setPendingWho(null)
        }}
        onSubmit={async (pin) => {
          if (!pendingWho) return
          const member = await authenticateStaff(database, pendingWho.id, pin)
          setWho(member)
          setPendingWho(null)
        }}
      />
    </div>
  )
}

function DayRosterList({
  roster,
  viewerId,
}: {
  roster: DayRoster
  viewerId?: string
}) {
  const hasWorkers = roster.slots.some((slot) => slot.people.length > 0)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <section aria-labelledby="siapa-kerja">
        <h3 id="siapa-kerja" className="mb-1 font-medium">
          Siapa kerja
        </h3>
        {hasWorkers ? (
          <ul className="flex flex-col gap-2">
            {roster.slots.map((slot) => (
              <li key={slot.slotId}>
                <p className="text-xs font-medium text-muted-foreground">
                  {slot.slotName}
                </p>
                {slot.people.length === 0 ? (
                  <p className="text-muted-foreground">kosong</p>
                ) : (
                  <ul>
                    {slot.people.map((person) => (
                      <li key={person.staffId}>
                        {person.name}
                        {person.staffId === viewerId ? " · kamu" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Belum ada yang dijadwalkan.</p>
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

function Legend({
  swatch,
  children,
}: {
  swatch: string
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 shrink-0 border", swatch)} aria-hidden />
      <span>{children}</span>
    </li>
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

function decisionDetail(day: PrefsDay): string {
  if (day.kind === "off" && day.source) {
    return OFF_SOURCE_LABEL[day.source]
  }
  if (day.kind === "declined" && day.alternativeDate) {
    return `Manager menawarkan ${formatIsoWeekdayShort(day.alternativeDate)}`
  }
  if (day.kind === "offered") {
    return `Pengganti permintaan ${formatIsoWeekdayShort(day.alternativeDate)}`
  }
  if (day.kind === "pending") {
    return day.note || "Menunggu keputusan manager"
  }
  return day.note || day.label
}

function dialogDescription(day: PrefsDay, today: string): string {
  const action = dayOffAction(day, today)
  if (action === "withdraw") {
    return day.note
      ? `Menunggu keputusan. Catatan: ${day.note}`
      : "Permintaan masih menunggu keputusan manager."
  }
  if (day.kind === "off") {
    return day.source
      ? `Sudah libur resmi (${OFF_SOURCE_LABEL[day.source]}).`
      : "Sudah libur resmi."
  }
  if (day.kind === "declined") {
    return day.alternativeDate
      ? `Ditolak. Manager menawarkan ${formatIsoWeekdayShort(day.alternativeDate)}.`
      : "Manager menolak permintaan ini."
  }
  if (day.kind === "offered") {
    return `Ini tawaran ganti dari ${formatIsoWeekdayShort(day.alternativeDate)}. Ketuk Minta libur kalau mau ambil hari ini.`
  }
  if (day.kind === "fair_off") {
    return "Giliran libur dari sistem (belum resmi). Ketuk Minta libur supaya manager meninjau."
  }
  if (day.kind === "work") {
    return day.slotNames.length > 0
      ? `Usulan sistem: ${day.slotNames.join(", ")}. Bisa minta libur; manager yang memutuskan.`
      : "Kerja default dari usulan sistem yang adil. Bisa minta libur; manager yang memutuskan."
  }
  if (action === "view") {
    return "Tanggal ini sudah lewat."
  }
  return "Kerja default dari usulan sistem. Minta libur di tanggal ini."
}
