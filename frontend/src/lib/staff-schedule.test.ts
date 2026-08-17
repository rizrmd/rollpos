import { describe, expect, test } from "bun:test"

import { createRollposDatabase } from "@/db/database"
import { seedCatalogIfEmpty } from "@/db/catalog"
import { SEED_DEFAULTS, applyStaffingSeed, seedStaffingIfEmpty } from "@/db/seed"
import {
  loadAssignments,
  loadAttendance,
  loadDayOffs,
  loadSettings,
  loadSlots,
  loadStaff,
  loadSuggestions,
} from "@/db/snapshot"
import {
  acceptSuggestion,
  addOfficialOff,
  authenticateStaff,
  changeStaffPin,
  clockPunch,
  defaultScheduleWeeks,
  ensureFairDefaultWeeks,
  hasOpenSession,
  removeOfficialOff,
  requestDayOff,
  saveOutletSettings,
  saveSlot,
  submitPreferences,
  softDeleteStaff,
  upsertAssignment,
  upsertStaff,
  withdrawDayOffRequest,
} from "@/db/staffing-write"
import { canEditSlots, canManage, isOwner } from "@/lib/permissions"
import { recommendSchedule, wouldViolateConsecutive } from "@/lib/recommend"
import { isStaffDeleted, type OutletSettingsRecord, type StaffRecord } from "@/lib/types"
import { DEFAULT_OUTLET_ID } from "@/lib/types"

let dbSeq = 0

async function freshDb() {
  dbSeq += 1
  return createRollposDatabase({
    dbName: `rollpos-test-${dbSeq}-${Date.now()}`,
    inMemory: true,
  })
}

async function bootstrap() {
  const database = await freshDb()
  await seedCatalogIfEmpty(database)
  const owner = await createPerson(database, {
    name: "Ayu",
    roles: ["owner", "barista"],
    pin: "1234",
    asOwner: true,
  })
  await saveOutletSettings(database, owner, {
    outletId: DEFAULT_OUTLET_ID,
    openMinutes: 400,
    closeMinutes: 1300,
    weekStartsOn: 1,
    preferenceDeadlineWeekday: 3,
    preferenceDeadlineMinutes: 1000,
    maxConsecutiveWorkDays: 6,
    targetDaysOffPerWeek: 1,
    targetHoursPerWeek: 0,
    hoursSkewPercent: 25,
    weekendFairnessEnabled: true,
    graceLateMinutes: 8,
  })
  return { database, owner }
}

async function createPerson(
  database: ReturnType<typeof createRollposDatabase>,
  input: {
    name: string
    roles: StaffRecord["roles"]
    pin: string
    asOwner?: boolean
  }
): Promise<StaffRecord> {
  const staff = await loadStaff(database)
  const actor =
    staff.find((row) => isOwner(row.roles)) ??
    ({
      id: "bootstrap",
      name: "bootstrap",
      nickname: "bootstrap",
      pinHash: "",
      pinSalt: "",
      isActive: true,
      outletId: DEFAULT_OUTLET_ID,
      roles: ["owner"],
    } satisfies StaffRecord)
  const id = await upsertStaff(database, input.asOwner ? actor : actor, {
    name: input.name,
    nickname: input.name,
    pin: input.pin,
    isActive: true,
    roles: input.roles,
  })
  const people = await loadStaff(database)
  const created = people.find((row) => row.id === id)
  if (!created) throw new Error("staff missing")
  return created
}

function settingsFrom(row: OutletSettingsRecord): OutletSettingsRecord {
  return { ...row }
}

