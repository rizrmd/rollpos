import {
  addRow,
  cellStr,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "@/db/database"
import { seedCatalogIfEmpty } from "@/db/catalog"
import { seedInventoryIfEmpty } from "@/db/inventory"
import { hashPin, newPinSalt, verifyPin } from "@/lib/pin"
import { DEFAULT_OUTLET_ID, type StaffRole } from "@/lib/types"

/** Seed defaults only. Product behavior must read stored outlet_settings / templates. */
export const SEED_DEFAULTS = {
  outletId: DEFAULT_OUTLET_ID,
  openMinutes: 7 * 60,
  closeMinutes: 22 * 60,
  weekStartsOn: 1,
  preferenceDeadlineWeekday: 3,
  preferenceDeadlineMinutes: 18 * 60,
  maxConsecutiveWorkDays: 6,
  targetDaysOffPerWeek: 1,
  targetHoursPerWeek: 0,
  hoursSkewPercent: 25,
  weekendFairnessEnabled: true,
  graceLateMinutes: 10,
  slots: [
    {
      name: "Pagi",
      startMinutes: 7 * 60,
      endMinutes: 15 * 60,
      sortOrder: 1,
      minStaffCount: 2,
    },
    {
      name: "Sore",
      startMinutes: 15 * 60,
      endMinutes: 22 * 60,
      sortOrder: 2,
      minStaffCount: 2,
    },
  ],
  staff: [
    {
      name: "Ayu",
      nickname: "Ayu",
      pin: "000000",
      roles: ["owner", "barista"] as StaffRole[],
    },
    {
      name: "Dimas",
      nickname: "Dimas",
      pin: "000000",
      roles: ["kasir", "manager"] as StaffRole[],
    },
    {
      name: "Nia",
      nickname: "Nia",
      pin: "000000",
      roles: ["barista", "kitchen"] as StaffRole[],
    },
    {
      name: "Raka",
      nickname: "Raka",
      pin: "000000",
      roles: ["kasir", "kitchen"] as StaffRole[],
    },
    {
      name: "Sinta",
      nickname: "Sinta",
      pin: "000000",
      roles: ["barista"] as StaffRole[],
    },
  ],
}

const staffingSeed = new WeakMap<object, Promise<void>>()

export function seedStaffingIfEmpty(database: Database): Promise<void> {
  const key = database.store
  let pending = staffingSeed.get(key)
  if (!pending) {
    pending = applyStaffingSeed(database)
    staffingSeed.set(key, pending)
  }
  return pending
}

type SeedPerson = (typeof SEED_DEFAULTS.staff)[number]
type StaffRow = ReturnType<typeof listRows>[number]

function matchesSeedPerson(row: StaffRow, person: SeedPerson): boolean {
  const name = cellStr(row, "name").trim().toLowerCase()
  const nickname = cellStr(row, "nickname").trim().toLowerCase()
  const wantName = person.name.trim().toLowerCase()
  const wantNick = person.nickname.trim().toLowerCase()
  return (
    name === wantName ||
    name === wantNick ||
    nickname === wantName ||
    nickname === wantNick
  )
}

async function hashSeedPeople(people: readonly SeedPerson[]) {
  return Promise.all(
    people.map(async (person) => {
      const salt = newPinSalt()
      return {
        ...person,
        salt,
        pinHash: await hashPin(person.pin, salt),
      }
    })
  )
}

function insertSeedPerson(
  database: Database,
  person: Awaited<ReturnType<typeof hashSeedPeople>>[number],
  now: number
): void {
  const staffId = addRow(database, TABLES.staffMembers, {
    name: person.name,
    nickname: person.nickname,
    pinSalt: person.salt,
    pinHash: person.pinHash,
    isActive: true,
    includeInAttendance: true,
    deletedAt: 0,
    outletId: SEED_DEFAULTS.outletId,
    createdAt: now,
    updatedAt: now,
  })
  for (const role of person.roles) {
    addRow(database, TABLES.staffMemberRoles, {
      staffId,
      role,
      createdAt: now,
    })
  }
}

/** Seed sekali per store. Tes yang mensimulasikan reload memakai `applyStaffingSeed`. */
export async function applyStaffingSeed(database: Database): Promise<void> {
  await seedCatalogIfEmpty(database)
  await seedInventoryIfEmpty(database)
  await database.ready

  const existing = listRows(database, TABLES.staffMembers)
  if (existing.length === 0) {
    await seedFresh(database)
    return
  }
  await backfillMissingSeedStaff(database, existing)
  await resetStaffPinsToSeed(database, listRows(database, TABLES.staffMembers))
}

async function seedFresh(database: Database): Promise<void> {
  const now = Date.now()
  const seed = SEED_DEFAULTS
  const hashed = await hashSeedPeople(seed.staff)

  transact(database, () => {
    addRow(database, TABLES.outletSettings, {
      outletId: seed.outletId,
      openMinutes: seed.openMinutes,
      closeMinutes: seed.closeMinutes,
      weekStartsOn: seed.weekStartsOn,
      preferenceDeadlineWeekday: seed.preferenceDeadlineWeekday,
      preferenceDeadlineMinutes: seed.preferenceDeadlineMinutes,
      maxConsecutiveWorkDays: seed.maxConsecutiveWorkDays,
      targetDaysOffPerWeek: seed.targetDaysOffPerWeek,
      targetHoursPerWeek: seed.targetHoursPerWeek,
      hoursSkewPercent: seed.hoursSkewPercent,
      weekendFairnessEnabled: seed.weekendFairnessEnabled,
      graceLateMinutes: seed.graceLateMinutes,
      createdAt: now,
      updatedAt: now,
    })

    for (const slot of seed.slots) {
      addRow(database, TABLES.shiftTemplates, {
        name: slot.name,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        sortOrder: slot.sortOrder,
        minStaffCount: slot.minStaffCount,
        isActive: true,
        outletId: seed.outletId,
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const person of hashed) {
      insertSeedPerson(database, person, now)
    }
  })
}

async function backfillMissingSeedStaff(
  database: Database,
  existing: StaffRow[]
): Promise<void> {
  const now = Date.now()
  const missing = SEED_DEFAULTS.staff.filter(
    (person) => !existing.some((row) => matchesSeedPerson(row, person))
  )
  if (missing.length === 0) return
  const hashedMissing = await hashSeedPeople(missing)

  transact(database, () => {
    for (const person of hashedMissing) {
      insertSeedPerson(database, person, now)
    }
  })
}

function seedPinForRow(row: StaffRow): string {
  const person = SEED_DEFAULTS.staff.find((candidate) =>
    matchesSeedPerson(row, candidate)
  )
  return person?.pin ?? "000000"
}

async function resetStaffPinsToSeed(
  database: Database,
  existing: StaffRow[]
): Promise<void> {
  const now = Date.now()
  const updates: Array<{ id: string; pinSalt: string; pinHash: string }> = []

  for (const row of existing) {
    const pin = seedPinForRow(row)
    const already = await verifyPin(
      pin,
      cellStr(row, "pinSalt"),
      cellStr(row, "pinHash")
    )
    if (already) continue
    const pinSalt = newPinSalt()
    updates.push({
      id: row.id,
      pinSalt,
      pinHash: await hashPin(pin, pinSalt),
    })
  }

  if (updates.length === 0) return

  transact(database, () => {
    for (const update of updates) {
      updateRow(database, TABLES.staffMembers, update.id, {
        pinSalt: update.pinSalt,
        pinHash: update.pinHash,
        updatedAt: now,
      })
    }
  })
}
