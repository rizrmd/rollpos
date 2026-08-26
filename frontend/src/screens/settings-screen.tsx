import type { Database } from "@/db/database"
import { useEffect, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  saveOutletSettings,
  saveRoleRequirements,
  saveSlot,
} from "@/db/staffing-write"
import { WEEKDAY_LONG } from "@/lib/format"
import { formatMinutes, parseMinutes } from "@/lib/time"
import {
  FLOOR_ROLES,
  type FloorRole,
  type OutletSettingsRecord,
  type RoleRequirementRecord,
  type SlotRecord,
  type StaffRecord,
} from "@/lib/types"

const fieldClass = "min-h-12"

export function SettingsScreen({
  database,
  actor,
  settings,
  slots,
  requirements,
}: {
  database: Database
  actor: StaffRecord
  settings: OutletSettingsRecord | null
  slots: SlotRecord[]
  requirements: RoleRequirementRecord[]
}) {
  const [form, setForm] = useState(formFrom(settings))
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setForm(formFrom(settings))
  }, [settings])

  return (
    <div className="grid gap-4">
      <LiveNotice message={notice} />
      <Card>
        <CardHeader>
          <CardTitle>Jadwal operasional outlet</CardTitle>
          <CardDescription>
            Atur jam outlet beroperasi dan periode jadwal staf.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-sm font-medium">Jam operasional harian</h3>
              <p className="text-sm text-muted-foreground">
                Jam outlet mulai melayani hingga selesai beroperasi.
              </p>
            </div>
            <Field
              label="Outlet buka pukul"
              value={form.open}
              onChange={(open) => setForm({ ...form, open })}
            />
            <Field
              label="Outlet tutup pukul"
              value={form.close}
              onChange={(close) => setForm({ ...form, close })}
            />
          </section>

          <section className="grid gap-3 border-t pt-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-sm font-medium">Periode jadwal staf</h3>
              <p className="text-sm text-muted-foreground">
                Pilih hari dimulainya jadwal mingguan yang diatur manager.
              </p>
            </div>
            <SelectField
              label="Minggu jadwal dimulai pada"
              value={form.weekStartsOn}
              onChange={(weekStartsOn) => setForm({ ...form, weekStartsOn })}
              options={WEEKDAY_LONG.map((name, index) => ({
                value: String(index),
                label: name,
              }))}
            />
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aturan adil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Maks hari kerja beruntun"
            value={form.maxConsecutive}
            onChange={(maxConsecutive) => setForm({ ...form, maxConsecutive })}
          />
          <Field
            label="Target libur per minggu"
            value={form.targetOff}
            onChange={(targetOff) => setForm({ ...form, targetOff })}
          />
          <Field
            label="Grace terlambat (menit)"
            value={form.grace}
            onChange={(grace) => setForm({ ...form, grace })}
          />
          <Field
            label="Jam timpang lebih dari (%)"
            value={form.skew}
            onChange={(skew) => setForm({ ...form, skew })}
          />
          <label className="flex min-h-12 items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-5"
              checked={form.weekend}
              onChange={(event) =>
                setForm({ ...form, weekend: event.target.checked })
              }
            />
            Giliran weekend adil
          </label>
          <Button
            type="button"
            size="touch"
            className="sm:col-span-2"
            onClick={async () => {
              await saveOutletSettings(database, actor, {
                outletId: settings?.outletId,
                openMinutes: parseMinutes(form.open),
                closeMinutes: parseMinutes(form.close),
                weekStartsOn: Number(form.weekStartsOn),
                preferenceDeadlineWeekday: Number(form.deadlineDay),
                preferenceDeadlineMinutes: parseMinutes(form.deadlineTime),
                maxConsecutiveWorkDays: Number(form.maxConsecutive),
                targetDaysOffPerWeek: Number(form.targetOff),
                graceLateMinutes: Number(form.grace),
                hoursSkewPercent: Number(form.skew),
                weekendFairnessEnabled: form.weekend,
              })
              setNotice("Pengaturan tersimpan.")
            }}
          >
            Simpan pengaturan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift harian</CardTitle>
          <CardDescription>
            Jumlah baris aktif = jumlah shift dalam sehari.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {slots.map((slot) => (
            <SlotEditor
              key={slot.id}
              slot={slot}
              requirements={requirements.filter(
                (row) => row.templateId === slot.id
              )}
              onSave={async (next, roles) => {
                await saveSlot(database, actor, next)
                await saveRoleRequirements(database, actor, slot.id, roles)
                setNotice(`${next.name} tersimpan.`)
              }}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="touch"
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
  requirements,
  onSave,
}: {
  slot: SlotRecord
  requirements: RoleRequirementRecord[]
  onSave: (
    input: {
      id: string
      name: string
      startMinutes: number
      endMinutes: number
      sortOrder: number
      minStaffCount: number
      isActive: boolean
    },
    roles: { role: FloorRole; minCount: number }[]
  ) => void
}) {
  const [name, setName] = useState(slot.name)
  const [start, setStart] = useState(formatMinutes(slot.startMinutes))
  const [end, setEnd] = useState(formatMinutes(slot.endMinutes))
  const [minStaff, setMinStaff] = useState(String(slot.minStaffCount))
  const [active, setActive] = useState(slot.isActive)
  const [roles, setRoles] = useState<Record<FloorRole, string>>(() => {
    const next = { kasir: "0", barista: "0", kitchen: "0" }
    for (const row of requirements) next[row.role] = String(row.minCount)
    return next
  })

  return (
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">{slot.name}</legend>
      <Field
        id={`${slot.id}-nama`}
        label="Nama"
        value={name}
        onChange={setName}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id={`${slot.id}-mulai`}
          label="Mulai"
          value={start}
          onChange={setStart}
        />
        <Field
          id={`${slot.id}-selesai`}
          label="Selesai"
          value={end}
          onChange={setEnd}
        />
        <Field
          id={`${slot.id}-min`}
          label="Min staff"
          value={minStaff}
          onChange={setMinStaff}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {FLOOR_ROLES.map((role) => (
          <Field
            key={role}
            id={`${slot.id}-${role}`}
            label={`Min ${role}`}
            value={roles[role]}
            onChange={(value) => setRoles({ ...roles, [role]: value })}
          />
        ))}
      </div>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Slot aktif
      </label>
      <Button
        type="button"
        size="touch"
        onClick={() =>
          onSave(
            {
              id: slot.id,
              name,
              startMinutes: parseMinutes(start),
              endMinutes: parseMinutes(end),
              sortOrder: slot.sortOrder,
              minStaffCount: Number(minStaff),
              isActive: active,
            },
            FLOOR_ROLES.map((role) => ({
              role,
              minCount: Number(roles[role]) || 0,
            }))
          )
        }
      >
        Simpan slot
      </Button>
    </fieldset>
  )
}

function formFrom(settings: OutletSettingsRecord | null) {
  return {
    open: settings ? formatMinutes(settings.openMinutes) : "",
    close: settings ? formatMinutes(settings.closeMinutes) : "",
    weekStartsOn: String(settings?.weekStartsOn ?? 1),
    deadlineDay: String(settings?.preferenceDeadlineWeekday ?? 3),
    deadlineTime: settings
      ? formatMinutes(settings.preferenceDeadlineMinutes)
      : "18:00",
    maxConsecutive: String(settings?.maxConsecutiveWorkDays ?? 6),
    targetOff: String(settings?.targetDaysOffPerWeek ?? 1),
    grace: String(settings?.graceLateMinutes ?? 10),
    skew: String(settings?.hoursSkewPercent ?? 25),
    weekend: settings?.weekendFairnessEnabled ?? true,
  }
}

function Field({
  label,
  value,
  onChange,
  id: idProp,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  id?: string
}) {
  const id = idProp ?? label.replace(/\s+/g, "-").toLowerCase()
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-sm font-medium">{label}</span>
      <Input
        id={id}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase()
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-sm font-medium">{label}</span>
      <select
        id={id}
        className="min-h-12 rounded-lg border border-input bg-transparent px-2.5 text-base"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
