import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Boxes,
  CalendarDays,
  CalendarRange,
  Clock3,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from "lucide-react"

import { canManage } from "@/lib/permissions"
import type { StaffRole } from "@/lib/types"

export type AppPage =
  | "menu"
  | "kasir"
  | "clock"
  | "today"
  | "orders"
  | "products"
  | "stock"
  | "prefs"
  | "week"
  | "staff"
  | "reports"
  | "settings"

export type NavAccess = "public" | "manage"

export type NavItem = {
  id: Exclude<AppPage, "menu">
  label: string
  hint: string
  icon: LucideIcon
  ready: boolean
  access: NavAccess
  plan: string[]
}

export type NavGroup = {
  id: string
  title: string
  items: NavItem[]
}

export const DEFAULT_PAGE: Exclude<AppPage, "menu"> = "kasir"

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inti",
    title: "Inti",
    items: [
      {
        id: "kasir",
        label: "Kasir",
        hint: "Jual, terima bayar, buka laci",
        icon: ShoppingCart,
        ready: false,
        access: "public",
        plan: [
          "Pilih menu dan jumlah",
          "Bayar tunai atau non-tunai",
          "Sesi laci terikat ke staff yang clock-in",
        ],
      },
      {
        id: "clock",
        label: "Masuk",
        hint: "Clock-in dan pulang dengan PIN",
        icon: Clock3,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "today",
        label: "Hari ini",
        hint: "Siapa jaga dan siapa sudah datang",
        icon: CalendarDays,
        ready: true,
        access: "public",
        plan: [],
      },
    ],
  },
  {
    id: "operasi",
    title: "Operasi",
    items: [
      {
        id: "orders",
        label: "Pesanan",
        hint: "Antrian dapur dan riwayat transaksi",
        icon: Receipt,
        ready: false,
        access: "public",
        plan: [
          "Lihat pesanan terbuka dan yang sudah bayar",
          "Ulangi atau batalkan transaksi",
          "Tiket dapur terpisah dari struk kasir",
        ],
      },
      {
        id: "products",
        label: "Produk",
        hint: "Nama, harga, dan SKU menu",
        icon: Package,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "stock",
        label: "Stok",
        hint: "Persediaan bahan dan produk",
        icon: Boxes,
        ready: false,
        access: "manage",
        plan: [
          "Stok awal dan penyesuaian",
          "Peringatan residu rendah",
          "Belum mengurangi stok otomatis dari kasir",
        ],
      },
    ],
  },
  {
    id: "tim",
    title: "Tim",
    items: [
      {
        id: "prefs",
        label: "Preferensi",
        hint: "Minta libur dan urutan shift minggu depan",
        icon: SlidersHorizontal,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "week",
        label: "Jadwal",
        hint: "Papan minggu, inbox libur, publish",
        icon: CalendarRange,
        ready: true,
        access: "manage",
        plan: [],
      },
      {
        id: "staff",
        label: "Orang",
        hint: "Staff, role, dan PIN",
        icon: Users,
        ready: true,
        access: "manage",
        plan: [],
      },
    ],
  },
  {
    id: "bisnis",
    title: "Bisnis",
    items: [
      {
        id: "reports",
        label: "Laporan",
        hint: "Omzet, shift, dan stok",
        icon: BarChart3,
        ready: false,
        access: "manage",
        plan: [
          "Omzet per hari dan per kasir",
          "Jam kerja dari absensi",
          "Belum ada penggajian otomatis",
        ],
      },
      {
        id: "settings",
        label: "Outlet",
        hint: "Jam buka, slot shift, aturan adil",
        icon: Settings,
        ready: true,
        access: "manage",
        plan: [],
      },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export const NAV_BY_ID: Record<Exclude<AppPage, "menu">, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item])
) as Record<Exclude<AppPage, "menu">, NavItem>

export const MANAGE_PAGES = new Set<AppPage>(
  NAV_ITEMS.filter((item) => item.access === "manage").map((item) => item.id)
)

export function isAppPage(value: string): value is Exclude<AppPage, "menu"> {
  return value in NAV_BY_ID
}

export function canSeeNavItem(
  item: Pick<NavItem, "access">,
  roles: readonly StaffRole[] | null | undefined
): boolean {
  return item.access === "public" || canManage(roles ?? [])
}

export function visibleNavGroups(
  roles: readonly StaffRole[] | null | undefined
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(item, roles)),
  })).filter((group) => group.items.length > 0)
}
