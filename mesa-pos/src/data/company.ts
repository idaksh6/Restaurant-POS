/** One company may own many branches. Terminals operate at branch level. */

export type CompanyProfile = {
  id: string
  companyName: string
  aliasName: string
  taxId: string
  enableTax: boolean
  /** Phase 1 ZATCA TLV QR on settled receipts (company setting; env can also force on). */
  zatcaEnabled?: boolean
  currency: string
  logoDataUrl?: string
  hqPhone?: string
}

export type Branch = {
  id: string
  companyId: string
  name: string
  nameAr: string
  code: string
  address: string
  addressAr: string
  phone: string
  active: boolean
}

/** Legacy flat shape still used by some screens — maps company + active branch. */
export type CompanyDetails = {
  companyName: string
  aliasName: string
  branchName: string
  branchNameAr: string
  address: string
  addressAr: string
  phone: string
  branchCode: string
  enableTax: boolean
  currency: string
  taxId: string
  logoDataUrl?: string
}

const COMPANY_KEY = 'mesa-company'
const BRANCHES_KEY = 'mesa-branches'
const ACTIVE_BRANCH_KEY = 'mesa-active-branch-id'
const LEGACY_KEY = 'mesa-company-details'

export const seedCompany: CompanyProfile = {
  id: 'co-mesa',
  companyName: 'Mesa Restaurant',
  aliasName: 'ميسا للمطاعم',
  taxId: '300000000000003',
  enableTax: true,
  zatcaEnabled: false,
  currency: 'Saudi Arabia · SAR',
  hqPhone: '+966 11 000 0000',
}

export const seedBranches: Branch[] = [
  {
    id: 'br-ryd-01',
    companyId: seedCompany.id,
    name: 'Riyadh Main',
    nameAr: 'فرع الرياض الرئيسي',
    code: 'RYD-01',
    address: 'Olaya Street, Riyadh',
    addressAr: 'شارع العليا، الرياض',
    phone: '+966 11 000 0000',
    active: true,
  },
  {
    id: 'br-jed-01',
    companyId: seedCompany.id,
    name: 'Jeddah Corniche',
    nameAr: 'فرع جدة الكورنيش',
    code: 'JED-01',
    address: 'Corniche Road, Jeddah',
    addressAr: 'طريق الكورنيش، جدة',
    phone: '+966 12 000 0000',
    active: true,
  },
]

function migrateLegacyIfNeeded() {
  try {
    if (localStorage.getItem(COMPANY_KEY) && localStorage.getItem(BRANCHES_KEY)) return
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return
    const legacy = JSON.parse(legacyRaw) as CompanyDetails
    const company: CompanyProfile = {
      ...seedCompany,
      companyName: legacy.companyName || seedCompany.companyName,
      aliasName: legacy.aliasName || seedCompany.aliasName,
      taxId: legacy.taxId || seedCompany.taxId,
      enableTax: legacy.enableTax ?? true,
      currency: legacy.currency || seedCompany.currency,
      logoDataUrl: legacy.logoDataUrl,
      hqPhone: legacy.phone || seedCompany.hqPhone,
    }
    const branch: Branch = {
      id: 'br-migrated',
      companyId: company.id,
      name: legacy.branchName || 'Main Branch',
      nameAr: legacy.branchNameAr || '',
      code: legacy.branchCode || 'MAIN',
      address: legacy.address || '',
      addressAr: legacy.addressAr || '',
      phone: legacy.phone || '',
      active: true,
    }
    localStorage.setItem(COMPANY_KEY, JSON.stringify(company))
    localStorage.setItem(BRANCHES_KEY, JSON.stringify([branch]))
    localStorage.setItem(ACTIVE_BRANCH_KEY, branch.id)
  } catch {
    /* ignore */
  }
}

export function loadCompanyProfile(): CompanyProfile {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(COMPANY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as CompanyProfile
      if (parsed?.companyName) return { ...seedCompany, ...parsed }
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(COMPANY_KEY, JSON.stringify(seedCompany))
  return { ...seedCompany }
}

export function saveCompanyProfile(company: CompanyProfile) {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(company))
}

export const COMPANY_SESSION_EVENT = 'mesa:company-session'

/** Persist company + branches and notify the UI (same-tab). */
export function applyCompanySession(
  company: CompanyProfile,
  branches?: Branch[],
  activeBranchId?: string | null,
) {
  saveCompanyProfile(company)
  if (branches && branches.length) {
    saveBranches(branches)
    const ids = branches.filter((b) => b.active).map((b) => b.id)
    const saved = localStorage.getItem(ACTIVE_BRANCH_KEY)
    const next =
      (activeBranchId && ids.includes(activeBranchId) ? activeBranchId : null) ||
      (saved && ids.includes(saved) ? saved : null) ||
      ids[0]
    if (next) setActiveBranchId(next)
  }
  window.dispatchEvent(new Event(COMPANY_SESSION_EVENT))
}

