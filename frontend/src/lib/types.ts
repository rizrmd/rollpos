export const STAFF_ROLES = [
  "owner",
  "manager",
  "kasir",
  "barista",
  "kitchen",
] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export const FLOOR_ROLES = ["kasir", "barista", "kitchen"] as const
export type FloorRole = (typeof FLOOR_ROLES)[number]

export const DEFAULT_OUTLET_ID = "main"

export type ProductRecord = {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  createdAt: number
  updatedAt: number
}

export type OutletSettingsRecord = {
  id: string
  outletId: string
  openMinutes: number
  closeMinutes: number
  weekStartsOn: number
  preferenceDeadlineWeekday: number
  preferenceDeadlineMinutes: number
  maxConsecutiveWorkDays: number
  targetDaysOffPerWeek: number
  targetHoursPerWeek: number
  hoursSkewPercent: number
  weekendFairnessEnabled: boolean
  graceLateMinutes: number
}

export type StaffRecord = {
  id: string
  name: string
  nickname: string
  pinHash: string
  pinSalt: string
  isActive: boolean
  outletId: string
  roles: StaffRole[]
}

export type SlotRecord = {
  id: string
  name: string
  startMinutes: number
  endMinutes: number
  sortOrder: number
  minStaffCount: number
  isActive: boolean
  outletId: string
}

export type RoleRequirementRecord = {
  id: string
  templateId: string
  role: FloorRole
  minCount: number
}

export type AssignmentStatus = "draft" | "published" | "cancelled"

export type AssignmentRecord = {
  id: string
  staffId: string
  templateId: string
  workDate: string
  startMinutes: number
  endMinutes: number
  dutyRole: string
  status: AssignmentStatus
  outletId: string
  note: string
}

export type AttendanceType = "clock_in" | "clock_out" | "correction"

export type AttendanceEventRecord = {
  id: string
  staffId: string
  type: AttendanceType
  occurredAt: number
  recordedAt: number
  deviceId: string
  shiftAssignmentId: string
  outletId: string
  note: string
  actorStaffId: string
  correctsEventId: string
}

export type SuggestionStatus = "suggested" | "accepted" | "declined"

export type SuggestionRecord = {
  id: string
  staffId: string
  weekStart: string
  workDate: string
  rank: number
  note: string
  status: SuggestionStatus
  alternativeDate: string
  actorStaffId: string
}

export type DayOffSource = "manager" | "accepted_suggestion" | "recommendation"

export type DayOffRecord = {
  id: string
  staffId: string
  workDate: string
  weekStart: string
  source: DayOffSource
  note: string
}

export type PreferenceSlotRecord = {
  templateId: string
  rank: number
}

export type PreferenceRecord = {
  id: string
  staffId: string
  weekStart: string
  note: string
  status: "draft" | "submitted"
  slots: PreferenceSlotRecord[]
}

export type WarningCode =
  | "understaffed"
  | "no_off"
  | "consecutive"
  | "hours_skew"
  | "off_pileup"
  | "weekend_unfair"
  | "unscheduled"

export type ScheduleWarning = {
  code: WarningCode
  workDate?: string
  templateId?: string
  staffId?: string
  message: string
}

export type ProposedAssignment = {
  staffId: string
  templateId: string
  workDate: string
  startMinutes: number
  endMinutes: number
  dutyRole: string
}

export type ProposedOff = {
  staffId: string
  workDate: string
  weekStart: string
  source: DayOffSource
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value)
}

export function isFloorRole(value: string): value is FloorRole {
  return (FLOOR_ROLES as readonly string[]).includes(value)
}
