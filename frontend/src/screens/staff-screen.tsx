import type { Database } from "@/db/database"
import { useMemo, useState } from "react"

import { LiveNotice } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertStaff } from "@/db/staffing-write"
import { capitalizePersonName } from "@/lib/format"
import { canGrantLeadership } from "@/lib/permissions"
import { formatMinutes } from "@/lib/time"
import {
  FLOOR_ROLES,
  STAFF_ROLES,
  type SlotRecord,
  type StaffRecord,
  type StaffRole,
} from "@/lib/types"

export function StaffScreen({
  database,
  actor,
  staff,
  slots,
}: {
  database: Database
  actor: StaffRecord
  staff: StaffRecord[]
  slots: SlotRecord[]
}) {
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<StaffRecord | "new" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return staff.filter((member) => {
      if (!needle) return true
      return (
        member.name.toLowerCase().includes(needle) ||
        member.nickname.toLowerCase().includes(needle) ||
        member.roles.some((role) => role.includes(needle))
      )
    })
  }, [query, staff])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="cari-orang" className="sr-only">
          Cari orang
        </Label>
        <Input
          id="cari-orang"
          className="min-h-12"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama atau role"
        />
        <Button type="button" size="touch" onClick={() => setEditing("new")}>
          Tambah
        </Button>
      </div>
      <LiveNotice message={notice} />
      <ul className="flex flex-col gap-2">
        {filtered.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => setEditing(member)}
              className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span>
                <span className="block font-medium">{member.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {member.roles.join(" · ") || "tanpa role"}
                  {preferredShiftLabel(member, slots)}
                  {member.isActive ? "" : " · nonaktif"}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">Ubah</span>
            </button>
          </li>
        ))}
      </ul>

      <StaffDialog
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        member={editing === "new" ? undefined : (editing ?? undefined)}
        actor={actor}
        slots={slots}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSave={async (input) => {
          await upsertStaff(database, actor, input)
          setNotice(`${input.name} tersimpan.`)
          setEditing(null)
        }}
      />
    </div>
  )
}

function StaffDialog({
  open,
  member,
  actor,
  slots,
  onOpenChange,
  onSave,
}: {
  open: boolean
  member?: StaffRecord
  actor: StaffRecord
  slots: SlotRecord[]
  onOpenChange: (open: boolean) => void
  onSave: (input: {
    id?: string
    name: string
    nickname: string
    pin?: string
    isActive: boolean
    roles: StaffRole[]
    preferredTemplateIds: string[]
  }) => Promise<void>
}) {
  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const [name, setName] = useState(member?.name ?? "")
  const [pin, setPin] = useState("")
  const [active, setActive] = useState(member?.isActive ?? true)
  const [roles, setRoles] = useState<StaffRole[]>(member?.roles ?? ["kasir"])
  const [preferred, setPreferred] = useState<string[]>(() =>
    initialPreferred(member, activeSlots)
  )
  const [error, setError] = useState<string | null>(null)
  const canLead = canGrantLeadership(actor.roles)

  function toggle(role: StaffRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    )
  }

  function toggleShift(templateId: string) {
    setPreferred((current) =>
      current.includes(templateId)
        ? current.filter((item) => item !== templateId)
        : [...current, templateId]
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(member?.name ?? "")
          setPin("")
          setActive(member?.isActive ?? true)
          setRoles(member?.roles ?? ["kasir"])
          setPreferred(initialPreferred(member, activeSlots))
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{member ? member.name : "Staff baru"}</DialogTitle>
          <DialogDescription>Satu orang boleh merangkap role.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              const personName = capitalizePersonName(name.trim())
              await onSave({
                id: member?.id,
                name: personName,
                nickname: personName,
                pin: pin || undefined,
                isActive: active,
                roles,
                preferredTemplateIds: storedPreferred(preferred, activeSlots),
              })
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="staff-name">Nama</Label>
            <Input
              id="staff-name"
              className="min-h-12"
              value={name}
              onChange={(event) => setName(capitalizePersonName(event.target.value))}
              autoCapitalize="words"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="staff-pin">
              {member ? "PIN baru (opsional)" : "PIN"}
            </Label>
            <Input
              id="staff-pin"
              className="min-h-12"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              required={!member}
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Stasiun</legend>
            <div className="flex flex-wrap gap-3">
              {FLOOR_ROLES.map((role) => (
                <label key={role} className="flex min-h-12 items-center gap-2 text-sm">
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={() => toggle(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Preferensi shift</legend>
            {activeSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada slot shift. Tambah di pengaturan outlet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {activeSlots.map((slot) => (
                  <label key={slot.id} className="flex min-h-12 items-center gap-2 text-sm">
                    <Checkbox
                      checked={preferred.includes(slot.id)}
                      onCheckedChange={() => toggleShift(slot.id)}
                    />
                    {slot.name}
                    <span className="text-muted-foreground">
                      {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Pimpinan</legend>
            <div className="flex flex-wrap gap-3">
              {STAFF_ROLES.filter((role) => role === "owner" || role === "manager").map(
                (role) => (
                  <label key={role} className="flex min-h-12 items-center gap-2 text-sm">
                    <Checkbox
                      checked={roles.includes(role)}
                      disabled={!canLead}
                      onCheckedChange={() => toggle(role)}
                    />
                    {role}
                  </label>
                )
              )}
            </div>
          </fieldset>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <Checkbox
              checked={active}
              onCheckedChange={(checked) => setActive(Boolean(checked))}
            />
            Aktif
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" size="touch">
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function preferredShiftLabel(member: StaffRecord, slots: SlotRecord[]): string {
  const names = (member.preferredTemplateIds ?? [])
    .map((id) => slots.find((slot) => slot.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  return names.length > 0 ? ` · ${names.join("/")}` : ""
}

function initialPreferred(member: StaffRecord | undefined, slots: SlotRecord[]): string[] {
  const saved = member?.preferredTemplateIds ?? []
  if (saved.length > 0) return saved.filter((id) => slots.some((slot) => slot.id === id))
  return slots.map((slot) => slot.id)
}

/** Semua atau tidak ada = tanpa preferensi (bisa isi shift mana saja). */
function storedPreferred(selected: string[], slots: SlotRecord[]): string[] {
  if (selected.length === 0 || selected.length === slots.length) return []
  return slots.filter((slot) => selected.includes(slot.id)).map((slot) => slot.id)
}
