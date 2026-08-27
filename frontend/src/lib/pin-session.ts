const PIN_SESSION_KEY = "rollpos:pin-session"

export const PIN_SESSION_DURATION_MS = 6 * 60 * 60 * 1000

type PinSession = {
  staffId: string
  expiresAt: number
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function savePinSession(
  staffId: string,
  storage: Storage | null = browserStorage(),
  now = Date.now()
): void {
  if (!storage) return
  const session: PinSession = {
    staffId,
    expiresAt: now + PIN_SESSION_DURATION_MS,
  }
  try {
    storage.setItem(PIN_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Login tetap boleh berjalan bila penyimpanan browser tidak tersedia.
  }
}

export function readPinSession(
  storage: Storage | null = browserStorage(),
  now = Date.now()
): string | null {
  if (!storage) return null

  try {
    const raw = storage.getItem(PIN_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<PinSession>
    if (
      typeof session.staffId !== "string" ||
      !session.staffId ||
      typeof session.expiresAt !== "number" ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= now
    ) {
      clearPinSession(storage)
      return null
    }
    return session.staffId
  } catch {
    clearPinSession(storage)
    return null
  }
}

export function clearPinSession(
  storage: Storage | null = browserStorage()
): void {
  try {
    storage?.removeItem(PIN_SESSION_KEY)
  } catch {
    // Tidak ada tindakan tambahan bila penyimpanan browser menolak akses.
  }
}
