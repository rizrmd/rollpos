import { Model } from "@nozbe/watermelondb"

export class RawModel extends Model {
  str(key: string): string {
    return String(this._getRaw(key) ?? "")
  }

  setStr(key: string, value: string) {
    this._setRaw(key, value)
  }

  num(key: string): number {
    return Number(this._getRaw(key) ?? 0)
  }

  setNum(key: string, value: number) {
    this._setRaw(key, value)
  }

  flag(key: string): boolean {
    return Boolean(this._getRaw(key))
  }

  setFlag(key: string, value: boolean) {
    this._setRaw(key, value)
  }

  stamp(now: number, fields: "created" | "updated" | "both" = "both") {
    if (fields === "created" || fields === "both") {
      this.setNum("created_at", now)
    }
    if (fields === "updated" || fields === "both") {
      this.setNum("updated_at", now)
    }
  }
}
