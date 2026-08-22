import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Boxes,
  CalendarRange,
  Clock3,
  KeyRound,
  Receipt,
  UtensilsCrossed,
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
  | "orders"
  | "products"
  | "stock"
  | "prefs"
  | "pin"
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

export type NavBranch = {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  access: NavAccess
  children: NavItem[]
}

export type NavEntry = NavItem | NavBranch

export type NavGroup = {
  id: string
  title: string
  items: NavEntry[]
}

export function isNavBranch(entry: NavEntry): entry is NavBranch {
  return "children" in entry
}

export const DEFAULT_PAGE: Exclude<AppPage, "menu"> = "kasir"

/** Kasir butuh area penuh. "menu" juga tertutup — di landscape itu hanya transisi ke kasir. */
export function isSidebarDefaultOpen(page: AppPage): boolean {
  return page !== "kasir" && page !== "menu"
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inti",
    title: "Harian",
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
    ],
  },
  {
    id: "operasi",
    title: "Toko",
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
        label: "Menu",
        hint: "Makanan, minuman, dan bahan resep",
        icon: UtensilsCrossed,
        ready: true,
        access: "manage",
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
    title: "Karyawan",
    items: [
      {
        id: "clock",
        label: "Absensi",
        hint: "Clock-in, pulang, dan siapa yang sudah masuk",
        icon: Clock3,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "prefs",
        label: "Shift Kerja",
        hint: "Kalender sebulan; ketuk nama untuk pilih pengganti",
        icon: SlidersHorizontal,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "pin",
        label: "Ubah PIN",
        hint: "Ganti PIN sendiri, atau reset PIN karyawan (owner/manager)",
        icon: KeyRound,
        ready: true,
        access: "public",
        plan: [],
      },
      {
        id: "week",
        label: "Jadwal",
        hint: "Kalender sebulan; seret tanggal untuk tentukan siapa kerja",
        icon: CalendarRange,
        ready: true,
        access: "manage",
        plan: [],
      },
      {
        id: "staff",
        label: "Staff",
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

export function flattenNavEntries(entries: readonly NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => (isNavBranch(entry) ? entry.children : [entry]))
}

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) =>
  flattenNavEntries(group.items)
)

export const NAV_BY_ID: Record<Exclude<AppPage, "menu">, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item])
) as Record<Exclude<AppPage, "menu">, NavItem>

export const MANAGE_PAGES = new Set<AppPage>(
  NAV_ITEMS.filter((item) => item.access === "manage").map((item) => item.id)
)

/** Path kanonik per screen — dipakai di address bar, bookmark, dan tautan. */
export const PAGE_PATH: Record<AppPage, string> = {
  menu: "/",
  kasir: "/kasir",
  clock: "/absensi",
  orders: "/pesanan",
  products: "/katalog",
  stock: "/stok",
  prefs: "/shift",
  pin: "/pin",
  week: "/jadwal",
  staff: "/staff",
  reports: "/laporan",
  settings: "/outlet",
}

const PATH_ALIAS: Record<string, AppPage> = {
  "": "menu",
  menu: "menu",
  kasir: "kasir",
  clock: "clock",
  absensi: "clock",
  masuk: "clock",
  orders: "orders",
  pesanan: "orders",
  products: "products",
  katalog: "products",
  produk: "products",
  stock: "stock",
  stok: "stock",
  prefs: "prefs",
  shift: "prefs",
  preferensi: "prefs",
  pin: "pin",
  week: "week",
  jadwal: "week",
  staff: "staff",
  orang: "staff",
  reports: "reports",
  laporan: "reports",
  settings: "settings",
  outlet: "settings",
  atur: "settings",
}

export function isAppPage(value: string): value is Exclude<AppPage, "menu"> {
  return value in NAV_BY_ID
}

export function pathForPage(page: AppPage): string {
  return PAGE_PATH[page]
}

export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? ""
  if (!path || path === "/") return "/"
  return `/${path.replace(/^\/+|\/+$/g, "").toLowerCase()}`
}

export function pageFromPath(pathname: string): AppPage | null {
  const normalized = normalizePath(pathname)
  const slug = normalized === "/" ? "" : normalized.slice(1)
  return PATH_ALIAS[slug] ?? null
}

export function pageTitle(page: AppPage): string {
  if (page === "menu") return "Roll n Brew"
  return `${NAV_BY_ID[page].label} · Roll n Brew`
}

export function shouldHandleInAppClick(event: {
  defaultPrevented: boolean
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

export function canSeeNavItem(
  item: Pick<NavItem, "access">,
  roles: readonly StaffRole[] | null | undefined
): boolean {
  return item.access === "public" || canManage(roles ?? [])
}

export function visibleNavEntry(
  entry: NavEntry,
  roles: readonly StaffRole[] | null | undefined
): NavEntry | null {
  const canShowItem = (item: NavItem) =>
    canSeeNavItem(item, roles) &&
    !(item.id === "prefs" && canManage(roles ?? []))

  if (isNavBranch(entry)) {
    const children = entry.children.filter(canShowItem)
    if (children.length === 0) return null
    return { ...entry, children }
  }

  return canShowItem(entry) ? entry : null
}

export function visibleNavGroups(
  roles: readonly StaffRole[] | null | undefined
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((entry) => visibleNavEntry(entry, roles))
      .filter((entry): entry is NavEntry => entry !== null),
  })).filter((group) => group.items.length > 0)
}

export function navEntryContainsPage(entry: NavEntry, page: AppPage): boolean {
  if (isNavBranch(entry)) {
    return entry.children.some((item) => item.id === page)
  }
  return entry.id === page
}
