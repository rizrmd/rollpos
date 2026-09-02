import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, PanelLeft } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { LiveNotice } from "@/components/page-header"
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
import { useAppPage } from "@/hooks/use-app-page"
import { useLandscape } from "@/hooks/use-landscape"
import { useStaffing } from "@/hooks/use-staffing"
import { canManage } from "@/lib/permissions"
import { formatJakartaClock } from "@/lib/format"
import {
  clearPinSession,
  readPinSession,
  savePinSession,
} from "@/lib/pin-session"
import { isStaffDeleted, type StaffRecord } from "@/lib/types"
import { CatalogScreen } from "@/screens/catalog-screen"
import { CashierScreen } from "@/screens/cashier-screen"
import { ClockScreen } from "@/screens/clock-screen"
import { ComingSoonScreen } from "@/screens/coming-soon-screen"
import { MenuScreen } from "@/screens/menu-screen"
import { KitchenScreen } from "@/screens/kitchen-screen"
import { PinScreen } from "@/screens/pin-screen"
import { PrefsScreen } from "@/screens/prefs-screen"
import { SettingsScreen } from "@/screens/settings-screen"
import { StockScreen } from "@/screens/stock-screen"
import { RecipesScreen } from "@/screens/recipes-screen"
import { StaffScreen } from "@/screens/staff-screen"
import { ScheduleScreen } from "@/screens/schedule-screen"
import {
  DEFAULT_PAGE,
  MANAGE_PAGES,
  NAV_BY_ID,
  canSeeNavItem,
  isSidebarDefaultOpen,
  pathForPage,
  shouldHandleInAppClick,
  type AppPage,
} from "@/lib/nav"

