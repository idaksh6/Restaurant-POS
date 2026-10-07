/** Company-level POS license helpers (control-plane TenantRegistry). */

export type LicenseStatus = 'pending' | 'active' | 'suspended' | 'expired'

export type LicenseSnapshot = {
  licenseStatus: LicenseStatus
  activatedAt: string | null
  expiresAt: string | null
  /** First device already activated — later devices inherit this window. */
  inherited: boolean
  daysRemaining: number | null
}

const DEFAULT_TERM_MONTHS = 12

export function addMonths(from: Date, months: number) {
  const d = new Date(from.getTime())
  d.setMonth(d.getMonth() + months)
  return d
}

export function resolveLicenseStatus(row: {
  licenseStatus?: string | null
  activatedAt?: Date | null
  expiresAt?: Date | null
}): LicenseStatus {
  const raw = String(row.licenseStatus || 'pending').toLowerCase()
  if (raw === 'suspended') return 'suspended'
  if (!row.activatedAt) return 'pending'
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return 'expired'
  if (raw === 'active') return 'active'
  if (raw === 'pending' && row.activatedAt) return 'active'
  return raw === 'expired' ? 'expired' : 'active'
}

export function licenseSnapshot(row: {
  licenseStatus?: string | null
  activatedAt?: Date | null
  expiresAt?: Date | null
}): LicenseSnapshot {
  const status = resolveLicenseStatus(row)
  const expiresAt = row.expiresAt ? row.expiresAt.toISOString() : null
  let daysRemaining: number | null = null
  if (row.expiresAt) {
    daysRemaining = Math.ceil((row.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  }
  return {
    licenseStatus: status,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    expiresAt,
    inherited: Boolean(row.activatedAt),
    daysRemaining,
  }
}

export function defaultExpiryFrom(activatedAt: Date) {
  return addMonths(activatedAt, DEFAULT_TERM_MONTHS)
}

export { DEFAULT_TERM_MONTHS }
