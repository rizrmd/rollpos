import { useDatabase } from "@nozbe/watermelondb/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  assignmentCollection,
  attendanceCollection,
  loadAssignments,
  loadAttendance,
  loadDayOffs,
  loadPreferences,
  loadRequirements,
  loadSettings,
  loadSlots,
  loadStaff,
  loadSuggestions,
  settingsCollection,
  slotCollection,
  staffCollection,
  suggestionCollection,
} from "@/db/snapshot"
import { hasOpenSession } from "@/db/staffing-write"
import { DEFAULT_OUTLET_ID, type OutletSettingsRecord, type StaffRecord } from "@/lib/types"
import { nextWeekStart, todayJakarta, weekDates, weekStartOn } from "@/lib/time"

export function useStaffing() {
  const database = useDatabase()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<OutletSettingsRecord | null>(null)
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof loadSlots>>>([])
  const [requirements, setRequirements] = useState<
    Awaited<ReturnType<typeof loadRequirements>>
  >([])
  const [assignments, setAssignments] = useState<
    Awaited<ReturnType<typeof loadAssignments>>
  >([])
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof loadSuggestions>>
  >([])
  const [offs, setOffs] = useState<Awaited<ReturnType<typeof loadDayOffs>>>([])
  const [preferences, setPreferences] = useState<
    Awaited<ReturnType<typeof loadPreferences>>
  >([])
  const [attendance, setAttendance] = useState<
    Awaited<ReturnType<typeof loadAttendance>>
  >([])

  const refresh = useCallback(async () => {
    try {
      const [
        nextSettings,
        nextStaff,
        nextSlots,
        nextRequirements,
        nextAssignments,
        nextSuggestions,
        nextOffs,
        nextPreferences,
        nextAttendance,
      ] = await Promise.all([
        loadSettings(database, DEFAULT_OUTLET_ID),
        loadStaff(database),
        loadSlots(database),
        loadRequirements(database),
        loadAssignments(database),
        loadSuggestions(database),
        loadDayOffs(database),
        loadPreferences(database),
        loadAttendance(database),
      ])
      setSettings(nextSettings)
      setStaff(nextStaff)
      setSlots(nextSlots)
      setRequirements(nextRequirements)
      setAssignments(nextAssignments)
      setSuggestions(nextSuggestions)
      setOffs(nextOffs)
      setPreferences(nextPreferences)
      setAttendance(nextAttendance)
      setReady(true)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [database])

  useEffect(() => {
    const subs = [
      staffCollection(database).query().observe().subscribe(() => void refresh()),
      slotCollection(database).query().observe().subscribe(() => void refresh()),
      assignmentCollection(database).query().observe().subscribe(() => void refresh()),
      attendanceCollection(database).query().observe().subscribe(() => void refresh()),
      suggestionCollection(database).query().observe().subscribe(() => void refresh()),
      settingsCollection(database).query().observe().subscribe(() => void refresh()),
    ]
    void refresh()
    return () => {
      for (const sub of subs) sub.unsubscribe()
    }
  }, [database, refresh])

  const weekStartsOn = settings?.weekStartsOn ?? 1
  const today = todayJakarta()
  const thisWeekStart = weekStartOn(today, weekStartsOn)
  const upcomingWeekStart = nextWeekStart(weekStartsOn)
  const thisWeekDates = useMemo(
    () => weekDates(thisWeekStart),
    [thisWeekStart]
  )

  const openByStaff = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const member of staff) {
      map.set(
        member.id,
        hasOpenSession(attendance.filter((row) => row.staffId === member.id))
      )
    }
    return map
  }, [attendance, staff])

  return {
    database,
    ready,
    error,
    refresh,
    settings,
    staff,
    slots,
    requirements,
    assignments,
    suggestions,
    offs,
    preferences,
    attendance,
    today,
    thisWeekStart,
    upcomingWeekStart,
    thisWeekDates,
    openByStaff,
  }
}
