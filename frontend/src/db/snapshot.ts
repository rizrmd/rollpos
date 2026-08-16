import type { Database } from "@nozbe/watermelondb"
import { Q } from "@nozbe/watermelondb"

import {
  AttendanceEvent,
  DayOffSuggestion,
  OutletSettings,
  ScheduledDayOff,
  ShiftAssignment,
  ShiftRoleRequirement,
  ShiftTemplate,
  StaffMember,
  StaffMemberRole,
  WeekPreference,
  WeekPreferenceSlot,
} from "@/db/models/staffing"
import { isFloorRole, isStaffRole, type FloorRole, type StaffRole } from "@/lib/types"
import type {
  AssignmentRecord,
  AttendanceEventRecord,
  AttendanceType,
  AssignmentStatus,
  DayOffRecord,
  DayOffSource,
  OutletSettingsRecord,
  PreferenceRecord,
  RoleRequirementRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
  SuggestionStatus,
} from "@/lib/types"

export function settingsCollection(database: Database) {
  return database.get<OutletSettings>("outlet_settings")
}
export function staffCollection(database: Database) {
  return database.get<StaffMember>("staff_members")
}
export function staffRoleCollection(database: Database) {
  return database.get<StaffMemberRole>("staff_member_roles")
}
export function slotCollection(database: Database) {
  return database.get<ShiftTemplate>("shift_templates")
}
export function requirementCollection(database: Database) {
  return database.get<ShiftRoleRequirement>("shift_role_requirements")
}
export function assignmentCollection(database: Database) {
  return database.get<ShiftAssignment>("shift_assignments")
}
export function attendanceCollection(database: Database) {
  return database.get<AttendanceEvent>("attendance_events")
}
export function preferenceCollection(database: Database) {
  return database.get<WeekPreference>("week_preferences")
}
export function preferenceSlotCollection(database: Database) {
  return database.get<WeekPreferenceSlot>("week_preference_slots")
}
export function suggestionCollection(database: Database) {
  return database.get<DayOffSuggestion>("day_off_suggestions")
}
export function dayOffCollection(database: Database) {
  return database.get<ScheduledDayOff>("scheduled_days_off")
}

export function toSettings(row: OutletSettings): OutletSettingsRecord {
  return {
    id: row.id,
    outletId: row.outletId,
    openMinutes: row.openMinutes,
    closeMinutes: row.closeMinutes,
    weekStartsOn: row.weekStartsOn,
    preferenceDeadlineWeekday: row.preferenceDeadlineWeekday,
    preferenceDeadlineMinutes: row.preferenceDeadlineMinutes,
    maxConsecutiveWorkDays: row.maxConsecutiveWorkDays,
    targetDaysOffPerWeek: row.targetDaysOffPerWeek,
    targetHoursPerWeek: row.targetHoursPerWeek,
    hoursSkewPercent: row.hoursSkewPercent,
    weekendFairnessEnabled: row.weekendFairnessEnabled,
    graceLateMinutes: row.graceLateMinutes,
  }
}

export function toSlot(row: ShiftTemplate): SlotRecord {
  return {
    id: row.id,
    name: row.name,
    startMinutes: row.startMinutes,
    endMinutes: row.endMinutes,
    sortOrder: row.sortOrder,
    minStaffCount: row.minStaffCount,
    isActive: row.isActive,
    outletId: row.outletId,
  }
}

export function toAssignment(row: ShiftAssignment): AssignmentRecord {
  return {
    id: row.id,
    staffId: row.staffId,
    templateId: row.templateId,
    workDate: row.workDate,
    startMinutes: row.startMinutes,
    endMinutes: row.endMinutes,
    dutyRole: row.dutyRole,
    status: row.status as AssignmentStatus,
    outletId: row.outletId,
    note: row.note,
  }
}

export function toSuggestion(row: DayOffSuggestion): SuggestionRecord {
  return {
    id: row.id,
    staffId: row.staffId,
    weekStart: row.weekStart,
    workDate: row.workDate,
    rank: row.rank,
    note: row.note,
    status: row.status as SuggestionStatus,
    alternativeDate: row.alternativeDate,
    actorStaffId: row.actorStaffId,
  }
}

