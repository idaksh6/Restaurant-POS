import type { Supplier } from '../data/purchasing'

const MIN_PHONE_DIGITS = 7

export function normalizeVendorPhone(raw: string) {
  return raw.replace(/\D/g, '')
}

export function normalizeVendorEmail(raw: string) {
  return raw.trim().toLowerCase()
}

function phoneDigitsMeaningful(raw: string) {
  return normalizeVendorPhone(raw).length >= MIN_PHONE_DIGITS
}

/** Another vendor (not excludeId) already uses this phone on mobile 1 or 2. */
export function findVendorPhoneConflict(
  suppliers: Supplier[],
  phone: string,
  excludeId?: string,
): Supplier | undefined {
  if (!phoneDigitsMeaningful(phone)) return undefined
  const norm = normalizeVendorPhone(phone)
  return suppliers.find((s) => {
    if (excludeId && s.id === excludeId) return false
    const p1 = normalizeVendorPhone(s.phone)
    const p2 = normalizeVendorPhone(s.phone2 ?? '')
    return (p1.length >= MIN_PHONE_DIGITS && p1 === norm) || (p2.length >= MIN_PHONE_DIGITS && p2 === norm)
  })
}

export function findVendorEmailConflict(
  suppliers: Supplier[],
  email: string,
  excludeId?: string,
): Supplier | undefined {
  const norm = normalizeVendorEmail(email)
  if (!norm) return undefined
  return suppliers.find((s) => {
    if (excludeId && s.id === excludeId) return false
    const e = normalizeVendorEmail(s.email ?? '')
    return e.length > 0 && e === norm
  })
}

export type VendorUniqueConflict = {
  field: 'phone' | 'phone2' | 'email'
  vendor: Supplier
}

/** Returns first duplicate phone/email conflict across the vendor list. */
export function findVendorUniqueConflict(
  suppliers: Supplier[],
  draft: Pick<Supplier, 'id' | 'phone' | 'phone2' | 'email'>,
): VendorUniqueConflict | null {
  const excludeId = draft.id

  if (draft.phone.trim()) {
    const conflict = findVendorPhoneConflict(suppliers, draft.phone, excludeId)
    if (conflict) return { field: 'phone', vendor: conflict }
  }

  if ((draft.phone2 ?? '').trim()) {
    const conflict = findVendorPhoneConflict(suppliers, draft.phone2 ?? '', excludeId)
    if (conflict) return { field: 'phone2', vendor: conflict }
  }

  if ((draft.email ?? '').trim()) {
    const conflict = findVendorEmailConflict(suppliers, draft.email ?? '', excludeId)
    if (conflict) return { field: 'email', vendor: conflict }
  }

  return null
}

export function vendorRowDuplicatePhones(phone: string, phone2: string) {
  const p1 = normalizeVendorPhone(phone)
  const p2 = normalizeVendorPhone(phone2)
  return p1.length >= MIN_PHONE_DIGITS && p2.length >= MIN_PHONE_DIGITS && p1 === p2
}
