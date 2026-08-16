import type { Database } from "@nozbe/watermelondb"

import { seedCatalogIfEmpty } from "@/db/catalog"
import {
  settingsCollection,
  slotCollection,
  staffCollection,
  staffRoleCollection,
} from "@/db/snapshot"
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

let seedInFlight: Promise<void> | null = null

export function seedStaffingIfEmpty(database: Database): Promise<void> {
  seedInFlight ??= seedOnce(database)
  return seedInFlight
}

async function seedOnce(database: Database): Promise<void> {
  await seedCatalogIfEmpty(database)
  const staffCount = await staffCollection(database).query().fetchCount()
  if (staffCount > 0) {
    return
  }

  const now = Date.now()
  const seed = SEED_DEFAULTS
  await database.write(async () => {
    await settingsCollection(database).create((row) => {
      row.outletId = seed.outletId
      row.openMinutes = seed.openMinutes
      row.closeMinutes = seed.closeMinutes
      row.weekStartsOn = seed.weekStartsOn
      row.preferenceDeadlineWeekday = seed.preferenceDeadlineWeekday
      row.preferenceDeadlineMinutes = seed.preferenceDeadlineMinutes
      row.maxConsecutiveWorkDays = seed.maxConsecutiveWorkDays
      row.targetDaysOffPerWeek = seed.targetDaysOffPerWeek
      row.targetHoursPerWeek = seed.targetHoursPerWeek
      row.hoursSkewPercent = seed.hoursSkewPercent
      row.weekendFairnessEnabled = seed.weekendFairnessEnabled
      row.graceLateMinutes = seed.graceLateMinutes
      row.stamp(now)
    })

    for (const slot of seed.slots) {
      await slotCollection(database).create((row) => {
        row.name = slot.name
        row.startMinutes = slot.startMinutes
        row.endMinutes = slot.endMinutes
        row.sortOrder = slot.sortOrder
        row.minStaffCount = slot.minStaffCount
        row.isActive = true
        row.outletId = seed.outletId
        row.stamp(now)
      })
    }

    for (const person of seed.staff) {
      const salt = newPinSalt()
      const pinHash = await hashPin(person.pin, salt)
      const created = await staffCollection(database).create((row) => {
        row.name = person.name
        row.nickname = person.nickname
        row.pinSalt = salt
        row.pinHash = pinHash
        row.isActive = true
        row.outletId = seed.outletId
        row.stamp(now)
      })
      for (const role of person.roles) {
        await staffRoleCollection(database).create((row) => {
          row.staffId = created.id
          row.role = role
          row.setNum("created_at", now)
        })
      }
    }
  })
}
