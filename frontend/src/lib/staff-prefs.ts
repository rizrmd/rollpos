import { canManage } from "@/lib/permissions"
import { addDays, jakartaDateParts, todayJakarta, weekStartOn } from "@/lib/time"
import {
  isIncludedInAttendance,
  type AssignmentRecord,
  type DayOffRecord,
  type DayOffSource,
  type OutletSettingsRecord,
  type PreferenceRecord,
  type PreferenceSlotRecord,
  type SlotRecord,
  type StaffRecord,
  type SuggestionRecord,
} from "@/lib/types"

export type PrefsDayKind =
  | "off"
  | "pending"
  | "declined"
  | "offered"
  | "work"
  | "fair_off"
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
  fair_off: "Giliran",
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
  proposedAssignments = [],
  proposedOffs = [],
  today,
}: {
  date: string
  inMonth: boolean
  staffId: string
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  assignments: AssignmentRecord[]
  slots: SlotRecord[]
  proposedAssignments?: { staffId: string; workDate: string; templateId: string }[]
  proposedOffs?: { staffId: string; workDate: string }[]
  today?: string
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
      row.status !== "cancelled"
  )
  const proposedWork = proposedAssignments.filter(
    (row) => row.staffId === staffId && row.workDate === date
  )
  const slotNames = (work.length > 0 ? work : proposedWork)
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
  if (work.length > 0 || proposedWork.length > 0) {
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
  const fairOff = proposedOffs.some(
    (row) => row.staffId === staffId && row.workDate === date
  )
  if (fairOff) {
    return {
      date,
      inMonth,
      kind: "fair_off",
      label: PREFS_KIND_LABEL.fair_off,
      note: "",
      alternativeDate: "",
      source: "recommendation",
      slotNames: [],
      suggestionId: "",
    }
  }
  if (today && date >= today && inMonth) {
    return {
      date,
      inMonth,
      kind: "work",
      label: PREFS_KIND_LABEL.work,
      note: "",
      alternativeDate: "",
      source: "recommendation",
      slotNames: [],
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

/** Inisial tampilan: dua huruf, atau dua kata → huruf pertama masing-masing. */
export function staffInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return "?"
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? ""
    const second = parts[1]?.[0] ?? ""
    return `${first}${second}`.toUpperCase()
  }
  return cleaned.slice(0, Math.min(2, cleaned.length)).toUpperCase()
}

export function workingInitials(roster: DayRoster): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const slot of roster.slots) {
    for (const person of slot.people) {
      if (seen.has(person.staffId)) continue
      seen.add(person.staffId)
      list.push(staffInitials(person.nickname || person.name))
    }
  }
  return list
}

/** Inisial staff yang ada di daftar — jangan jatuh ke id TinyBase ("0", "1"). */
export function visibleStaffInitials(
  staff: StaffRecord[],
  staffIds: string[]
): string[] {
  const list: string[] = []
  const seen = new Set<string>()
  for (const id of staffIds) {
    if (seen.has(id)) continue
    const member = staff.find((item) => item.id === id)
    if (!member) continue
    seen.add(id)
    list.push(staffInitials(member.nickname || member.name))
  }
  return list
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
  return PREFS_KIND_LABEL.work
}

