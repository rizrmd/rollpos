import type { ReactNode } from "react"
import { Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatIsoLong } from "@/lib/format"
import { NAV_GROUPS, type AppPage, type NavItem } from "@/lib/nav"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"

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
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-background">
      <div className="border-b px-4 py-4">
        <p className="text-sm text-muted-foreground">Roll n Brew</p>
        <p className="mt-1 text-lg font-semibold tracking-tight">POS</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <time dateTime={today}>{formatIsoLong(today)}</time>
          <span aria-hidden="true"> · </span>
          <span>{nowLabel}</span>
        </p>
      </div>

      <nav
        aria-label="Menu utama"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-3"
      >
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.id}
            title={group.title}
            items={group.items}
            page={page}
            onOpen={onOpen}
          />
        ))}

        <div className="mt-auto pt-2">
          {actor ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full justify-start"
              onClick={onLock}
            >
              <LockOpen className="size-5" />
              Kunci · {actor.nickname}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full justify-start"
              onClick={onUnlock}
            >
              <Lock className="size-5" />
              Mode atur
            </Button>
          )}
        </div>
      </nav>
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
        className="mb-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-1" aria-labelledby={headingId}>
        {items.map((item) => {
          const Icon = item.icon
          const current = page === item.id
          const featured = item.id === "kasir"
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  featured ? "min-h-14" : "min-h-11",
                  current
                    ? "bg-primary text-primary-foreground"
                    : featured
                      ? "bg-muted text-foreground hover:bg-muted/80"
                      : "text-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {!item.ready ? (
                  <span
                    className={cn(
                      "text-[10px] font-normal",
                      current ? "text-primary-foreground/80" : "text-muted-foreground"
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
