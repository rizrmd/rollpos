import { floorRolesOf } from "@/lib/permissions"
import { consecutiveRunEnding, isWeekend, slotHours, weekDates } from "@/lib/time"
import {
  isIncludedInAttendance,
  type AssignmentRecord,
  type DayOffRecord,
  type OutletSettingsRecord,
  type RoleRequirementRecord,
  type ScheduleWarning,
  type SlotRecord,
  type StaffRecord,
  type SuggestionRecord,
} from "@/lib/types"

export type WarningInput = {
  settings: OutletSettingsRecord
  staff: StaffRecord[]
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
  assignments: AssignmentRecord[]
  offs: DayOffRecord[]
  suggestions: SuggestionRecord[]
  weekStart: string
  historyWorkDates?: Record<string, string[]>
  published?: boolean
}

function activeAssignments(assignments: AssignmentRecord[]) {
  return assignments.filter((row) => row.status !== "cancelled")
}

function offKey(staffId: string, workDate: string) {
  return `${staffId}:${workDate}`
}

export function detectWarnings(input: WarningInput): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = []
  const dates = weekDates(input.weekStart)
  const slots = input.slots.filter((slot) => slot.isActive)
  const staff = input.staff.filter(
    (member) => member.isActive && isIncludedInAttendance(member)
  )
  const assignments = activeAssignments(input.assignments)
  const offSet = new Set(input.offs.map((row) => offKey(row.staffId, row.workDate)))
  const hours = new Map<string, number>()

  for (const date of dates) {
    const suggested = input.suggestions.filter(
      (row) => row.workDate === date && row.status === "suggested"
    )
    const needed = slots.reduce((sum, slot) => sum + slot.minStaffCount, 0)
    if (suggested.length > 0 && suggested.length >= Math.max(1, staff.length - needed + 1)) {
      warnings.push({
        code: "off_pileup",
        workDate: date,
        message: `${suggested.length} staff suggest libur ${date}.`,
      })
    }

    for (const slot of slots) {
      const filled = assignments.filter(
        (row) => row.workDate === date && row.templateId === slot.id
      )
      if (filled.length < slot.minStaffCount) {
        warnings.push({
          code: "understaffed",
          workDate: date,
          templateId: slot.id,
          message: `${slot.name} ${date}: ${filled.length}/${slot.minStaffCount}.`,
        })
      }

      for (const req of input.requirements.filter((row) => row.templateId === slot.id)) {
        const count = filled.filter((row) => row.dutyRole === req.role).length
        if (count < req.minCount) {
          warnings.push({
            code: "understaffed",
            workDate: date,
            templateId: slot.id,
            message: `${slot.name} ${date} butuh ${req.minCount} ${req.role}.`,
          })
        }
      }

      for (const row of filled) {
        hours.set(
          row.staffId,
          (hours.get(row.staffId) ?? 0) + slotHours(row.startMinutes, row.endMinutes)
        )
      }
    }
  }

  const hourValues = [...hours.values()]
  const median =
    hourValues.length === 0
      ? 0
      : [...hourValues].sort((a, b) => a - b)[Math.floor(hourValues.length / 2)]

  for (const member of staff) {
    const worked = dates.filter((date) =>
      assignments.some((row) => row.staffId === member.id && row.workDate === date)
    )
    const offs = dates.filter((date) => offSet.has(offKey(member.id, date)))
    const unscheduled = dates.filter(
      (date) =>
        !worked.includes(date) && !offSet.has(offKey(member.id, date))
    )

    if (input.settings.targetDaysOffPerWeek > 0 && offs.length === 0 && worked.length > 0) {
      warnings.push({
        code: "no_off",
        staffId: member.id,
        message: `${member.name} belum punya hari libur resmi minggu ini.`,
      })
    }

    if (input.published && unscheduled.length > 0) {
      warnings.push({
        code: "unscheduled",
        staffId: member.id,
        message: `${member.name} masih punya ${unscheduled.length} hari belum diisi.`,
      })
    }

    for (const date of worked) {
      const history = [
        ...(input.historyWorkDates?.[member.id] ?? []),
        ...worked,
      ]
      if (
        consecutiveRunEnding(history, date) > input.settings.maxConsecutiveWorkDays
      ) {
        warnings.push({
          code: "consecutive",
          staffId: member.id,
          workDate: date,
          message: `${member.name} melebihi batas hari beruntun.`,
        })
      }
    }

    const memberHours = hours.get(member.id) ?? 0
    if (
      median > 0 &&
      input.settings.hoursSkewPercent > 0 &&
      Math.abs(memberHours - median) / median >= input.settings.hoursSkewPercent / 100
    ) {
      warnings.push({
        code: "hours_skew",
        staffId: member.id,
        message: `Jam kerja ${member.name} timpang dibanding median.`,
      })
    }

    if (input.settings.weekendFairnessEnabled) {
      const weekends = [...(input.historyWorkDates?.[member.id] ?? []), ...worked].filter(
        isWeekend
      )
      const uniqueWeekends = new Set(weekends)
      if (uniqueWeekends.size >= 6) {
        warnings.push({
          code: "weekend_unfair",
          staffId: member.id,
          message: `${member.name} terlalu sering jaga weekend.`,
        })
      }
    }

    if (floorRolesOf(member.roles).length === 0 && worked.length > 0) {
      // owner-only still valid
    }
  }

  return warnings
}
