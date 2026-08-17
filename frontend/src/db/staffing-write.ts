import {
  addRow,
  cellStr,
  deleteMatching,
  deleteRow,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "@/db/database"
import {
  loadAssignments,
  loadAttendance,
  loadDayOffs,
  loadPreferences,
  loadRequirements,
  loadSettings,
  loadSlots,
  loadStaff,
  loadSuggestions,
} from "@/db/snapshot"
import {
  hasConsecutiveShifts,
  historyWorkDatesFrom,
  recommendSchedule,
  SYSTEM_DRAFT_NOTE,
  weekHasActiveAssignments,
} from "@/lib/recommend"
import { hashPin, newPinSalt, validatePin, verifyPin } from "@/lib/pin"
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
  FloorRole,
  OutletSettingsRecord,
  StaffRecord,
  StaffRole,
  SuggestionStatus,
} from "@/lib/types"
import { DEFAULT_OUTLET_ID } from "@/lib/types"
import { nextWeekStart, todayJakarta, weekDates, weekStartOn } from "@/lib/time"

export function hasOpenSession(events: { type: AttendanceType }[]): boolean {
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
  await database.ready
  const existing = listRows(database, TABLES.outletSettings).find(
    (row) => cellStr(row, "outletId") === (patch.outletId ?? DEFAULT_OUTLET_ID)
  )
  const now = Date.now()
  transact(database, () => {
    if (existing) {
      updateRow(database, TABLES.outletSettings, existing.id, {
        ...(patch.openMinutes !== undefined
          ? { openMinutes: patch.openMinutes }
          : {}),
        ...(patch.closeMinutes !== undefined
          ? { closeMinutes: patch.closeMinutes }
          : {}),
        ...(patch.weekStartsOn !== undefined
          ? { weekStartsOn: patch.weekStartsOn }
          : {}),
        ...(patch.preferenceDeadlineWeekday !== undefined
          ? { preferenceDeadlineWeekday: patch.preferenceDeadlineWeekday }
          : {}),
        ...(patch.preferenceDeadlineMinutes !== undefined
          ? { preferenceDeadlineMinutes: patch.preferenceDeadlineMinutes }
          : {}),
        ...(patch.maxConsecutiveWorkDays !== undefined
          ? { maxConsecutiveWorkDays: patch.maxConsecutiveWorkDays }
          : {}),
        ...(patch.targetDaysOffPerWeek !== undefined
          ? { targetDaysOffPerWeek: patch.targetDaysOffPerWeek }
          : {}),
        ...(patch.targetHoursPerWeek !== undefined
          ? { targetHoursPerWeek: patch.targetHoursPerWeek }
          : {}),
        ...(patch.hoursSkewPercent !== undefined
          ? { hoursSkewPercent: patch.hoursSkewPercent }
          : {}),
        ...(patch.weekendFairnessEnabled !== undefined
          ? { weekendFairnessEnabled: patch.weekendFairnessEnabled }
          : {}),
        ...(patch.graceLateMinutes !== undefined
          ? { graceLateMinutes: patch.graceLateMinutes }
          : {}),
        updatedAt: now,
      })
      return
    }
    addRow(database, TABLES.outletSettings, {
      outletId: patch.outletId ?? DEFAULT_OUTLET_ID,
      openMinutes: patch.openMinutes ?? 0,
      closeMinutes: patch.closeMinutes ?? 0,
      weekStartsOn: patch.weekStartsOn ?? 1,
      preferenceDeadlineWeekday: patch.preferenceDeadlineWeekday ?? 3,
      preferenceDeadlineMinutes: patch.preferenceDeadlineMinutes ?? 0,
      maxConsecutiveWorkDays: patch.maxConsecutiveWorkDays ?? 6,
      targetDaysOffPerWeek: patch.targetDaysOffPerWeek ?? 1,
      targetHoursPerWeek: patch.targetHoursPerWeek ?? 0,
      hoursSkewPercent: patch.hoursSkewPercent ?? 25,
      weekendFairnessEnabled: patch.weekendFairnessEnabled ?? true,
      graceLateMinutes: patch.graceLateMinutes ?? 10,
      createdAt: now,
      updatedAt: now,
    })
  })
  await rebuildOpenSystemWeeks(database)
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
  await database.ready
  const now = Date.now()
  if (input.id) {
    updateRow(database, TABLES.shiftTemplates, input.id, {
      name: input.name,
      startMinutes: input.startMinutes,
      endMinutes: input.endMinutes,
      sortOrder: input.sortOrder,
      minStaffCount: input.minStaffCount,
      isActive: input.isActive,
      updatedAt: now,
    })
    return input.id
  }
  return addRow(database, TABLES.shiftTemplates, {
    name: input.name,
    startMinutes: input.startMinutes,
    endMinutes: input.endMinutes,
    sortOrder: input.sortOrder,
    minStaffCount: input.minStaffCount,
    isActive: input.isActive,
    outletId: input.outletId ?? DEFAULT_OUTLET_ID,
    createdAt: now,
    updatedAt: now,
  })
}

