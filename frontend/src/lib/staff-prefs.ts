import { addDays, jakartaDateParts, todayJakarta, weekStartOn } from "@/lib/time"
import type {
  AssignmentRecord,
  DayOffRecord,
  DayOffSource,
  OutletSettingsRecord,
  PreferenceRecord,
  SlotRecord,
  SuggestionRecord,
} from "@/lib/types"

export type PrefsDayKind =
  | "off"
  | "pending"
  | "declined"
  | "offered"
  | "work"
  | "empty"

export type PrefsDay = {
  date: string
  inMonth: boolean
  kind: PrefsDayKind
  label: string
  note: string
  alternativeDate: string
  source: DayOffSource | ""
  slotNames: string[]
  suggestionId: string
}

export type DayOffAction = "request" | "withdraw" | "view"

export type MonthSummary = {
  approved: number
  pending: number
  declined: number
  offered: number
  workDays: number
}

export type TeamDayStatus = {
  date: string
  inMonth: boolean
  approved: { staffId: string; source: DayOffSource; note: string }[]
  pending: { staffId: string; note: string }[]
  declined: { staffId: string; alternativeDate: string; note: string }[]
}

export const PREFS_KIND_LABEL: Record<PrefsDayKind, string> = {
  off: "Libur",
  pending: "Menunggu",
  declined: "Ditolak",
  offered: "Tawaran",
  work: "Kerja",
  empty: "",
}

export const OFF_SOURCE_LABEL: Record<DayOffSource, string> = {
  manager: "ditetapkan manager",
  accepted_suggestion: "permintaan diterima",
  recommendation: "dari rekomendasi",
}

export function isPreferenceDeadlinePassed(
  settings: Pick<
    OutletSettingsRecord,
    "weekStartsOn" | "preferenceDeadlineWeekday" | "preferenceDeadlineMinutes"
  >,
  at: Date = new Date()
): boolean {
  const today = todayJakarta(at)
  const thisWeek = weekStartOn(today, settings.weekStartsOn)
  const delta =
    (settings.preferenceDeadlineWeekday - settings.weekStartsOn + 7) % 7
  const deadlineDate = addDays(thisWeek, delta)
  if (today < deadlineDate) return false
  if (today > deadlineDate) return true
  return jakartaDateParts(at).minutes > settings.preferenceDeadlineMinutes
}

export function resolvePrefsDay({
  date,
  inMonth,
  staffId,
  offs,
  suggestions,
  assignments,
  slots,
}: {
  date: string
  inMonth: boolean
  staffId: string
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  assignments: AssignmentRecord[]
  slots: SlotRecord[]
}): PrefsDay {
  const official = offs.find(
    (row) => row.staffId === staffId && row.workDate === date
  )
  const mine = suggestions.filter(
    (row) => row.staffId === staffId && row.workDate === date
  )
  const pending = mine.find((row) => row.status === "suggested")
  const accepted = mine.find((row) => row.status === "accepted")
  const declined = mine.find((row) => row.status === "declined")
  const offered = suggestions.find(
    (row) =>
      row.staffId === staffId &&
      row.status === "declined" &&
      row.alternativeDate === date
  )
  const work = assignments.filter(
    (row) =>
      row.staffId === staffId &&
      row.workDate === date &&
      row.status === "published"
  )
  const slotNames = work
    .map((row) => slots.find((slot) => slot.id === row.templateId)?.name)
    .filter((name): name is string => Boolean(name))

  if (official || accepted) {
    return {
      date,
      inMonth,
      kind: "off",
      label: PREFS_KIND_LABEL.off,
      note: official?.note || accepted?.note || "",
      alternativeDate: "",
      source: official?.source ?? "accepted_suggestion",
      slotNames: [],
      suggestionId: accepted?.id ?? "",
    }
  }
  if (pending) {
    return {
      date,
      inMonth,
      kind: "pending",
      label: PREFS_KIND_LABEL.pending,
      note: pending.note,
      alternativeDate: "",
      source: "",
      slotNames: [],
      suggestionId: pending.id,
    }
  }
  if (declined) {
    return {
      date,
      inMonth,
      kind: "declined",
      label: PREFS_KIND_LABEL.declined,
      note: declined.note,
      alternativeDate: declined.alternativeDate,
      source: "",
      slotNames,
      suggestionId: declined.id,
    }
  }
  if (offered) {
    return {
      date,
      inMonth,
      kind: "offered",
      label: PREFS_KIND_LABEL.offered,
      note: offered.note,
      alternativeDate: offered.workDate,
      source: "",
      slotNames,
      suggestionId: offered.id,
    }
  }
  if (work.length > 0) {
    return {
      date,
      inMonth,
      kind: "work",
      label: PREFS_KIND_LABEL.work,
      note: "",
      alternativeDate: "",
      source: "",
      slotNames,
      suggestionId: "",
    }
  }
  return {
    date,
    inMonth,
    kind: "empty",
    label: "",
    note: "",
    alternativeDate: "",
    source: "",
    slotNames: [],
    suggestionId: "",
  }
}

