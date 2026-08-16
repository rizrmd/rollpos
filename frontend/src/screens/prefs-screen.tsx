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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { authenticateStaff, submitPreferences } from "@/db/staffing-write"
import {
  formatIsoWeekday,
  formatIsoWeekdayShort,
  formatMonthYear,
  formatWeekRange,
  preferenceDeadlineLabel,
  weekdayHeaders,
} from "@/lib/format"
import {
  decidedPrefsDays,
  isPreferenceDeadlinePassed,
  OFF_SOURCE_LABEL,
  prefsDaysForMonth,
  resolvePrefsDay,
  summarizePrefsMonth,
  weekPreferenceOf,
  type PrefsDay,
  type PrefsDayKind,
} from "@/lib/staff-prefs"
import { addMonths, monthGrid, monthStartOf, todayJakarta, weekDates } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  AssignmentRecord,
  DayOffRecord,
  OutletSettingsRecord,
  PreferenceRecord,
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
  empty: "border-border bg-card",
}

export function PrefsScreen({
  database,
  staff,
  slots,
  suggestions,
  preferences,
  assignments,
  offs,
  settings,
  weekStart,
  today = todayJakarta(),
}: {
  database: Database
  staff: StaffRecord[]
  slots: SlotRecord[]
  suggestions: SuggestionRecord[]
  preferences: PreferenceRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  settings: OutletSettingsRecord | null
  weekStart: string
  today?: string
}) {
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const [pending, setPending] = useState<StaffRecord | null>(null)
  const [who, setWho] = useState<StaffRecord | null>(null)
  const [monthCursor, setMonthCursor] = useState(() => monthStartOf(today))
  const [ranked, setRanked] = useState<string[]>([])
  const [askedOffs, setAskedOffs] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const activeStaff = staff.filter((member) => member.isActive)

  const deadline = settings
    ? preferenceDeadlineLabel(
        settings.preferenceDeadlineWeekday,
        settings.preferenceDeadlineMinutes
      )
    : null
  const closed = settings ? isPreferenceDeadlinePassed(settings) : false

  const cells = useMemo(
    () => monthGrid(monthCursor, weekStartsOn),
    [monthCursor, weekStartsOn]
  )
  const days = useMemo(() => {
    if (!who) return []
    return prefsDaysForMonth({
      cells,
      staffId: who.id,
      offs,
      suggestions,
      assignments,
      slots: activeSlots,
    })
  }, [who, cells, offs, suggestions, assignments, activeSlots])
  const summary = summarizePrefsMonth(days)
  const decided = decidedPrefsDays(days)
  const weekDays = useMemo(() => {
    if (!who) return []
    return dates.map((date) =>
      resolvePrefsDay({
        date,
        inMonth: true,
        staffId: who.id,
        offs,
        suggestions,
        assignments,
        slots: activeSlots,
      })
    )
  }, [who, dates, offs, suggestions, assignments, activeSlots])
  const headers = weekdayHeaders(weekStartsOn)
  const submitted = who
    ? weekPreferenceOf(preferences, who.id, weekStart)
    : undefined

  function loadForm(member: StaffRecord) {
    const pref = weekPreferenceOf(preferences, member.id, weekStart)
    const mine = suggestions.filter(
      (row) =>
        row.staffId === member.id &&
        row.weekStart === weekStart &&
        row.status === "suggested"
    )
    setRanked(
      [...(pref?.slots ?? [])]
        .sort((a, b) => a.rank - b.rank)
        .map((row) => row.templateId)
    )
    setAskedOffs(mine.map((row) => row.workDate))
    setNote(pref?.note || mine[0]?.note || "")
  }

  function toggleRank(id: string) {
    setRanked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  function moveRank(id: string, direction: -1 | 1) {
    setRanked((current) => {
      const next = [...current]
      const index = next.indexOf(id)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= next.length) return current
      ;[next[index], next[swap]] = [next[swap], next[index]]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Shift & libur</h1>
        <p className="text-sm text-muted-foreground">
          Lihat yang sudah disetujui sebulan, lalu minta minggu depan. Manager
          yang memutuskan.
        </p>
      </header>

      <LiveNotice message={notice} />

      <Card>
        <CardHeader>
          <CardTitle>Siapa yang melihat?</CardTitle>
          <CardDescription>
            PIN hanya membuka data orang itu: kalender approve + form minggu
            depan.
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
                  setPending(member)
                }}
              >
                {member.nickname}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {who ? (
        <>
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
                  {who.nickname} · {summary.approved} disetujui
                  {summary.pending > 0 ? ` · ${summary.pending} menunggu` : ""}
                  {summary.declined > 0 ? ` · ${summary.declined} ditolak` : ""}
                  {summary.workDays > 0 ? ` · ${summary.workDays} hari kerja` : ""}
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

            <ol className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-5">
              <Legend swatch={KIND_CLASS.off}>Libur disetujui</Legend>
              <Legend swatch={KIND_CLASS.pending}>Menunggu</Legend>
              <Legend swatch={KIND_CLASS.declined}>Ditolak</Legend>
              <Legend swatch={KIND_CLASS.offered}>Tawaran</Legend>
              <Legend swatch={KIND_CLASS.work}>Kerja terbit</Legend>
            </ol>

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
                  return (
                    <li key={day.date} className="min-h-16 border-t border-l first:border-l-0 [&:nth-child(7n+1)]:border-l-0">
                      <div
                        className={cn(
                          "flex h-full min-h-16 flex-col gap-0.5 p-1.5 text-left",
                          day.inMonth ? KIND_CLASS[day.kind] : "bg-muted/20 text-muted-foreground/60",
                          isToday ? "ring-2 ring-ring ring-inset" : ""
                        )}
                      >
                        <span className="text-xs font-medium">
                          {Number(day.date.slice(8))}
                        </span>
                        {day.inMonth && day.label ? (
                          <span className="text-[0.65rem] leading-tight">
                            {day.label}
                            {day.kind === "work" && day.slotNames.length > 0
                              ? ` ${day.slotNames.join("/")}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>

            {decided.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada keputusan libur di {formatMonthYear(monthCursor)}.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {decided.map((day) => (
                  <li
                    key={`${day.date}-${day.kind}`}
                    className="flex items-start justify-between gap-3 border bg-card px-3 py-2"
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Minta minggu depan</CardTitle>
              <CardDescription>
                {formatWeekRange(weekStart)}
                {deadline ? ` · tutup ${deadline}` : ""}. Ini permintaan, bukan
                libur resmi.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {closed ? (
                <p className="text-sm text-destructive" role="status">
                  Deadline sudah lewat. Hubungi manager untuk mengubah.
                </p>
              ) : null}
              {submitted && !closed ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Preferensi minggu ini sudah terkirim. Kirim lagi untuk
                  mengganti yang masih menunggu.
                </p>
              ) : null}

              <form
                className="flex flex-col gap-6"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (closed) return
                  await submitPreferences(
                    database,
                    who.id,
                    weekStart,
                    ranked.map((templateId, index) => ({
                      templateId,
                      rank: index + 1,
                    })),
                    askedOffs.map((workDate, index) => ({
                      workDate,
                      rank: index + 1,
                      note,
                    })),
                    note
                  )
                  setNotice(
                    "Terkirim. Cek kalender di atas untuk status approve."
                  )
                }}
              >
                <fieldset disabled={closed} className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">
                    1. Urutan shift (1 = paling mau)
                  </legend>
                  <ol className="flex flex-col gap-2">
                    {ranked.map((id, index) => {
                      const slot = activeSlots.find((item) => item.id === id)
                      if (!slot) return null
                      return (
                        <li
                          key={id}
                          className="flex items-center justify-between gap-3 border px-3 py-2"
                        >
                          <span className="font-medium">
                            {index + 1}. {slot.name}
                          </span>
                          <span className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              aria-label={`Naikkan ${slot.name}`}
                              onClick={() => moveRank(id, -1)}
                            >
                              Naik
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              aria-label={`Turunkan ${slot.name}`}
                              onClick={() => moveRank(id, 1)}
                            >
                              Turun
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="touch"
                              onClick={() => toggleRank(id)}
                            >
                              Hapus
                            </Button>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    {activeSlots
                      .filter((slot) => !ranked.includes(slot.id))
                      .map((slot) => (
                        <Button
                          key={slot.id}
                          type="button"
                          variant="outline"
                          size="touch"
                          onClick={() => toggleRank(slot.id)}
                        >
                          Pilih {slot.name}
                        </Button>
                      ))}
                  </div>
                </fieldset>

                <fieldset disabled={closed} className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">2. Minta libur</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {dates.map((date) => {
                      const decidedDay = weekDays.find((day) => day.date === date)
                      const locked =
                        decidedDay?.kind === "off" ||
                        decidedDay?.kind === "declined"
                      const selected = askedOffs.includes(date)
                      return (
                        <button
                          key={date}
                          type="button"
                          disabled={locked}
                          aria-pressed={selected || decidedDay?.kind === "off"}
                          onClick={() =>
                            setAskedOffs((current) =>
                              current.includes(date)
                                ? current.filter((item) => item !== date)
                                : [...current, date]
                            )
                          }
                          className={cn(
                            "min-h-16 border px-3 py-2 text-left text-sm font-medium",
                            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            locked
                              ? KIND_CLASS[decidedDay.kind]
                              : selected
                                ? "border-transparent bg-primary text-primary-foreground"
                                : "bg-card hover:bg-muted"
                          )}
                        >
                          <span className="block">
                            {formatIsoWeekdayShort(date)}
                          </span>
                          <span className="block text-xs font-normal opacity-80">
                            {locked
                              ? decidedDay.label
                              : selected
                                ? "diminta"
                                : "kerja?"}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="pref-note">Catatan</Label>
                  <Textarea
                    id="pref-note"
                    value={note}
                    disabled={closed}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>

                <Button type="submit" size="touch" disabled={closed}>
                  Kirim permintaan
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pilih nama, lalu masukkan PIN. Kalender sebulan baru muncul setelah
          PIN benar.
        </p>
      )}

      <PinDialog
        open={Boolean(pending)}
        title={pending ? `PIN ${pending.name}` : "PIN"}
        description="Hanya pemilik PIN ini yang boleh melihat dan mengisi preferensinya."
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        onSubmit={async (pin) => {
          if (!pending) return
          const member = await authenticateStaff(database, pending.id, pin)
          setWho(member)
          setMonthCursor(monthStartOf(today))
          loadForm(member)
          setPending(null)
        }}
      />
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
