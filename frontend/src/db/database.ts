import { Database } from "@nozbe/watermelondb"
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs"

import { migrations } from "./migrations"
import Product from "./models/Product"
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
} from "./models/staffing"
import { schema } from "./schema"

export const modelClasses = [
  Product,
  OutletSettings,
  StaffMember,
  StaffMemberRole,
  ShiftTemplate,
  ShiftRoleRequirement,
  ShiftAssignment,
  AttendanceEvent,
  WeekPreference,
  WeekPreferenceSlot,
  DayOffSuggestion,
  ScheduledDayOff,
]

export function createRollposDatabase(options?: {
  dbName?: string
  inMemory?: boolean
}): Database {
  const adapter = new LokiJSAdapter({
    schema,
    migrations,
    dbName: options?.dbName ?? "rollpos",
    useWebWorker: false,
    useIncrementalIndexedDB: options?.inMemory ? false : true,
    extraLokiOptions: options?.inMemory ? { autosave: false } : undefined,
    onSetUpError: (error) => {
      console.error("WatermelonDB failed to start", error)
    },
    onQuotaExceededError: (error) => {
      console.error("WatermelonDB is out of disk quota", error)
    },
  })

  return new Database({
    adapter,
    modelClasses,
  })
}

export const database = createRollposDatabase()