export async function saveRoleRequirements(
  database: Database,
  actor: StaffRecord,
  templateId: string,
  items: { role: FloorRole; minCount: number }[]
): Promise<void> {
  if (!canEditSlots(actor.roles)) {
    throw new Error("Lantai tidak boleh mengubah kebutuhan role.")
  }
  await database.ready
  const now = Date.now()
  transact(database, () => {
    deleteMatching(
      database,
      TABLES.shiftRoleRequirements,
      (row) => cellStr(row, "templateId") === templateId
    )
    for (const item of items) {
      if (item.minCount <= 0) continue
      addRow(database, TABLES.shiftRoleRequirements, {
        templateId,
        role: item.role,
        minCount: item.minCount,
        createdAt: now,
      })
    }
  })
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
    preferredTemplateIds?: string[]
    outletId?: string
  }
): Promise<string> {
  const staff = await loadStaff(database)
  const target = input.id ? staff.find((row) => row.id === input.id) : undefined
  if (target) {
    assertCanChangeRoles(
      actor.roles,
      target,
      input.roles,
      staff,
      input.isActive
    )
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
  if (target) {
    const pinCells = input.pin
      ? await (async () => {
          const salt = newPinSalt()
          return { pinSalt: salt, pinHash: await hashPin(input.pin!, salt) }
        })()
      : {}
    transact(database, () => {
      updateRow(database, TABLES.staffMembers, target.id, {
        name: input.name,
        nickname: input.nickname,
        isActive: input.isActive,
        updatedAt: now,
        ...pinCells,
      })
      deleteMatching(
        database,
        TABLES.staffMemberRoles,
        (row) => cellStr(row, "staffId") === target.id
      )
      for (const role of input.roles) {
        addRow(database, TABLES.staffMemberRoles, {
          staffId: target.id,
          role,
          createdAt: now,
        })
      }
      if (input.preferredTemplateIds !== undefined) {
        writePreferredSlots(database, target.id, input.preferredTemplateIds)
      }
    })
    if (
      input.preferredTemplateIds !== undefined &&
      !sameTemplateIds(target.preferredTemplateIds, input.preferredTemplateIds)
    ) {
      await rebuildOpenSystemWeeks(database)
    }
    return target.id
  }

  const salt = newPinSalt()
  const pinHash = await hashPin(input.pin ?? "0000", salt)
  let staffId = ""
  transact(database, () => {
    staffId = addRow(database, TABLES.staffMembers, {
      name: input.name,
      nickname: input.nickname,
      pinSalt: salt,
      pinHash,
      isActive: input.isActive,
      outletId: input.outletId ?? DEFAULT_OUTLET_ID,
      createdAt: now,
      updatedAt: now,
    })
    for (const role of input.roles) {
      addRow(database, TABLES.staffMemberRoles, {
        staffId,
        role,
        createdAt: now,
      })
    }
    writePreferredSlots(database, staffId, input.preferredTemplateIds ?? [])
  })
  if (input.preferredTemplateIds !== undefined) {
    await rebuildOpenSystemWeeks(database)
  }
  return staffId
}

function sameTemplateIds(left: string[] = [], right: string[] = []): boolean {
  if (left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

function writePreferredSlots(
  database: Database,
  staffId: string,
  templateIds: string[]
): void {
  deleteMatching(
    database,
    TABLES.staffPreferredSlots,
    (row) => cellStr(row, "staffId") === staffId
  )
  const unique = [...new Set(templateIds.filter(Boolean))]
  unique.forEach((templateId, index) => {
    addRow(database, TABLES.staffPreferredSlots, {
      staffId,
      templateId,
      rank: index + 1,
    })
  })
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

export async function changeStaffPin(
  database: Database,
  staffId: string,
  currentPin: string,
  newPin: string
): Promise<void> {
  await authenticateStaff(database, staffId, currentPin)
  const validationError = validatePin(newPin)
  if (validationError) throw new Error(validationError)
  if (currentPin === newPin) {
    throw new Error("PIN baru harus berbeda dari PIN saat ini.")
  }

  const salt = newPinSalt()
  updateRow(database, TABLES.staffMembers, staffId, {
    pinSalt: salt,
    pinHash: await hashPin(newPin, salt),
    updatedAt: Date.now(),
  })
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
  addRow(database, TABLES.attendanceEvents, {
    staffId,
    type,
    occurredAt: at,
    recordedAt: Date.now(),
    deviceId,
    shiftAssignmentId: "",
    outletId: settings?.outletId ?? DEFAULT_OUTLET_ID,
    note: "",
    actorStaffId: staffId,
    correctsEventId: "",
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
  await database.ready
  addRow(database, TABLES.attendanceEvents, {
    staffId: input.staffId,
    type: "correction",
    occurredAt: input.occurredAt,
    recordedAt: Date.now(),
    deviceId: input.deviceId,
    shiftAssignmentId: "",
    outletId: DEFAULT_OUTLET_ID,
    note: input.note,
    actorStaffId: actor.id,
    correctsEventId: input.correctsEventId ?? "",
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
  await database.ready
  const offs = listRows(database, TABLES.scheduledDaysOff).filter(
    (row) =>
      cellStr(row, "staffId") === input.staffId &&
      cellStr(row, "workDate") === input.workDate
  )
  if (offs.length > 0) {
    throw new Error("Tidak bisa menugaskan kerja di hari libur resmi.")
  }
  const now = Date.now()
  const existing = listRows(database, TABLES.shiftAssignments).find(
    (row) =>
      cellStr(row, "staffId") === input.staffId &&
      cellStr(row, "templateId") === input.templateId &&
      cellStr(row, "workDate") === input.workDate &&
      cellStr(row, "status") !== "cancelled"
  )
  if (existing) {
    updateRow(database, TABLES.shiftAssignments, existing.id, {
      startMinutes: input.startMinutes,
      endMinutes: input.endMinutes,
      dutyRole: input.dutyRole,
      status: input.status ?? cellStr(existing, "status"),
      note: input.note ?? cellStr(existing, "note"),
      updatedAt: now,
    })
    return
  }
  addRow(database, TABLES.shiftAssignments, {
    staffId: input.staffId,
    templateId: input.templateId,
    workDate: input.workDate,
    startMinutes: input.startMinutes,
    endMinutes: input.endMinutes,
    dutyRole: input.dutyRole,
    status: input.status ?? "published",
    outletId: DEFAULT_OUTLET_ID,
    note: input.note ?? "",
    createdAt: now,
    updatedAt: now,
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
  await database.ready
  updateRow(database, TABLES.shiftAssignments, assignmentId, {
    status: "cancelled",
    updatedAt: Date.now(),
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
  await database.ready
  const now = Date.now()
  const existing = listRows(database, TABLES.weekPreferences).find(
    (row) =>
      cellStr(row, "staffId") === staffId &&
      cellStr(row, "weekStart") === weekStart
  )
  transact(database, () => {
    let preferenceId = existing?.id ?? ""
    if (existing) {
      updateRow(database, TABLES.weekPreferences, existing.id, {
        note,
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
      })
      deleteMatching(
        database,
        TABLES.weekPreferenceSlots,
        (row) => cellStr(row, "preferenceId") === existing.id
      )
    } else {
      preferenceId = addRow(database, TABLES.weekPreferences, {
        staffId,
        weekStart,
        note,
        status: "submitted",
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const slot of slots) {
      addRow(database, TABLES.weekPreferenceSlots, {
        preferenceId,
        templateId: slot.templateId,
        rank: slot.rank,
      })
    }
    deleteMatching(
      database,
      TABLES.dayOffSuggestions,
      (row) =>
        cellStr(row, "staffId") === staffId &&
        cellStr(row, "weekStart") === weekStart &&
        cellStr(row, "status") === "suggested"
    )
    for (const item of suggestions) {
      addRow(database, TABLES.dayOffSuggestions, {
        staffId,
        weekStart,
        workDate: item.workDate,
        rank: item.rank,
        note: item.note,
        status: "suggested",
        alternativeDate: "",
        actorStaffId: staffId,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  await rebuildOpenSystemWeeks(database)
}

export async function requestDayOff(
  database: Database,
  staffId: string,
  workDate: string,
  weekStartsOn: number,
  note = ""
): Promise<string> {
  await database.ready
  const official = listRows(database, TABLES.scheduledDaysOff).find(
    (row) =>
      cellStr(row, "staffId") === staffId && cellStr(row, "workDate") === workDate
  )
  if (official) {
    throw new Error("Tanggal itu sudah libur resmi.")
  }
  const pending = listRows(database, TABLES.dayOffSuggestions).find(
    (row) =>
      cellStr(row, "staffId") === staffId &&
      cellStr(row, "workDate") === workDate &&
      cellStr(row, "status") === "suggested"
  )
  const now = Date.now()
  if (pending) {
    updateRow(database, TABLES.dayOffSuggestions, pending.id, {
      note,
      updatedAt: now,
    })
    return pending.id
  }
  const weekStart = weekStartOn(workDate, weekStartsOn)
  const rank =
    listRows(database, TABLES.dayOffSuggestions).filter(
      (row) =>
        cellStr(row, "staffId") === staffId &&
        cellStr(row, "weekStart") === weekStart
    ).length + 1
  return addRow(database, TABLES.dayOffSuggestions, {
    staffId,
    weekStart,
    workDate,
    rank,
    note,
    status: "suggested",
    alternativeDate: "",
    actorStaffId: staffId,
    createdAt: now,
    updatedAt: now,
  })
}

export async function withdrawDayOffRequest(
  database: Database,
  staffId: string,
  suggestionId: string
): Promise<void> {
  await database.ready
  const row = listRows(database, TABLES.dayOffSuggestions).find(
    (item) => item.id === suggestionId
  )
  if (!row) {
    throw new Error("Permintaan tidak ditemukan.")
  }
  if (cellStr(row, "staffId") !== staffId) {
    throw new Error("Hanya pemilik permintaan yang boleh mencabut.")
  }
  if (cellStr(row, "status") !== "suggested") {
    throw new Error("Permintaan sudah diputuskan manager.")
  }
  deleteRow(database, TABLES.dayOffSuggestions, suggestionId)
}

export async function acceptSuggestion(
  database: Database,
  actor: StaffRecord,
  suggestionId: string
): Promise<void> {
  if (!canAcceptSuggestions(actor.roles)) {
    throw new Error(
      "Hanya owner atau manager yang boleh menerima suggest libur."
    )
  }
  await database.ready
  const suggestion = listRows(database, TABLES.dayOffSuggestions).find(
    (row) => row.id === suggestionId
  )
  if (!suggestion) {
    throw new Error("Saran libur tidak ditemukan")
  }
  const staffId = cellStr(suggestion, "staffId")
  const workDate = cellStr(suggestion, "workDate")
  const now = Date.now()
  transact(database, () => {
    for (const row of listRows(database, TABLES.shiftAssignments)) {
      if (
        cellStr(row, "staffId") === staffId &&
        cellStr(row, "workDate") === workDate &&
        cellStr(row, "status") !== "cancelled"
      ) {
        updateRow(database, TABLES.shiftAssignments, row.id, {
          status: "cancelled",
          updatedAt: now,
        })
      }
    }
    updateRow(database, TABLES.dayOffSuggestions, suggestionId, {
      status: "accepted",
      actorStaffId: actor.id,
      updatedAt: now,
    })
    addRow(database, TABLES.scheduledDaysOff, {
      staffId,
      workDate,
      weekStart: cellStr(suggestion, "weekStart"),
      source: "accepted_suggestion",
      note: cellStr(suggestion, "note"),
      createdAt: now,
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
    throw new Error(
      "Hanya owner atau manager yang boleh menolak suggest libur."
    )
  }
  await database.ready
  updateRow(database, TABLES.dayOffSuggestions, suggestionId, {
    status: "declined",
    alternativeDate,
    actorStaffId: actor.id,
    updatedAt: Date.now(),
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
  await database.ready
  const now = Date.now()
  transact(database, () => {
    for (const row of listRows(database, TABLES.shiftAssignments)) {
      if (
        cellStr(row, "staffId") === input.staffId &&
        cellStr(row, "workDate") === input.workDate &&
        cellStr(row, "status") !== "cancelled"
      ) {
        updateRow(database, TABLES.shiftAssignments, row.id, {
          status: "cancelled",
          updatedAt: now,
        })
      }
    }
    addRow(database, TABLES.scheduledDaysOff, {
      staffId: input.staffId,
      workDate: input.workDate,
      weekStart: input.weekStart,
      source: input.source ?? "manager",
      note: input.note ?? "",
      createdAt: now,
    })
  })
}

export async function removeOfficialOff(
  database: Database,
  actor: StaffRecord,
  offId: string
): Promise<void> {
  if (!canManage(actor.roles)) {
    throw new Error("Lantai tidak boleh menghapus libur resmi.")
  }
  await database.ready
  deleteRow(database, TABLES.scheduledDaysOff, offId)
}

/** Tulis usulan kerja sistem dan langsung terbitkan. Tidak menimpa minggu yang sudah diisi, tidak menulis libur resmi. */
export async function writeFairDefaultDraft(
  database: Database,
  weekStart: string,
  assignments: {
    staffId: string
    templateId: string
    workDate: string
    startMinutes: number
    endMinutes: number
    dutyRole: string
  }[]
): Promise<boolean> {
  await database.ready
  const weekEnd = weekDates(weekStart)[6] ?? weekStart
  const already = listRows(database, TABLES.shiftAssignments).filter(
    (row) =>
      cellStr(row, "status") !== "cancelled" &&
      cellStr(row, "workDate") >= weekStart &&
      cellStr(row, "workDate") <= weekEnd
  )
  if (already.length > 0) return false

  const now = Date.now()
  transact(database, () => {
    for (const item of assignments) {
      addRow(database, TABLES.shiftAssignments, {
        staffId: item.staffId,
        templateId: item.templateId,
        workDate: item.workDate,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        dutyRole: item.dutyRole,
        status: "published",
        outletId: DEFAULT_OUTLET_ID,
        note: SYSTEM_DRAFT_NOTE,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  return true
}

/** Isi kerja minggu ini + depan jika masih kosong, lalu langsung terbitkan. Libur resmi tidak ditulis. */
export async function ensureFairDefaultWeeks(
  database: Database,
  weekStarts: string[],
  options?: { rebuildSystem?: boolean }
): Promise<number> {
  await database.ready
  const settings = await loadSettings(database, DEFAULT_OUTLET_ID)
  if (!settings) return 0
  const [staff, slots, requirements, loadedAssignments, suggestions, offs, preferences] =
    await Promise.all([
      loadStaff(database),
      loadSlots(database),
      loadRequirements(database),
      loadAssignments(database),
      loadSuggestions(database),
      loadDayOffs(database),
      loadPreferences(database),
    ])
  let assignments = loadedAssignments
  const activeSlots = slots.filter((slot) => slot.isActive)
  if (staff.filter((row) => row.isActive).length === 0 || activeSlots.length === 0) {
    return 0
  }

  let wrote = 0
  for (const weekStart of weekStarts) {
    const weekEnd = weekDates(weekStart)[6] ?? weekStart
    const weekRows = assignments.filter(
      (row) =>
        row.status !== "cancelled" &&
        row.workDate >= weekStart &&
        row.workDate <= weekEnd
    )
    const systemOnly =
      weekRows.length > 0 &&
      weekRows.every((row) => row.note === SYSTEM_DRAFT_NOTE)
    const publishedOrManual = weekRows.some(
      (row) => row.status === "published" || row.note !== SYSTEM_DRAFT_NOTE
    )
    const shouldReplace =
      weekRows.length > 0 &&
      ((Boolean(options?.rebuildSystem) && systemOnly) ||
        (!publishedOrManual && hasConsecutiveShifts(weekRows, activeSlots)))
    if (weekHasActiveAssignments(assignments, weekStart) && !shouldReplace) {
      continue
    }
    if (shouldReplace) {
      await clearSystemDraftWeek(database, weekStart)
    }
    const history = historyWorkDatesFrom(assignments, weekStart)
    const result = recommendSchedule({
      settings,
      staff,
      slots: activeSlots,
      requirements,
      assignments: shouldReplace
        ? assignments.filter((row) => !weekRows.includes(row))
        : assignments,
      offs,
      suggestions,
      preferences,
      weekStart,
      historyWorkDates: history,
    })
    const ok = await writeFairDefaultDraft(database, weekStart, result.assignments)
    if (ok) {
      wrote += 1
      assignments = await loadAssignments(database)
    }
  }
  await promoteDraftsToPublished(database, weekStarts)
  return wrote
}

/** Hitung ulang minggu berjalan + depan jika masih murni usulan sistem. */
export async function rebuildOpenSystemWeeks(database: Database): Promise<number> {
  const settings = await loadSettings(database, DEFAULT_OUTLET_ID)
  const weekStartsOn = settings?.weekStartsOn ?? 1
  return ensureFairDefaultWeeks(database, defaultScheduleWeeks(weekStartsOn), {
    rebuildSystem: true,
  })
}

/** Jadwal berubah langsung terbit — draft lama di minggu yang dibuka ikut dipromosikan. */
async function promoteDraftsToPublished(
  database: Database,
  weekStarts: string[]
): Promise<void> {
  const now = Date.now()
  transact(database, () => {
    for (const weekStart of weekStarts) {
      const weekEnd = weekDates(weekStart)[6] ?? weekStart
      for (const row of listRows(database, TABLES.shiftAssignments)) {
        const workDate = cellStr(row, "workDate")
        if (
          workDate >= weekStart &&
          workDate <= weekEnd &&
          cellStr(row, "status") === "draft"
        ) {
          updateRow(database, TABLES.shiftAssignments, row.id, {
            status: "published",
            updatedAt: now,
          })
        }
      }
    }
  })
}

async function clearSystemDraftWeek(
  database: Database,
  weekStart: string
): Promise<void> {
  const weekEnd = weekDates(weekStart)[6] ?? weekStart
  const now = Date.now()
  transact(database, () => {
    for (const row of listRows(database, TABLES.shiftAssignments)) {
      const workDate = cellStr(row, "workDate")
      if (
        workDate >= weekStart &&
        workDate <= weekEnd &&
        cellStr(row, "status") !== "cancelled" &&
        cellStr(row, "note") === SYSTEM_DRAFT_NOTE
      ) {
        updateRow(database, TABLES.shiftAssignments, row.id, {
          status: "cancelled",
          updatedAt: now,
        })
      }
    }
  })
}

export function defaultScheduleWeeks(weekStartsOn: number): string[] {
  const today = todayJakarta()
  return [weekStartOn(today, weekStartsOn), nextWeekStart(weekStartsOn)]
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
  await database.ready
  const now = Date.now()
  const weekEnd = addDaysLocal(weekStart, 6)
  transact(database, () => {
    for (const row of listRows(database, TABLES.shiftAssignments)) {
      const workDate = cellStr(row, "workDate")
      if (workDate >= weekStart && workDate <= weekEnd) {
        updateRow(database, TABLES.shiftAssignments, row.id, {
          status: "cancelled",
          updatedAt: now,
        })
      }
    }
    for (const item of assignments) {
      addRow(database, TABLES.shiftAssignments, {
        staffId: item.staffId,
        templateId: item.templateId,
        workDate: item.workDate,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        dutyRole: item.dutyRole,
        status: "published",
        outletId: DEFAULT_OUTLET_ID,
        note: "rekomendasi",
        createdAt: now,
        updatedAt: now,
      })
    }
    deleteMatching(
      database,
      TABLES.scheduledDaysOff,
      (row) => cellStr(row, "weekStart") === weekStart
    )
    for (const item of offs) {
      addRow(database, TABLES.scheduledDaysOff, {
        staffId: item.staffId,
        workDate: item.workDate,
        weekStart,
        source: item.source,
        note: "rekomendasi",
        createdAt: now,
      })
    }
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
  await database.ready
  const weekEnd = addDaysLocal(weekStart, 6)
  transact(database, () => {
    for (const row of listRows(database, TABLES.shiftAssignments)) {
      const workDate = cellStr(row, "workDate")
      if (
        workDate >= weekStart &&
        workDate <= weekEnd &&
        cellStr(row, "status") === "draft"
      ) {
        updateRow(database, TABLES.shiftAssignments, row.id, {
          status: "published",
          updatedAt: Date.now(),
        })
      }
    }
  })
}

export function suggestionStatusOf(value: string): SuggestionStatus {
  if (value === "accepted" || value === "declined") return value
  return "suggested"
}
