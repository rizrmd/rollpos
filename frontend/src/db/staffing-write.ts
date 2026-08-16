import { Q, type Database } from "@nozbe/watermelondb"

import {
  assignmentCollection,
  attendanceCollection,
  dayOffCollection,
  loadAttendance,
  loadSettings,
  loadStaff,
  preferenceCollection,
  preferenceSlotCollection,
  settingsCollection,
  slotCollection,
  staffCollection,
  staffRoleCollection,
  suggestionCollection,
} from "@/db/snapshot"
import { hashPin, newPinSalt, verifyPin } from "@/lib/pin"
import {
  assertCanChangeRoles,
  assertLastOwnerSafe,
  canAcceptSuggestions,
  canCorrectAttendance,
  canEditSlots,
  canManage,
} from "@/lib/permissions"
import type {
  AssignmentStatus,
  AttendanceType,
  DayOffSource,
  OutletSettingsRecord,
  StaffRecord,
  StaffRole,
  SuggestionStatus,
} from "@/lib/types"
import { DEFAULT_OUTLET_ID } from "@/lib/types"

export function hasOpenSession(
  events: { type: AttendanceType }[]
): boolean {
  const punches = events.filter(
    (event) => event.type === "clock_in" || event.type === "clock_out"
  )
  return punches.at(-1)?.type === "clock_in"
}

export async function saveOutletSettings(
  database: Database,
  actor: StaffRecord,
  patch: Partial<OutletSettingsRecord>
): Promise<void> {
  if (!canEditSlots(actor.roles)) {
    throw new Error("Lantai tidak boleh mengubah pengaturan outlet.")
  }
  const existing = await settingsCollection(database)
    .query(Q.where("outlet_id", patch.outletId ?? DEFAULT_OUTLET_ID))
    .fetch()
  const now = Date.now()
  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update((row) => {
        if (patch.openMinutes !== undefined) row.openMinutes = patch.openMinutes
        if (patch.closeMinutes !== undefined) row.closeMinutes = patch.closeMinutes
        if (patch.weekStartsOn !== undefined) row.weekStartsOn = patch.weekStartsOn
        if (patch.preferenceDeadlineWeekday !== undefined) {
          row.preferenceDeadlineWeekday = patch.preferenceDeadlineWeekday
        }
        if (patch.preferenceDeadlineMinutes !== undefined) {
          row.preferenceDeadlineMinutes = patch.preferenceDeadlineMinutes
        }
        if (patch.maxConsecutiveWorkDays !== undefined) {
          row.maxConsecutiveWorkDays = patch.maxConsecutiveWorkDays
        }
        if (patch.targetDaysOffPerWeek !== undefined) {
          row.targetDaysOffPerWeek = patch.targetDaysOffPerWeek
        }
        if (patch.targetHoursPerWeek !== undefined) {
          row.targetHoursPerWeek = patch.targetHoursPerWeek
        }
        if (patch.hoursSkewPercent !== undefined) {
          row.hoursSkewPercent = patch.hoursSkewPercent
        }
        if (patch.weekendFairnessEnabled !== undefined) {
          row.weekendFairnessEnabled = patch.weekendFairnessEnabled
        }
        if (patch.graceLateMinutes !== undefined) {
          row.graceLateMinutes = patch.graceLateMinutes
        }
        row.stamp(now, "updated")
      })
      return
    }
    await settingsCollection(database).create((row) => {
      row.outletId = patch.outletId ?? DEFAULT_OUTLET_ID
      row.openMinutes = patch.openMinutes ?? 0
      row.closeMinutes = patch.closeMinutes ?? 0
      row.weekStartsOn = patch.weekStartsOn ?? 1
      row.preferenceDeadlineWeekday = patch.preferenceDeadlineWeekday ?? 3
      row.preferenceDeadlineMinutes = patch.preferenceDeadlineMinutes ?? 0
      row.maxConsecutiveWorkDays = patch.maxConsecutiveWorkDays ?? 6
      row.targetDaysOffPerWeek = patch.targetDaysOffPerWeek ?? 1
      row.targetHoursPerWeek = patch.targetHoursPerWeek ?? 0
      row.hoursSkewPercent = patch.hoursSkewPercent ?? 25
      row.weekendFairnessEnabled = patch.weekendFairnessEnabled ?? true
      row.graceLateMinutes = patch.graceLateMinutes ?? 10
      row.stamp(now)
    })
  })
}

