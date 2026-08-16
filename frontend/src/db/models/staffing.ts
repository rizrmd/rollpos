import { RawModel } from "@/db/raw-model"

export class OutletSettings extends RawModel {
  static table = "outlet_settings"

  get outletId() {
    return this.str("outlet_id")
  }
  set outletId(value: string) {
    this.setStr("outlet_id", value)
  }
  get openMinutes() {
    return this.num("open_minutes")
  }
  set openMinutes(value: number) {
    this.setNum("open_minutes", value)
  }
  get closeMinutes() {
    return this.num("close_minutes")
  }
  set closeMinutes(value: number) {
    this.setNum("close_minutes", value)
  }
  get weekStartsOn() {
    return this.num("week_starts_on")
  }
  set weekStartsOn(value: number) {
    this.setNum("week_starts_on", value)
  }
  get preferenceDeadlineWeekday() {
    return this.num("preference_deadline_weekday")
  }
  set preferenceDeadlineWeekday(value: number) {
    this.setNum("preference_deadline_weekday", value)
  }
  get preferenceDeadlineMinutes() {
    return this.num("preference_deadline_minutes")
  }
  set preferenceDeadlineMinutes(value: number) {
    this.setNum("preference_deadline_minutes", value)
  }
  get maxConsecutiveWorkDays() {
    return this.num("max_consecutive_work_days")
  }
  set maxConsecutiveWorkDays(value: number) {
    this.setNum("max_consecutive_work_days", value)
  }
  get targetDaysOffPerWeek() {
    return this.num("target_days_off_per_week")
  }
  set targetDaysOffPerWeek(value: number) {
    this.setNum("target_days_off_per_week", value)
  }
  get targetHoursPerWeek() {
    return this.num("target_hours_per_week")
  }
  set targetHoursPerWeek(value: number) {
    this.setNum("target_hours_per_week", value)
  }
  get hoursSkewPercent() {
    return this.num("hours_skew_percent")
  }
  set hoursSkewPercent(value: number) {
    this.setNum("hours_skew_percent", value)
  }
  get weekendFairnessEnabled() {
    return this.flag("weekend_fairness_enabled")
  }
  set weekendFairnessEnabled(value: boolean) {
    this.setFlag("weekend_fairness_enabled", value)
  }
  get graceLateMinutes() {
    return this.num("grace_late_minutes")
  }
  set graceLateMinutes(value: number) {
    this.setNum("grace_late_minutes", value)
  }
}

export class StaffMember extends RawModel {
  static table = "staff_members"

  get name() {
    return this.str("name")
  }
  set name(value: string) {
    this.setStr("name", value)
  }
  get nickname() {
    return this.str("nickname")
  }
  set nickname(value: string) {
    this.setStr("nickname", value)
  }
  get pinHash() {
    return this.str("pin_hash")
  }
  set pinHash(value: string) {
    this.setStr("pin_hash", value)
  }
  get pinSalt() {
    return this.str("pin_salt")
  }
  set pinSalt(value: string) {
    this.setStr("pin_salt", value)
  }
  get isActive() {
    return this.flag("is_active")
  }
  set isActive(value: boolean) {
    this.setFlag("is_active", value)
  }
  get outletId() {
    return this.str("outlet_id")
  }
  set outletId(value: string) {
    this.setStr("outlet_id", value)
  }
}

export class StaffMemberRole extends RawModel {
  static table = "staff_member_roles"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get role() {
    return this.str("role")
  }
  set role(value: string) {
    this.setStr("role", value)
  }
}

export class ShiftTemplate extends RawModel {
  static table = "shift_templates"

  get name() {
    return this.str("name")
  }
  set name(value: string) {
    this.setStr("name", value)
  }
  get startMinutes() {
    return this.num("start_minutes")
  }
  set startMinutes(value: number) {
    this.setNum("start_minutes", value)
  }
  get endMinutes() {
    return this.num("end_minutes")
  }
  set endMinutes(value: number) {
    this.setNum("end_minutes", value)
  }
  get sortOrder() {
    return this.num("sort_order")
  }
  set sortOrder(value: number) {
    this.setNum("sort_order", value)
  }
  get minStaffCount() {
    return this.num("min_staff_count")
  }
  set minStaffCount(value: number) {
    this.setNum("min_staff_count", value)
  }
  get isActive() {
    return this.flag("is_active")
  }
  set isActive(value: boolean) {
    this.setFlag("is_active", value)
  }
  get outletId() {
    return this.str("outlet_id")
  }
  set outletId(value: string) {
    this.setStr("outlet_id", value)
  }
}

export class ShiftRoleRequirement extends RawModel {
  static table = "shift_role_requirements"

  get templateId() {
    return this.str("template_id")
  }
  set templateId(value: string) {
    this.setStr("template_id", value)
  }
  get role() {
    return this.str("role")
  }
  set role(value: string) {
    this.setStr("role", value)
  }
  get minCount() {
    return this.num("min_count")
  }
  set minCount(value: number) {
    this.setNum("min_count", value)
  }
}