export function App() {
  const staffing = useStaffing()
  const landscape = useLandscape()
  const { page, navigate } = useAppPage()
  const [actorId, setActorId] = useState<string | null>(() => readPinSession())
  const [unlockWho, setUnlockWho] = useState<StaffRecord | null>(null)
  const [pickManager, setPickManager] = useState(false)
  const [pendingPage, setPendingPage] = useState<Exclude<
    AppPage,
    "menu"
  > | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [nowLabel, setNowLabel] = useState(() => formatJakartaClock())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const unlockAttemptedFor = useRef<AppPage | null>(null)

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowLabel(formatJakartaClock()),
      15_000
    )
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

  const actor = useMemo(
    () =>
      staffing.staff.find(
        (candidate) =>
          candidate.id === actorId &&
          candidate.isActive &&
          !isStaffDeleted(candidate) &&
          canManage(candidate.roles)
      ) ?? null,
    [actorId, staffing.staff]
  )

  useEffect(() => {
    if (landscape && page === "menu") navigate(DEFAULT_PAGE, { replace: true })
  }, [landscape, page, navigate])

  useEffect(() => {
    if (!landscape) return
    setSidebarOpen(isSidebarDefaultOpen(page))
  }, [landscape, page])

  useEffect(() => {
    if (!landscape || !sidebarOpen || page !== "kasir") return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [landscape, sidebarOpen, page])

  const managers = staffing.staff.filter(
    (member) =>
      member.isActive && !isStaffDeleted(member) && canManage(member.roles)
  )

  function goMenu() {
    navigate("menu")
  }

  function lock() {
    clearPinSession()
    setActorId(null)
    if (MANAGE_PAGES.has(page)) {
      navigate(landscape ? DEFAULT_PAGE : "menu")
    }
  }

  function openPage(next: Exclude<AppPage, "menu">) {
    const target = NAV_BY_ID[next]
    if (target && !canSeeNavItem(target, actor?.roles)) {
      setPendingPage(next)
      startUnlock()
      return
    }
    navigate(next)
  }

  const startUnlock = useCallback(() => {
    if (managers.length === 1) {
      setUnlockWho(managers[0])
      return
    }
    if (managers.length > 1) {
      setPickManager(true)
      return
    }
    setNotice("Belum ada owner atau manager.")
  }, [managers])

  useEffect(() => {
    if (!staffing.ready) return
    if (actor || !MANAGE_PAGES.has(page)) {
      if (actor) unlockAttemptedFor.current = null
      return
    }
    if (unlockAttemptedFor.current === page) return
    unlockAttemptedFor.current = page
    setPendingPage(page as Exclude<AppPage, "menu">)
    startUnlock()
  }, [actor, page, staffing.ready, startUnlock])

  const item = page === "menu" ? null : NAV_BY_ID[page]
  const content = !staffing.ready ? (
    <p className="text-sm text-muted-foreground">Membuka database lokal…</p>
  ) : page === "kasir" ? (
    <CashierScreen />
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
  ) : page === "week" && actor ? (
    <ScheduleScreen
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
      thisWeekStart={staffing.thisWeekStart}
      upcomingWeekStart={staffing.upcomingWeekStart}
    />
  ) : page === "prefs" && actor ? (
    <PrefsScreen
      database={staffing.database}
      actor={actor}
      staff={staffing.staff}
      slots={staffing.slots}
      suggestions={staffing.suggestions}
      assignments={staffing.assignments}
      offs={staffing.offs}
      settings={staffing.settings}
      preferences={staffing.preferences}
      requirements={staffing.requirements}
      today={staffing.today}
    />
  ) : page === "pin" ? (
    <PinScreen
      database={staffing.database}
      staff={staffing.staff}
      actor={actor}
    />
  ) : page === "staff" && actor ? (
    <StaffScreen
      database={staffing.database}
      actor={actor}
      staff={staffing.staff}
      slots={staffing.slots}
    />
  ) : page === "settings" && actor ? (
    <SettingsScreen
      database={staffing.database}
      actor={actor}
      settings={staffing.settings}
      slots={staffing.slots}
      requirements={staffing.requirements}
    />
  ) : page === "products" && actor ? (
    <CatalogScreen actor={actor} />
  ) : page === "stock" && actor ? (
    <StockScreen actor={actor} />
  ) : page === "recipes" && actor ? (
    <RecipesScreen />
  ) : page === "kitchen" ? (
    <KitchenScreen />
  ) : page === "menu" ? null : item && !item.ready ? (
    <ComingSoonScreen item={item} />
  ) : MANAGE_PAGES.has(page) && !actor ? (
    <p className="text-sm text-muted-foreground">
      Buka pengaturan untuk melihat halaman ini.
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">Halaman tidak ditemukan.</p>
  )

  const managerPickDialog = (
    <Dialog open={pickManager} onOpenChange={setPickManager}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Siapa yang membuka pengaturan?</DialogTitle>
          <DialogDescription>
            Pilih owner atau manager, lalu masukkan PIN.
          </DialogDescription>
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
      title={unlockWho ? `Pengaturan · ${unlockWho.name}` : "PIN"}
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
        savePinSession(member.id)
        setActorId(member.id)
        if (pendingPage) navigate(pendingPage)
        else if (landscape) navigate("week")
        setPendingPage(null)
      }}
    />
  )

  if (landscape) {
    const overlaySidebar = page === "kasir" && sidebarOpen
    const sidebar = (
      <AppSidebar
        today={staffing.today}
        nowLabel={nowLabel}
        page={page}
        actor={actor}
        onOpen={openPage}
        onUnlock={startUnlock}
        onLock={lock}
        onCollapse={() => setSidebarOpen(false)}
      />
    )

    return (
      <div className="relative flex h-svh bg-background">
        <a href="#konten" className="skip-link">
          Langsung ke konten
        </a>
        {sidebarOpen && !overlaySidebar ? sidebar : null}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {sidebarOpen ? null : (
            <Button
              type="button"
              variant="outline"
              size="icon-touch"
              className="absolute top-3 left-3 z-20 shadow-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label="Tampilkan menu"
              aria-expanded={false}
              aria-controls="app-sidebar"
              title="Tampilkan menu"
            >
              <PanelLeft className="size-5" />
            </Button>
          )}
          <main
            id="konten"
            tabIndex={-1}
            className={
              page === "kasir"
                ? "min-h-0 flex-1 overflow-hidden"
                : "min-h-0 flex-1 overflow-auto"
            }
          >
            <div
              className={
                page === "kasir"
                  ? "h-full w-full p-3 pt-16"
                  : "mx-auto w-full max-w-5xl px-4 py-4"
              }
            >
              <LiveNotice message={notice ?? staffing.error} tone="error" />
              {content}
            </div>
          </main>
        </div>
        {overlaySidebar ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/30"
              aria-label="Tutup menu"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-40 h-full shadow-xl">
              {sidebar}
            </div>
          </>
        ) : null}
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
      {page === "menu" ? null : (
        <div className="border-b px-4 py-2">
          <Button
            variant="outline"
            size="icon-touch"
            render={
              <a
                href={pathForPage("menu")}
                aria-label="Kembali ke menu"
                onClick={(event) => {
                  if (!shouldHandleInAppClick(event)) return
                  event.preventDefault()
                  goMenu()
                }}
              />
            }
          >
            <ArrowLeft className="size-5" />
          </Button>
        </div>
      )}
      <main
        id="konten"
        tabIndex={-1}
        className={
          page === "kasir"
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-auto"
        }
      >
        {page === "menu" ? (
          <MenuScreen
            actor={actor}
            onOpen={openPage}
            onUnlock={startUnlock}
            onLock={lock}
          />
        ) : (
          <div
            className={
              page === "kasir"
                ? "h-full w-full p-3"
                : "mx-auto w-full max-w-5xl px-4 py-4"
            }
          >
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
