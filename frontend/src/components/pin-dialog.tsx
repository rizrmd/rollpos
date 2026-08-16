import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function PinDialog({
  open,
  title,
  description,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (pin: string) => Promise<void> | void
}) {
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(next = pin) {
    if (next.length < 4) {
      setError("PIN minimal 4 digit.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(next)
      setPin("")
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function press(digit: string) {
    const next = (pin + digit).slice(0, 6)
    setPin(next)
    if (next.length >= 4 && digit !== "") {
      // wait for explicit OK
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setPin("")
          setError(null)
        }
        onOpenChange(value)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <p
          className="min-h-8 font-mono text-center text-2xl leading-8 tracking-[0.4em]"
          aria-label={pin ? `PIN ${pin.length} digit` : "PIN kosong"}
        >
          {pin ? pin.replace(/./g, "•") : "\u00A0"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].map((key) => (
            <Button
              key={key}
              type="button"
              variant={key === "OK" ? "default" : "outline"}
              disabled={busy}
              onClick={() => {
                if (key === "C") {
                  setPin("")
                  setError(null)
                  return
                }
                if (key === "OK") {
                  void submit()
                  return
                }
                setError(null)
                press(key)
              }}
            >
              {key}
            </Button>
          ))}
        </div>
        <p
          className="min-h-5 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {error ?? "\u00A0"}
        </p>
      </DialogContent>
    </Dialog>
  )
}
