import { Model } from "@nozbe/watermelondb"

export default class Product extends Model {
  static table = "products"

  get name(): string {
    return String(this._getRaw("name") ?? "")
  }

  set name(value: string) {
    this._setRaw("name", value)
  }

  get sku(): string {
    return String(this._getRaw("sku") ?? "")
  }

  set sku(value: string) {
    this._setRaw("sku", value)
  }

  get price(): number {
    return Number(this._getRaw("price") ?? 0)
  }

  set price(value: number) {
    this._setRaw("price", value)
  }

  get stock(): number {
    return Number(this._getRaw("stock") ?? 0)
  }

  set stock(value: number) {
    this._setRaw("stock", value)
  }

  get createdAt(): number {
    return Number(this._getRaw("created_at") ?? 0)
  }

  set createdAt(value: number) {
    this._setRaw("created_at", value)
  }

  get updatedAt(): number {
    return Number(this._getRaw("updated_at") ?? 0)
  }

  set updatedAt(value: number) {
    this._setRaw("updated_at", value)
  }
}