export async function saveSlot(
  database: Database,
  actor: StaffRecord,
  input: {
    id?: string
    name: string
    startMinutes: number
    endMinutes: number
    sortOrder: number
    minStaffCount: number
    isActive: boolean
    outletId?: string
  }
): Promise<string> {
  if (!canEditSlots(actor.roles)) {
    throw new Error("Lantai tidak boleh mengubah slot shift.")
  }
  const now = Date.now()
  let id = input.id ?? ""
  await database.write(async () => {
    if (input.id) {
      const row = await slotCollection(database).find(input.id)
      await row.update((slot) => {
        slot.name = input.name
        slot.startMinutes = input.startMinutes
        slot.endMinutes = input.endMinutes
        slot.sortOrder = input.sortOrder
        slot.minStaffCount = input.minStaffCount
        slot.isActive = input.isActive
        slot.stamp(now, "updated")
      })
      return
    }
    const created = await slotCollection(database).create((slot) => {
      slot.name = input.name
      slot.startMinutes = input.startMinutes
      slot.endMinutes = input.endMinutes
      slot.sortOrder = input.sortOrder
      slot.minStaffCount = input.minStaffCount
      slot.isActive = input.isActive
      slot.outletId = input.outletId ?? DEFAULT_OUTLET_ID
      slot.stamp(now)
    })
    id = created.id
  })
  return id
}

export async function upsertStaff(
  database: Database,
  actor: StaffRecord,
  input: {
    id?: string
    name: string
    nickname: string
    pin?: string
    isActive: boolean
    roles: StaffRole[]
    outletId?: string
  }
): Promise<string> {
  const staff = await loadStaff(database)
  const target = input.id ? staff.find((row) => row.id === input.id) : undefined
  if (target) {
    assertCanChangeRoles(actor.roles, target, input.roles, staff, input.isActive)
  } else if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh menambah staff.")
  } else {
    assertLastOwnerSafe(
      [
        ...staff,
        {
          id: "__new__",
          name: input.name,
          nickname: input.nickname,
          pinHash: "",
          pinSalt: "",
          isActive: input.isActive,
          outletId: input.outletId ?? DEFAULT_OUTLET_ID,
          roles: input.roles,
        },
      ],
      "__new__",
      input.roles,
      input.isActive
    )
  }

  const now = Date.now()
  let staffId = input.id ?? ""
  await database.write(async () => {
    if (target) {
      const row = await staffCollection(database).find(target.id)
      await row.update((person) => {
        person.name = input.name
        person.nickname = input.nickname
        person.isActive = input.isActive
        person.stamp(now, "updated")
      })
      if (input.pin) {
        const salt = newPinSalt()
        const pinHash = await hashPin(input.pin, salt)
        await row.update((person) => {
          person.pinSalt = salt
          person.pinHash = pinHash
        })
      }
      const existingRoles = await staffRoleCollection(database)
        .query(Q.where("staff_id", target.id))
        .fetch()
      await Promise.all(existingRoles.map((role) => role.destroyPermanently()))
      await Promise.all(
        input.roles.map((role) =>
          staffRoleCollection(database).create((row) => {
            row.staffId = target.id
            row.role = role
            row.setNum("created_at", now)
          })
        )
      )
      staffId = target.id
      return
    }

    const salt = newPinSalt()
    const pinHash = await hashPin(input.pin ?? "0000", salt)
    const created = await staffCollection(database).create((person) => {
      person.name = input.name
      person.nickname = input.nickname
      person.pinSalt = salt
      person.pinHash = pinHash
      person.isActive = input.isActive
      person.outletId = input.outletId ?? DEFAULT_OUTLET_ID
      person.stamp(now)
    })
    await Promise.all(
      input.roles.map((role) =>
        staffRoleCollection(database).create((row) => {
          row.staffId = created.id
          row.role = role
          row.setNum("created_at", now)
        })
      )
    )
    staffId = created.id
  })
  return staffId
}

