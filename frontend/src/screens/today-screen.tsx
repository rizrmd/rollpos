import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatIsoWeekday, formatOccurredClock, minutesFromOccurred } from "@/lib/format"
import { formatMinutes, jakartaDateParts, todayJakarta } from "@/lib/time"
import type {
  AssignmentRecord,
  AttendanceEventRecord,
  DayOffRecord,
  OutletSettingsRecord,
  SlotRecord,
  StaffRecord,
} from "@/lib/types"

export function TodayScreen({
  today,
  settings,
  staff,
  slots,
  assignments,
  attendance,
  offs,
  openByStaff,
}: {
  today: string
  settings: OutletSettingsRecord | null
  staff: StaffRecord[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  attendance: AttendanceEventRecord[]
  offs: DayOffRecord[]
  openByStaff: Map<string, boolean>
}) {
  const grace = settings?.graceLateMinutes ?? 0
  const nowMinutes = jakartaDateParts().minutes
  const activeSlots = slots.filter((slot) => slot.isActive)
  const todayAssignments = assignments.filter(
    (row) => row.workDate === today && row.status !== "cancelled"
  )
  const assignedIds = new Set(todayAssignments.map((row) => row.staffId))
  const unscheduled = staff.filter(
    (member) =>
      member.isActive &&
      openByStaff.get(member.id) &&
      !assignedIds.has(member.id)
  )
  const todayOffs = offs.filter((row) => row.workDate === today)
  const onDuty = staff.filter((member) => openByStaff.get(member.id)).length
  const missing = todayAssignments.filter((row) => {
    const clockIn = todayEvent(attendance, row.staffId, "clock_in", today)
    return !clockIn && nowMinutes > row.startMinutes + grace
  }).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {onDuty} on duty · {missing} belum datang · {todayOffs.length} libur
      </p>

      {activeSlots.map((slot) => {
        const filled = todayAssignments.filter((row) => row.templateId === slot.id)
        const ok = filled.length >= slot.minStaffCount
        return (
          <section key={slot.id} aria-labelledby={`slot-${slot.id}`}>
            <Card>
              <CardHeader>
                <CardTitle id={`slot-${slot.id}`} className="flex items-center justify-between gap-2">
                  <span>{slot.name}</span>
                  <Badge variant={ok ? "secondary" : "destructive"}>
                    {filled.length}/{slot.minStaffCount}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filled.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada yang dijadwalkan.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filled.map((row) => {
                      const member = staff.find((item) => item.id === row.staffId)
                      const status = personStatus({
                        row,
                        grace,
                        nowMinutes,
                        onDuty: Boolean(openByStaff.get(row.staffId)),
                        clockIn: todayEvent(attendance, row.staffId, "clock_in", today),
                        clockOut: todayEvent(attendance, row.staffId, "clock_out", today),
                      })
                      return (
                        <li
                          key={row.id}
                          className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3"
                        >
                          <div>
                            <p className="font-medium">{member?.name ?? row.staffId}</p>
                            <p className="text-sm text-muted-foreground">
                              {row.dutyRole || "stasiun bebas"}
                              {status.detail ? ` · ${status.detail}` : ""}
                            </p>
                          </div>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        )
      })}

      {unscheduled.length > 0 ? (
        <section aria-labelledby="unscheduled-heading">
          <Card>
            <CardHeader>
              <CardTitle id="unscheduled-heading">Tidak di jadwal</CardTitle>
              <CardDescription>Sudah clock-in tanpa assignment hari ini.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {unscheduled.map((member) => {
                  const clockIn = todayEvent(attendance, member.id, "clock_in", today)
                  return (
                    <li key={member.id} className="rounded-lg border px-3 py-3">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">
                        masuk {clockIn ? formatOccurredClock(clockIn.occurredAt) : "—"}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {todayOffs.length > 0 ? (
        <section aria-labelledby="off-heading">
          <Card>
            <CardHeader>
              <CardTitle id="off-heading">Libur resmi</CardTitle>
              <CardDescription>{formatIsoWeekday(today)}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-sm">
                {todayOffs.map((row) => (
                  <li key={row.id}>
                    {staff.find((item) => item.id === row.staffId)?.name ?? row.staffId}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function todayEvent(
  attendance: AttendanceEventRecord[],
  staffId: string,
  type: "clock_in" | "clock_out",
  today: string
): AttendanceEventRecord | undefined {
  return attendance.find(
    (event) =>
      event.staffId === staffId &&
      event.type === type &&
      todayJakarta(new Date(event.occurredAt)) === today
  )
}

function personStatus({
  row,
  grace,
  nowMinutes,
  onDuty,
  clockIn,
  clockOut,
}: {
  row: AssignmentRecord
  grace: number
  nowMinutes: number
  onDuty: boolean
  clockIn?: AttendanceEventRecord
  clockOut?: AttendanceEventRecord
}): {
  label: string
  detail: string
  variant: "secondary" | "destructive" | "outline"
} {
  const late =
    clockIn &&
    grace >= 0 &&
    minutesFromOccurred(clockIn.occurredAt) > row.startMinutes + grace

  if (clockOut && !onDuty) {
    return {
      label: "pulang",
      detail: `${formatOccurredClock(clockIn?.occurredAt ?? clockOut.occurredAt)}–${formatOccurredClock(clockOut.occurredAt)}`,
      variant: "outline",
    }
  }
  if (onDuty || clockIn) {
    return {
      label: late ? "terlambat" : "on duty",
      detail: clockIn ? `masuk ${formatOccurredClock(clockIn.occurredAt)}` : "",
      variant: late ? "destructive" : "secondary",
    }
  }
  if (nowMinutes > row.startMinutes + grace) {
    return {
      label: "belum datang",
      detail: `jadwal ${formatMinutes(row.startMinutes)}`,
      variant: "destructive",
    }
  }
  return {
    label: "belum masuk",
    detail: `mulai ${formatMinutes(row.startMinutes)}`,
    variant: "outline",
  }
}
