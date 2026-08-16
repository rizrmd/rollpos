import type { NavItem } from "@/lib/nav"

export function ComingSoonScreen({ item }: { item: NavItem }) {
  return (
    <section
      aria-labelledby="soon-heading"
      className="mx-auto w-full max-w-lg"
    >
      <div className="rounded-2xl border bg-card px-5 py-6">
        <p className="text-sm font-medium text-muted-foreground">Belum dibangun</p>
        <h2 id="soon-heading" className="mt-1 text-2xl font-semibold tracking-tight">
          {item.label}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{item.hint}</p>
        {item.plan.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {item.plan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">
          Menu ini sudah ada supaya alur kasir tidak tertinggal di belakang absensi.
          Detail menyusul tanpa memindah tempat menu.
        </p>
      </div>
    </section>
  )
}