export class ShiftAssignment extends RawModel {
  static table = "shift_assignments"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get templateId() {
    return this.str("template_id")
  }
  set templateId(value: string) {
    this.setStr("template_id", value)
  }
  get workDate() {
    return this.str("work_date")
  }
  set workDate(value: string) {
    this.setStr("work_date", value)
  }
  get startMinutes() {
    return this.num("start_minutes")
  }
  set startMinutes(value: number) {
    this.setNum("start_minutes", value)
  }
  get endMinutes() {
    return this.num("end_minutes")
  }
  set endMinutes(value: number) {
    this.setNum("end_minutes", value)
  }
  get dutyRole() {
    return this.str("duty_role")
  }
  set dutyRole(value: string) {
    this.setStr("duty_role", value)
  }
  get status() {
    return this.str("status")
  }
  set status(value: string) {
    this.setStr("status", value)
  }
  get outletId() {
    return this.str("outlet_id")
  }
  set outletId(value: string) {
    this.setStr("outlet_id", value)
  }
  get note() {
    return this.str("note")
  }
  set note(value: string) {
    this.setStr("note", value)
  }
}

export class AttendanceEvent extends RawModel {
  static table = "attendance_events"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get type() {
    return this.str("type")
  }
  set type(value: string) {
    this.setStr("type", value)
  }
  get occurredAt() {
    return this.num("occurred_at")
  }
  set occurredAt(value: number) {
    this.setNum("occurred_at", value)
  }
  get recordedAt() {
    return this.num("recorded_at")
  }
  set recordedAt(value: number) {
    this.setNum("recorded_at", value)
  }
  get deviceId() {
    return this.str("device_id")
  }
  set deviceId(value: string) {
    this.setStr("device_id", value)
  }
  get shiftAssignmentId() {
    return this.str("shift_assignment_id")
  }
  set shiftAssignmentId(value: string) {
    this.setStr("shift_assignment_id", value)
  }
  get outletId() {
    return this.str("outlet_id")
  }
  set outletId(value: string) {
    this.setStr("outlet_id", value)
  }
  get note() {
    return this.str("note")
  }
  set note(value: string) {
    this.setStr("note", value)
  }
  get actorStaffId() {
    return this.str("actor_staff_id")
  }
  set actorStaffId(value: string) {
    this.setStr("actor_staff_id", value)
  }
  get correctsEventId() {
    return this.str("corrects_event_id")
  }
  set correctsEventId(value: string) {
    this.setStr("corrects_event_id", value)
  }
}

export class WeekPreference extends RawModel {
  static table = "week_preferences"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get weekStart() {
    return this.str("week_start")
  }
  set weekStart(value: string) {
    this.setStr("week_start", value)
  }
  get note() {
    return this.str("note")
  }
  set note(value: string) {
    this.setStr("note", value)
  }
  get status() {
    return this.str("status")
  }
  set status(value: string) {
    this.setStr("status", value)
  }
  get submittedAt() {
    return this.num("submitted_at")
  }
  set submittedAt(value: number) {
    this.setNum("submitted_at", value)
  }
}

export class WeekPreferenceSlot extends RawModel {
  static table = "week_preference_slots"

  get preferenceId() {
    return this.str("preference_id")
  }
  set preferenceId(value: string) {
    this.setStr("preference_id", value)
  }
  get templateId() {
    return this.str("template_id")
  }
  set templateId(value: string) {
    this.setStr("template_id", value)
  }
  get rank() {
    return this.num("rank")
  }
  set rank(value: number) {
    this.setNum("rank", value)
  }
}

export class DayOffSuggestion extends RawModel {
  static table = "day_off_suggestions"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get weekStart() {
    return this.str("week_start")
  }
  set weekStart(value: string) {
    this.setStr("week_start", value)
  }
  get workDate() {
    return this.str("work_date")
  }
  set workDate(value: string) {
    this.setStr("work_date", value)
  }
  get rank() {
    return this.num("rank")
  }
  set rank(value: number) {
    this.setNum("rank", value)
  }
  get note() {
    return this.str("note")
  }
  set note(value: string) {
    this.setStr("note", value)
  }
  get status() {
    return this.str("status")
  }
  set status(value: string) {
    this.setStr("status", value)
  }
  get alternativeDate() {
    return this.str("alternative_date")
  }
  set alternativeDate(value: string) {
    this.setStr("alternative_date", value)
  }
  get actorStaffId() {
    return this.str("actor_staff_id")
  }
  set actorStaffId(value: string) {
    this.setStr("actor_staff_id", value)
  }
}

export class ScheduledDayOff extends RawModel {
  static table = "scheduled_days_off"

  get staffId() {
    return this.str("staff_id")
  }
  set staffId(value: string) {
    this.setStr("staff_id", value)
  }
  get workDate() {
    return this.str("work_date")
  }
  set workDate(value: string) {
    this.setStr("work_date", value)
  }
  get weekStart() {
    return this.str("week_start")
  }
  set weekStart(value: string) {
    this.setStr("week_start", value)
  }
  get source() {
    return this.str("source")
  }
  set source(value: string) {
    this.setStr("source", value)
  }
  get note() {
    return this.str("note")
  }
  set note(value: string) {
    this.setStr("note", value)
  }
}
