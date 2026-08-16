import { useEffect, useState } from "react"

export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(orientation: landscape)").matches
      : false
  )

  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)")
    const onChange = () => setLandscape(media.matches)
    onChange()
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return landscape
}