export function loadBranches(): Branch[] {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(BRANCHES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Branch[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(seedBranches))
  return [...seedBranches]
}

export function saveBranches(branches: Branch[]) {
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches))
}

export function getActiveBranchId(): string {
  const branches = loadBranches().filter((b) => b.active)
  const saved = localStorage.getItem(ACTIVE_BRANCH_KEY)
  if (saved && branches.some((b) => b.id === saved)) return saved
  const first = branches[0]?.id ?? seedBranches[0].id
  localStorage.setItem(ACTIVE_BRANCH_KEY, first)
  return first
}

export function setActiveBranchId(branchId: string) {
  localStorage.setItem(ACTIVE_BRANCH_KEY, branchId)
}

export function loadActiveBranch(): Branch {
  const id = getActiveBranchId()
  return loadBranches().find((b) => b.id === id) ?? loadBranches()[0] ?? seedBranches[0]
}

/** Flat view for receipt headers / legacy forms. */
export function toCompanyDetails(
  company: CompanyProfile = loadCompanyProfile(),
  branch: Branch = loadActiveBranch(),
): CompanyDetails {
  return {
    companyName: company.companyName,
    aliasName: company.aliasName,
    branchName: branch.name,
    branchNameAr: branch.nameAr,
    address: branch.address,
    addressAr: branch.addressAr,
    phone: branch.phone,
    branchCode: branch.code,
    enableTax: company.enableTax,
    currency: company.currency,
    taxId: company.taxId,
    logoDataUrl: company.logoDataUrl,
  }
}

export function loadCompany(): CompanyDetails {
  return toCompanyDetails()
}

export function saveCompany(data: CompanyDetails) {
  const company = loadCompanyProfile()
  const branches = loadBranches()
  const activeId = getActiveBranchId()
  saveCompanyProfile({
    ...company,
    companyName: data.companyName,
    aliasName: data.aliasName,
    taxId: data.taxId,
    enableTax: data.enableTax,
    currency: data.currency,
    logoDataUrl: data.logoDataUrl,
    hqPhone: data.phone || company.hqPhone,
  })
  const nextBranches = branches.map((b) =>
    b.id === activeId
      ? {
          ...b,
          name: data.branchName,
          nameAr: data.branchNameAr,
          code: data.branchCode,
          address: data.address,
          addressAr: data.addressAr,
          phone: data.phone,
        }
      : b,
  )
  saveBranches(nextBranches)
  // keep legacy key for older backups
  localStorage.setItem(LEGACY_KEY, JSON.stringify(data))
}

export function mergeRemoteBranches(
  remote: Branch[],
  pendingUpserts: Branch[] = [],
  pendingDeletes: string[] = [],
): Branch[] {
  const byId = new Map<string, Branch>()
  for (const row of remote) {
    if (row?.id) byId.set(row.id, row)
  }
  for (const row of pendingUpserts) {
    if (row?.id) byId.set(row.id, row)
  }
  for (const id of pendingDeletes) byId.delete(id)
  return [...byId.values()]
}

export function hydrateCompanySession(
  remoteCompany: CompanyProfile,
  remoteBranches: Branch[],
  overlay?: {
    pendingCompany?: CompanyProfile | null
    pendingBranches?: Branch[]
    pendingDeletes?: string[]
    activeBranchId?: string | null
  },
) {
  const prev = loadCompanyProfile()
  const merged = overlay?.pendingCompany
    ? { ...remoteCompany, ...overlay.pendingCompany, id: remoteCompany.id }
    : remoteCompany
  // Keep local ZATCA flag when remote/API payloads omit the field (older servers).
  const company: CompanyProfile = {
    ...merged,
    zatcaEnabled:
      merged.zatcaEnabled !== undefined
        ? !!merged.zatcaEnabled
        : prev.id === remoteCompany.id
          ? !!prev.zatcaEnabled
          : false,
  }
  const base =
    remoteBranches.length > 0
      ? remoteBranches
      : loadBranches().filter((b) => b.companyId === company.id)
  const branches = mergeRemoteBranches(
    base,
    overlay?.pendingBranches ?? [],
    overlay?.pendingDeletes ?? [],
  )
  applyCompanySession(company, branches.length ? branches : undefined, overlay?.activeBranchId)
}

export const currencyOptions = [
  'Saudi Arabia · SAR',
  'United Arab Emirates · AED',
  'Kuwait · KWD',
  'Bahrain · BHD',
  'Qatar · QAR',
  'Oman · OMR',
  'United States · USD',
]
