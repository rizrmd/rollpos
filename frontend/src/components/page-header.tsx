import { useEffect, useRef, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

export function PageHeader({
  title,
  description,
  onBack,
  backLabel = "Kembali ke menu",
  trailing,
}: {
  title: string
  description?: string
  onBack?: () => void
  backLabel?: string
  trailing?: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [title])

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            onClick={onBack}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-5" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-none"
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  )
}

export function LiveNotice({
  message,
  tone = "info",
}: {
  message: string | null
  tone?: "info" | "error"
}) {
  if (!message) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        tone === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {message}
    </p>
  )
}
