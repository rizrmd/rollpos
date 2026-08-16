import type { Database } from "@/db/database"
import { useState } from "react"

import { PinDialog } from "@/components/pin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { clockPunch } from "@/db/staffing-write"
import { deviceId } from "@/lib/time"
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clock in / out</CardTitle>
        <CardDescription>
          Ketuk nama, masukkan PIN. Berjalan offline di perangkat ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {staff
            .filter((member) => member.isActive)
            .map((member) => {
              const onDuty = openByStaff.get(member.id)
              return (
                <Button
                  key={member.id}
                  type="button"
                  variant={onDuty ? "default" : "outline"}
                  className="h-auto flex-col items-start gap-1 px-3 py-3"
                  onClick={() => setSelected(member)}
                >
                  <span className="text-base">{member.nickname || member.name}</span>
                  <span className="flex flex-wrap gap-1">
                    {member.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {role}
                      </Badge>
                    ))}
                  </span>
                  <span className="text-xs opacity-80">
                    {onDuty ? "Sedang on duty" : "Belum masuk"}
                  </span>
                </Button>
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
      </CardContent>
    </Card>
  )
}
