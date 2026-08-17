import type { ReactNode } from "react"
import { ChevronRight, Coffee, Lock, LockOpen, PanelLeftClose } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OnDutyStrip } from "@/components/on-duty-board"
import { formatIsoLong } from "@/lib/format"
import {
  NAV_BY_ID,
  isNavBranch,
  navEntryContainsPage,
  visibleNavGroups,
  type AppPage,
  type NavEntry,
  type NavItem,
} from "@/lib/nav"
import type { OnDutyEntry } from "@/lib/on-duty"
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
  onDuty,
  onOpen,
  onUnlock,
  onLock,
  onCollapse,
}: {
  today: string
  nowLabel: string
  page: AppPage
  actor: StaffRecord | null
  onDuty: readonly OnDutyEntry[]
  onOpen: (page: Exclude<AppPage, "menu">) => void
  onUnlock: () => void
  onLock: () => void
  onCollapse: () => void
}) {
  const kasir = NAV_BY_ID["kasir"]
  const KasirIcon = kasir.icon
  const kasirActive = page === kasir.id

  return (
    <aside
      id="app-sidebar"
      className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-3">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          aria-label="Sembunyikan menu"
          aria-expanded={true}
          aria-controls="app-sidebar"
          title="Sembunyikan menu"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => onOpen("today")}
          className={cn(
            "mb-3 w-full rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3 text-left",
            "hover:bg-sidebar-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          )}
          aria-label="Lihat siapa yang sedang masuk"
        >
          <OnDutyStrip entries={onDuty} />
        </button>
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
                Pengaturan aktif
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onLock}
              aria-label="Kunci pengaturan"
              title="Kunci pengaturan"
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
            Pengaturan
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
  items: NavEntry[]
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
        {items.map((entry) => (
          <NavEntryRow
            key={entry.id}
            entry={entry}
            page={page}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

function NavEntryRow({
  entry,
  page,
  onOpen,
}: {
  entry: NavEntry
  page: AppPage
  onOpen: (page: Exclude<AppPage, "menu">) => void
}) {
  if (isNavBranch(entry)) {
    const open = navEntryContainsPage(entry, page)
    return (
      <li>
        <p
          className={cn(
            "px-3 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground",
            open && "text-foreground"
          )}
        >
          {entry.label}
        </p>
        <ul className="flex flex-col gap-0.5 pl-2">
          {entry.children.map((item) => (
            <li key={item.id}>
              <NavLeafButton item={item} page={page} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </li>
    )
  }

  return (
    <li>
      <NavLeafButton item={entry} page={page} onOpen={onOpen} />
    </li>
  )
}

function NavLeafButton({
  item,
  page,
  onOpen,
}: {
  item: NavItem
  page: AppPage
  onOpen: (page: Exclude<AppPage, "menu">) => void
}) {
  const Icon = item.icon
  const current = page === item.id
  return (
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
  )
}
