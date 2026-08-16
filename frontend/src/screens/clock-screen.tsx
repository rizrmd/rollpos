import type { Database } from "@/db/database"
import { useState } from "react"

import { PinDialog } from "@/components/pin-dialog"
import { Badge } from "@/components/ui/badge"
import { clockPunch } from "@/db/staffing-write"
import { deviceId } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"

export function ClockScreen({
  database,
  staff,
  openByStaff,
}: {
  database: Database
  staff: StaffRecord[]
  openByStaff: Map<string, boolean>
}) {
  const [selected, setSelected] = useState<StaffRecord | null>(null)
  const active = staff.filter((member) => member.isActive)

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Ketuk nama, masukkan PIN. Berjalan offline di perangkat ini.
      </p>
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
        {active.map((member) => {
          const onDuty = openByStaff.get(member.id)
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelected(member)}
              className={cn(
                "flex min-h-28 flex-col items-start justify-between rounded-2xl border px-4 py-4 text-left transition-colors",
                onDuty
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              )}
            >
              <span className="text-lg font-medium">
                {member.nickname || member.name}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {member.roles.map((role) => (
                  <Badge
                    key={role}
                    variant={onDuty ? "secondary" : "outline"}
                    className={onDuty ? "border-transparent" : undefined}
                  >
                    {role}
                  </Badge>
                ))}
              </span>
              <span className={cn("text-xs", onDuty ? "opacity-80" : "text-muted-foreground")}>
                {onDuty ? "Sedang on duty" : "Belum masuk"}
              </span>
            </button>
          )
        })}
      </div>
      <PinDialog
        open={Boolean(selected)}
        title={
          selected
            ? `${openByStaff.get(selected.id) ? "Clock out" : "Clock in"} · ${selected.name}`
            : "PIN"
        }
        description="Masukkan PIN staff."
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onSubmit={async (pin) => {
          if (!selected) return
          const type = openByStaff.get(selected.id) ? "clock_out" : "clock_in"
          await clockPunch(database, selected.id, pin, type, deviceId())
        }}
      />
    </div>
  )
}