export async function authenticateStaff(
  database: Database,
  staffId: string,
  pin: string
): Promise<StaffRecord> {
  const staff = await loadStaff(database)
  const member = staff.find((row) => row.id === staffId && row.isActive)
  if (!member) {
    throw new Error("Staff tidak ditemukan.")
  }
  const ok = await verifyPin(pin, member.pinSalt, member.pinHash)
  if (!ok) {
    throw new Error("PIN salah.")
  }
  return member
}

export async function clockPunch(
  database: Database,
  staffId: string,
  pin: string,
  type: "clock_in" | "clock_out",
  deviceId: string,
  at = Date.now()
): Promise<void> {
  await authenticateStaff(database, staffId, pin)
  const events = await loadAttendance(database, staffId)
  const open = hasOpenSession(events)
  if (type === "clock_in" && open) {
    throw new Error("Kamu sudah clock-in. Clock-out dulu.")
  }
  if (type === "clock_out" && !open) {
    throw new Error("Belum ada sesi terbuka untuk di-clock-out.")
  }
  const settings = await loadSettings(database, DEFAULT_OUTLET_ID)
  await database.write(async () => {
    await attendanceCollection(database).create((event) => {
      event.staffId = staffId
      event.type = type
      event.occurredAt = at
      event.recordedAt = Date.now()
      event.deviceId = deviceId
      event.shiftAssignmentId = ""
      event.outletId = settings?.outletId ?? DEFAULT_OUTLET_ID
      event.note = ""
      event.actorStaffId = staffId
      event.correctsEventId = ""
    })
  })
}

export async function correctAttendance(
  database: Database,
  actor: StaffRecord,
  input: {
    staffId: string
    occurredAt: number
    note: string
    correctsEventId?: string
    deviceId: string
  }
): Promise<void> {
  if (!canCorrectAttendance(actor.roles)) {
    throw new Error("Hanya owner atau manager yang boleh koreksi absensi.")
  }
  if (!input.note.trim()) {
    throw new Error("Alasan koreksi wajib diisi.")
  }
  await database.write(async () => {
    await attendanceCollection(database).create((event) => {
      event.staffId = input.staffId
      event.type = "correction"
      event.occurredAt = input.occurredAt
      event.recordedAt = Date.now()
      event.deviceId = input.deviceId
      event.shiftAssignmentId = ""
      event.outletId = DEFAULT_OUTLET_ID
      event.note = input.note
      event.actorStaffId = actor.id
      event.correctsEventId = input.correctsEventId ?? ""
    })
  })
}

export async function upsertAssignment(
  database: Database,
  actor: StaffRecord,
  input: {
    staffId: string
    templateId: string
    workDate: string
    startMinutes: number
    endMinutes: number
    dutyRole: string
    status?: AssignmentStatus
    note?: string
  }
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh mengubah roster.")
  }
  const offs = await dayOffCollection(database)
    .query(Q.where("staff_id", input.staffId), Q.where("work_date", input.workDate))
    .fetch()
  if (offs.length > 0) {
    throw new Error("Tidak bisa menugaskan kerja di hari libur resmi.")
  }
  const now = Date.now()
  const existing = await assignmentCollection(database)
    .query(
      Q.where("staff_id", input.staffId),
      Q.where("template_id", input.templateId),
      Q.where("work_date", input.workDate),
      Q.where("status", Q.notEq("cancelled"))
    )
    .fetch()
  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update((row) => {
        row.startMinutes = input.startMinutes
        row.endMinutes = input.endMinutes
        row.dutyRole = input.dutyRole
        row.status = input.status ?? row.status
        row.note = input.note ?? row.note
        row.stamp(now, "updated")
      })
      return
    }
    await assignmentCollection(database).create((row) => {
      row.staffId = input.staffId
      row.templateId = input.templateId
      row.workDate = input.workDate
      row.startMinutes = input.startMinutes
      row.endMinutes = input.endMinutes
      row.dutyRole = input.dutyRole
      row.status = input.status ?? "draft"
      row.outletId = DEFAULT_OUTLET_ID
      row.note = input.note ?? ""
      row.stamp(now)
    })
  })
}

