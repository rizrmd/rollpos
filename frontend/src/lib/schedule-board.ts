import { isConsecutiveShift } from "@/lib/recommend"
import { effectivePreferenceSlots } from "@/lib/staff-prefs"
import { addDays, consecutiveRunEnding, slotHours } from "@/lib/time"
import {
  isStaffDeleted,
  type AssignmentRecord,
  type DayOffRecord,
  type PreferenceRecord,
  type ProposedAssignment,
  type ProposedOff,
  type RoleRequirementRecord,
  type SlotRecord,
  type StaffRecord,
  type SuggestionRecord,
} from "@/lib/types"

export type CoverageTone = "ok" | "tight" | "short"
export type DayHeat = "cool" | "warm" | "hot"
export type WeekRelation = "past" | "current" | "next" | "future"

export function coverageTone(
  filled: number,
  min: number,
  roleFailed: boolean
): CoverageTone {
  if (roleFailed || filled < min) return "short"
  if (filled === min) return "tight"
  return "ok"
}

export function roleFills(
  assignments: AssignmentRecord[],
  requirements: RoleRequirementRecord[],
  slotId: string
): { role: string; have: number; min: number }[] {
  return requirements
    .filter((row) => row.templateId === slotId)
    .map((row) => ({
      role: row.role,
      have: assignments.filter((item) => item.dutyRole === row.role).length,
      min: row.minCount,
    }))
}

export function cellCoverage(
  filled: AssignmentRecord[],
  slot: SlotRecord,
  requirements: RoleRequirementRecord[]
): {
  filled: number
  min: number
  tone: CoverageTone
  roles: { role: string; have: number; min: number }[]
} {
  const roles = roleFills(filled, requirements, slot.id)
  return {
    filled: filled.length,
    min: slot.minStaffCount,
    tone: coverageTone(
      filled.length,
      slot.minStaffCount,
      roles.some((row) => row.have < row.min)
    ),
    roles,
  }
}

export function dayHeat(
  suggested: number,
  activeStaff: number,
  minCoverage: number
): DayHeat {
  if (suggested <= 0) return "cool"
  if (suggested >= Math.max(1, activeStaff - minCoverage + 1)) return "hot"
  if (suggested >= 2) return "warm"
  return "cool"
}

export function weekRelation(
  weekStart: string,
  thisWeekStart: string
): WeekRelation {
  if (weekStart === thisWeekStart) return "current"
  if (weekStart === addDays(thisWeekStart, 7)) return "next"
  if (weekStart < thisWeekStart) return "past"
  return "future"
}

export function pickBoardWeekStart({
  thisWeekStart,
  upcomingWeekStart,
  assignments,
  suggestions,
}: {
  thisWeekStart: string
  upcomingWeekStart: string
  assignments: AssignmentRecord[]
  suggestions: SuggestionRecord[]
}): string {
  const thisEnd = addDays(thisWeekStart, 6)
  const nextEnd = addDays(upcomingWeekStart, 6)
  const thisPublished = assignments.some(
    (row) =>
      row.status === "published" &&
      row.workDate >= thisWeekStart &&
      row.workDate <= thisEnd
  )
  const nextPublished = assignments.some(
    (row) =>
      row.status === "published" &&
      row.workDate >= upcomingWeekStart &&
      row.workDate <= nextEnd
  )
  const nextPending = suggestions.some(
    (row) => row.weekStart === upcomingWeekStart && row.status === "suggested"
  )
  if (!nextPublished && (nextPending || thisPublished)) {
    return upcomingWeekStart
  }
  return thisWeekStart
}

export function alternativeOffDate({
  dates,
  requested,
  staffId,
  suggestions,
  offs,
}: {
  dates: string[]
  requested: string
  staffId: string
  suggestions: SuggestionRecord[]
  offs: DayOffRecord[]
}): string | null {
  const scored = dates
    .filter((date) => date !== requested)
    .filter(
      (date) =>
        !offs.some((row) => row.staffId === staffId && row.workDate === date)
    )
    .map((date) => ({
      date,
      heat: suggestions.filter(
        (row) => row.workDate === date && row.status === "suggested"
      ).length,
    }))
    .sort((a, b) => a.heat - b.heat || a.date.localeCompare(b.date))
  return scored[0]?.date ?? null
}

