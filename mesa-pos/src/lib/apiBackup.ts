import { getApiBaseUrl } from './apiBase'
import { downloadText } from './dataTransfer'

function token() {
  return sessionStorage.getItem('mesa-token')
}

export function apiServerBackupReady() {
  return Boolean(getApiBaseUrl() && token() && typeof navigator !== 'undefined' && navigator.onLine)
}

/** Download company-wide backup JSON from mesa-api (`GET /sync/backup`). */
export async function apiDownloadServerBackup() {
  const base = getApiBaseUrl()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')

  let res: Response
  try {
    res = await fetch(`${base}/sync/backup`, {
      headers: { Authorization: `Bearer ${auth}` },
    })
  } catch {
    throw new Error('Could not reach the server')
  }
  if (!res.ok) {
    const text = await res.text()
    let message = text || `Backup failed (${res.status})`
    try {
      const json = JSON.parse(text) as { message?: string | string[] }
      const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message
      if (msg) message = msg
    } catch {
      /* keep text */
    }
    throw new Error(message)
  }

  const data = (await res.json()) as Record<string, unknown>
  const day = new Date().toISOString().slice(0, 10)
  const companyId = String(data.companyId ?? 'company')
  downloadText(
    `mesa-server-backup-${companyId}-${day}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  )
  return data
}
