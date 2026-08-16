import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Clock3,
  Lock,
  LockOpen,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatIsoLong, formatJakartaClock } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"

export type AppPage =
  | "menu"
  | "clock"
  | "today"
  | "prefs"
  | "week"
  | "staff"
  | "settings"
  | "catalog"

type MenuItem = {
  id: Exclude<AppPage, "menu">
  label: string
  hint: string
  icon: typeof Clock3
  locked?: boolean
}

export const FLOOR_ITEMS: MenuItem[] = [
  { id: "clock", label: "Masuk", hint: "Clock-in dan clock-out dengan PIN", icon: Clock3 },
  { id: "today", label: "Hari ini", hint: "Siapa jaga, siapa sudah datang", icon: CalendarDays },
  { id: "prefs", label: "Preferensi", hint: "Pilih shift dan minta libur minggu depan", icon: SlidersHorizontal },
]

export const MANAGE_ITEMS: MenuItem[] = [
  { id: "week", label: "Jadwal", hint: "Papan minggu, inbox libur, publish", icon: CalendarRange },
  { id: "staff", label: "Orang", hint: "Tambah staff, role, dan PIN", icon: Users },
  { id: "settings", label: "Outlet", hint: "Jam buka, slot shift, aturan adil", icon: Settings },
]

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

      <section aria-labelledby="menu-lantai">
        <h2 id="menu-lantai" className="mb-3 text-sm font-medium text-muted-foreground">
          Lantai
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FLOOR_ITEMS.map((item) => (
            <li key={item.id}>
              <MenuCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="menu-atur">
        <h2 id="menu-atur" className="mb-3 text-sm font-medium text-muted-foreground">
          Pengaturan
        </h2>
        {actor ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Mode atur terbuka sebagai{" "}
              <span className="font-medium">{actor.name}</span>.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {MANAGE_ITEMS.map((item) => (
                <li key={item.id}>
                  <MenuCard item={item} onOpen={onOpen} />
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="touch" onClick={onLock}>
              <LockOpen className="size-5" />
              Kunci mode atur
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="touch" className="w-full justify-start sm:w-auto" onClick={onUnlock}>
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
  onOpen,
}: {
  item: MenuItem
  onOpen: (page: Exclude<AppPage, "menu">) => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={cn(
        "flex min-h-24 w-full items-center gap-4 rounded-2xl border bg-card px-4 py-4 text-left transition-colors",
        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium">{item.label}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{item.hint}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

export function menuNowLabel(at = new Date()): string {
  return formatJakartaClock(at)
}
