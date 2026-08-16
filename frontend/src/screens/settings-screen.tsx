import type { Database } from "@/db/database"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { saveOutletSettings, saveSlot } from "@/db/staffing-write"
import { formatMinutes, parseMinutes } from "@/lib/time"
import type { OutletSettingsRecord, SlotRecord, StaffRecord } from "@/lib/types"

export function SettingsScreen({
  database,
  actor,
  settings,
  slots,
}: {
  database: Database
  actor: StaffRecord
  settings: OutletSettingsRecord | null
  slots: SlotRecord[]
}) {
  const [form, setForm] = useState({
    open: settings ? formatMinutes(settings.openMinutes) : "",
    close: settings ? formatMinutes(settings.closeMinutes) : "",
    weekStartsOn: String(settings?.weekStartsOn ?? 1),
    maxConsecutive: String(settings?.maxConsecutiveWorkDays ?? 6),
    targetOff: String(settings?.targetDaysOffPerWeek ?? 1),
    grace: String(settings?.graceLateMinutes ?? 10),
    skew: String(settings?.hoursSkewPercent ?? 25),
    weekend: settings?.weekendFairnessEnabled ?? true,
  })

  useEffect(() => {
    if (!settings) return
    setForm({
      open: formatMinutes(settings.openMinutes),
      close: formatMinutes(settings.closeMinutes),
      weekStartsOn: String(settings.weekStartsOn),
      maxConsecutive: String(settings.maxConsecutiveWorkDays),
      targetOff: String(settings.targetDaysOffPerWeek),
      grace: String(settings.graceLateMinutes),
      skew: String(settings.hoursSkewPercent),
      weekend: settings.weekendFairnessEnabled,
    })
  }, [settings])

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Jam operasional & ambang</CardTitle>
          <CardDescription>
            Semua angka tersimpan di pengaturan, bukan hardcode di aplikasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Buka" value={form.open} onChange={(open) => setForm({ ...form, open })} />
          <Field label="Tutup" value={form.close} onChange={(close) => setForm({ ...form, close })} />
          <Field
            label="Awal minggu (0=Min)"
            value={form.weekStartsOn}
            onChange={(weekStartsOn) => setForm({ ...form, weekStartsOn })}
          />
          <Field
            label="Maks hari beruntun"
            value={form.maxConsecutive}
            onChange={(maxConsecutive) => setForm({ ...form, maxConsecutive })}
          />
          <Field
            label="Target libur / minggu"
            value={form.targetOff}
            onChange={(targetOff) => setForm({ ...form, targetOff })}
          />
          <Field
            label="Grace terlambat (menit)"
            value={form.grace}
            onChange={(grace) => setForm({ ...form, grace })}
          />
          <Field
            label="Ambang jam timpang (%)"
            value={form.skew}
            onChange={(skew) => setForm({ ...form, skew })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.weekend}
              onChange={(event) => setForm({ ...form, weekend: event.target.checked })}
            />
            Perata weekend
          </label>
          <Button
            type="button"
            className="sm:col-span-2"
            onClick={() =>
              void saveOutletSettings(database, actor, {
                outletId: settings?.outletId,
                openMinutes: parseMinutes(form.open),
                closeMinutes: parseMinutes(form.close),
                weekStartsOn: Number(form.weekStartsOn),
                maxConsecutiveWorkDays: Number(form.maxConsecutive),
                targetDaysOffPerWeek: Number(form.targetOff),
                graceLateMinutes: Number(form.grace),
                hoursSkewPercent: Number(form.skew),
                weekendFairnessEnabled: form.weekend,
              })
            }
          >
            Simpan pengaturan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slot shift</CardTitle>
          <CardDescription>Jumlah shift = jumlah baris aktif.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {slots.map((slot) => (
            <SlotEditor
              key={slot.id}
              slot={slot}
              onSave={(next) => void saveSlot(database, actor, next)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void saveSlot(database, actor, {
                name: "Shift baru",
                startMinutes: settings?.openMinutes ?? 0,
                endMinutes: settings?.closeMinutes ?? 0,
                sortOrder: slots.length + 1,
                minStaffCount: 1,
                isActive: true,
              })
            }
          >
            Tambah slot
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SlotEditor({
  slot,
  onSave,
}: {
  slot: SlotRecord
  onSave: (input: {
    id: string
    name: string
    startMinutes: number
    endMinutes: number
    sortOrder: number
    minStaffCount: number
    isActive: boolean
  }) => void
}) {
  const [name, setName] = useState(slot.name)
  const [start, setStart] = useState(formatMinutes(slot.startMinutes))
  const [end, setEnd] = useState(formatMinutes(slot.endMinutes))
  const [minStaff, setMinStaff] = useState(String(slot.minStaffCount))

  return (
    <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5">
      <Input value={name} onChange={(event) => setName(event.target.value)} />
      <Input value={start} onChange={(event) => setStart(event.target.value)} />
      <Input value={end} onChange={(event) => setEnd(event.target.value)} />
      <Input
        value={minStaff}
        onChange={(event) => setMinStaff(event.target.value)}
        aria-label="Min pegawai"
      />
      <Button
        type="button"
        onClick={() =>
          onSave({
            id: slot.id,
            name,
            startMinutes: parseMinutes(start),
            endMinutes: parseMinutes(end),
            sortOrder: slot.sortOrder,
            minStaffCount: Number(minStaff),
            isActive: slot.isActive,
          })
        }
      >
        Simpan
      </Button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
