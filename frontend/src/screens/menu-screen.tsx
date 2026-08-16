import { ChevronRight, Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatIsoLong, formatJakartaClock } from "@/lib/format"
import { NAV_GROUPS, type AppPage, type NavItem } from "@/lib/nav"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"

export function MenuScreen({
  today,
  nowLabel,
  actor,
  onOpen,
  onUnlock,
  onLock,
}: {
  today: string
  nowLabel: string
  actor: StaffRecord | null
  onOpen: (page: Exclude<AppPage, "menu">) => void
  onUnlock: () => void
  onLock: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <header>
        <p className="text-sm text-muted-foreground">Roll n Brew</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Menu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <time dateTime={today}>{formatIsoLong(today)}</time>
          <span aria-hidden="true"> · </span>
          <span>{nowLabel}</span>
        </p>
      </header>

      {NAV_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`menu-${group.id}`}>
          <h2
            id={`menu-${group.id}`}
            className="mb-3 text-sm font-medium text-muted-foreground"
          >
            {group.title}
          </h2>
          <ul
            className={
              group.id === "inti"
                ? "grid gap-3"
                : "grid gap-3 sm:grid-cols-2"
            }
          >
            {group.items.map((item) => (
              <li key={item.id} className={item.id === "kasir" ? "sm:col-span-2" : undefined}>
                <MenuCard item={item} featured={item.id === "kasir"} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="menu-kunci">
        <h2 id="menu-kunci" className="mb-3 text-sm font-medium text-muted-foreground">
          Mode atur
        </h2>
        {actor ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Terbuka sebagai <span className="font-medium">{actor.name}</span>. Jadwal,
              orang, stok, dan laporan bisa diubah.
            </p>
            <Button type="button" variant="outline" size="touch" onClick={onLock}>
              <LockOpen className="size-5" />
              Kunci mode atur
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full justify-start sm:w-auto"
            onClick={onUnlock}
          >
            <Lock className="size-5" />
            Buka mode atur
            <span className="text-muted-foreground">PIN owner atau manager</span>
          </Button>
        )}
      </section>
    </div>
  )
}

function MenuCard({
  item,
  featured,
  onOpen,
}: {
  item: NavItem
  featured?: boolean
  onOpen: (page: Exclude<AppPage, "menu">) => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border bg-card px-4 py-4 text-left transition-colors",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        featured ? "min-h-28 border-foreground/20" : "min-h-24"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-muted",
          featured ? "size-14" : "size-12"
        )}
      >
        <Icon className={featured ? "size-7" : "size-6"} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium", featured ? "text-xl" : "text-lg")}>
          {item.label}
          {!item.ready ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              segera
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{item.hint}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

export function menuNowLabel(at = new Date()): string {
  return formatJakartaClock(at)
}
