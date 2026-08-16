import { useState } from "react"
import { Delete, KeyRound, ShieldCheck } from "lucide-react"

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
  actionLabel,
  onAction,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  onOpenChange: (open: boolean) => void
  onSubmit: (pin: string) => Promise<void> | void
}) {
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(next = pin) {
    if (next.length < 4) {
      setError("Masukkan minimal 4 digit.")
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
      <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
        <div
          className="flex flex-col gap-5 p-5"
          tabIndex={0}
          autoFocus
          onKeyDown={(event) => {
            if (/^\d$/.test(event.key)) press(event.key)
            if (event.key === "Backspace") setPin((value) => value.slice(0, -1))
            if (event.key === "Enter") void submit()
          }}
        >
          <DialogHeader className="items-center text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <KeyRound className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div
            className="flex min-h-10 items-center justify-center gap-3"
            aria-label={pin ? `PIN ${pin.length} digit` : "PIN kosong"}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <span
                key={index}
                className={`size-3 rounded-full border-2 ${index < pin.length ? "border-primary bg-primary" : "border-muted-foreground/35"}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "hapus",
              "0",
              "masuk",
            ].map((key) => (
              <Button
                key={key}
                type="button"
                variant={key === "masuk" ? "default" : "outline"}
                className="h-14 text-lg font-semibold"
                disabled={busy}
                aria-label={
                  key === "hapus"
                    ? "Hapus digit terakhir"
                    : key === "masuk"
                      ? "Konfirmasi PIN"
                      : undefined
                }
                onClick={() => {
                  if (key === "hapus") {
                    setPin((value) => value.slice(0, -1))
                    setError(null)
                    return
                  }
                  if (key === "masuk") {
                    void submit()
                    return
                  }
                  setError(null)
                  press(key)
                }}
              >
                {key === "hapus" ? (
                  <Delete className="size-5" />
                ) : key === "masuk" ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  key
                )}
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
          {actionLabel && onAction ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPin("")
                setError(null)
                onAction()
              }}
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
