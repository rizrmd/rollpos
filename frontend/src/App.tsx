import { useEffect, useState } from "react"
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  Lock,
  LockOpen,
  Package,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react"

import { PinDialog } from "@/components/pin-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authenticateStaff } from "@/db/staffing-write"
import { seedStaffingIfEmpty } from "@/db/seed"
import { useStaffing } from "@/hooks/use-staffing"
import { canManage } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import type { StaffRecord } from "@/lib/types"
import { CatalogScreen } from "@/screens/catalog-screen"
import { ClockScreen } from "@/screens/clock-screen"
import { PrefsScreen } from "@/screens/prefs-screen"
import { SettingsScreen } from "@/screens/settings-screen"
import { StaffScreen } from "@/screens/staff-screen"
import { TodayScreen } from "@/screens/today-screen"
import { WeekScreen } from "@/screens/week-screen"

type Tab =
  | "clock"
  | "today"
  | "week"
  | "prefs"
  | "staff"
  | "settings"
  | "catalog"

const PUBLIC_TABS: { id: Tab; label: string; icon: typeof Clock3 }[] = [
  { id: "clock", label: "Clock", icon: Clock3 },
  { id: "today", label: "Hari ini", icon: CalendarDays },
  { id: "week", label: "Jadwal", icon: CalendarRange },
  { id: "prefs", label: "Pref", icon: SlidersHorizontal },
  { id: "catalog", label: "Katalog", icon: Package },
]

const MANAGE_TABS: { id: Tab; label: string; icon: typeof Clock3 }[] = [
  { id: "staff", label: "Staff", icon: Users },
  { id: "settings", label: "Atur", icon: Settings },
]

export function App() {
  const staffing = useStaffing()
  const [actor, setActor] = useState<StaffRecord | null>(null)
  const [tab, setTab] = useState<Tab>("clock")
  const [unlockWho, setUnlockWho] = useState<StaffRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!staffing.ready) return
    void seedStaffingIfEmpty(staffing.database)
      .then(() => staffing.refresh())
      .catch((err: unknown) =>
        setNotice(err instanceof Error ? err.message : String(err))
      )
  }, [staffing.database, staffing.ready, staffing.refresh])

  const managers = staffing.staff.filter(
    (member) => member.isActive && canManage(member.roles)
  )

  function lock() {
    setActor(null)
    if (tab === "staff" || tab === "settings") setTab("clock")
  }

  const navItems = actor ? [...PUBLIC_TABS, ...MANAGE_TABS] : PUBLIC_TABS

  return (
    <div className="flex h-svh flex-col bg-background">
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto h-full w-full max-w-5xl px-4 py-4">
          {notice ? (
            <p className="mb-3 text-sm text-destructive">{notice}</p>
          ) : null}
          {staffing.error ? (
            <p className="mb-3 text-sm text-destructive">{staffing.error}</p>
          ) : null}
          {!staffing.ready ? (
            <p className="text-sm text-muted-foreground">
              Membuka database lokal…
            </p>
          ) : tab === "clock" ? (
            <ClockScreen
              database={staffing.database}
              staff={staffing.staff}
              openByStaff={staffing.openByStaff}
            />
          ) : tab === "today" ? (
            <TodayScreen
              today={staffing.today}
              settings={staffing.settings}
              staff={staffing.staff}
              slots={staffing.slots}
              assignments={staffing.assignments}
              attendance={staffing.attendance}
              openByStaff={staffing.openByStaff}
            />
          ) : tab === "week" ? (
            <WeekScreen
              database={staffing.database}
              actor={actor}
              settings={staffing.settings}
              staff={staffing.staff}
              slots={staffing.slots}
              requirements={staffing.requirements}
              assignments={staffing.assignments}
              suggestions={staffing.suggestions}
              offs={staffing.offs}
              preferences={staffing.preferences}
              weekStart={staffing.thisWeekStart}
            />
          ) : tab === "prefs" ? (
            <PrefsScreen
              database={staffing.database}
              staff={staffing.staff}
              slots={staffing.slots}
              weekStart={staffing.upcomingWeekStart}
            />
          ) : tab === "staff" && actor ? (
            <StaffScreen
              database={staffing.database}
              actor={actor}
              staff={staffing.staff}
            />
          ) : tab === "settings" && actor ? (
            <SettingsScreen
              database={staffing.database}
              actor={actor}
              settings={staffing.settings}
              slots={staffing.slots}
            />
          ) : tab === "catalog" ? (
            <CatalogScreen />
          ) : null}
        </div>
      </main>

      <nav className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-5xl items-stretch gap-1 px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-5" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}

          {actor ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 flex-col gap-1 px-3 text-[11px]"
              onClick={lock}
            >
              <LockOpen className="size-5" />
              <span className="truncate">{actor.nickname}</span>
            </Button>
          ) : managers.length === 1 ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 flex-col gap-1 px-3 text-[11px]"
              onClick={() => setUnlockWho(managers[0])}
            >
              <Lock className="size-5" />
              Atur
            </Button>
          ) : managers.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-14 flex-col gap-1 px-3 text-[11px]"
                  />
                }
              >
                <Lock className="size-5" />
                Atur
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end">
                {managers.map((member) => (
                  <DropdownMenuItem
                    key={member.id}
                    onClick={() => setUnlockWho(member)}
                  >
                    {member.nickname}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </nav>

      <PinDialog
        open={Boolean(unlockWho)}
        title={unlockWho ? `Mode atur · ${unlockWho.name}` : "PIN"}
        description="Owner atau manager tidak wajib sudah clock-in."
        onOpenChange={(open) => {
          if (!open) setUnlockWho(null)
        }}
        onSubmit={async (pin) => {
          if (!unlockWho) return
          const member = await authenticateStaff(
            staffing.database,
            unlockWho.id,
            pin
          )
          if (!canManage(member.roles)) {
            throw new Error(
              "Hanya owner atau manager yang boleh membuka pengaturan."
            )
          }
          setActor(member)
        }}
      />
    </div>
  )
}

export default App
