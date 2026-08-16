const JAKARTA = "Asia/Jakarta"

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function parseMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0
  }
  return hours * 60 + minutes
}

export function slotHours(startMinutes: number, endMinutes: number): number {
  return Math.max(0, endMinutes - startMinutes) / 60
}

export function jakartaDateParts(at: Date = new Date()): {
  year: number
  month: number
  day: number
  weekday: number
  minutes: number
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)

  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0"
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: weekdayMap[read("weekday")] ?? 1,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  }
}

export function todayJakarta(at: Date = new Date()): string {
  const { year, month, day } = jakartaDateParts(at)
  return isoDate(year, month, day)
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function weekdayOf(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function weekStartOn(iso: string, weekStartsOn: number): string {
  const weekday = weekdayOf(iso)
  const delta = (weekday - weekStartsOn + 7) % 7
  return addDays(iso, -delta)
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

export function nextWeekStart(weekStartsOn: number, at: Date = new Date()): string {
  const today = todayJakarta(at)
  return addDays(weekStartOn(today, weekStartsOn), 7)
}

export function isWeekend(iso: string): boolean {
  const day = weekdayOf(iso)
  return day === 0 || day === 6
}

export function consecutiveRunEnding(
  workDates: string[],
  endDate: string
): number {
  const set = new Set(workDates)
  let run = 0
  let cursor = endDate
  while (set.has(cursor)) {
    run += 1
    cursor = addDays(cursor, -1)
  }
  return run
}

export function deviceId(): string {
  const key = "rollpos.device_id"
  const existing = globalThis.localStorage?.getItem(key)
  if (existing) {
    return existing
  }
  const id = crypto.randomUUID()
  globalThis.localStorage?.setItem(key, id)
  return id
}
