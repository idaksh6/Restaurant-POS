const DEVICE_KEY = 'mesa-device-id'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Stable terminal id persisted in localStorage. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = uuid()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return uuid()
  }
}
