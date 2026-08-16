import {
  addRow,
  listRows,
  transact,
  type Database,
  TABLES,
} from "@/db/database"
import { seedCatalogIfEmpty } from "@/db/catalog"
import { hashPin, newPinSalt } from "@/lib/pin"
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
    { name: "Pagi", startMinutes: 7 * 60, endMinutes: 15 * 60, sortOrder: 1, minStaffCount: 2 },
    { name: "Sore", startMinutes: 15 * 60, endMinutes: 22 * 60, sortOrder: 2, minStaffCount: 2 },
  ],
  staff: [
    {
      name: "Ayu",
      nickname: "Ayu",
      pin: "1234",
      roles: ["owner", "barista"] as StaffRole[],
    },
    {
      name: "Dimas",
      nickname: "Dimas",
      pin: "2222",
      roles: ["kasir"] as StaffRole[],
    },
    {
      name: "Nia",
      nickname: "Nia",
      pin: "3333",
      roles: ["barista", "kitchen"] as StaffRole[],
    },
    {
      name: "Raka",
      nickname: "Raka",
      pin: "4444",
      roles: ["kasir", "kitchen"] as StaffRole[],
    },
    {
      name: "Sinta",
      nickname: "Sinta",
      pin: "5555",
      roles: ["barista"] as StaffRole[],
    },
  ],
}

const staffingSeed = new WeakMap<object, Promise<void>>()

export function seedStaffingIfEmpty(database: Database): Promise<void> {
  const key = database.store
  let pending = staffingSeed.get(key)
  if (!pending) {
    pending = seedOnce(database)
    staffingSeed.set(key, pending)
  }
  return pending
}

async function seedOnce(database: Database): Promise<void> {
  await seedCatalogIfEmpty(database)
  if (listRows(database, TABLES.staffMembers).length > 0) {
    return
  }

  const now = Date.now()
  const seed = SEED_DEFAULTS
  const hashed = await Promise.all(
    seed.staff.map(async (person) => {
      const salt = newPinSalt()
      return {
        ...person,
        salt,
        pinHash: await hashPin(person.pin, salt),
      }
    })
  )

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
      const staffId = addRow(database, TABLES.staffMembers, {
        name: person.name,
        nickname: person.nickname,
        pinSalt: person.salt,
        pinHash: person.pinHash,
        isActive: true,
        outletId: seed.outletId,
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
  })
}
