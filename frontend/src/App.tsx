import { useEffect, useState } from "react"

import { PinDialog } from "@/components/pin-dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authenticateStaff } from "@/db/staffing-write"
import { seedStaffingIfEmpty } from "@/db/seed"
import { useStaffing } from "@/hooks/use-staffing"
import { canManage } from "@/lib/permissions"
import type { StaffRecord } from "@/lib/types"
import { CatalogScreen } from "@/screens/catalog-screen"
import { ClockScreen } from "@/screens/clock-screen"
import { PrefsScreen } from "@/screens/prefs-screen"
import { SettingsScreen } from "@/screens/settings-screen"
import { StaffScreen } from "@/screens/staff-screen"
import { TodayScreen } from "@/screens/today-screen"
import { WeekScreen } from "@/screens/week-screen"

export function App() {
  const staffing = useStaffing()
  const [actor, setActor] = useState<StaffRecord | null>(null)
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

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Roll n Brew
            </p>
            <h1 className="font-heading text-lg">RollPOS · Staff & shift</h1>
          </div>
          <div className="flex items-center gap-2">
            {actor ? (
              <Button type="button" variant="outline" onClick={() => setActor(null)}>
                Kunci atur ({actor.nickname})
              </Button>
            ) : (
              managers.map((member) => (
                <Button
                  key={member.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlockWho(member)}
                >
                  Buka atur · {member.nickname}
                </Button>
              ))
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {notice ? <p className="mb-3 text-sm text-destructive">{notice}</p> : null}
        {staffing.error ? (
          <p className="mb-3 text-sm text-destructive">{staffing.error}</p>
        ) : null}
        {!staffing.ready ? (
          <p className="text-sm text-muted-foreground">Membuka database lokal…</p>
        ) : (
          <Tabs defaultValue="clock">
            <TabsList className="mb-4 flex flex-wrap">
              <TabsTrigger value="clock">Clock</TabsTrigger>
              <TabsTrigger value="today">Hari ini</TabsTrigger>
              <TabsTrigger value="week">Jadwal</TabsTrigger>
              <TabsTrigger value="prefs">Preferensi</TabsTrigger>
              <TabsTrigger value="staff" disabled={!actor}>
                Staff
              </TabsTrigger>
              <TabsTrigger value="settings" disabled={!actor}>
                Pengaturan
              </TabsTrigger>
              <TabsTrigger value="catalog">Katalog</TabsTrigger>
            </TabsList>
            <TabsContent value="clock">
              <ClockScreen
                database={staffing.database}
                staff={staffing.staff}
                openByStaff={staffing.openByStaff}
              />
            </TabsContent>
            <TabsContent value="today">
              <TodayScreen
                today={staffing.today}
                settings={staffing.settings}
                staff={staffing.staff}
                slots={staffing.slots}
                assignments={staffing.assignments}
                attendance={staffing.attendance}
                openByStaff={staffing.openByStaff}
              />
            </TabsContent>
            <TabsContent value="week">
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
            </TabsContent>
            <TabsContent value="prefs">
              <PrefsScreen
                database={staffing.database}
                staff={staffing.staff}
                slots={staffing.slots}
                weekStart={staffing.upcomingWeekStart}
              />
            </TabsContent>
            <TabsContent value="staff">
              {actor ? (
                <StaffScreen
                  database={staffing.database}
                  actor={actor}
                  staff={staffing.staff}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="settings">
              {actor ? (
                <SettingsScreen
                  database={staffing.database}
                  actor={actor}
                  settings={staffing.settings}
                  slots={staffing.slots}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="catalog">
              <CatalogScreen />
            </TabsContent>
          </Tabs>
        )}
      </main>

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
            throw new Error("Hanya owner atau manager yang boleh membuka pengaturan.")
          }
          setActor(member)
        }}
      />
    </div>
  )
}

export default App