export async function cancelAssignment(
  database: Database,
  actor: StaffRecord,
  assignmentId: string
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh mengubah roster.")
  }
  const row = await assignmentCollection(database).find(assignmentId)
  await database.write(async () => {
    await row.update((assignment) => {
      assignment.status = "cancelled"
      assignment.stamp(Date.now(), "updated")
    })
  })
}

export async function submitPreferences(
  database: Database,
  staffId: string,
  weekStart: string,
  slots: { templateId: string; rank: number }[],
  suggestions: { workDate: string; rank: number; note: string }[],
  note = ""
): Promise<void> {
  const now = Date.now()
  const existing = await preferenceCollection(database)
    .query(Q.where("staff_id", staffId), Q.where("week_start", weekStart))
    .fetch()
  await database.write(async () => {
    let preferenceId = existing[0]?.id ?? ""
    if (existing[0]) {
      await existing[0].update((row) => {
        row.note = note
        row.status = "submitted"
        row.submittedAt = now
        row.stamp(now, "updated")
      })
      const oldSlots = await preferenceSlotCollection(database)
        .query(Q.where("preference_id", existing[0].id))
        .fetch()
      await Promise.all(oldSlots.map((row) => row.destroyPermanently()))
    } else {
      const created = await preferenceCollection(database).create((row) => {
        row.staffId = staffId
        row.weekStart = weekStart
        row.note = note
        row.status = "submitted"
        row.submittedAt = now
        row.stamp(now)
      })
      preferenceId = created.id
    }
    await Promise.all(
      slots.map((slot) =>
        preferenceSlotCollection(database).create((row) => {
          row.preferenceId = preferenceId
          row.templateId = slot.templateId
          row.rank = slot.rank
        })
      )
    )
    const oldSuggestions = await suggestionCollection(database)
      .query(
        Q.where("staff_id", staffId),
        Q.where("week_start", weekStart),
        Q.where("status", "suggested")
      )
      .fetch()
    await Promise.all(oldSuggestions.map((row) => row.destroyPermanently()))
    await Promise.all(
      suggestions.map((item) =>
        suggestionCollection(database).create((row) => {
          row.staffId = staffId
          row.weekStart = weekStart
          row.workDate = item.workDate
          row.rank = item.rank
          row.note = item.note
          row.status = "suggested"
          row.alternativeDate = ""
          row.actorStaffId = staffId
          row.stamp(now)
        })
      )
    )
  })
}

export async function acceptSuggestion(
  database: Database,
  actor: StaffRecord,
  suggestionId: string
): Promise<void> {
  if (!canAcceptSuggestions(actor.roles)) {
    throw new Error("Hanya owner atau manager yang boleh menerima suggest libur.")
  }
  const suggestion = await suggestionCollection(database).find(suggestionId)
  const conflicts = await assignmentCollection(database)
    .query(
      Q.where("staff_id", suggestion.staffId),
      Q.where("work_date", suggestion.workDate),
      Q.where("status", Q.notEq("cancelled"))
    )
    .fetch()
  const now = Date.now()
  await database.write(async () => {
    await Promise.all(
      conflicts.map((row) =>
        row.update((assignment) => {
          assignment.status = "cancelled"
          assignment.stamp(now, "updated")
        })
      )
    )
    await suggestion.update((row) => {
      row.status = "accepted"
      row.actorStaffId = actor.id
      row.stamp(now, "updated")
    })
    await dayOffCollection(database).create((row) => {
      row.staffId = suggestion.staffId
      row.workDate = suggestion.workDate
      row.weekStart = suggestion.weekStart
      row.source = "accepted_suggestion"
      row.note = suggestion.note
      row.setNum("created_at", now)
    })
  })
}

