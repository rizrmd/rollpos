import type { Database } from "@/db/database"
import { useMemo, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { PinDialog } from "@/components/pin-dialog"
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
  formatIsoWeekdayShort,
  formatWeekRange,
  preferenceDeadlineLabel,
} from "@/lib/format"
import { addDays, jakartaDateParts, todayJakarta, weekDates, weekStartOn } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  OutletSettingsRecord,
  PreferenceRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

export function PrefsScreen({
  database,
  staff,
  slots,
  suggestions,
  preferences,
  settings,
  weekStart,
}: {
  database: Database
  staff: StaffRecord[]
  slots: SlotRecord[]
  suggestions: SuggestionRecord[]
  preferences: PreferenceRecord[]
  settings: OutletSettingsRecord | null
  weekStart: string
}) {
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const activeSlots = slots.filter((slot) => slot.isActive)
  const [pending, setPending] = useState<StaffRecord | null>(null)
  const [who, setWho] = useState<StaffRecord | null>(null)
  const [ranked, setRanked] = useState<string[]>([])
  const [offs, setOffs] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  const deadline = settings
    ? preferenceDeadlineLabel(
        settings.preferenceDeadlineWeekday,
        settings.preferenceDeadlineMinutes
      )
    : null
  const closed = settings ? isPastDeadline(settings) : false

  function loadForm(member: StaffRecord) {
    const pref = preferences.find(
      (row) => row.staffId === member.id && row.weekStart === weekStart
    )
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
    setOffs(mine.map((row) => row.workDate))
    setNote(pref?.note || mine[0]?.note || "")
  }

  function moveRank(id: string, direction: -1 | 1) {
    setRanked((current) => {
      const next = current.includes(id) ? [...current] : [...current, id]
      const index = next.indexOf(id)
      const swap = index + direction
      if (swap < 0 || swap >= next.length) return next
      ;[next[index], next[swap]] = [next[swap], next[index]]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Minggu {formatWeekRange(weekStart)}</CardTitle>
          <CardDescription>
            Permintaan, bukan libur resmi. Manager yang memutuskan.
            {deadline ? ` Pengisian ditutup ${deadline}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LiveNotice message={notice} />
          {closed ? (
            <p className="text-sm text-destructive" role="status">
              Deadline sudah lewat. Hubungi manager untuk mengubah.
            </p>
          ) : null}

          <fieldset disabled={closed} className="flex flex-col gap-4 disabled:opacity-70">
            <legend className="mb-2 text-sm font-medium">Siapa yang mengisi?</legend>
            <div className="flex flex-wrap gap-2">
              {staff
                .filter((member) => member.isActive)
                .map((member) => (
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
          </fieldset>

          {who ? (
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
                  offs.map((workDate, index) => ({
                    workDate,
                    rank: index + 1,
                    note,
                  })),
                  note
                )
                setNotice(
                  "Terkirim. Permintaan libur masih menunggu keputusan manager."
                )
              }}
            >
              <fieldset disabled={closed} className="flex flex-col gap-2">
                <legend className="text-sm font-medium">1. Urutan shift</legend>
                <ol className="flex flex-col gap-2">
                  {activeSlots.map((slot) => {
                    const rank = ranked.indexOf(slot.id)
                    return (
                      <li
                        key={slot.id}
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                      >
                        <span>
                          {rank >= 0 ? `${rank + 1}. ` : ""}
                          {slot.name}
                        </span>
                        <span className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            aria-label={`Naikkan ${slot.name}`}
                            onClick={() => moveRank(slot.id, -1)}
                          >
                            Naik
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            aria-label={`Turunkan ${slot.name}`}
                            onClick={() => moveRank(slot.id, 1)}
                          >
                            Turun
                          </Button>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </fieldset>

              <fieldset disabled={closed} className="flex flex-col gap-2">
                <legend className="text-sm font-medium">2. Minta libur</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {dates.map((date) => {
                    const selected = offs.includes(date)
                    return (
                      <button
                        key={date}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setOffs((current) =>
                            current.includes(date)
                              ? current.filter((item) => item !== date)
                              : [...current, date]
                          )
                        }
                        className={cn(
                          "min-h-16 rounded-xl border px-3 py-2 text-left text-sm font-medium",
                          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          selected
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "bg-card hover:bg-muted"
                        )}
                      >
                        {formatIsoWeekdayShort(date)}
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
                Kirim preferensi
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pilih nama, lalu masukkan PIN. Form baru muncul setelah PIN benar.
            </p>
          )}
        </CardContent>
      </Card>

      <PinDialog
        open={Boolean(pending)}
        title={pending ? `PIN ${pending.name}` : "PIN"}
        description="Hanya pemilik PIN ini yang boleh mengisi preferensinya."
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        onSubmit={async (pin) => {
          if (!pending) return
          const member = await authenticateStaff(database, pending.id, pin)
          setWho(member)
          loadForm(member)
          setPending(null)
        }}
      />
    </div>
  )
}

function isPastDeadline(settings: OutletSettingsRecord): boolean {
  const today = todayJakarta()
  const thisWeek = weekStartOn(today, settings.weekStartsOn)
  const delta =
    (settings.preferenceDeadlineWeekday - settings.weekStartsOn + 7) % 7
  const deadlineDate = addDays(thisWeek, delta)
  if (today < deadlineDate) return false
  if (today > deadlineDate) return true
  return jakartaDateParts().minutes > settings.preferenceDeadlineMinutes
}
