import { jakartaDateParts, weekdayOf } from "@/lib/time"

export const WEEKDAY_LONG = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const

export const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const

const MONTH_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number)
  return { year, month, day }
}

export function formatIsoLong(iso: string): string {
  const { year, month, day } = parseIso(iso)
  return `${day} ${MONTH_LONG[month - 1]} ${year}`
}

export function formatIsoShort(iso: string): string {
  const { month, day } = parseIso(iso)
  return `${day} ${MONTH_SHORT[month - 1]}`
}

export function formatIsoWeekday(iso: string): string {
  return `${WEEKDAY_LONG[weekdayOf(iso)]}, ${formatIsoShort(iso)}`
}

export function formatIsoWeekdayShort(iso: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(iso)]} ${parseIso(iso).day}`
}

export function formatWeekRange(weekStart: string): string {
  const { year, month, day } = parseIso(weekStart)
  const end = new Date(Date.UTC(year, month - 1, day + 6))
  const endDay = end.getUTCDate()
  const endMonth = end.getUTCMonth()
  if (endMonth === month - 1) {
    return `${day}–${endDay} ${MONTH_LONG[month - 1]} ${year}`
  }
  return `${day} ${MONTH_SHORT[month - 1]} – ${endDay} ${MONTH_SHORT[endMonth]} ${end.getUTCFullYear()}`
}

export function formatClockFromMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`
}

export function formatOccurredClock(ms: number): string {
  const { minutes } = jakartaDateParts(new Date(ms))
  return formatClockFromMinutes(minutes)
}

export function minutesFromOccurred(ms: number): number {
  return jakartaDateParts(new Date(ms)).minutes
}

export function formatDuration(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60_000))
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours === 0) return `${minutes} menit`
  if (minutes === 0) return `${hours} jam`
  return `${hours} jam ${minutes} menit`
}

export function formatJakartaClock(at = new Date()): string {
  return formatClockFromMinutes(jakartaDateParts(at).minutes)
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const qtyId = new Intl.NumberFormat("id-ID")

export function formatRupiah(amount: number): string {
  return rupiah.format(amount)
}

export function formatQty(qty: number, unit = ""): string {
  const n = qtyId.format(qty)
  return unit ? `${n} ${unit}` : n
}

export function preferenceDeadlineLabel(
  weekday: number,
  minutes: number
): string {
  return `${WEEKDAY_LONG[weekday] ?? "—"} pukul ${formatClockFromMinutes(minutes)}`
}