export function dayOffAction(day: PrefsDay, today: string): DayOffAction {
  if (day.kind === "pending") return "withdraw"
  if (day.kind === "off") return "view"
  if (day.date < today) return "view"
  return "request"
}

/** Label pendek di sel kalender — setiap tanggal punya status. */
export function prefsDayCaption(day: PrefsDay, today: string): string {
  if (day.kind === "work") {
    return day.slotNames.length > 0
      ? `Kerja ${day.slotNames.join("/")}`
      : PREFS_KIND_LABEL.work
  }
  if (day.kind !== "empty") return day.label
  if (day.date < today) return "—"
  return "Kosong"
}

export function prefsDaysForMonth({
  cells,
  staffId,
  offs,
  suggestions,
  assignments,
  slots,
}: {
  cells: { date: string; inMonth: boolean }[]
  staffId: string
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  assignments: AssignmentRecord[]
  slots: SlotRecord[]
}): PrefsDay[] {
  return cells.map((cell) =>
    resolvePrefsDay({
      ...cell,
      staffId,
      offs,
      suggestions,
      assignments,
      slots,
    })
  )
}

export function summarizePrefsMonth(days: PrefsDay[]): MonthSummary {
  const inMonth = days.filter((day) => day.inMonth)
  return {
    approved: inMonth.filter((day) => day.kind === "off").length,
    pending: inMonth.filter((day) => day.kind === "pending").length,
    declined: inMonth.filter((day) => day.kind === "declined").length,
    offered: inMonth.filter((day) => day.kind === "offered").length,
    workDays: inMonth.filter((day) => day.kind === "work").length,
  }
}

export function decidedPrefsDays(days: PrefsDay[]): PrefsDay[] {
  return days.filter(
    (day) =>
      day.inMonth &&
      (day.kind === "off" ||
        day.kind === "pending" ||
        day.kind === "declined" ||
        day.kind === "offered")
  )
}

export function teamDayStatus({
  date,
  inMonth,
  offs,
  suggestions,
}: {
  date: string
  inMonth: boolean
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
}): TeamDayStatus {
  return {
    date,
    inMonth,
    approved: offs
      .filter((row) => row.workDate === date)
      .map((row) => ({
        staffId: row.staffId,
        source: row.source,
        note: row.note,
      })),
    pending: suggestions
      .filter((row) => row.workDate === date && row.status === "suggested")
      .map((row) => ({ staffId: row.staffId, note: row.note })),
    declined: suggestions
      .filter((row) => row.workDate === date && row.status === "declined")
      .map((row) => ({
        staffId: row.staffId,
        alternativeDate: row.alternativeDate,
        note: row.note,
      })),
  }
}

export function teamMonthDays({
  cells,
  offs,
  suggestions,
}: {
  cells: { date: string; inMonth: boolean }[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
}): TeamDayStatus[] {
  return cells.map((cell) => teamDayStatus({ ...cell, offs, suggestions }))
}

export function summarizeTeamMonth(days: TeamDayStatus[]): {
  approved: number
  pending: number
  declined: number
  peopleOff: number
} {
  const inMonth = days.filter((day) => day.inMonth)
  const people = new Set<string>()
  let approved = 0
  let pending = 0
  let declined = 0
  for (const day of inMonth) {
    approved += day.approved.length
    pending += day.pending.length
    declined += day.declined.length
    for (const row of day.approved) people.add(row.staffId)
  }
  return { approved, pending, declined, peopleOff: people.size }
}

export function weekPreferenceOf(
  preferences: PreferenceRecord[],
  staffId: string,
  weekStart: string
): PreferenceRecord | undefined {
  return preferences.find(
    (row) => row.staffId === staffId && row.weekStart === weekStart
  )
}