describe("staffing persist + schedule", () => {
  test("preferensi shift tersimpan dan tidak terhapus saat update tanpa field itu", async () => {
    const { database, owner } = await bootstrap()
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 420,
      endMinutes: 900,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    const id = await upsertStaff(database, owner, {
      name: "Nia",
      nickname: "Nia",
      pin: "3333",
      isActive: true,
      roles: ["barista", "kitchen"],
      preferredTemplateIds: [slotId],
    })
    const saved = (await loadStaff(database)).find((row) => row.id === id)
    expect(saved?.preferredTemplateIds).toEqual([slotId])

    await upsertStaff(database, owner, {
      id,
      name: "Nia",
      nickname: "Nia",
      isActive: true,
      roles: ["barista", "kitchen"],
    })
    const kept = (await loadStaff(database)).find((row) => row.id === id)
    expect(kept?.preferredTemplateIds).toEqual([slotId])

    await upsertStaff(database, owner, {
      id,
      name: "Nia",
      nickname: "Nia",
      isActive: true,
      roles: ["barista", "kitchen"],
      preferredTemplateIds: [],
    })
    const cleared = (await loadStaff(database)).find((row) => row.id === id)
    expect(cleared?.preferredTemplateIds).toEqual([])
  })

  test("ubah preferensi shift menghitung ulang usulan sistem", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista", "kitchen"],
      pin: "3333",
    })
    await createPerson(database, {
      name: "Dimas",
      roles: ["kasir", "manager"],
      pin: "2222",
    })
    await createPerson(database, {
      name: "Raka",
      roles: ["kasir", "kitchen"],
      pin: "4444",
    })
    await createPerson(database, {
      name: "Sinta",
      roles: ["barista"],
      pin: "5555",
    })
    const pagiId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 420,
      endMinutes: 900,
      sortOrder: 1,
      minStaffCount: 2,
      isActive: true,
    })
    const soreId = await saveSlot(database, owner, {
      name: "Sore",
      startMinutes: 900,
      endMinutes: 1320,
      sortOrder: 2,
      minStaffCount: 2,
      isActive: true,
    })
    const weeks = defaultScheduleWeeks(1)
    expect(await ensureFairDefaultWeeks(database, weeks)).toBeGreaterThan(0)

    await upsertStaff(database, owner, {
      id: nia.id,
      name: "Nia",
      nickname: "Nia",
      isActive: true,
      roles: ["barista", "kitchen"],
      preferredTemplateIds: [pagiId],
    })

    const after = (await loadAssignments(database)).filter(
      (row) => row.staffId === nia.id && row.status !== "cancelled"
    )
    const pagiCount = after.filter((row) => row.templateId === pagiId).length
    const soreCount = after.filter((row) => row.templateId === soreId).length
    expect(pagiCount).toBeGreaterThan(soreCount)
    expect(after.every((row) => row.note === "usulan sistem")).toBe(true)
  })

  test("ubah preferensi tidak menimpa assignment yang diisi manual", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 420,
      endMinutes: 900,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    const weekStart = defaultScheduleWeeks(1)[0]
    if (!weekStart) throw new Error("missing week")
    await upsertAssignment(database, owner, {
      staffId: nia.id,
      templateId: slotId,
      workDate: weekStart,
      startMinutes: 420,
      endMinutes: 900,
      dutyRole: "barista",
      note: "manual",
    })
    const before = await loadAssignments(database)
    const manual = before.find(
      (row) => row.staffId === nia.id && row.workDate === weekStart
    )
    expect(manual?.note).toBe("manual")

    await upsertStaff(database, owner, {
      id: nia.id,
      name: "Nia",
      nickname: "Nia",
      isActive: true,
      roles: ["barista"],
      preferredTemplateIds: [slotId],
    })

    const after = await loadAssignments(database)
    const kept = after.find((row) => row.id === manual?.id)
    expect(kept?.status).toBe("published")
    expect(kept?.note).toBe("manual")
    expect(
      after.filter(
        (row) => row.workDate === weekStart && row.status !== "cancelled"
      )
    ).toHaveLength(1)
  })

  test("simpan staff tanpa ubah preferensi tidak menghitung ulang", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 420,
      endMinutes: 900,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    expect(
      await ensureFairDefaultWeeks(database, defaultScheduleWeeks(1))
    ).toBeGreaterThan(0)
    const before = (await loadAssignments(database))
      .filter((row) => row.status !== "cancelled")
      .map((row) => `${row.id}:${row.staffId}:${row.templateId}:${row.workDate}`)
      .sort()

    await upsertStaff(database, owner, {
      id: nia.id,
      name: "Nia Sari",
      nickname: "Nia Sari",
      isActive: true,
      roles: ["barista"],
    })

    const after = (await loadAssignments(database))
      .filter((row) => row.status !== "cancelled")
      .map((row) => `${row.id}:${row.staffId}:${row.templateId}:${row.workDate}`)
      .sort()
    expect(after).toEqual(before)
    expect(slotId).toBeTruthy()
  })

  test("multi-role persist survives a write-and-reload snapshot", async () => {
    const { database, owner } = await bootstrap()
    const id = await upsertStaff(database, owner, {
      name: "Nia",
      nickname: "Nia",
      pin: "3333",
      isActive: true,
      roles: ["barista", "kitchen"],
    })
    const again = await loadStaff(database)
    const nia = again.find((row) => row.id === id)
    expect(nia?.roles.sort()).toEqual(["barista", "kitchen"])
  })

  test("demo seed includes a manager who cannot grant leadership", async () => {
    expect(
      SEED_DEFAULTS.staff.some((person) => person.roles.includes("manager"))
    ).toBe(true)

    const database = await freshDb()
    await seedStaffingIfEmpty(database)
    const people = await loadStaff(database)
    const manager = people.find((row) => row.roles.includes("manager"))
    const owner = people.find((row) => isOwner(row.roles))
    if (!manager || !owner) throw new Error("seed missing manager or owner")

    expect(isOwner(manager.roles)).toBe(false)
    expect(canManage(manager.roles)).toBe(true)
    expect(canEditSlots(manager.roles)).toBe(true)

    const slotId = await saveSlot(database, manager, {
      name: "Siang",
      startMinutes: 200,
      endMinutes: 400,
      sortOrder: 3,
      minStaffCount: 2,
      isActive: true,
    })
    const slots = await loadSlots(database)
    expect(slots.some((slot) => slot.id === slotId)).toBe(true)

    await expect(
      upsertStaff(database, manager, {
        id: owner.id,
        name: owner.name,
        nickname: owner.nickname,
        isActive: true,
        roles: [...owner.roles, "kasir"],
      })
    ).rejects.toThrow(/Hanya owner/)
  })

  test("seed backfills Dimas as manager when staff already exist", async () => {
    const { database } = await bootstrap()
    expect(
      (await loadStaff(database)).some((row) => row.name === "Dimas")
    ).toBe(false)
    await seedStaffingIfEmpty(database)
    const people = await loadStaff(database)
    const dimas = people.find((row) => row.nickname === "Dimas")
    if (!dimas) throw new Error("Dimas masih belum ter-seed")
    expect(dimas.isActive).toBe(true)
    expect(dimas.roles.sort()).toEqual(["kasir", "manager"])
    expect(people.filter((row) => row.name === "Ayu")).toHaveLength(1)
  })

  test("seed tidak menimpa role, aktif, dan preferensi Dimas yang sudah disimpan", async () => {
    const database = await freshDb()
    await seedStaffingIfEmpty(database)
    const people = await loadStaff(database)
    const owner = people.find((row) => isOwner(row.roles))
    const dimas = people.find((row) => row.nickname === "Dimas")
    if (!owner || !dimas) throw new Error("seed missing owner or Dimas")

    const pagi = (await loadSlots(database)).find((slot) => slot.name === "Pagi")
    if (!pagi) throw new Error("seed missing Pagi")

    await upsertStaff(database, owner, {
      id: dimas.id,
      name: dimas.name,
      nickname: dimas.nickname,
      isActive: false,
      roles: ["barista"],
      preferredTemplateIds: [pagi.id],
    })

    await applyStaffingSeed(database)
    const after = await loadStaff(database)
    const again = after.find((row) => row.id === dimas.id)
    expect(again?.isActive).toBe(false)
    expect(again?.roles).toEqual(["barista"])
    expect(again?.preferredTemplateIds).toEqual([pagi.id])
    expect(after.filter((row) => row.name === "Ayu")).toHaveLength(1)
  })

  test("seed staff PIN is 000000 and existing staff get PIN backfill", async () => {
    expect(SEED_DEFAULTS.staff.every((person) => person.pin === "000000")).toBe(
      true
    )

    const fresh = await freshDb()
    await seedStaffingIfEmpty(fresh)
    for (const person of await loadStaff(fresh)) {
      await expect(
        authenticateStaff(fresh, person.id, "000000")
      ).resolves.toMatchObject({
        id: person.id,
      })
    }

    const { database } = await bootstrap()
    const ayuBefore = (await loadStaff(database)).find(
      (row) => row.name === "Ayu"
    )
    if (!ayuBefore) throw new Error("missing ayu")
    await expect(
      authenticateStaff(database, ayuBefore.id, "1234")
    ).resolves.toMatchObject({
      id: ayuBefore.id,
    })

    await seedStaffingIfEmpty(database)
    for (const person of await loadStaff(database)) {
      await expect(
        authenticateStaff(database, person.id, "000000")
      ).resolves.toMatchObject({
        id: person.id,
      })
    }
  })

  test("staff dapat mengubah PIN sendiri setelah memverifikasi PIN saat ini", async () => {
    const { database } = await bootstrap()
    const staff = await createPerson(database, {
      name: "Nia",
      roles: ["kasir"],
      pin: "2468",
    })

    await expect(
      changeStaffPin(database, staff.id, "9999", "1357")
    ).rejects.toThrow(/PIN salah/)
    await expect(
      changeStaffPin(database, staff.id, "2468", "12ab")
    ).rejects.toThrow(/angka/)
    await expect(
      changeStaffPin(database, staff.id, "2468", "2468")
    ).rejects.toThrow(/berbeda/)

    await changeStaffPin(database, staff.id, "2468", "1357")
    await expect(authenticateStaff(database, staff.id, "2468")).rejects.toThrow(
      /PIN salah/
    )
    await expect(
      authenticateStaff(database, staff.id, "1357")
    ).resolves.toMatchObject({
      id: staff.id,
    })
  })

  test("owner/manager dapat mengubah PIN karyawan lain tanpa PIN saat ini", async () => {
    const { database, owner } = await bootstrap()
    const manager = await createPerson(database, {
      name: "Sari",
      roles: ["manager"],
      pin: "1111",
    })
    const staff = await createPerson(database, {
      name: "Nia",
      roles: ["kasir"],
      pin: "2468",
    })

    await expect(
      changeStaffPin(database, staff.id, "", "1357")
    ).rejects.toThrow(/PIN salah/)
    await expect(
      changeStaffPin(database, staff.id, "", "1357", staff)
    ).rejects.toThrow(/PIN salah/)
    await expect(
      changeStaffPin(database, owner.id, "", "9999", owner)
    ).rejects.toThrow(/PIN salah/)
    await expect(
      changeStaffPin(database, staff.id, "", "2468", owner)
    ).rejects.toThrow(/berbeda/)

    await changeStaffPin(database, staff.id, "", "1357", owner)
    await expect(authenticateStaff(database, staff.id, "2468")).rejects.toThrow(
      /PIN salah/
    )
    await expect(
      authenticateStaff(database, staff.id, "1357")
    ).resolves.toMatchObject({ id: staff.id })

    await changeStaffPin(database, staff.id, "", "8888", manager)
    await expect(
      authenticateStaff(database, staff.id, "8888")
    ).resolves.toMatchObject({ id: staff.id })
  })

  test("owner implies manager powers; floor cannot mutate slots", async () => {
    const { database, owner } = await bootstrap()
    expect(canManage(owner.roles)).toBe(true)
    expect(canEditSlots(owner.roles)).toBe(true)
    const kasir = await createPerson(database, {
      name: "Dimas",
      roles: ["kasir"],
      pin: "2222",
    })
    expect(canEditSlots(kasir.roles)).toBe(false)
    await expect(
      saveSlot(database, kasir, {
        name: "Malam",
        startMinutes: 200,
        endMinutes: 400,
        sortOrder: 9,
        minStaffCount: 1,
        isActive: true,
      })
    ).rejects.toThrow(/Lantai/)
    const slotId = await saveSlot(database, owner, {
      name: "Siang",
      startMinutes: 200,
      endMinutes: 400,
      sortOrder: 3,
      minStaffCount: 3,
      isActive: true,
    })
    const slots = await loadSlots(database)
    expect(
      slots.some((slot) => slot.id === slotId && slot.minStaffCount === 3)
    ).toBe(true)
  })

  test("last active owner cannot be stripped", async () => {
    const { database, owner } = await bootstrap()
    await expect(
      upsertStaff(database, owner, {
        id: owner.id,
        name: owner.name,
        nickname: owner.nickname,
        isActive: true,
        roles: ["barista"],
      })
    ).rejects.toThrow(/Owner terakhir/)
  })

  test("soft-delete menyimpan baris tapi tidak tampil untuk login", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    await softDeleteStaff(database, owner, nia.id)
    const people = await loadStaff(database)
    const deleted = people.find((row) => row.id === nia.id)
    expect(deleted).toBeDefined()
    expect(isStaffDeleted(deleted!)).toBe(true)
    expect(deleted?.isActive).toBe(false)
    await expect(authenticateStaff(database, nia.id, "3333")).rejects.toThrow(
      /tidak ditemukan/
    )
    await expect(
      upsertStaff(database, owner, {
        id: nia.id,
        name: "Nia",
        nickname: "Nia",
        isActive: true,
        roles: ["barista"],
      })
    ).rejects.toThrow(/tidak ditemukan/)
  })

  test("owner terakhir tidak boleh dihapus", async () => {
    const { database, owner } = await bootstrap()
    await expect(softDeleteStaff(database, owner, owner.id)).rejects.toThrow(
      /Owner terakhir/
    )
    const still = (await loadStaff(database)).find((row) => row.id === owner.id)
    expect(isStaffDeleted(still!)).toBe(false)
    expect(still?.isActive).toBe(true)
  })

  test("lantai tidak boleh menghapus staff", async () => {
    const { database } = await bootstrap()
    const kasir = await createPerson(database, {
      name: "Dimas",
      roles: ["kasir"],
      pin: "2222",
    })
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    await expect(softDeleteStaff(database, kasir, nia.id)).rejects.toThrow(/Lantai/)
    const still = (await loadStaff(database)).find((row) => row.id === nia.id)
    expect(isStaffDeleted(still!)).toBe(false)
  })

  test("suggestion stays suggested until accept creates official off", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    await submitPreferences(
      database,
      nia.id,
      "2026-08-17",
      [{ templateId: slotId, rank: 1 }],
      [{ workDate: "2026-08-18", rank: 1, note: "acara keluarga" }]
    )
    const pending = await loadSuggestions(database, "2026-08-17")
    expect(pending).toHaveLength(1)
    expect(pending[0]?.status).toBe("suggested")
    expect(await loadDayOffs(database, "2026-08-17")).toHaveLength(0)

    await acceptSuggestion(database, owner, pending[0]!.id)
    const after = await loadSuggestions(database, "2026-08-17")
    expect(after[0]?.status).toBe("accepted")
    const offs = await loadDayOffs(database, "2026-08-17")
    expect(offs).toHaveLength(1)
    expect(offs[0]?.staffId).toBe(nia.id)
    expect(offs[0]?.workDate).toBe("2026-08-18")

    await expect(
      upsertAssignment(database, owner, {
        staffId: nia.id,
        templateId: slotId,
        workDate: "2026-08-18",
        startMinutes: 300,
        endMinutes: 600,
        dutyRole: "barista",
      })
    ).rejects.toThrow(/libur resmi/)
  })

  test("minta libur per tanggal, bisa dicabut selama masih suggested", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const first = await requestDayOff(
      database,
      nia.id,
      "2026-08-20",
      1,
      "acara"
    )
    const second = await requestDayOff(database, nia.id, "2026-08-22", 1)
    const pending = await loadSuggestions(database)
    expect(pending.filter((row) => row.staffId === nia.id)).toHaveLength(2)
    expect(pending.find((row) => row.id === first)?.workDate).toBe("2026-08-20")
    expect(pending.find((row) => row.id === first)?.weekStart).toBe("2026-08-17")
    expect(pending.find((row) => row.id === second)?.workDate).toBe("2026-08-22")

    await withdrawDayOffRequest(database, nia.id, first)
    const after = await loadSuggestions(database)
    expect(after.some((row) => row.id === first)).toBe(false)
    expect(after.some((row) => row.id === second && row.status === "suggested")).toBe(
      true
    )

    await acceptSuggestion(database, owner, second)
    await expect(withdrawDayOffRequest(database, nia.id, second)).rejects.toThrow(
      /diputuskan/
    )
    await expect(
      requestDayOff(database, nia.id, "2026-08-22", 1)
    ).rejects.toThrow(/libur resmi/)
  })

  test("changing live slot hours does not rewrite copied assignment minutes", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    await upsertAssignment(database, owner, {
      staffId: nia.id,
      templateId: slotId,
      workDate: "2026-08-18",
      startMinutes: 300,
      endMinutes: 600,
      dutyRole: "barista",
    })
    await saveSlot(database, owner, {
      id: slotId,
      name: "Pagi",
      startMinutes: 360,
      endMinutes: 700,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    const assignments = await loadAssignments(database)
    const copied = assignments.find((row) => row.staffId === nia.id)
    expect(copied?.startMinutes).toBe(300)
    expect(copied?.endMinutes).toBe(600)
    const slots = await loadSlots(database)
    expect(slots.find((slot) => slot.id === slotId)?.startMinutes).toBe(360)
  })

  test("clock-in opens a session; second clock-in is rejected", async () => {
    const { database } = await bootstrap()
    const staff = (await loadStaff(database)).find((row) => row.name === "Ayu")
    if (!staff) throw new Error("missing ayu")
    await clockPunch(database, staff.id, "1234", "clock_in", "device-a", 1_000)
    const events = await loadAttendance(database, staff.id)
    expect(hasOpenSession(events)).toBe(true)
    await expect(
      clockPunch(database, staff.id, "1234", "clock_in", "device-a", 2_000)
    ).rejects.toThrow(/sudah clock-in/)
    await clockPunch(database, staff.id, "1234", "clock_out", "device-a", 3_000)
    const closed = await loadAttendance(database, staff.id)
    expect(hasOpenSession(closed)).toBe(false)
    await expect(authenticateStaff(database, staff.id, "0000")).rejects.toThrow(
      /PIN/
    )
  })

  test("recommendation refuses an understaffed grant", async () => {
    const { database, owner } = await bootstrap()
    const stored = await loadSettings(database, DEFAULT_OUTLET_ID)
    if (!stored) throw new Error("settings missing")
    const dimas = await createPerson(database, {
      name: "Dimas",
      roles: ["kasir"],
      pin: "2222",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 2,
      isActive: true,
    })
    const staff = await loadStaff(database)
    const result = recommendSchedule({
      settings: settingsFrom(stored),
      staff,
      slots: [
        {
          id: slotId,
          name: "Pagi",
          startMinutes: 300,
          endMinutes: 600,
          sortOrder: 1,
          minStaffCount: 2,
          isActive: true,
          outletId: DEFAULT_OUTLET_ID,
        },
      ],
      requirements: [],
      assignments: [],
      offs: [],
      suggestions: [
        {
          id: "s1",
          staffId: owner.id,
          weekStart: "2026-08-17",
          workDate: "2026-08-17",
          rank: 1,
          note: "",
          status: "suggested",
          alternativeDate: "",
          actorStaffId: owner.id,
        },
        {
          id: "s2",
          staffId: dimas.id,
          weekStart: "2026-08-17",
          workDate: "2026-08-17",
          rank: 1,
          note: "",
          status: "suggested",
          alternativeDate: "",
          actorStaffId: dimas.id,
        },
      ],
      preferences: [],
      weekStart: "2026-08-17",
    })
    const grantedThatDay = result.offs.filter(
      (row) => row.workDate === "2026-08-17"
    )
    expect(grantedThatDay.length).toBeLessThan(2)
    expect(result.grantedSuggestionIds.length).toBeLessThan(2)
    const assigned = result.assignments.filter(
      (row) => row.workDate === "2026-08-17" && row.templateId === slotId
    )
    expect(assigned.length).toBeGreaterThanOrEqual(2)
  })

  test("consecutive-day cap blocks a proposed work day", () => {
    const history = [
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]
    expect(wouldViolateConsecutive(history, "2026-08-17", 6)).toBe(true)
    expect(wouldViolateConsecutive(history, "2026-08-18", 6)).toBe(false)
  })

  test("apply recommendation writes published assignments only, not attendance", async () => {
    const { database, owner } = await bootstrap()
    const before = await loadAttendance(database)
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    const { applyRecommendationDraft } = await import("@/db/staffing-write")
    await applyRecommendationDraft(
      database,
      owner,
      "2026-08-17",
      [
        {
          staffId: nia.id,
          templateId: slotId,
          workDate: "2026-08-17",
          startMinutes: 300,
          endMinutes: 600,
          dutyRole: "barista",
        },
      ],
      []
    )
    const assignments = await loadAssignments(database)
    expect(
      assignments.some(
        (row) => row.status === "published" && row.staffId === nia.id
      )
    ).toBe(true)
    const after = await loadAttendance(database)
    expect(after.length).toBe(before.length)
  })

  test("fair default writes published assignments once and skips the second write", async () => {
    const { writeFairDefaultDraft, ensureFairDefaultWeeks } = await import(
      "@/db/staffing-write"
    )
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    const first = await writeFairDefaultDraft(database, "2026-08-17", [
      {
        staffId: nia.id,
        templateId: slotId,
        workDate: "2026-08-17",
        startMinutes: 300,
        endMinutes: 600,
        dutyRole: "barista",
      },
    ])
    const second = await writeFairDefaultDraft(database, "2026-08-17", [
      {
        staffId: owner.id,
        templateId: slotId,
        workDate: "2026-08-18",
        startMinutes: 300,
        endMinutes: 600,
        dutyRole: "barista",
      },
    ])
    expect(first).toBe(true)
    expect(second).toBe(false)
    const assignments = await loadAssignments(database)
    expect(
      assignments.filter(
        (row) => row.status === "published" && row.note === "usulan sistem"
      )
    ).toHaveLength(1)
    expect(await ensureFairDefaultWeeks(database, ["2026-08-17"])).toBe(0)
  })

  test("manual assignment and leftover drafts are published immediately", async () => {
    const { ensureFairDefaultWeeks } = await import("@/db/staffing-write")
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    const slotId = await saveSlot(database, owner, {
      name: "Pagi",
      startMinutes: 300,
      endMinutes: 600,
      sortOrder: 1,
      minStaffCount: 1,
      isActive: true,
    })
    await upsertAssignment(database, owner, {
      staffId: nia.id,
      templateId: slotId,
      workDate: "2026-08-17",
      startMinutes: 300,
      endMinutes: 600,
      dutyRole: "barista",
    })
    const written = await loadAssignments(database)
    expect(written.find((row) => row.staffId === nia.id)?.status).toBe(
      "published"
    )

    await upsertAssignment(database, owner, {
      staffId: owner.id,
      templateId: slotId,
      workDate: "2026-08-18",
      startMinutes: 300,
      endMinutes: 600,
      dutyRole: "barista",
      status: "draft",
    })
    expect(await ensureFairDefaultWeeks(database, ["2026-08-17"])).toBe(0)
    const after = await loadAssignments(database)
    expect(after.every((row) => row.status === "published")).toBe(true)
  })

  test("manager can add then remove official day off", async () => {
    const { database, owner } = await bootstrap()
    const nia = await createPerson(database, {
      name: "Nia",
      roles: ["barista"],
      pin: "3333",
    })
    await addOfficialOff(database, owner, {
      staffId: nia.id,
      workDate: "2026-08-18",
      weekStart: "2026-08-17",
      source: "manager",
    })
    const offs = await loadDayOffs(database, "2026-08-17")
    expect(offs).toHaveLength(1)
    await removeOfficialOff(database, owner, offs[0]!.id)
    expect(await loadDayOffs(database, "2026-08-17")).toHaveLength(0)
  })
})
