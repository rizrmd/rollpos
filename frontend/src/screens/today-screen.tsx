import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMinutes } from "@/lib/time"
import type {
  AssignmentRecord,
  AttendanceEventRecord,
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
  openByStaff,
}: {
  today: string
  settings: OutletSettingsRecord | null
  staff: StaffRecord[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  attendance: AttendanceEventRecord[]
  openByStaff: Map<string, boolean>
}) {
  const grace = settings?.graceLateMinutes ?? 0
  const activeSlots = slots.filter((slot) => slot.isActive)

  return (
    <div className="grid gap-4">
      {activeSlots.map((slot) => {
        const filled = assignments.filter(
          (row) =>
            row.workDate === today &&
            row.templateId === slot.id &&
            row.status !== "cancelled"
        )
        return (
          <Card key={slot.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{slot.name}</span>
                <Badge variant={filled.length >= slot.minStaffCount ? "secondary" : "destructive"}>
                  {filled.length}/{slot.minStaffCount}
                </Badge>
              </CardTitle>
              <CardDescription>
                {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {filled.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada yang dijadwalkan.</p>
              ) : (
                filled.map((row) => {
                  const member = staff.find((item) => item.id === row.staffId)
                  const punch = attendance.find(
                    (event) =>
                      event.staffId === row.staffId && event.type === "clock_in"
                  )
                  const late =
                    punch &&
                    grace >= 0 &&
                    minutesFromMidnight(punch.occurredAt) >
                      row.startMinutes + grace
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{member?.name ?? row.staffId}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.dutyRole || "stasiun belum dipilih"}
                          {openByStaff.get(row.staffId) ? " · on duty" : ""}
                        </p>
                      </div>
                      {late ? <Badge variant="destructive">terlambat</Badge> : null}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function minutesFromMidnight(ms: number): number {
  const date = new Date(ms)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  return hour * 60 + minute
}
