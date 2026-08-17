import { useCallback, useEffect, useState } from "react"

import { pageFromPath, pageTitle, pathForPage, type AppPage } from "@/lib/nav"

function readPage(): AppPage {
  return pageFromPath(window.location.pathname) ?? "menu"
}

export function useAppPage(): {
  page: AppPage
  navigate: (next: AppPage, options?: { replace?: boolean }) => void
} {
  const [page, setPage] = useState<AppPage>(readPage)

  const navigate = useCallback((next: AppPage, options?: { replace?: boolean }) => {
    const path = pathForPage(next)
    if (window.location.pathname !== path) {
      if (options?.replace) window.history.replaceState(null, "", path)
      else window.history.pushState(null, "", path)
    }
    setPage(next)
  }, [])

  useEffect(() => {
    const onPop = () => setPage(readPage())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (pageFromPath(window.location.pathname) === null) {
      window.history.replaceState(null, "", pathForPage(page))
    }
  }, [page])

  useEffect(() => {
    document.title = pageTitle(page)
  }, [page])

  return { page, navigate }
}
