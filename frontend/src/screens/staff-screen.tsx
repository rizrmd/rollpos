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
import { staffFromStore } from "@/db/snapshot"
import { softDeleteStaff, upsertStaff } from "@/db/staffing-write"
import { capitalizePersonName } from "@/lib/format"
import { canGrantLeadership } from "@/lib/permissions"
import {
  preferredSlotIdsFromMember,
  preferredSlotIdsToStore,
} from "@/lib/staff-prefs"
import { formatMinutes } from "@/lib/time"
import {
  FLOOR_ROLES,
  STAFF_ROLES,
  isStaffDeleted,
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
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const liveStaff = staffFromStore(database)
  const editingMember =
    editingId && editingId !== "new"
      ? (liveStaff.find((member) => member.id === editingId) ??
        staff.find((member) => member.id === editingId))
      : undefined

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return liveStaff.filter((member) => {
      if (isStaffDeleted(member)) return false
      if (!needle) return true
      return (
        member.name.toLowerCase().includes(needle) ||
        member.nickname.toLowerCase().includes(needle) ||
        member.roles.some((role) => role.includes(needle))
      )
    })
  }, [query, liveStaff])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="cari-staff" className="sr-only">
          Cari staff
        </Label>
        <Input
          id="cari-staff"
          className="min-h-12"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama atau role"
        />
        <Button type="button" size="touch" onClick={() => setEditingId("new")}>
          Tambah
        </Button>
      </div>
      <LiveNotice message={notice} />
      <ul className="flex flex-col gap-2">
        {filtered.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => setEditingId(member.id)}
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
        key={editingId === "new" ? "new" : editingId ?? "closed"}
        open={editingId !== null && (editingId === "new" || Boolean(editingMember))}
        member={editingId === "new" ? undefined : editingMember}
        actor={actor}
        slots={slots}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        onSave={async (input) => {
          await upsertStaff(database, actor, input)
          setNotice(`${input.name} tersimpan.`)
          setEditingId(null)
        }}
        onDelete={async (member) => {
          await softDeleteStaff(database, actor, member.id)
          setNotice(`${member.name} dihapus.`)
          setEditingId(null)
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
  onDelete,
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
  onDelete: (member: StaffRecord) => Promise<void>
}) {
  const activeSlots = slots
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const [name, setName] = useState(member?.name ?? "")
  const [pin, setPin] = useState("")
  const [active, setActive] = useState(member?.isActive ?? true)
  const [roles, setRoles] = useState<StaffRole[]>(member?.roles ?? ["kasir"])
  const [preferred, setPreferred] = useState<string[]>(() =>
    preferredSlotIdsFromMember(member, activeSlots)
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const canLead = canGrantLeadership(actor.roles)

  function toggle(role: StaffRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    )
  }

  function setShiftChecked(templateId: string, checked: boolean) {
    setPreferred((current) => {
      if (checked) {
        return current.includes(templateId) ? current : [...current, templateId]
      }
      return current.filter((item) => item !== templateId)
    })
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
          setPreferred(preferredSlotIdsFromMember(member, activeSlots))
          setError(null)
          setConfirmDelete(false)
          setBusy(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{member ? member.name : "Staff baru"}</DialogTitle>
          <DialogDescription>Satu staff boleh merangkap role.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              setBusy(true)
              const personName = capitalizePersonName(name.trim())
              await onSave({
                id: member?.id,
                name: personName,
                nickname: personName,
                pin: member ? undefined : pin,
                isActive: active,
                roles,
                preferredTemplateIds: preferredSlotIdsToStore(preferred, activeSlots),
              })
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
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
          {member ? null : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="staff-pin">PIN</Label>
              <Input
                id="staff-pin"
                className="min-h-12"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                required
              />
            </div>
          )}
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
            <legend className="mb-2 text-sm font-medium">Pembagian shift</legend>
            {activeSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada slot shift. Tambah di pengaturan outlet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {activeSlots.map((slot) => (
                    <label key={slot.id} className="flex min-h-12 items-center gap-2 text-sm">
                      <Checkbox
                        checked={preferred.includes(slot.id)}
                        onCheckedChange={(checked) =>
                          setShiftChecked(slot.id, checked === true)
                        }
                      />
                      {slot.name}
                      <span className="text-muted-foreground">
                        {formatMinutes(slot.startMinutes)}–{formatMinutes(slot.endMinutes)}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Centang shift yang diisi. Kosong = tidak di-assign sama sekali.
                </p>
              </>
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
          <DialogFooter className={member ? "sm:justify-between" : undefined}>
            {member ? (
              <Button
                type="button"
                variant="destructive"
                size="touch"
                disabled={busy}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  try {
                    setBusy(true)
                    await onDelete(member)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                    setConfirmDelete(false)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {confirmDelete ? "Yakin hapus?" : "Hapus"}
              </Button>
            ) : null}
            <Button type="submit" size="touch" disabled={busy}>
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
