import type { Database } from "@/db/database"
import { useEffect, useMemo, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { cn } from "@/lib/utils"

const fieldClass = "min-h-12"

type OutletTab = "operasional" | "aturan" | "shift"

function getInitialTab(): OutletTab {
  const urlParam = new URLSearchParams(window.location.search).get("tab")
  if (urlParam === "aturan" || urlParam === "shift") return urlParam
  return "operasional"
}

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
  const [tab, setTab] = useState<OutletTab>(getInitialTab)
  const [form, setForm] = useState(formFrom(settings))
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState<string>("")

  useEffect(() => {
    setForm(formFrom(settings))
  }, [settings])

  useEffect(() => {
    const onPop = () => {
      const urlParam = new URLSearchParams(window.location.search).get("tab")
      if (urlParam === "aturan" || urlParam === "shift" || urlParam === "operasional") {
        setTab(urlParam as OutletTab)
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  function changeTab(next: OutletTab) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url.pathname + url.search)
  }

  const selectedSlot = useMemo(() => {
    if (slots.length === 0) return null
    return slots.find((s) => s.id === selectedSlotId) ?? slots[0]
  }, [slots, selectedSlotId])

  const currentSlotIndex = useMemo(() => {
    if (!selectedSlot) return 0
    const idx = slots.findIndex((s) => s.id === selectedSlot.id)
    return idx >= 0 ? idx : 0
  }, [slots, selectedSlot])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <TabButton
          active={tab === "operasional"}
          label="Operasional"
          onClick={() => changeTab("operasional")}
        />
        <TabButton
          active={tab === "aturan"}
          label="Aturan Kerja"
          onClick={() => changeTab("aturan")}
        />
        <TabButton
          active={tab === "shift"}
          label="Shift"
          count={`${slots.length} shift`}
          onClick={() => changeTab("shift")}
        />
      </div>

      <LiveNotice message={notice} />

      {tab === "operasional" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Outlet buka pukul"
            value={form.open}
            placeholder="07:00"
            onChange={(open) => setForm({ ...form, open })}
          />
          <Field
            label="Outlet tutup pukul"
            value={form.close}
            placeholder="22:00"
            onChange={(close) => setForm({ ...form, close })}
          />
          <div className="sm:col-span-2">
            <SelectField
              label="Minggu jadwal dimulai pada"
              value={form.weekStartsOn}
              onChange={(weekStartsOn) => setForm({ ...form, weekStartsOn })}
              options={WEEKDAY_LONG.map((name, index) => ({
                value: String(index),
                label: name,
              }))}
            />
          </div>
          <Button
            type="button"
            size="touch"
            className="sm:col-span-2"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await saveOutletSettings(database, actor, {
                  outletId: settings?.outletId,
                  openMinutes: parseMinutes(form.open),
                  closeMinutes: parseMinutes(form.close),
                  weekStartsOn: Number(form.weekStartsOn),
                })
                setNotice("Pengaturan operasional tersimpan.")
              } catch (err) {
                setNotice(err instanceof Error ? err.message : String(err))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Menyimpan…" : "Simpan operasional"}
          </Button>
        </div>
      )}

      {tab === "aturan" && (
        <div className="grid gap-4 sm:grid-cols-2">
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
            <Checkbox
              checked={form.weekend}
              onCheckedChange={(checked) =>
                setForm({ ...form, weekend: Boolean(checked) })
              }
            />
            Giliran weekend adil
          </label>
          <Button
            type="button"
            size="touch"
            className="sm:col-span-2"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await saveOutletSettings(database, actor, {
                  outletId: settings?.outletId,
                  maxConsecutiveWorkDays: Number(form.maxConsecutive),
                  targetDaysOffPerWeek: Number(form.targetOff),
                  graceLateMinutes: Number(form.grace),
                  hoursSkewPercent: Number(form.skew),
                  weekendFairnessEnabled: form.weekend,
                })
                setNotice("Aturan kerja tersimpan.")
              } catch (err) {
                setNotice(err instanceof Error ? err.message : String(err))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Menyimpan…" : "Simpan aturan"}
          </Button>
        </div>
      )}

      {tab === "shift" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {slots.map((slot, index) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlotId(slot.id)}
                  aria-pressed={selectedSlot?.id === slot.id}
                  className={cn(
                    "min-h-10 border px-3 text-sm transition-colors",
                    "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selectedSlot?.id === slot.id
                      ? "border-foreground bg-foreground text-background font-medium"
                      : "border-border bg-background text-foreground"
                  )}
                >
                  {slot.name || `Shift ${index + 1}`}
                </button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                onClick={async () => {
                  try {
                    const newId = await saveSlot(database, actor, {
                      name: `Shift ${slots.length + 1}`,
                      startMinutes: settings?.openMinutes ?? 7 * 60,
                      endMinutes: settings?.closeMinutes ?? 22 * 60,
                      sortOrder: slots.length + 1,
                      minStaffCount: 1,
                      isActive: true,
                    })
                    setSelectedSlotId(newId)
                    setNotice("Slot baru berhasil dibuat.")
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : String(err))
                  }
                }}
              >
                + Tambah slot
              </Button>
            </div>

            <Pagination
              page={currentSlotIndex + 1}
              pageCount={slots.length}
              onPage={(p) => setSelectedSlotId(slots[p - 1]?.id ?? "")}
            />
          </div>

          {selectedSlot ? (
            <SlotEditor
              key={selectedSlot.id}
              slot={selectedSlot}
              requirements={requirements.filter(
                (row) => row.templateId === selectedSlot.id
              )}
              onSave={async (next, roles) => {
                await saveSlot(database, actor, next)
                await saveRoleRequirements(database, actor, selectedSlot.id, roles)
                setNotice(`${next.name} tersimpan.`)
              }}
            />
          ) : (
            <div className="border bg-card p-6 text-center text-sm text-muted-foreground">
              Belum ada slot shift. Klik "+ Tambah slot" untuk membuat shift.
            </div>
          )}
        </div>
      )}
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
  ) => Promise<void>
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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(slot.name)
    setStart(formatMinutes(slot.startMinutes))
    setEnd(formatMinutes(slot.endMinutes))
    setMinStaff(String(slot.minStaffCount))
    setActive(slot.isActive)
    const next = { kasir: "0", barista: "0", kitchen: "0" }
    for (const row of requirements) next[row.role] = String(row.minCount)
    setRoles(next)
  }, [slot, requirements])

  return (
    <div className="grid gap-4 border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${slot.id}-nama`}
          label="Nama shift"
          value={name}
          onChange={setName}
        />
        <Field
          id={`${slot.id}-min`}
          label="Min total staff"
          value={minStaff}
          onChange={setMinStaff}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <Checkbox
          checked={active}
          onCheckedChange={(checked) => setActive(Boolean(checked))}
        />
        Shift aktif
      </label>
      <Button
        type="button"
        size="touch"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            await onSave(
              {
                id: slot.id,
                name,
                startMinutes: parseMinutes(start),
                endMinutes: parseMinutes(end),
                sortOrder: slot.sortOrder,
                minStaffCount: Number(minStaff) || 0,
                isActive: active,
              },
              FLOOR_ROLES.map((role) => ({
                role,
                minCount: Number(roles[role]) || 0,
              }))
            )
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? "Menyimpan…" : "Simpan shift"}
      </Button>
    </div>
  )
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 flex-col items-start justify-center border px-4 py-2 text-left transition-colors",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "border-foreground bg-card font-medium"
          : "border-border bg-background text-muted-foreground"
      )}
    >
      <span className="text-base font-medium text-foreground">{label}</span>
      {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
    </button>
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
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}) {
  const id = idProp ?? label.replace(/\s+/g, "-").toLowerCase()
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-sm font-medium">{label}</span>
      <Input
        id={id}
        className={fieldClass}
        value={value}
        placeholder={placeholder}
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

