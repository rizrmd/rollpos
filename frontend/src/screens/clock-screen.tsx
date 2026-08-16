import type { Database } from "@/db/database"
import { useMemo, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { ChangePinDialog } from "@/components/change-pin-dialog"
import { PinDialog } from "@/components/pin-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { changeStaffPin, clockPunch } from "@/db/staffing-write"
import {
  formatClockFromMinutes,
  formatDuration,
  formatOccurredClock,
  minutesFromOccurred,
} from "@/lib/format"
import { deviceId, formatMinutes, todayJakarta } from "@/lib/time"
import { cn } from "@/lib/utils"
import type {
  AssignmentRecord,
  AttendanceEventRecord,
  DayOffRecord,
  SlotRecord,
  StaffRecord,
} from "@/lib/types"

export function ClockScreen({
  database,
  staff,
  slots,
  assignments,
  attendance,
  offs,
  openByStaff,
  today,
}: {
  database: Database
  staff: StaffRecord[]
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  attendance: AttendanceEventRecord[]
  offs: DayOffRecord[]
  openByStaff: Map<string, boolean>
  today: string
}) {
  const [selected, setSelected] = useState<StaffRecord | null>(null)
  const [changePinWho, setChangePinWho] = useState<StaffRecord | null>(null)
  const [pickPinOwner, setPickPinOwner] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const active = staff.filter((member) => member.isActive)

  const cards = useMemo(
    () =>
      active.map((member) =>
        describeMember({
          member,
          today,
          slots,
          assignments,
          attendance,
          offs,
          onDuty: Boolean(openByStaff.get(member.id)),
        })
      ),
    [active, assignments, attendance, offs, openByStaff, slots, today]
  )

  return (
    <div className="flex flex-col gap-4">
      <LiveNotice message={notice} />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickPinOwner(true)}
        >
          Ubah PIN saya
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.member.id}>
            <button
              type="button"
              disabled={card.kind === "off"}
              onClick={() => {
                setNotice(null)
                setSelected(card.member)
              }}
              className={cn(
                "flex min-h-28 w-full flex-col items-start justify-between rounded-2xl border px-4 py-4 text-left transition-colors",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                card.kind === "on_duty" &&
                  "border-transparent bg-primary text-primary-foreground",
                card.kind === "off" && "cursor-not-allowed opacity-60",
                card.kind !== "on_duty" &&
                  card.kind !== "off" &&
                  "bg-card hover:bg-muted"
              )}
            >
              <span className="text-lg font-medium">
                {card.member.nickname || card.member.name}
              </span>
              <span
                className={cn(
                  "text-sm",
                  card.kind === "on_duty"
                    ? "opacity-90"
                    : "text-muted-foreground"
                )}
              >
                {card.line}
              </span>
              <span className="text-sm font-medium">{card.action}</span>
            </button>
          </li>
        ))}
      </ul>
      <PinDialog
        open={Boolean(selected)}
        title={
          selected
            ? `${openByStaff.get(selected.id) ? "Pulang" : "Masuk"} · ${selected.name}`
            : "PIN"
        }
        description={
          selected
            ? pinDescription(
                selected,
                openByStaff.get(selected.id) === true,
                attendance
              )
            : "Masukkan PIN staff."
        }
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        actionLabel="Ubah PIN saya"
        onAction={() => {
          setChangePinWho(selected)
          setSelected(null)
        }}
        onSubmit={async (pin) => {
          if (!selected) return
          const type = openByStaff.get(selected.id) ? "clock_out" : "clock_in"
          await clockPunch(database, selected.id, pin, type, deviceId())
          const clock = formatOccurredClock(Date.now())
          setNotice(
            type === "clock_out"
              ? `${selected.nickname} pulang ${clock}`
              : `${selected.nickname} masuk ${clock}`
          )
        }}
      />
      <Dialog open={pickPinOwner} onOpenChange={setPickPinOwner}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Pilih nama kamu</DialogTitle>
            <DialogDescription>
              PIN saat ini akan diminta sebelum PIN dapat diubah.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {active.map((member) => (
              <li key={member.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full justify-start"
                  onClick={() => {
                    setPickPinOwner(false)
                    setChangePinWho(member)
                  }}
                >
                  {member.name}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <ChangePinDialog
        open={Boolean(changePinWho)}
        staffName={changePinWho?.nickname || changePinWho?.name || "staff"}
        onOpenChange={(open) => {
          if (!open) setChangePinWho(null)
        }}
        onSubmit={async (currentPin, newPin) => {
          if (!changePinWho) return
          await changeStaffPin(database, changePinWho.id, currentPin, newPin)
          setNotice(`PIN ${changePinWho.nickname} berhasil diubah.`)
        }}
      />
    </div>
  )
}

function describeMember({
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
  slots: SlotRecord[]
  assignments: AssignmentRecord[]
  attendance: AttendanceEventRecord[]
  offs: DayOffRecord[]
  onDuty: boolean
}): {
  member: StaffRecord
  kind: "off" | "on_duty" | "scheduled" | "unscheduled"
  line: string
  action: string
} {
  if (offs.some((row) => row.staffId === member.id && row.workDate === today)) {
    return {
      member,
      kind: "off",
      line: "Libur resmi hari ini",
      action: "Tidak bisa clock-in",
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
  const clockIn = lastToday(attendance, member.id, "clock_in", today)

  if (onDuty) {
    return {
      member,
      kind: "on_duty",
      line: clockIn
        ? `On duty sejak ${formatOccurredClock(clockIn.occurredAt)}`
        : "Sedang on duty",
      action: "Ketuk untuk pulang",
    }
  }

  if (assignment && slot) {
    return {
      member,
      kind: "scheduled",
      line: `${slot.name} ${formatMinutes(assignment.startMinutes)}–${formatMinutes(assignment.endMinutes)}`,
      action: "Ketuk untuk masuk",
    }
  }

  return {
    member,
    kind: "unscheduled",
    line: "Tidak ada di jadwal hari ini",
    action: "Ketuk untuk masuk",
  }
}

function lastToday(
  attendance: AttendanceEventRecord[],
  staffId: string,
  type: "clock_in" | "clock_out",
  today: string
): AttendanceEventRecord | undefined {
  return [...attendance]
    .reverse()
    .find(
      (event) =>
        event.staffId === staffId &&
        event.type === type &&
        todayJakarta(new Date(event.occurredAt)) === today
    )
}

function pinDescription(
  member: StaffRecord,
  onDuty: boolean,
  attendance: AttendanceEventRecord[]
): string {
  if (!onDuty) {
    return `Masukkan PIN ${member.nickname}.`
  }
  const clockIn = [...attendance]
    .reverse()
    .find((event) => event.staffId === member.id && event.type === "clock_in")
  if (!clockIn) {
    return `Masukkan PIN untuk pulang.`
  }
  const now = Date.now()
  return `Masuk ${formatOccurredClock(clockIn.occurredAt)} · sekarang ${formatClockFromMinutes(minutesFromOccurred(now))} (${formatDuration(clockIn.occurredAt, now)}). Masukkan PIN untuk pulang.`
}
