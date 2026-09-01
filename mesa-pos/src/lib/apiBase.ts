const OVERRIDE_KEY = 'mesa-api-url'

/** Runtime override (Settings → Delivery APIs). Falls back to VITE_API_URL. */
export function getApiBaseUrl(): string | undefined {
  try {
    const override = localStorage.getItem(OVERRIDE_KEY)?.trim()
    if (override) return override.replace(/\/$/, '')
  } catch {
    /* ignore */
  }
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  return env ? env.replace(/\/$/, '') : undefined
}

export function envApiBaseUrl(): string {
  return ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
}

export function setApiBaseUrlOverride(url: string) {
  const cleaned = url.trim().replace(/\/$/, '')
  try {
    if (!cleaned || cleaned === envApiBaseUrl()) {
      localStorage.removeItem(OVERRIDE_KEY)
    } else {
      localStorage.setItem(OVERRIDE_KEY, cleaned)
    }
  } catch {
    /* ignore */
  }
}

export function hasApiBaseUrlOverride() {
  try {
    return Boolean(localStorage.getItem(OVERRIDE_KEY)?.trim())
  } catch {
    return false
  }
}
