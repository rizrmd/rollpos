import { effectivePreferenceSlots } from "@/lib/staff-prefs"
import { addDays, consecutiveRunEnding, slotHours } from "@/lib/time"
import type {
  AssignmentRecord,
  DayOffRecord,
  PreferenceRecord,
  ProposedAssignment,
  ProposedOff,
  RoleRequirementRecord,
  ScheduleWarning,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
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