export async function declineSuggestion(
  database: Database,
  actor: StaffRecord,
  suggestionId: string,
  alternativeDate = ""
): Promise<void> {
  if (!canAcceptSuggestions(actor.roles)) {
    throw new Error("Hanya owner atau manager yang boleh menolak suggest libur.")
  }
  const suggestion = await suggestionCollection(database).find(suggestionId)
  await database.write(async () => {
    await suggestion.update((row) => {
      row.status = "declined"
      row.alternativeDate = alternativeDate
      row.actorStaffId = actor.id
      row.stamp(Date.now(), "updated")
    })
  })
}

export async function addOfficialOff(
  database: Database,
  actor: StaffRecord,
  input: {
    staffId: string
    workDate: string
    weekStart: string
    source?: DayOffSource
    note?: string
  }
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh menetapkan libur resmi.")
  }
  const now = Date.now()
  const conflicts = await assignmentCollection(database)
    .query(
      Q.where("staff_id", input.staffId),
      Q.where("work_date", input.workDate),
      Q.where("status", Q.notEq("cancelled"))
    )
    .fetch()
  await database.write(async () => {
    await Promise.all(
      conflicts.map((row) =>
        row.update((assignment) => {
          assignment.status = "cancelled"
          assignment.stamp(now, "updated")
        })
      )
    )
    await dayOffCollection(database).create((row) => {
      row.staffId = input.staffId
      row.workDate = input.workDate
      row.weekStart = input.weekStart
      row.source = input.source ?? "manager"
      row.note = input.note ?? ""
      row.setNum("created_at", now)
    })
  })
}

export async function applyRecommendationDraft(
  database: Database,
  actor: StaffRecord,
  weekStart: string,
  assignments: {
    staffId: string
    templateId: string
    workDate: string
    startMinutes: number
    endMinutes: number
    dutyRole: string
  }[],
  offs: { staffId: string; workDate: string; source: DayOffSource }[]
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh menerapkan rekomendasi.")
  }
  const now = Date.now()
  const existingAssignments = await assignmentCollection(database).query().fetch()
  const weekEnd = addDaysLocal(weekStart, 6)
  const inWeek = existingAssignments.filter(
    (row) => row.workDate >= weekStart && row.workDate <= weekEnd
  )
  await database.write(async () => {
    await Promise.all(
      inWeek.map((row) =>
        row.update((assignment) => {
          assignment.status = "cancelled"
          assignment.stamp(now, "updated")
        })
      )
    )
    await Promise.all(
      assignments.map((item) =>
        assignmentCollection(database).create((row) => {
          row.staffId = item.staffId
          row.templateId = item.templateId
          row.workDate = item.workDate
          row.startMinutes = item.startMinutes
          row.endMinutes = item.endMinutes
          row.dutyRole = item.dutyRole
          row.status = "draft"
          row.outletId = DEFAULT_OUTLET_ID
          row.note = "rekomendasi"
          row.stamp(now)
        })
      )
    )
    const existingOffs = await dayOffCollection(database)
      .query(Q.where("week_start", weekStart))
      .fetch()
    await Promise.all(existingOffs.map((row) => row.destroyPermanently()))
    await Promise.all(
      offs.map((item) =>
        dayOffCollection(database).create((row) => {
          row.staffId = item.staffId
          row.workDate = item.workDate
          row.weekStart = weekStart
          row.source = item.source
          row.note = "rekomendasi"
          row.setNum("created_at", now)
        })
      )
    )
  })
}

function addDaysLocal(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

export async function publishWeek(
  database: Database,
  actor: StaffRecord,
  weekStart: string
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh mem-publish roster.")
  }
  const rows = await assignmentCollection(database).query().fetch()
  const inWeek = rows.filter((row) => {
    return row.workDate >= weekStart && row.workDate <= addDaysLocal(weekStart, 6)
  })
  await database.write(async () => {
    await Promise.all(
      inWeek
        .filter((row) => row.status === "draft")
        .map((row) =>
          row.update((assignment) => {
            assignment.status = "published"
            assignment.stamp(Date.now(), "updated")
          })
        )
    )
  })
}

export function suggestionStatusOf(value: string): SuggestionStatus {
  if (value === "accepted" || value === "declined") return value
  return "suggested"
}
