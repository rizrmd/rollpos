import { formatOccurredClock } from "@/lib/format"
import { formatMinutes, todayJakarta } from "@/lib/time"
import {
  isStaffDeleted,
  type AssignmentRecord,
  type AttendanceEventRecord,
  type SlotRecord,
  type StaffRecord,
} from "@/lib/types"

export type OnDutyEntry = {
  staff: StaffRecord
  clockInAt: number | null
  assignment: AssignmentRecord | undefined
  slot: SlotRecord | undefined
}

export type ClockCardKind = "off" | "on_duty" | "scheduled" | "unscheduled"

/** Waktu clock-in sesi terbuka, atau null jika staff tidak sedang masuk. */
export function openClockInAt(
  attendance: readonly AttendanceEventRecord[],
  staffId: string
): number | null {
  const punches = attendance
    .filter(
      (event) =>
        event.staffId === staffId &&
        (event.type === "clock_in" || event.type === "clock_out")
    )
    .sort((left, right) => left.occurredAt - right.occurredAt)
  const last = punches.at(-1)
  if (!last || last.type !== "clock_in") return null
  return last.occurredAt
}

export function listOnDuty({
  staff,
  attendance,
  assignments,
  slots,
  today,
  openByStaff,
}: {
  staff: readonly StaffRecord[]
  attendance: readonly AttendanceEventRecord[]
  assignments: readonly AssignmentRecord[]
  slots: readonly SlotRecord[]
  today: string
  openByStaff?: ReadonlyMap<string, boolean>
}): OnDutyEntry[] {
  const entries: OnDutyEntry[] = []
  for (const member of staff) {
    if (!member.isActive || isStaffDeleted(member)) continue
    const present = openByStaff
      ? Boolean(openByStaff.get(member.id))
      : openClockInAt(attendance, member.id) != null
    if (!present) continue
    const assignment = assignments.find(
      (row) =>
        row.staffId === member.id &&
        row.workDate === today &&
        row.status !== "cancelled"
    )
    const slot = assignment
      ? slots.find((item) => item.id === assignment.templateId)
      : undefined
    entries.push({
      staff: member,
      clockInAt: openClockInAt(attendance, member.id),
      assignment,
      slot,
    })
  }
  return entries.sort((left, right) => {
    if (left.clockInAt == null && right.clockInAt == null) {
      return left.staff.nickname.localeCompare(right.staff.nickname, "id")
    }
    if (left.clockInAt == null) return 1
    if (right.clockInAt == null) return -1
    return left.clockInAt - right.clockInAt
  })
}

export function groupClockCards<T extends { kind: ClockCardKind }>(cards: T[]): {
  onDuty: T[]
  waiting: T[]
  off: T[]
} {
  const onDuty: T[] = []
  const waiting: T[] = []
  const off: T[] = []
  for (const card of cards) {
    if (card.kind === "on_duty") onDuty.push(card)
    else if (card.kind === "off") off.push(card)
    else waiting.push(card)
  }
  return { onDuty, waiting, off }
}

export function onDutyLabel(count: number): string {
  if (count === 0) return "Belum ada yang masuk"
  if (count === 1) return "1 staff sedang masuk"
  return `${count} staff sedang masuk`
}

export type ClockCardView = {
  member: StaffRecord
  kind: ClockCardKind
  line: string
  action: string
  clockInAt: number | null
}

function lastEventToday(
  attendance: readonly AttendanceEventRecord[],
  staffId: string,
  type: "clock_in" | "clock_out",
  today: string
): AttendanceEventRecord | undefined {
  return attendance
    .filter(
      (event) =>
        event.staffId === staffId &&
        event.type === type &&
        todayJakarta(new Date(event.occurredAt)) === today
    )
    .sort((left, right) => right.occurredAt - left.occurredAt)[0]
}

function shiftLine(
  assignment: AssignmentRecord | undefined,
  slot: SlotRecord | undefined
): string | null {
  if (!assignment || !slot) return null
  return `${slot.name} ${formatMinutes(assignment.startMinutes)}–${formatMinutes(assignment.endMinutes)}`
}

export function describeClockCard({
  member,
  today,
  slots,
  assignments,
  attendance,
  offs,
  onDuty,
}: {
  member: StaffRecord
  today: string
  slots: readonly SlotRecord[]
  assignments: readonly AssignmentRecord[]
  attendance: readonly AttendanceEventRecord[]
  offs: readonly { staffId: string; workDate: string }[]
  onDuty: boolean
}): ClockCardView {
  if (offs.some((row) => row.staffId === member.id && row.workDate === today)) {
    return {
      member,
      kind: "off",
      line: "Libur resmi hari ini",
      action: "Tidak bisa clock-in",
      clockInAt: null,
    }
  }

  const assignment = assignments.find(
    (row) =>
      row.staffId === member.id &&
      row.workDate === today &&
      row.status !== "cancelled"
  )
  const slot = assignment
    ? slots.find((item) => item.id === assignment.templateId)
    : undefined
  const openAt = openClockInAt(attendance, member.id)
  const clockInToday = lastEventToday(attendance, member.id, "clock_in", today)
  const clockOutToday = lastEventToday(attendance, member.id, "clock_out", today)
  const finishedToday =
    clockInToday &&
    clockOutToday &&
    clockOutToday.occurredAt >= clockInToday.occurredAt
      ? `Masuk ${formatOccurredClock(clockInToday.occurredAt)} · pulang ${formatOccurredClock(clockOutToday.occurredAt)}`
      : null
  const scheduled = shiftLine(assignment, slot)

  if (onDuty) {
    return {
      member,
      kind: "on_duty",
      clockInAt: openAt ?? clockInToday?.occurredAt ?? null,
      line: scheduled ?? "Tidak di jadwal",
      action: "Ketuk untuk pulang",
    }
  }

  if (assignment && slot) {
    return {
      member,
      kind: "scheduled",
      clockInAt: null,
      line:
        finishedToday ??
        `${slot.name} ${formatMinutes(assignment.startMinutes)}–${formatMinutes(assignment.endMinutes)}`,
      action: "Ketuk untuk masuk",
    }
  }

  return {
    member,
    kind: "unscheduled",
    clockInAt: null,
    line: finishedToday ?? "Tidak ada di jadwal hari ini",
    action: "Ketuk untuk masuk",
  }
}
