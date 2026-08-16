export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export async function verifyPin(
  pin: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actual = await hashPin(pin, salt)
  return actual === expectedHash
}

export function newPinSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "PIN hanya boleh berisi angka."
  if (pin.length < 4 || pin.length > 6)
    return "PIN harus terdiri dari 4–6 digit."
  return null
}
