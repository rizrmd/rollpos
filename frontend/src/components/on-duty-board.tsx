import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  formatDuration,
  formatOccurredClock,
} from "@/lib/format"
import { onDutyLabel, type OnDutyEntry } from "@/lib/on-duty"
import { cn } from "@/lib/utils"

function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function displayName(entry: OnDutyEntry): string {
  return entry.staff.nickname || entry.staff.name
}

function slotLine(entry: OnDutyEntry): string {
  if (entry.slot) {
    return entry.assignment?.dutyRole
      ? `${entry.slot.name} · ${entry.assignment.dutyRole}`
      : entry.slot.name
  }
  return "Tidak di jadwal"
}

function sinceLine(entry: OnDutyEntry, now: number): string {
  if (entry.clockInAt == null) return "Sedang masuk"
  return `masuk ${formatOccurredClock(entry.clockInAt)} · ${formatDuration(entry.clockInAt, now)}`
}

export function OnDutyBoard({
  entries,
  className,
}: {
  entries: readonly OnDutyEntry[]
  className?: string
}) {
  const now = useNow()
  return (
    <section aria-labelledby="sedang-masuk-heading">
      <Card className={cn("border-primary/25 bg-primary/5", className)}>
        <CardHeader>
          <CardTitle
            id="sedang-masuk-heading"
            className="flex items-center justify-between gap-2"
          >
            <span>Sedang masuk</span>
            <Badge variant={entries.length > 0 ? "default" : "outline"}>
              {entries.length}
            </Badge>
          </CardTitle>
          <CardDescription>{onDutyLabel(entries.length)}</CardDescription>
        </CardHeader>
        {entries.length > 0 ? (
          <CardContent>
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.staff.id}
                  className="flex flex-col gap-1 rounded-lg border border-primary/15 bg-background/80 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{displayName(entry)}</p>
                    <p className="text-sm text-muted-foreground">
                      {slotLine(entry)}
                    </p>
                  </div>
                  <p className="text-sm font-medium sm:shrink-0 sm:text-right">
                    {sinceLine(entry, now)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>
    </section>
  )
}

export function OnDutyStrip({
  entries,
  className,
}: {
  entries: readonly OnDutyEntry[]
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Sedang masuk
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.staff.id}
              className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
            >
              {displayName(entry)}
              {entry.clockInAt != null ? (
                <span className="ml-1 font-normal opacity-80">
                  {formatOccurredClock(entry.clockInAt)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OnDutyBanner({
  entries,
  onOpen,
}: {
  entries: readonly OnDutyEntry[]
  onOpen: () => void
}) {
  const now = useNow()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-4 text-left",
        "hover:bg-primary/10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Sedang masuk</span>
        <Badge variant={entries.length > 0 ? "default" : "outline"}>
          {entries.length}
        </Badge>
      </span>
      {entries.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          Belum ada yang clock-in. Ketuk untuk buka papan hari ini.
        </span>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li key={entry.staff.id} className="text-sm">
              <span className="font-medium">{displayName(entry)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {sinceLine(entry, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  )
}
