import { floorRolesOf } from "@/lib/permissions"
import { consecutiveRunEnding, isWeekend, slotHours, weekDates } from "@/lib/time"
import type {
  AssignmentRecord,
  DayOffRecord,
  FloorRole,
  OutletSettingsRecord,
  PreferenceRecord,
  ProposedAssignment,
  ProposedOff,
  RoleRequirementRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
} from "@/lib/types"

export type RecommendInput = {
  settings: OutletSettingsRecord
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  preferences: PreferenceRecord[]
  weekStart: string
  historyWorkDates?: Record<string, string[]>
}

export type RecommendResult = {
  assignments: ProposedAssignment[]
  offs: ProposedOff[]
  grantedSuggestionIds: string[]
  recommendedDayOff: { staffId: string; workDate: string }[]
}

function offKey(staffId: string, workDate: string) {
  return `${staffId}:${workDate}`
}

function availableStaff(
  staff: StaffRecord[],
  date: string,
  offs: Set<string>,
  history: Record<string, string[]>,
  proposedWork: Map<string, string[]>,
  maxConsecutive: number
): StaffRecord[] {
  return staff.filter((member) => {
    if (!member.isActive) return false
    if (offs.has(offKey(member.id, date))) return false
    const dates = [...(history[member.id] ?? []), ...(proposedWork.get(member.id) ?? []), date]
    return consecutiveRunEnding(dates, date) <= maxConsecutive
  })
}

function canCoverDay(
  staff: StaffRecord[],
  slots: SlotRecord[],
  requirements: RoleRequirementRecord[],
  date: string,
  offs: Set<string>,
  history: Record<string, string[]>,
  proposedWork: Map<string, string[]>,
  maxConsecutive: number
): boolean {
  const pool = availableStaff(staff, date, offs, history, proposedWork, maxConsecutive)
  for (const slot of slots) {
    if (pool.length < slot.minStaffCount) {
      return false
    }
    for (const req of requirements.filter((row) => row.templateId === slot.id)) {
      const capable = pool.filter((member) => member.roles.includes(req.role)).length
      if (capable < req.minCount) {
        return false
      }
    }
  }
  return true
}

function pickDutyRole(
  member: StaffRecord,
  slotId: string,
  requirements: RoleRequirementRecord[],
  already: ProposedAssignment[]
): string {
  const needed = requirements.filter((row) => row.templateId === slotId)
  for (const req of needed) {
    const have = already.filter(
      (row) => row.templateId === slotId && row.dutyRole === req.role
    ).length
    if (have < req.minCount && member.roles.includes(req.role)) {
      return req.role
    }
  }
  return floorRolesOf(member.roles)[0] ?? ""
}

export function recommendSchedule(input: RecommendInput): RecommendResult {
  const dates = weekDates(input.weekStart)
  const slots = input.slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const staff = input.staff.filter((member) => member.isActive)
  const history = input.historyWorkDates ?? {}
  const maxConsecutive = input.settings.maxConsecutiveWorkDays

  const grantedOff = new Set(input.offs.map((row) => offKey(row.staffId, row.workDate)))
  const grantedSuggestionIds: string[] = []
  const recommendedDayOff: { staffId: string; workDate: string }[] = []

  const suggestions = [...input.suggestions]
    .filter((row) => row.status === "suggested")
    .sort((a, b) => a.rank - b.rank || a.staffId.localeCompare(b.staffId))

  const emptyWork = new Map<string, string[]>()

  for (const suggestion of suggestions) {
    const trial = new Set(grantedOff)
    trial.add(offKey(suggestion.staffId, suggestion.workDate))
    const ok = dates.every((date) =>
      canCoverDay(
        staff,
        slots,
        input.requirements,
        date,
        trial,
        history,
        emptyWork,
        maxConsecutive
      )
    )
    if (ok) {
      grantedOff.add(offKey(suggestion.staffId, suggestion.workDate))
      grantedSuggestionIds.push(suggestion.id)
      recommendedDayOff.push({
        staffId: suggestion.staffId,
        workDate: suggestion.workDate,
      })
    } else {
      const alternative = dates.find(
        (date) =>
          date !== suggestion.workDate &&
          canCoverDay(
            staff,
            slots,
            input.requirements,
            date,
            new Set([...grantedOff, offKey(suggestion.staffId, date)]),
            history,
            emptyWork,
            maxConsecutive
          )
      )
      if (alternative) {
        recommendedDayOff.push({
          staffId: suggestion.staffId,
          workDate: alternative,
        })
      }
    }
  }

  const proposedWork = new Map<string, string[]>()
  const assignments: ProposedAssignment[] = []
  const hours = new Map<string, number>()

  for (const date of dates) {
    for (const slot of slots) {
      const already = assignments.filter(
        (row) => row.workDate === date && row.templateId === slot.id
      )
      const needed = Math.max(0, slot.minStaffCount - already.length)
      const pool = availableStaff(
        staff,
        date,
        grantedOff,
        history,
        proposedWork,
        maxConsecutive
      ).filter(
        (member) =>
          !assignments.some(
            (row) =>
              row.staffId === member.id &&
              row.workDate === date &&
              row.templateId === slot.id
          )
      )

      const scored = pool
        .map((member) => {
          const pref = input.preferences.find(
            (row) => row.staffId === member.id && row.weekStart === input.weekStart
          )
          const rank =
            pref?.slots.find((row) => row.templateId === slot.id)?.rank ?? 99
          const weekendPenalty =
            input.settings.weekendFairnessEnabled && isWeekend(date)
              ? (history[member.id] ?? []).filter(isWeekend).length
              : 0
          return {
            member,
            score:
              rank * 10 +
              (hours.get(member.id) ?? 0) +
              weekendPenalty * 3 +
              (proposedWork.get(member.id)?.length ?? 0),
          }
        })
        .sort((a, b) => a.score - b.score || a.member.id.localeCompare(b.member.id))

      for (const { member } of scored.slice(0, needed)) {
        const dutyRole = pickDutyRole(
          member,
          slot.id,
          input.requirements,
          assignments.filter((row) => row.workDate === date)
        )
        assignments.push({
          staffId: member.id,
          templateId: slot.id,
          workDate: date,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          dutyRole: dutyRole as FloorRole | "",
        })
        hours.set(
          member.id,
          (hours.get(member.id) ?? 0) + slotHours(slot.startMinutes, slot.endMinutes)
        )
        proposedWork.set(member.id, [...(proposedWork.get(member.id) ?? []), date])
      }
    }
  }

  const offs: ProposedOff[] = [...grantedOff].map((key) => {
    const [staffId, workDate] = key.split(":")
    const fromSuggestion = grantedSuggestionIds.some((id) => {
      const suggestion = input.suggestions.find((row) => row.id === id)
      return suggestion?.staffId === staffId && suggestion.workDate === workDate
    })
    return {
      staffId,
      workDate,
      weekStart: input.weekStart,
      source: fromSuggestion ? "accepted_suggestion" : "recommendation",
    }
  })

  return { assignments, offs, grantedSuggestionIds, recommendedDayOff }
}

export function wouldViolateConsecutive(
  workDates: string[],
  candidate: string,
  maxConsecutive: number
): boolean {
  return consecutiveRunEnding([...workDates, candidate], candidate) > maxConsecutive
}