export function toDayOff(row: ScheduledDayOff): DayOffRecord {
  return {
    id: row.id,
    staffId: row.staffId,
    workDate: row.workDate,
    weekStart: row.weekStart,
    source: row.source as DayOffSource,
    note: row.note,
  }
}

export function toAttendance(row: AttendanceEvent): AttendanceEventRecord {
  return {
    id: row.id,
    staffId: row.staffId,
    type: row.type as AttendanceType,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    deviceId: row.deviceId,
    shiftAssignmentId: row.shiftAssignmentId,
    outletId: row.outletId,
    note: row.note,
    actorStaffId: row.actorStaffId,
    correctsEventId: row.correctsEventId,
  }
}

export async function loadSettings(
  database: Database,
  outletId: string
): Promise<OutletSettingsRecord | null> {
  const rows = await settingsCollection(database)
    .query(Q.where("outlet_id", outletId))
    .fetch()
  return rows[0] ? toSettings(rows[0]) : null
}

export async function loadStaff(database: Database): Promise<StaffRecord[]> {
  const people = await staffCollection(database).query().fetch()
  const roles = await staffRoleCollection(database).query().fetch()
  return people.map((person) => ({
    id: person.id,
    name: person.name,
    nickname: person.nickname,
    pinHash: person.pinHash,
    pinSalt: person.pinSalt,
    isActive: person.isActive,
    outletId: person.outletId,
    roles: roles
      .filter((row) => row.staffId === person.id && isStaffRole(row.role))
      .map((row) => row.role as StaffRole),
  }))
}

export async function loadSlots(database: Database): Promise<SlotRecord[]> {
  const rows = await slotCollection(database).query().fetch()
  return rows.map(toSlot).sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function loadRequirements(
  database: Database
): Promise<RoleRequirementRecord[]> {
  const rows = await requirementCollection(database).query().fetch()
  return rows
    .filter((row) => isFloorRole(row.role))
    .map((row) => ({
      id: row.id,
      templateId: row.templateId,
      role: row.role as FloorRole,
      minCount: row.minCount,
    }))
}

export async function loadAssignments(
  database: Database,
  weekDates?: string[]
): Promise<AssignmentRecord[]> {
  const rows = weekDates
    ? await assignmentCollection(database)
        .query(Q.where("work_date", Q.oneOf(weekDates)))
        .fetch()
    : await assignmentCollection(database).query().fetch()
  return rows.map(toAssignment)
}

export async function loadSuggestions(
  database: Database,
  weekStart?: string
): Promise<SuggestionRecord[]> {
  const rows = weekStart
    ? await suggestionCollection(database)
        .query(Q.where("week_start", weekStart))
        .fetch()
    : await suggestionCollection(database).query().fetch()
  return rows.map(toSuggestion)
}

export async function loadDayOffs(
  database: Database,
  weekStart?: string
): Promise<DayOffRecord[]> {
  const rows = weekStart
    ? await dayOffCollection(database).query(Q.where("week_start", weekStart)).fetch()
    : await dayOffCollection(database).query().fetch()
  return rows.map(toDayOff)
}

export async function loadAttendance(
  database: Database,
  staffId?: string
): Promise<AttendanceEventRecord[]> {
  const rows = staffId
    ? await attendanceCollection(database).query(Q.where("staff_id", staffId)).fetch()
    : await attendanceCollection(database).query().fetch()
  return rows
    .map(toAttendance)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.recordedAt - b.recordedAt)
}

export async function loadPreferences(
  database: Database,
  weekStart?: string
): Promise<PreferenceRecord[]> {
  const prefs = weekStart
    ? await preferenceCollection(database)
        .query(Q.where("week_start", weekStart))
        .fetch()
    : await preferenceCollection(database).query().fetch()
  const slots = await preferenceSlotCollection(database).query().fetch()
  return prefs.map((pref) => ({
    id: pref.id,
    staffId: pref.staffId,
    weekStart: pref.weekStart,
    note: pref.note,
    status: pref.status === "submitted" ? "submitted" : "draft",
    slots: slots
      .filter((row) => row.preferenceId === pref.id)
      .map((row) => ({ templateId: row.templateId, rank: row.rank })),
  }))
}
