import type { Database } from "@/db/database"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { upsertStaff } from "@/db/staffing-write"
import { STAFF_ROLES, type StaffRecord, type StaffRole } from "@/lib/types"

export function StaffScreen({
  database,
  actor,
  staff,
}: {
  database: Database
  actor: StaffRecord
  staff: StaffRecord[]
}) {
  return (
    <div className="grid gap-4">
      {staff.map((member) => (
        <StaffEditor
          key={member.id}
          database={database}
          actor={actor}
          member={member}
        />
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Tambah staff</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffEditor database={database} actor={actor} />
        </CardContent>
      </Card>
    </div>
  )
}

function StaffEditor({
  database,
  actor,
  member,
}: {
  database: Database
  actor: StaffRecord
  member?: StaffRecord
}) {
  const [name, setName] = useState(member?.name ?? "")
  const [pin, setPin] = useState("")
  const [roles, setRoles] = useState<StaffRole[]>(member?.roles ?? ["kasir"])
  const [notice, setNotice] = useState<string | null>(null)

  function toggle(role: StaffRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role]
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{member ? member.name : "Staff baru"}</CardTitle>
        <CardDescription>Satu orang boleh merangkap role.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nama"
        />
        <Input
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder={member ? "PIN baru (opsional)" : "PIN"}
        />
        <div className="flex flex-wrap gap-3">
          {STAFF_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={roles.includes(role)}
                onCheckedChange={() => toggle(role)}
              />
              {role}
            </label>
          ))}
        </div>
        <Button
          type="button"
          onClick={async () => {
            try {
              await upsertStaff(database, actor, {
                id: member?.id,
                name,
                nickname: name,
                pin: pin || undefined,
                isActive: member?.isActive ?? true,
                roles,
              })
              setNotice("Tersimpan.")
              setPin("")
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          Simpan
        </Button>
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </CardContent>
    </Card>
  )
}
