import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <nav className="flex items-center justify-end gap-2" aria-label="Pagination">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Halaman sebelumnya"
      >
        <ChevronLeft />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {page} / {pageCount}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Halaman berikutnya"
      >
        <ChevronRight />
      </Button>
    </nav>
  )
}
