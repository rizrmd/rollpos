import {
  cellFlag,
  cellNum,
  cellStr,
  listRows,
  type Database,
  TABLES,
} from "@/db/database"
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
  ProductRecord,
  RoleRequirementRecord,
  SlotRecord,
  StaffRecord,
  SuggestionRecord,
  SuggestionStatus,
} from "@/lib/types"

export function toSettings(row: ReturnType<typeof listRows>[number]): OutletSettingsRecord {
  return {
    id: row.id,
    outletId: cellStr(row, "outletId"),
    openMinutes: cellNum(row, "openMinutes"),
    closeMinutes: cellNum(row, "closeMinutes"),
    weekStartsOn: cellNum(row, "weekStartsOn"),
    preferenceDeadlineWeekday: cellNum(row, "preferenceDeadlineWeekday"),
    preferenceDeadlineMinutes: cellNum(row, "preferenceDeadlineMinutes"),
    maxConsecutiveWorkDays: cellNum(row, "maxConsecutiveWorkDays"),
    targetDaysOffPerWeek: cellNum(row, "targetDaysOffPerWeek"),
    targetHoursPerWeek: cellNum(row, "targetHoursPerWeek"),
    hoursSkewPercent: cellNum(row, "hoursSkewPercent"),
    weekendFairnessEnabled: cellFlag(row, "weekendFairnessEnabled"),
    graceLateMinutes: cellNum(row, "graceLateMinutes"),
  }
}

export function toSlot(row: ReturnType<typeof listRows>[number]): SlotRecord {
  return {
    id: row.id,
    name: cellStr(row, "name"),
    startMinutes: cellNum(row, "startMinutes"),
    endMinutes: cellNum(row, "endMinutes"),
    sortOrder: cellNum(row, "sortOrder"),
    minStaffCount: cellNum(row, "minStaffCount"),
    isActive: cellFlag(row, "isActive"),
    outletId: cellStr(row, "outletId"),
  }
}

export function toAssignment(row: ReturnType<typeof listRows>[number]): AssignmentRecord {
  return {
    id: row.id,
    staffId: cellStr(row, "staffId"),
    templateId: cellStr(row, "templateId"),
    workDate: cellStr(row, "workDate"),
    startMinutes: cellNum(row, "startMinutes"),
    endMinutes: cellNum(row, "endMinutes"),
    dutyRole: cellStr(row, "dutyRole"),
    status: cellStr(row, "status") as AssignmentStatus,
    outletId: cellStr(row, "outletId"),
    note: cellStr(row, "note"),
  }
}

export function toSuggestion(row: ReturnType<typeof listRows>[number]): SuggestionRecord {
  return {
    id: row.id,
    staffId: cellStr(row, "staffId"),
    weekStart: cellStr(row, "weekStart"),
    workDate: cellStr(row, "workDate"),
    rank: cellNum(row, "rank"),
    note: cellStr(row, "note"),
    status: cellStr(row, "status") as SuggestionStatus,
    alternativeDate: cellStr(row, "alternativeDate"),
    actorStaffId: cellStr(row, "actorStaffId"),
  }
}

export function toDayOff(row: ReturnType<typeof listRows>[number]): DayOffRecord {
  return {
    id: row.id,
    staffId: cellStr(row, "staffId"),
    workDate: cellStr(row, "workDate"),
    weekStart: cellStr(row, "weekStart"),
    source: cellStr(row, "source") as DayOffSource,
    note: cellStr(row, "note"),
  }
}

export function toAttendance(row: ReturnType<typeof listRows>[number]): AttendanceEventRecord {
  return {
    id: row.id,
    staffId: cellStr(row, "staffId"),
    type: cellStr(row, "type") as AttendanceType,
    occurredAt: cellNum(row, "occurredAt"),
    recordedAt: cellNum(row, "recordedAt"),
    deviceId: cellStr(row, "deviceId"),
    shiftAssignmentId: cellStr(row, "shiftAssignmentId"),
    outletId: cellStr(row, "outletId"),
    note: cellStr(row, "note"),
    actorStaffId: cellStr(row, "actorStaffId"),
    correctsEventId: cellStr(row, "correctsEventId"),
  }
}

