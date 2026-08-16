import type { ReactNode } from "react"
import { ChevronRight, Coffee, Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatIsoLong } from "@/lib/format"
import { NAV_BY_ID, visibleNavGroups, type AppPage, type NavItem } from "@/lib/nav"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function AppSidebar({
  today,
  nowLabel,
  page,
  actor,
  onOpen,
  onUnlock,
  onLock,
}: {
  today: string
  nowLabel: string
  page: AppPage
  actor: StaffRecord | null
  onOpen: (page: Exclude<AppPage, "menu">) => void
  onUnlock: () => void
  onLock: () => void
}) {
  const kasir = NAV_BY_ID["kasir"]
  const KasirIcon = kasir.icon
  const kasirActive = page === kasir.id

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Coffee className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight">
            Roll n Brew
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <time dateTime={today}>{formatIsoLong(today)}</time>
            <span aria-hidden="true"> · </span>
            <span>{nowLabel}</span>
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => onOpen(kasir.id)}
          aria-current={kasirActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-primary-foreground transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            kasirActive
              ? "bg-primary/95 shadow-sm"
              : "bg-primary shadow-sm hover:bg-primary/90"
          )}
        >
          <KasirIcon className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Kasir</span>
          <span className="text-xs font-normal text-primary-foreground/70">
            Jual &amp; bayar
          </span>
          <ChevronRight
            className="size-4 shrink-0 opacity-70"
            aria-hidden="true"
          />
        </button>
      </div>

      <nav
        aria-label="Menu utama"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3 pt-4"
      >
        {visibleNavGroups(actor?.roles).map((group) => {
          const items = group.items.filter((item) => item.id !== "kasir")
          if (items.length === 0) return null
          return (
            <NavGroup
              key={group.id}
              title={group.title}
              items={items}
              page={page}
              onOpen={onOpen}
            />
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {actor ? (
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-2 pl-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              {initialsOf(actor.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{actor.nickname}</p>
              <p className="truncate text-xs text-muted-foreground">
                Mode atur aktif
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onLock}
              aria-label="Kunci mode atur"
              title="Kunci mode atur"
            >
              <LockOpen className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full justify-start"
            onClick={onUnlock}
          >
            <Lock className="size-5" />
            Buka mode atur
          </Button>
        )}
      </div>
    </aside>
  )
}

function NavGroup({
  title,
  items,
  page,
  onOpen,
  children,
}: {
  title: string
  items: NavItem[]
  page: AppPage
  onOpen: (page: Exclude<AppPage, "menu">) => void
  children?: ReactNode
}) {
  const headingId = `nav-${title.toLowerCase()}`
  return (
    <div>
      <h2
        id={headingId}
        className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-0.5" aria-labelledby={headingId}>
        {items.map((item) => {
          const Icon = item.icon
          const current = page === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  current
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {!item.ready ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      current
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    segera
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}
