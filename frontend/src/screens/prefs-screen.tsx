import type { Database } from "@nozbe/watermelondb"
import { useMemo, useState } from "react"

import { PinDialog } from "@/components/pin-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { authenticateStaff, submitPreferences } from "@/db/staffing-write"
import { weekDates } from "@/lib/time"
import type { SlotRecord, StaffRecord } from "@/lib/types"

export function PrefsScreen({
  database,
  staff,
  slots,
  weekStart,
}: {
  database: Database
  staff: StaffRecord[]
  slots: SlotRecord[]
  weekStart: string
}) {
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const [who, setWho] = useState<StaffRecord | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [ranked, setRanked] = useState<string[]>([])
  const [offs, setOffs] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  function toggleRank(id: string) {
    setRanked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferensi minggu depan</CardTitle>
        <CardDescription>
          Minggu {weekStart}. Suggest libur tidak otomatis disetujui.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {staff
            .filter((member) => member.isActive)
            .map((member) => (
              <Button
                key={member.id}
                type="button"
                variant={who?.id === member.id ? "default" : "outline"}
                onClick={() => {
                  setWho(member)
                  setPinOpen(true)
                }}
              >
                {member.nickname}
              </Button>
            ))}
        </div>
        {who ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Peringkat shift</p>
              <div className="flex flex-col gap-2">
                {slots
                  .filter((slot) => slot.isActive)
                  .map((slot) => (
                    <label key={slot.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={ranked.includes(slot.id)}
                        onCheckedChange={() => toggleRank(slot.id)}
                      />
                      {slot.name}{" "}
                      {ranked.includes(slot.id)
                        ? `(#${ranked.indexOf(slot.id) + 1})`
                        : ""}
                    </label>
                  ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Suggest hari libur</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {dates.map((date) => (
                  <label key={date} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={offs.includes(date)}
                      onCheckedChange={(checked) =>
                        setOffs((current) =>
                          checked
                            ? [...current, date]
                            : current.filter((item) => item !== date)
                        )
                      }
                    />
                    {date}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pref-note">Catatan</Label>
              <Textarea
                id="pref-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={async () => {
                await submitPreferences(
                  database,
                  who.id,
                  weekStart,
                  ranked.map((templateId, index) => ({
                    templateId,
                    rank: index + 1,
                  })),
                  offs.map((workDate, index) => ({
                    workDate,
                    rank: index + 1,
                    note,
                  })),
                  note
                )
                setNotice("Preferensi tersimpan sebagai suggest, belum libur resmi.")
              }}
            >
              Kirim preferensi
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pilih nama dulu.</p>
        )}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        <PinDialog
          open={pinOpen}
          title={who ? `PIN ${who.name}` : "PIN"}
          onOpenChange={setPinOpen}
          onSubmit={async (pin) => {
            if (!who) return
            await authenticateStaff(database, who.id, pin)
          }}
        />
      </CardContent>
    </Card>
  )
}