export function staffWeekLoad({
  member,
  dates,
  assignments,
  offs,
  suggestions,
  preferences,
  warnings,
  weekStart,
}: {
  member: StaffRecord
  dates: string[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  preferences: PreferenceRecord[]
  warnings: ScheduleWarning[]
  weekStart: string
}): {
  workDays: number
  hours: number
  offDays: number
  consecutive: number
  preferredSlotId: string | null
  suggestDates: string[]
  warningCodes: ScheduleWarning["code"][]
} {
  const mine = assignments.filter((row) => row.staffId === member.id)
  const workDates = [...new Set(mine.map((row) => row.workDate))].sort()
  const lastWork = workDates.at(-1)
  const prefSlots = effectivePreferenceSlots(member, preferences, weekStart)
  const topPref = [...prefSlots].sort((a, b) => a.rank - b.rank)[0]
  return {
    workDays: workDates.length,
    hours: mine.reduce(
      (sum, row) => sum + slotHours(row.startMinutes, row.endMinutes),
      0
    ),
    offDays: offs.filter(
      (row) => row.staffId === member.id && dates.includes(row.workDate)
    ).length,
    consecutive: lastWork ? consecutiveRunEnding(workDates, lastWork) : 0,
    preferredSlotId: topPref?.templateId ?? null,
    suggestDates: suggestions
      .filter(
        (row) =>
          row.staffId === member.id &&
          row.weekStart === weekStart &&
          row.status === "suggested"
      )
      .sort((a, b) => a.rank - b.rank)
      .map((row) => row.workDate),
    warningCodes: [
      ...new Set(
        warnings
          .filter((row) => row.staffId === member.id)
          .map((row) => row.code)
      ),
    ],
  }
}

export function summarizeRecommendation({
  proposedAssignments,
  proposedOffs,
  grantedSuggestionIds,
  recommendedDayOff,
  currentAssignments,
}: {
  proposedAssignments: ProposedAssignment[]
  proposedOffs: ProposedOff[]
  grantedSuggestionIds: string[]
  recommendedDayOff: { staffId: string; workDate: string }[]
  currentAssignments: AssignmentRecord[]
}): {
  assignmentCount: number
  offCount: number
  grantedCount: number
  alternativeCount: number
  replaces: number
} {
  const grantedKeys = new Set(
    proposedOffs
      .filter((row) => row.source === "accepted_suggestion")
      .map((row) => `${row.staffId}:${row.workDate}`)
  )
  return {
    assignmentCount: proposedAssignments.length,
    offCount: proposedOffs.length,
    grantedCount: grantedSuggestionIds.length,
    alternativeCount: recommendedDayOff.filter(
      (row) => !grantedKeys.has(`${row.staffId}:${row.workDate}`)
    ).length,
    replaces: currentAssignments.length,
  }
}

export function groupWarnings(warnings: ScheduleWarning[]): {
  understaffed: number
  noOff: number
  consecutive: number
  pileup: number
  unscheduled: number
  other: number
} {
  return {
    understaffed: warnings.filter((row) => row.code === "understaffed").length,
    noOff: warnings.filter((row) => row.code === "no_off").length,
    consecutive: warnings.filter((row) => row.code === "consecutive").length,
    pileup: warnings.filter((row) => row.code === "off_pileup").length,
    unscheduled: warnings.filter((row) => row.code === "unscheduled").length,
    other: warnings.filter(
      (row) =>
        row.code !== "understaffed" &&
        row.code !== "no_off" &&
        row.code !== "consecutive" &&
        row.code !== "off_pileup" &&
        row.code !== "unscheduled"
    ).length,
  }
}

export function unscheduledOnDate(
  staff: StaffRecord[],
  date: string,
  assignments: AssignmentRecord[],
  offs: DayOffRecord[]
): StaffRecord[] {
  return staff.filter((member) => {
    if (!member.isActive) return false
    const working = assignments.some(
      (row) => row.staffId === member.id && row.workDate === date
    )
    const off = offs.some(
      (row) => row.staffId === member.id && row.workDate === date
    )
    return !working && !off
  })
}

export type WorkloadBand = "longgar" | "pas" | "padat"

export const WORKLOAD_BAND_LABEL: Record<WorkloadBand, string> = {
  longgar: "longgar",
  pas: "pas",
  padat: "padat",
}

export type ReplacementOption = {
  staffId: string
  name: string
  nickname: string
  workDays: number
  hours: number
  band: WorkloadBand
}

type WorkRow = {
  staffId: string
  templateId: string
  workDate: string
  startMinutes: number
  endMinutes: number
}

/** Jam di atas/bawah median ± skew = padat/longgar. */
export function workloadBand(
  hours: number,
  peerHours: number[],
  skewPercent: number
): WorkloadBand {
  if (peerHours.length === 0) return "pas"
  const sorted = [...peerHours].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  if (median <= 0) return hours > 0 ? "padat" : "longgar"
  const skew = Math.max(0, skewPercent) / 100
  if (hours > median * (1 + skew)) return "padat"
  if (hours < median * (1 - skew)) return "longgar"
  return "pas"
}

function slotMinutes(
  slots: SlotRecord[],
  templateId: string
): { startMinutes: number; endMinutes: number } {
  const slot = slots.find((item) => item.id === templateId)
  return {
    startMinutes: slot?.startMinutes ?? 0,
    endMinutes: slot?.endMinutes ?? 0,
  }
}

/** Assignment tersimpan per tanggal; kalau tanggal kosong, pakai usulan. */
export function displayedWorkRows({
  dates,
  slots,
  assignments,
  proposedAssignments = [],
}: {
  dates: string[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  proposedAssignments?: { staffId: string; workDate: string; templateId: string }[]
}): WorkRow[] {
  const rows: WorkRow[] = []
  for (const date of dates) {
    const stored = assignments.filter(
      (row) => row.workDate === date && row.status !== "cancelled"
    )
    if (stored.length > 0) {
      rows.push(
        ...stored.map((row) => ({
          staffId: row.staffId,
          templateId: row.templateId,
          workDate: row.workDate,
          startMinutes: row.startMinutes,
          endMinutes: row.endMinutes,
        }))
      )
      continue
    }
    for (const row of proposedAssignments.filter((item) => item.workDate === date)) {
      const minutes = slotMinutes(slots, row.templateId)
      rows.push({
        staffId: row.staffId,
        templateId: row.templateId,
        workDate: row.workDate,
        ...minutes,
      })
    }
  }
  return rows
}

function loadOf(rows: WorkRow[], staffId: string): { workDays: number; hours: number } {
  const mine = rows.filter((row) => row.staffId === staffId)
  return {
    workDays: new Set(mine.map((row) => row.workDate)).size,
    hours: mine.reduce(
      (sum, row) => sum + slotHours(row.startMinutes, row.endMinutes),
      0
    ),
  }
}

const BAND_RANK: Record<WorkloadBand, number> = {
  longgar: 0,
  pas: 1,
  padat: 2,
}

/** Orang yang bisa menggantikan satu orang di satu slot, diurutkan dari yang paling longgar. */
export function replacementOptions({
  staff,
  slots,
  date,
  slotId,
  fromStaffId,
  assignments,
  offs,
  proposedAssignments = [],
  dates,
  skewPercent,
}: {
  staff: StaffRecord[]
  slots: SlotRecord[]
  date: string
  slotId: string
  fromStaffId: string
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  proposedAssignments?: { staffId: string; workDate: string; templateId: string }[]
  dates: string[]
  skewPercent: number
}): ReplacementOption[] {
  const slot = slots.find((item) => item.id === slotId)
  if (!slot) return []
  const rows = displayedWorkRows({
    dates,
    slots,
    assignments,
    proposedAssignments,
  })
  const dayRows = rows.filter((row) => row.workDate === date)
  const offIds = new Set(
    offs
      .filter((row) => row.workDate === date)
      .map((row) => row.staffId)
  )
  const peerHours = staff
    .filter((member) => member.isActive && !isStaffDeleted(member))
    .map((member) => loadOf(rows, member.id).hours)
  const options: ReplacementOption[] = []
  for (const member of staff) {
    if (!member.isActive || isStaffDeleted(member)) continue
    if (member.id === fromStaffId) continue
    if (offIds.has(member.id)) continue
    if (
      dayRows.some(
        (row) => row.staffId === member.id && row.templateId === slotId
      )
    ) {
      continue
    }
    if (
      dayRows.some(
        (row) =>
          row.staffId === member.id &&
          isConsecutiveShift(row, slot, date, slots)
      )
    ) {
      continue
    }
    const load = loadOf(rows, member.id)
    options.push({
      staffId: member.id,
      name: member.name,
      nickname: member.nickname,
      workDays: load.workDays,
      hours: load.hours,
      band: workloadBand(load.hours, peerHours, skewPercent),
    })
  }
  return options.sort(
    (a, b) =>
      BAND_RANK[a.band] - BAND_RANK[b.band] ||
      a.hours - b.hours ||
      a.name.localeCompare(b.name, "id")
  )
}

