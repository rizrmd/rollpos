import type { Database } from "@/db/database"
import { useMemo, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { PinDialog } from "@/components/pin-dialog"
import { clockPunch } from "@/db/staffing-write"
import {
  formatClockFromMinutes,
  formatDuration,
  formatOccurredClock,
  minutesFromOccurred,
} from "@/lib/format"
import {
  describeClockCard,
  groupClockCards,
  openClockInAt,
} from "@/lib/on-duty"
import { deviceId } from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  isIncludedInAttendance,
  isStaffDeleted,
  type AssignmentRecord,
  type AttendanceEventRecord,
  type DayOffRecord,
  type SlotRecord,
  type StaffRecord,
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
  const [notice, setNotice] = useState<string | null>(null)
  const active = staff.filter(
    (member) =>
      member.isActive &&
      !isStaffDeleted(member) &&
      (isIncludedInAttendance(member) || Boolean(openByStaff.get(member.id)))
  )

  const cards = useMemo(
    () =>
      active.map((member) =>
        describeClockCard({
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
  const grouped = useMemo(() => groupClockCards(cards), [cards])

  function renderCards(items: typeof cards) {
    if (items.length === 0) return null
    return (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((card) => (
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
              <span className="flex w-full items-baseline justify-between gap-3">
                <span className="text-lg font-medium">
                  {card.member.nickname || card.member.name}
                </span>
                {card.clockInAt != null ? (
                  <time
                    dateTime={new Date(card.clockInAt).toISOString()}
                    className="text-2xl font-semibold tabular-nums tracking-tight"
                  >
                    {formatOccurredClock(card.clockInAt)}
                  </time>
                ) : null}
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
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveNotice message={notice} />
      <section aria-labelledby="clock-on-duty" className="flex flex-col gap-3">
        <h2
          id="clock-on-duty"
          className="text-sm font-semibold tracking-wide text-foreground uppercase"
        >
          Sedang masuk
          <span className="ml-2 font-normal text-muted-foreground normal-case">
            {grouped.onDuty.length}
          </span>
        </h2>
        {grouped.onDuty.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Belum ada yang clock-in. Ketuk nama di bawah untuk masuk.
          </p>
        ) : (
          renderCards(grouped.onDuty)
        )}
      </section>
      {grouped.waiting.length > 0 ? (
        <section aria-labelledby="clock-waiting" className="flex flex-col gap-3">
          <h2
            id="clock-waiting"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Belum masuk
            <span className="ml-2 font-normal">{grouped.waiting.length}</span>
          </h2>
          {renderCards(grouped.waiting)}
        </section>
      ) : null}
      {grouped.off.length > 0 ? (
        <section aria-labelledby="clock-off" className="flex flex-col gap-3">
          <h2
            id="clock-off"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Libur
            <span className="ml-2 font-normal">{grouped.off.length}</span>
          </h2>
          {renderCards(grouped.off)}
        </section>
      ) : null}
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
    </div>
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
  const clockInAt = openClockInAt(attendance, member.id)
  if (clockInAt == null) {
    return `Masukkan PIN untuk pulang.`
  }
  const now = Date.now()
  return `Masuk ${formatOccurredClock(clockInAt)} · sekarang ${formatClockFromMinutes(minutesFromOccurred(now))} (${formatDuration(clockInAt, now)}). Masukkan PIN untuk pulang.`
}
