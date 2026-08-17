import type { Database } from "@/db/database"
import { useState } from "react"

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
import { Label } from "@/components/ui/label"
import { changeStaffPin } from "@/db/staffing-write"
import { canManage, canResetStaffPin } from "@/lib/permissions"
import { validatePin } from "@/lib/pin"
import type { StaffRecord } from "@/lib/types"

export function PinScreen({
  database,
  staff,
  actor = null,
}: {
  database: Database
  staff: StaffRecord[]
  actor?: StaffRecord | null
}) {
  const [who, setWho] = useState<StaffRecord | null>(null)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeStaff = staff.filter((member) => member.isActive)
  const skipCurrentPin = canResetStaffPin(actor, who?.id ?? "")
  const managerCanResetOthers = Boolean(actor && canManage(actor.roles))

  function resetForm() {
    setCurrentPin("")
    setNewPin("")
    setConfirmation("")
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Ubah PIN</CardTitle>
          <CardDescription>
            {managerCanResetOthers
              ? "PIN sendiri tetap butuh PIN lama. PIN karyawan lain bisa diganti langsung."
              : "Pilih nama, masukkan PIN saat ini, lalu buat PIN baru 4–6 digit."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LiveNotice message={notice} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Siapa yang mengubah PIN?</legend>
            <div className="flex flex-wrap gap-2">
              {activeStaff.map((member) => (
                <Button
                  key={member.id}
                  type="button"
                  size="touch"
                  variant={who?.id === member.id ? "default" : "outline"}
                  aria-pressed={who?.id === member.id}
                  onClick={() => {
                    setWho(member)
                    resetForm()
                    setNotice(null)
                  }}
                >
                  {member.nickname || member.name}
                </Button>
              ))}
            </div>
          </fieldset>

          {who ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault()
                const validationError = validatePin(newPin)
                if (validationError) return setError(validationError)
                if (newPin !== confirmation)
                  return setError("Konfirmasi PIN baru tidak sama.")
                setBusy(true)
                setError(null)
                try {
                  await changeStaffPin(
                    database,
                    who.id,
                    skipCurrentPin ? "" : currentPin,
                    newPin,
                    actor
                  )
                  setNotice(`PIN ${who.nickname || who.name} berhasil diubah.`)
                  resetForm()
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {skipCurrentPin ? null : (
                <PinField
                  id="pin-current"
                  label="PIN saat ini"
                  value={currentPin}
                  onChange={setCurrentPin}
                  autoFocus
                />
              )}
              <PinField
                id="pin-new"
                label="PIN baru"
                value={newPin}
                onChange={setNewPin}
                autoFocus={skipCurrentPin}
              />
              <PinField
                id="pin-confirm"
                label="Ulangi PIN baru"
                value={confirmation}
                onChange={setConfirmation}
              />
              <p className="min-h-5 text-sm text-destructive" role="alert">
                {error ?? "\u00A0"}
              </p>
              <Button
                type="submit"
                size="touch"
                disabled={
                  busy ||
                  (!skipCurrentPin && !currentPin) ||
                  !newPin ||
                  !confirmation
                }
              >
                {busy ? "Menyimpan…" : "Simpan PIN baru"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {managerCanResetOthers
                ? "Pilih nama. PIN karyawan lain tidak perlu PIN lama."
                : "Pilih nama dulu. PIN lama wajib benar sebelum PIN baru tersimpan."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PinField({
  id,
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="min-h-12 text-lg tracking-[0.35em]"
        value={value}
        maxLength={6}
        autoFocus={autoFocus}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </div>
  )
}
