import type { Database } from "@nozbe/watermelondb"

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
  acceptSuggestion,
  applyRecommendationDraft,
  declineSuggestion,
  publishWeek,
} from "@/db/staffing-write"
import { recommendSchedule } from "@/lib/recommend"
import { slotHours, weekDates } from "@/lib/time"
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
  weekStart,
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
  const dates = weekDates(weekStart)
  const activeSlots = slots.filter((slot) => slot.isActive)
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
        published: assignments.some(
          (row) =>
            row.workDate >= weekStart &&
            row.workDate <= dates[6] &&
            row.status === "published"
        ),
      })
    : []

  async function recommend() {
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
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Jadwal minggu {weekStart}</CardTitle>
          <CardDescription>
            Hijau = aman, merah = kurang orang. Suggest belum otomatis libur.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" disabled={!actor} onClick={() => void recommend()}>
            Buat rekomendasi (draft)
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!actor}
            onClick={() => actor && void publishWeek(database, actor, weekStart)}
          >
            Publish minggu
          </Button>
        </CardContent>
      </Card>

      {warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Peringatan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {warnings.map((warning, index) => (
              <p key={`${warning.code}-${index}`} className="text-destructive">
                {warning.message}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border bg-muted px-2 py-1 text-left">Shift</th>
              {dates.map((date) => (
                <th key={date} className="border bg-muted px-2 py-1">
                  {date.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSlots.map((slot) => (
              <tr key={slot.id}>
                <td className="border px-2 py-1 font-medium">{slot.name}</td>
                {dates.map((date) => {
                  const filled = assignments.filter(
                    (row) =>
                      row.templateId === slot.id &&
                      row.workDate === date &&
                      row.status !== "cancelled"
                  )
                  const ok = filled.length >= slot.minStaffCount
                  return (
                    <td
                      key={date}
                      className={`border px-2 py-1 align-top ${ok ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-destructive/10"}`}
                    >
                      <p className="mb-1 text-xs">
                        {filled.length}/{slot.minStaffCount}
                      </p>
                      {filled.map((row) => (
                        <p key={row.id}>
                          {staff.find((item) => item.id === row.staffId)?.nickname ??
                            row.staffId}
                        </p>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td className="border px-2 py-1 font-medium">Libur resmi</td>
              {dates.map((date) => (
                <td key={date} className="border px-2 py-1 align-top">
                  {offs
                    .filter((row) => row.workDate === date)
                    .map((row) => (
                      <p key={row.id}>
                        {staff.find((item) => item.id === row.staffId)?.nickname}
                      </p>
                    ))}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border px-2 py-1 font-medium">Suggest</td>
              {dates.map((date) => {
                const rows = suggestions.filter(
                  (row) => row.workDate === date && row.status === "suggested"
                )
                return (
                  <td key={date} className="border px-2 py-1 align-top">
                    {rows.length > 1 ? (
                      <Badge variant="destructive">{rows.length}</Badge>
                    ) : null}
                    {rows.map((row) => (
                      <div key={row.id} className="mt-1 flex flex-col gap-1">
                        <span>
                          {staff.find((item) => item.id === row.staffId)?.nickname}
                        </span>
                        {actor ? (
                          <div className="flex gap-1">
                            <Button
                              size="xs"
                              type="button"
                              onClick={() => void acceptSuggestion(database, actor, row.id)}
                            >
                              Terima
                            </Button>
                            <Button
                              size="xs"
                              type="button"
                              variant="outline"
                              onClick={() =>
                                void declineSuggestion(database, actor, row.id)
                              }
                            >
                              Tolak
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Beban staff</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {staff
            .filter((member) => member.isActive)
            .map((member) => {
              const mine = assignments.filter(
                (row) =>
                  row.staffId === member.id &&
                  row.status !== "cancelled" &&
                  dates.includes(row.workDate)
              )
              const hours = mine.reduce(
                (sum, row) => sum + slotHours(row.startMinutes, row.endMinutes),
                0
              )
              const offDays = offs.filter(
                (row) => row.staffId === member.id && dates.includes(row.workDate)
              ).length
              return (
                <div key={member.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-muted-foreground">
                    {new Set(mine.map((row) => row.workDate)).size} hari · {hours.toFixed(1)} jam
                    · {offDays} libur resmi
                  </p>
                </div>
              )
            })}
        </CardContent>
      </Card>
    </div>
  )
}