export function prefsDaysForMonth({
  cells,
  staffId,
  offs,
  suggestions,
  assignments,
  slots,
  proposedAssignments,
  proposedOffs,
  today,
}: {
  cells: { date: string; inMonth: boolean }[]
  staffId: string
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  assignments: AssignmentRecord[]
  slots: SlotRecord[]
  proposedAssignments?: { staffId: string; workDate: string; templateId: string }[]
  proposedOffs?: { staffId: string; workDate: string }[]
  today?: string
}): PrefsDay[] {
  return cells.map((cell) =>
    resolvePrefsDay({
      ...cell,
      staffId,
      offs,
      suggestions,
      assignments,
      slots,
      proposedAssignments,
      proposedOffs,
      today,
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

export type RosterPerson = {
  staffId: string
  name: string
  nickname: string
}

export type RosterSlot = {
  slotId: string
  slotName: string
  people: RosterPerson[]
}

export type DayRoster = {
  slots: RosterSlot[]
  off: RosterPerson[]
  pending: RosterPerson[]
}

function rosterPerson(
  staff: StaffRecord[],
  staffId: string
): RosterPerson {
  const member = staff.find((row) => row.id === staffId)
  return {
    staffId,
    name: member?.name ?? staffId,
    nickname: member?.nickname ?? staffId,
  }
}

/** Siapa kerja, libur, dan minta libur di satu tanggal. */
export function dayRoster({
  date,
  staff,
  slots,
  assignments,
  offs,
  proposedAssignments = [],
  suggestions = [],
}: {
  date: string
  staff: StaffRecord[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  proposedAssignments?: { staffId: string; workDate: string; templateId: string }[]
  suggestions?: SuggestionRecord[]
}): DayRoster {
  const active = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const stored = assignments.filter(
    (row) => row.workDate === date && row.status !== "cancelled"
  )
  const rows =
    stored.length > 0
      ? stored
      : proposedAssignments.filter((row) => row.workDate === date)

  return {
    slots: active.map((slot) => {
      const ids = [
        ...new Set(
          rows
            .filter((row) => row.templateId === slot.id)
            .map((row) => row.staffId)
        ),
      ]
      return {
        slotId: slot.id,
        slotName: slot.name,
        people: ids.map((id) => rosterPerson(staff, id)),
      }
    }),
    off: offs
      .filter((row) => row.workDate === date)
      .map((row) => rosterPerson(staff, row.staffId)),
    pending: suggestions
      .filter((row) => row.workDate === date && row.status === "suggested")
      .map((row) => rosterPerson(staff, row.staffId)),
  }
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

/** Slot yang dicentang di profil; minggu spesifik menimpa jika ada. */
export function standingPreferredSlots(member: StaffRecord): PreferenceSlotRecord[] {
  return (member.preferredTemplateIds ?? []).map((templateId, index) => ({
    templateId,
    rank: index + 1,
  }))
}

/** Slot yang boleh diisi. Kosong = tidak di-assign sama sekali. */
export function allocatedSlotIds(
  member: StaffRecord,
  preferences: PreferenceRecord[],
  weekStart: string
): string[] {
  if (!isIncludedInAttendance(member)) return []
  return effectivePreferenceSlots(member, preferences, weekStart).map(
    (row) => row.templateId
  )
}

export function canBeAssignedToSlot(
  member: StaffRecord,
  slotId: string,
  preferences: PreferenceRecord[],
  weekStart: string
): boolean {
  if (!isIncludedInAttendance(member)) return false
  if (canManage(member.roles)) return true
  return allocatedSlotIds(member, preferences, weekStart).includes(slotId)
}

export function hasShiftAllocation(
  member: StaffRecord,
  preferences: PreferenceRecord[],
  weekStart: string
): boolean {
  if (!isIncludedInAttendance(member)) return false
  if (canManage(member.roles)) return true
  return allocatedSlotIds(member, preferences, weekStart).length > 0
}

/** Usulan sistem di luar pembagian — harus dihitung ulang / dibatalkan. */
export function isStaleSystemAssignment(
  row: Pick<AssignmentRecord, "staffId" | "templateId" | "status" | "note">,
  staff: StaffRecord[],
  preferences: PreferenceRecord[],
  weekStart: string,
  systemNote: string
): boolean {
  if (row.status === "cancelled") return false
  if (row.note !== systemNote) return false
  const member = staff.find((item) => item.id === row.staffId)
  if (!member) return true
  return !canBeAssignedToSlot(member, row.templateId, preferences, weekStart)
}

/** Centang yang tampil di form = persis yang tersimpan. Kosong tetap kosong. */
export function preferredSlotIdsFromMember(
  member: StaffRecord | undefined,
  slots: Pick<SlotRecord, "id">[]
): string[] {
  const known = new Set(slots.map((slot) => slot.id))
  return (member?.preferredTemplateIds ?? []).filter((id) => known.has(id))
}

/** Simpan persis yang dicentang, termasuk tidak ada sama sekali. */
export function preferredSlotIdsToStore(
  selected: string[],
  slots: Pick<SlotRecord, "id">[]
): string[] {
  const picked = new Set(selected.filter(Boolean))
  return slots.map((slot) => slot.id).filter((id) => picked.has(id))
}

export function effectivePreferenceSlots(
  member: StaffRecord,
  preferences: PreferenceRecord[],
  weekStart: string
): PreferenceSlotRecord[] {
  const week = weekPreferenceOf(preferences, member.id, weekStart)
  if (week && week.slots.length > 0) return week.slots
  return standingPreferredSlots(member)
}

export function slotPreferenceRank(
  member: StaffRecord,
  slotId: string,
  preferences: PreferenceRecord[],
  weekStart: string
): number {
  const slots = effectivePreferenceSlots(member, preferences, weekStart)
  if (slots.length === 0) return 99
  return slots.find((row) => row.templateId === slotId)?.rank ?? 99
}

/** Shift yang sudah ditetapkan manager di tanggal terpilih, per orang. */
export function templateIdsByStaffOnDates(
  assignments: Pick<
    AssignmentRecord,
    "staffId" | "templateId" | "workDate" | "status"
  >[],
  dates: string[]
): Record<string, string[]> {
  const wanted = new Set(dates)
  const map: Record<string, string[]> = {}
  for (const row of assignments) {
    if (row.status === "cancelled") continue
    if (!wanted.has(row.workDate)) continue
    const list = map[row.staffId] ?? []
    if (!list.includes(row.templateId)) list.push(row.templateId)
    map[row.staffId] = list
  }
  return map
}

/** Shift default saat orang dicentang kerja: preferensi pertama, atau slot pertama. */
export function defaultTemplateIdsForStaff(
  member: StaffRecord,
  slots: SlotRecord[],
  preferences: PreferenceRecord[],
  weekStart: string
): string[] {
  const active = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const known = new Set(active.map((slot) => slot.id))
  const preferred = allocatedSlotIds(member, preferences, weekStart).filter((id) =>
    known.has(id)
  )
  const first = preferred[0] ?? active[0]?.id
  return first ? [first] : []
}

/** Tambah/lepas satu shift. Kosong = libur. */
export function toggleStaffTemplateIds(
  current: Record<string, string[]>,
  staffId: string,
  templateId: string
): Record<string, string[]> {
  const existing = current[staffId] ?? []
  const next = existing.includes(templateId)
    ? existing.filter((id) => id !== templateId)
    : [...existing, templateId]
  if (next.length === 0) {
    const { [staffId]: _removed, ...rest } = current
    return rest
  }
  return { ...current, [staffId]: next }
}
