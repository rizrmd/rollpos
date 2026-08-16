import { useState } from "react"
import { KeyRound } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { validatePin } from "@/lib/pin"

export function ChangePinDialog({
  open,
  staffName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  staffName: string
  onOpenChange: (open: boolean) => void
  onSubmit: (currentPin: string, newPin: string) => Promise<void>
}) {
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCurrentPin("")
    setNewPin("")
    setConfirmation("")
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>Ubah PIN {staffName}</DialogTitle>
          <DialogDescription>
            Verifikasi PIN saat ini, lalu buat PIN baru 4–6 digit.
          </DialogDescription>
        </DialogHeader>
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
              await onSubmit(currentPin, newPin)
              reset()
              onOpenChange(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <PinField
            id="pin-current"
            label="PIN saat ini"
            value={currentPin}
            onChange={setCurrentPin}
            autoFocus
          />
          <PinField
            id="pin-new"
            label="PIN baru"
            value={newPin}
            onChange={setNewPin}
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
          <DialogFooter>
            <Button
              type="submit"
              size="touch"
              disabled={busy || !currentPin || !newPin || !confirmation}
            >
              {busy ? "Menyimpan…" : "Simpan PIN baru"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
