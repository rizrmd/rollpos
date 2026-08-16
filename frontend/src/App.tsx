import { useEffect, useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { LiveNotice, PageHeader } from "@/components/page-header"
import { PinDialog } from "@/components/pin-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { authenticateStaff } from "@/db/staffing-write"
import { seedStaffingIfEmpty } from "@/db/seed"
import { useLandscape } from "@/hooks/use-landscape"
import { useStaffing } from "@/hooks/use-staffing"
import { canManage } from "@/lib/permissions"
import {
  formatIsoLong,
  formatJakartaClock,
  formatWeekRange,
} from "@/lib/format"
import type { StaffRecord } from "@/lib/types"
import { CatalogScreen } from "@/screens/catalog-screen"
import { ClockScreen } from "@/screens/clock-screen"
import { ComingSoonScreen } from "@/screens/coming-soon-screen"
import { MenuScreen } from "@/screens/menu-screen"
import { PrefsScreen } from "@/screens/prefs-screen"
import { SettingsScreen } from "@/screens/settings-screen"
import { StaffScreen } from "@/screens/staff-screen"
import { TodayScreen } from "@/screens/today-screen"
import { WeekScreen } from "@/screens/week-screen"
import {
  DEFAULT_PAGE,
  MANAGE_PAGES,
  NAV_BY_ID,
  type AppPage,
} from "@/lib/nav"

export function App() {
  const staffing = useStaffing()
  const landscape = useLandscape()
  const [actor, setActor] = useState<StaffRecord | null>(null)
  const [page, setPage] = useState<AppPage>("menu")
  const [unlockWho, setUnlockWho] = useState<StaffRecord | null>(null)
  const [pickManager, setPickManager] = useState(false)
  const [pendingPage, setPendingPage] = useState<Exclude<AppPage, "menu"> | null>(
    null
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [nowLabel, setNowLabel] = useState(() => formatJakartaClock())

  useEffect(() => {
    const timer = window.setInterval(() => setNowLabel(formatJakartaClock()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!staffing.ready) return
    void seedStaffingIfEmpty(staffing.database)
      .then(() => staffing.refresh())
      .catch((err: unknown) =>
        setNotice(err instanceof Error ? err.message : String(err))
      )
  }, [staffing.database, staffing.ready, staffing.refresh])

  useEffect(() => {
    if (landscape && page === "menu") setPage(DEFAULT_PAGE)
  }, [landscape, page])

  const managers = staffing.staff.filter(
    (member) => member.isActive && canManage(member.roles)
  )

  function goMenu() {
    setPage("menu")
  }

  function lock() {
    setActor(null)
    if (MANAGE_PAGES.has(page)) {
      setPage(landscape ? DEFAULT_PAGE : "menu")
    }
  }

  function openPage(next: Exclude<AppPage, "menu">) {
    if (MANAGE_PAGES.has(next) && !actor) {
      setPendingPage(next)
      startUnlock()
      return
    }
    setPage(next)
  }

  function startUnlock() {
    if (managers.length === 1) {
      setUnlockWho(managers[0])
      return
    }
    if (managers.length > 1) {
      setPickManager(true)
      return
    }
    setNotice("Belum ada owner atau manager.")
  }

  const item = page === "menu" ? null : NAV_BY_ID[page]
  const meta = item
    ? {
        title: item.label,
        description:
          page === "clock"
            ? `Clock-in / pulang · ${formatIsoLong(staffing.today)}`
            : page === "today"
              ? formatIsoLong(staffing.today)
              : page === "prefs"
                ? `Minggu depan · ${formatWeekRange(staffing.upcomingWeekStart)}`
                : item.hint,
      }
    : null
  const content = !staffing.ready ? (
    <p className="text-sm text-muted-foreground">Membuka database lokal…</p>
  ) : page === "clock" ? (
    <ClockScreen
      database={staffing.database}
      staff={staffing.staff}
      slots={staffing.slots}
      assignments={staffing.assignments}
      attendance={staffing.attendance}
      offs={staffing.offs}
      openByStaff={staffing.openByStaff}
      today={staffing.today}
    />
  ) : page === "today" ? (
    <TodayScreen
      today={staffing.today}
      settings={staffing.settings}
      staff={staffing.staff}
      slots={staffing.slots}
      assignments={staffing.assignments}
      attendance={staffing.attendance}
      offs={staffing.offs}
      openByStaff={staffing.openByStaff}
    />
  ) : page === "week" && actor ? (
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
  ) : page === "prefs" ? (
    <PrefsScreen
      database={staffing.database}
      staff={staffing.staff}
      slots={staffing.slots}
      suggestions={staffing.suggestions}
      preferences={staffing.preferences}
      settings={staffing.settings}
      weekStart={staffing.upcomingWeekStart}
    />
  ) : page === "staff" && actor ? (
    <StaffScreen
      database={staffing.database}
      actor={actor}
      staff={staffing.staff}
    />
  ) : page === "settings" && actor ? (
    <SettingsScreen
      database={staffing.database}
      actor={actor}
      settings={staffing.settings}
      slots={staffing.slots}
      requirements={staffing.requirements}
    />
  ) : page === "products" ? (
    <CatalogScreen />
  ) : page === "menu" ? null : item && !item.ready ? (
    <ComingSoonScreen item={item} />
  ) : MANAGE_PAGES.has(page) && !actor ? (
    <p className="text-sm text-muted-foreground">Buka mode atur untuk melihat halaman ini.</p>
  ) : (
    <p className="text-sm text-muted-foreground">Halaman tidak ditemukan.</p>
  )

  const managerPickDialog = (
    <Dialog open={pickManager} onOpenChange={setPickManager}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Siapa yang membuka mode atur?</DialogTitle>
          <DialogDescription>Pilih owner atau manager, lalu masukkan PIN.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {managers.map((member) => (
            <li key={member.id}>
              <Button
                type="button"
                size="touch"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setPickManager(false)
                  setUnlockWho(member)
                }}
              >
                {member.name}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )

  const pinDialog = (
    <PinDialog
      open={Boolean(unlockWho)}
      title={unlockWho ? `Mode atur · ${unlockWho.name}` : "PIN"}
      description="Owner atau manager tidak wajib sudah clock-in."
      onOpenChange={(open) => {
        if (!open) {
          setUnlockWho(null)
          setPendingPage(null)
        }
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
        if (pendingPage) setPage(pendingPage)
        else if (landscape) setPage("week")
        setPendingPage(null)
      }}
    />
  )

  if (landscape) {
    return (
      <div className="flex h-svh bg-background">
        <a href="#konten" className="skip-link">
          Langsung ke konten
        </a>
        <AppSidebar
          today={staffing.today}
          nowLabel={nowLabel}
          page={page}
          actor={actor}
          onOpen={openPage}
          onUnlock={startUnlock}
          onLock={lock}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {meta ? (
            <PageHeader title={meta.title} description={meta.description} />
          ) : null}
          <main id="konten" tabIndex={-1} className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-4">
              <LiveNotice message={notice ?? staffing.error} tone="error" />
              {content}
            </div>
          </main>
        </div>
        {pinDialog}
        {managerPickDialog}
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <a href="#konten" className="skip-link">
        Langsung ke konten
      </a>
      {page === "menu" ? null : meta ? (
        <PageHeader
          title={meta.title}
          description={meta.description}
          onBack={goMenu}
        />
      ) : null}
      <main id="konten" tabIndex={-1} className="min-h-0 flex-1 overflow-auto">
        {page === "menu" ? (
          <MenuScreen
            today={staffing.today}
            nowLabel={nowLabel}
            actor={actor}
            onOpen={openPage}
            onUnlock={startUnlock}
            onLock={lock}
          />
        ) : (
          <div className="mx-auto w-full max-w-5xl px-4 py-4">
            <LiveNotice message={notice ?? staffing.error} tone="error" />
            {content}
          </div>
        )}
      </main>
      {pinDialog}
      {managerPickDialog}
    </div>
  )
}

export default App
