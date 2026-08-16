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
        if (!value) setPin("")
        onOpenChange(value)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <p className="font-mono text-center text-2xl tracking-[0.4em]">
          {pin.replace(/./g, "•") || "••••"}
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
                press(key)
              }}
            >
              {key}
            </Button>
          ))}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
