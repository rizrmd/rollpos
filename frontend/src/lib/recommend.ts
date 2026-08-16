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

export const SYSTEM_DRAFT_NOTE = "usulan sistem"

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

export function historyWorkDatesFrom(
  assignments: AssignmentRecord[],
  beforeDate: string
): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const row of assignments) {
    if (row.status === "cancelled") continue
    if (row.workDate >= beforeDate) continue
    const list = map[row.staffId] ?? []
    if (!list.includes(row.workDate)) list.push(row.workDate)
    map[row.staffId] = list
  }
  for (const id of Object.keys(map)) {
    map[id]?.sort()
  }
  return map
}

export function weekHasActiveAssignments(
  assignments: AssignmentRecord[],
  weekStart: string
): boolean {
  const weekEnd = weekDates(weekStart)[6] ?? weekStart
  return assignments.some(
    (row) =>
      row.status !== "cancelled" &&
      row.workDate >= weekStart &&
      row.workDate <= weekEnd
  )
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
    const dates = [
      ...(history[member.id] ?? []),
      ...(proposedWork.get(member.id) ?? []),
      date,
    ]
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
  const pool = availableStaff(
    staff,
    date,
    offs,
    history,
    proposedWork,
    maxConsecutive
  )
  for (const slot of slots) {
    if (pool.length < slot.minStaffCount) {
      return false
    }
    for (const req of requirements.filter((row) => row.templateId === slot.id)) {
      const capable = pool.filter((member) =>
        member.roles.includes(req.role)
      ).length
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

function weekendWorkCount(
  memberId: string,
  history: Record<string, string[]>,
  extraDates: string[] = []
): number {
  return [...(history[memberId] ?? []), ...extraDates].filter(isWeekend).length
}

function grantStaffSuggestions({
  staff,
  slots,
  requirements,
  suggestions,
  dates,
  grantedOff,
  history,
  maxConsecutive,
}: {
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  suggestions: SuggestionRecord[]
  dates: string[]
  grantedOff: Set<string>
  history: Record<string, string[]>
  maxConsecutive: number
}): {
  grantedSuggestionIds: string[]
  recommendedDayOff: { staffId: string; workDate: string }[]
} {
  const grantedSuggestionIds: string[] = []
  const recommendedDayOff: { staffId: string; workDate: string }[] = []
  const emptyWork = new Map<string, string[]>()
  const ranked = [...suggestions]
    .filter((row) => row.status === "suggested")
    .sort((a, b) => a.rank - b.rank || a.staffId.localeCompare(b.staffId))

  for (const suggestion of ranked) {
    const trial = new Set(grantedOff)
    trial.add(offKey(suggestion.staffId, suggestion.workDate))
    const ok = dates.every((date) =>
      canCoverDay(
        staff,
        slots,
        requirements,
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
      continue
    }
    const alternative = dates.find(
      (date) =>
        date !== suggestion.workDate &&
        canCoverDay(
          staff,
          slots,
          requirements,
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

  return { grantedSuggestionIds, recommendedDayOff }
}

function allocateFairOffs({
  staff,
  slots,
  requirements,
  dates,
  grantedOff,
  history,
  settings,
}: {
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  dates: string[]
  grantedOff: Set<string>
  history: Record<string, string[]>
  settings: OutletSettingsRecord
}): { staffId: string; workDate: string }[] {
  const target = settings.targetDaysOffPerWeek
  if (target <= 0) return []

  const emptyWork = new Map<string, string[]>()
  const added: { staffId: string; workDate: string }[] = []
  const offCount = (staffId: string) =>
    dates.filter((date) => grantedOff.has(offKey(staffId, date))).length
  const offsOn = (date: string) =>
    staff.filter((member) => grantedOff.has(offKey(member.id, date))).length

  let progressed = true
  while (progressed) {
    progressed = false
    const needy = staff
      .filter((member) => offCount(member.id) < target)
      .sort((a, b) => {
        const offDelta = offCount(a.id) - offCount(b.id)
        if (offDelta !== 0) return offDelta
        if (settings.weekendFairnessEnabled) {
          const weekendDelta =
            weekendWorkCount(b.id, history) - weekendWorkCount(a.id, history)
          if (weekendDelta !== 0) return weekendDelta
        }
        return a.id.localeCompare(b.id)
      })

    for (const member of needy) {
      const scored = dates
        .filter((date) => !grantedOff.has(offKey(member.id, date)))
        .filter((date) =>
          canCoverDay(
            staff,
            slots,
            requirements,
            date,
            new Set([...grantedOff, offKey(member.id, date)]),
            history,
            emptyWork,
            settings.maxConsecutiveWorkDays
          )
        )
        .map((date) => {
          let score = offsOn(date) * 8
          if (settings.weekendFairnessEnabled && isWeekend(date)) {
            const weekends = weekendWorkCount(member.id, history)
            score += weekends >= 2 ? -5 : 5
          }
          return { date, score }
        })
        .sort(
          (a, b) => a.score - b.score || a.date.localeCompare(b.date)
        )

      const pick = scored[0]
      if (!pick) continue
      grantedOff.add(offKey(member.id, pick.date))
      added.push({ staffId: member.id, workDate: pick.date })
      progressed = true
      break
    }
  }

  return added
}

function assignToSlot(
  assignments: ProposedAssignment[],
  hours: Map<string, number>,
  proposedWork: Map<string, string[]>,
  member: StaffRecord,
  slot: SlotRecord,
  date: string,
  requirements: RoleRequirementRecord[]
): void {
  assignments.push({
    staffId: member.id,
    templateId: slot.id,
    workDate: date,
    startMinutes: slot.startMinutes,
    endMinutes: slot.endMinutes,
    dutyRole: pickDutyRole(
      member,
      slot.id,
      requirements,
      assignments.filter((row) => row.workDate === date)
    ) as FloorRole | "",
  })
  hours.set(
    member.id,
    (hours.get(member.id) ?? 0) + slotHours(slot.startMinutes, slot.endMinutes)
  )
  const days = proposedWork.get(member.id) ?? []
  if (!days.includes(date)) {
    proposedWork.set(member.id, [...days, date])
  }
}

function workScore({
  member,
  slot,
  date,
  preferences,
  weekStart,
  hours,
  proposedWork,
  history,
  weekendFairness,
}: {
  member: StaffRecord
  slot: SlotRecord
  date: string
  preferences: PreferenceRecord[]
  weekStart: string
  hours: Map<string, number>
  proposedWork: Map<string, string[]>
  history: Record<string, string[]>
  weekendFairness: boolean
}): number {
  const pref = preferences.find(
    (row) => row.staffId === member.id && row.weekStart === weekStart
  )
  const rank =
    pref?.slots.find((row) => row.templateId === slot.id)?.rank ?? 99
  const weekendPenalty =
    weekendFairness && isWeekend(date)
      ? weekendWorkCount(member.id, history, proposedWork.get(member.id))
      : 0
  return (
    rank * 10 +
    (hours.get(member.id) ?? 0) +
    weekendPenalty * 3 +
    (proposedWork.get(member.id)?.length ?? 0)
  )
}

function assignFairWork({
  staff,
  slots,
  requirements,
  dates,
  grantedOff,
  history,
  settings,
  preferences,
  weekStart,
}: {
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  dates: string[]
  grantedOff: Set<string>
  history: Record<string, string[]>
  settings: OutletSettingsRecord
  preferences: PreferenceRecord[]
  weekStart: string
}): ProposedAssignment[] {
  const assignments: ProposedAssignment[] = []
  const hours = new Map<string, number>()
  const proposedWork = new Map<string, string[]>()

  const scoreOf = (member: StaffRecord, slot: SlotRecord, date: string) =>
    workScore({
      member,
      slot,
      date,
      preferences,
      weekStart,
      hours,
      proposedWork,
      history,
      weekendFairness: settings.weekendFairnessEnabled,
    })

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
        settings.maxConsecutiveWorkDays
      ).filter(
        (member) =>
          !already.some((row) => row.staffId === member.id)
      )
      const scored = [...pool].sort(
        (a, b) =>
          scoreOf(a, slot, date) - scoreOf(b, slot, date) ||
          a.id.localeCompare(b.id)
      )
      for (const member of scored.slice(0, needed)) {
        assignToSlot(
          assignments,
          hours,
          proposedWork,
          member,
          slot,
          date,
          requirements
        )
      }
    }

    for (const slot of slots) {
      const already = assignments.filter(
        (row) => row.workDate === date && row.templateId === slot.id
      )
      if (already.length >= slot.minStaffCount) continue
      const extras = availableStaff(
        staff,
        date,
        grantedOff,
        history,
        proposedWork,
        settings.maxConsecutiveWorkDays
      ).filter((member) => !already.some((row) => row.staffId === member.id))
      const scored = [...extras].sort(
        (a, b) =>
          scoreOf(a, slot, date) - scoreOf(b, slot, date) ||
          a.id.localeCompare(b.id)
      )
      for (const member of scored.slice(
        0,
        slot.minStaffCount - already.length
      )) {
        assignToSlot(
          assignments,
          hours,
          proposedWork,
          member,
          slot,
          date,
          requirements
        )
      }
    }

    const workingIds = new Set(
      assignments
        .filter((row) => row.workDate === date)
        .map((row) => row.staffId)
    )
    const leftovers = availableStaff(
      staff,
      date,
      grantedOff,
      history,
      proposedWork,
      settings.maxConsecutiveWorkDays
    ).filter((member) => !workingIds.has(member.id))

    for (const member of leftovers) {
      const slot = [...slots].sort((a, b) => {
        const fillA = assignments.filter(
          (row) => row.workDate === date && row.templateId === a.id
        ).length
        const fillB = assignments.filter(
          (row) => row.workDate === date && row.templateId === b.id
        ).length
        const shortA = fillA < a.minStaffCount ? 0 : 1
        const shortB = fillB < b.minStaffCount ? 0 : 1
        if (shortA !== shortB) return shortA - shortB
        if (fillA !== fillB) return fillA - fillB
        return (
          scoreOf(member, a, date) - scoreOf(member, b, date) ||
          a.sortOrder - b.sortOrder
        )
      })[0]
      if (!slot) continue
      assignToSlot(
        assignments,
        hours,
        proposedWork,
        member,
        slot,
        date,
        requirements
      )
    }
  }

  return assignments
}

export function recommendSchedule(input: RecommendInput): RecommendResult {
  const dates = weekDates(input.weekStart)
  const slots = input.slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const staff = input.staff.filter((member) => member.isActive)
  const history = input.historyWorkDates ?? {}
  const maxConsecutive = input.settings.maxConsecutiveWorkDays

  const grantedOff = new Set(
    input.offs.map((row) => offKey(row.staffId, row.workDate))
  )

  const { grantedSuggestionIds, recommendedDayOff } = grantStaffSuggestions({
    staff,
    slots,
    requirements: input.requirements,
    suggestions: input.suggestions,
    dates,
    grantedOff,
    history,
    maxConsecutive,
  })

  const fairOffs = allocateFairOffs({
    staff,
    slots,
    requirements: input.requirements,
    dates,
    grantedOff,
    history,
    settings: input.settings,
  })
  for (const row of fairOffs) {
    if (
      !recommendedDayOff.some(
        (item) => item.staffId === row.staffId && item.workDate === row.workDate
      )
    ) {
      recommendedDayOff.push(row)
    }
  }

  const assignments = assignFairWork({
    staff,
    slots,
    requirements: input.requirements,
    dates,
    grantedOff,
    history,
    settings: input.settings,
    preferences: input.preferences,
    weekStart: input.weekStart,
  })

  const offs: ProposedOff[] = [...grantedOff].map((key) => {
    const [staffId, workDate] = key.split(":") as [string, string]
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
