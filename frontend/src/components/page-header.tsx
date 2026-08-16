export function LiveNotice({
  message,
  tone = "info",
}: {
  message: string | null
  tone?: "info" | "error"
}) {
  if (!message) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        tone === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {message}
    </p>
  )
}