export function toProduct(row: ReturnType<typeof listRows>[number]): ProductRecord {
  return {
    id: row.id,
    name: cellStr(row, "name"),
    sku: cellStr(row, "sku"),
    price: cellNum(row, "price"),
    stock: cellNum(row, "stock"),
    createdAt: cellNum(row, "createdAt"),
    updatedAt: cellNum(row, "updatedAt"),
  }
}

export async function loadSettings(
  database: Database,
  outletId: string
): Promise<OutletSettingsRecord | null> {
  await database.ready
  const row = listRows(database, TABLES.outletSettings).find(
    (item) => cellStr(item, "outletId") === outletId
  )
  return row ? toSettings(row) : null
}

export async function loadStaff(database: Database): Promise<StaffRecord[]> {
  await database.ready
  const people = listRows(database, TABLES.staffMembers)
  const roles = listRows(database, TABLES.staffMemberRoles)
  return people.map((person) => ({
    id: person.id,
    name: cellStr(person, "name"),
    nickname: cellStr(person, "nickname"),
    pinHash: cellStr(person, "pinHash"),
    pinSalt: cellStr(person, "pinSalt"),
    isActive: cellFlag(person, "isActive"),
    outletId: cellStr(person, "outletId"),
    roles: roles
      .filter((row) => cellStr(row, "staffId") === person.id && isStaffRole(cellStr(row, "role")))
      .map((row) => cellStr(row, "role") as StaffRole),
  }))
}

export async function loadSlots(database: Database): Promise<SlotRecord[]> {
  await database.ready
  return listRows(database, TABLES.shiftTemplates)
    .map(toSlot)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function loadRequirements(
  database: Database
): Promise<RoleRequirementRecord[]> {
  await database.ready
  return listRows(database, TABLES.shiftRoleRequirements)
    .filter((row) => isFloorRole(cellStr(row, "role")))
    .map((row) => ({
      id: row.id,
      templateId: cellStr(row, "templateId"),
      role: cellStr(row, "role") as FloorRole,
      minCount: cellNum(row, "minCount"),
    }))
}

export async function loadAssignments(
  database: Database,
  weekDates?: string[]
): Promise<AssignmentRecord[]> {
  await database.ready
  const allowed = weekDates ? new Set(weekDates) : null
  return listRows(database, TABLES.shiftAssignments)
    .filter((row) => !allowed || allowed.has(cellStr(row, "workDate")))
    .map(toAssignment)
}

export async function loadSuggestions(
  database: Database,
  weekStart?: string
): Promise<SuggestionRecord[]> {
  await database.ready
  return listRows(database, TABLES.dayOffSuggestions)
    .filter((row) => !weekStart || cellStr(row, "weekStart") === weekStart)
    .map(toSuggestion)
}

export async function loadDayOffs(
  database: Database,
  weekStart?: string
): Promise<DayOffRecord[]> {
  await database.ready
  return listRows(database, TABLES.scheduledDaysOff)
    .filter((row) => !weekStart || cellStr(row, "weekStart") === weekStart)
    .map(toDayOff)
}

export async function loadAttendance(
  database: Database,
  staffId?: string
): Promise<AttendanceEventRecord[]> {
  await database.ready
  return listRows(database, TABLES.attendanceEvents)
    .filter((row) => !staffId || cellStr(row, "staffId") === staffId)
    .map(toAttendance)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.recordedAt - b.recordedAt)
}

export async function loadPreferences(
  database: Database,
  weekStart?: string
): Promise<PreferenceRecord[]> {
  await database.ready
  const prefs = listRows(database, TABLES.weekPreferences).filter(
    (row) => !weekStart || cellStr(row, "weekStart") === weekStart
  )
  const slots = listRows(database, TABLES.weekPreferenceSlots)
  return prefs.map((pref) => ({
    id: pref.id,
    staffId: cellStr(pref, "staffId"),
    weekStart: cellStr(pref, "weekStart"),
    note: cellStr(pref, "note"),
    status: cellStr(pref, "status") === "submitted" ? "submitted" : "draft",
    slots: slots
      .filter((row) => cellStr(row, "preferenceId") === pref.id)
      .map((row) => ({
        templateId: cellStr(row, "templateId"),
        rank: cellNum(row, "rank"),
      })),
  }))
}

export async function loadProducts(database: Database): Promise<ProductRecord[]> {
  await database.ready
  return listRows(database, TABLES.products).map(toProduct)
}
