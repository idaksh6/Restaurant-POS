import type { Branch, CompanyProfile } from '../data/company'

export function brandInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'POS'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function companyDisplayName(company: CompanyProfile, lang: 'en' | 'ar') {
  if (lang === 'ar' && company.aliasName?.trim()) return company.aliasName.trim()
  return company.companyName
}

export function branchDisplayName(branch: Branch, lang: 'en' | 'ar') {
  if (lang === 'ar' && branch.nameAr?.trim()) return branch.nameAr.trim()
  return branch.name
}

/** Staff / user label: Arabic uses `nameAr` when set. */
export function personDisplayName(
  row: { name: string; nameAr?: string | null },
  lang: 'en' | 'ar',
) {
  if (lang === 'ar' && row.nameAr?.trim()) return row.nameAr.trim()
  return row.name
}

/** Product / department label: Arabic uses `alias` when set. */
export function localizedName(
  row: { name: string; alias?: string | null },
  lang: 'en' | 'ar',
) {
  if (lang === 'ar' && row.alias?.trim()) return row.alias.trim()
  return row.name
}

/** Ticket line label — prefers live masters alias when language is Arabic. */
export function localizedLineName(
  line: { itemId: string; name: string },
  dishes: Array<{ id: string; name: string; alias?: string | null }>,
  lang: 'en' | 'ar',
) {
  const dish = dishes.find((d) => d.id === line.itemId)
  if (!dish) return line.name
  const base = localizedName(dish, lang)
  if (line.name === dish.name || line.name === (dish.alias ?? '')) return base
  if (line.name.startsWith(dish.name)) return `${base}${line.name.slice(dish.name.length)}`
  if (dish.alias && line.name.startsWith(dish.alias)) {
    return `${base}${line.name.slice(dish.alias.length)}`
  }
  return line.name
}

/** Bilingual slip: "Hummus / حمص" when alias exists. */
export function bilingualName(row: { name: string; alias?: string | null }) {
  const alias = row.alias?.trim()
  if (alias && alias !== row.name) return `${row.name} / ${alias}`
  return row.name
}

export type ApiBranchLike = {
  id: string
  companyId?: string
  name: string
  nameAr?: string | null
  code: string
  address?: string | null
  addressAr?: string | null
  phone?: string | null
  active?: boolean
}

export function mapApiBranches(companyId: string, rows: ApiBranchLike[] | undefined): Branch[] {
  if (!rows?.length) return []
  return rows
    .filter((row) => row.id && row.name && row.code)
    .map((row) => ({
      id: row.id,
      companyId: row.companyId ?? companyId,
      name: row.name,
      nameAr: row.nameAr ?? '',
      code: row.code,
      address: row.address ?? '',
      addressAr: row.addressAr ?? '',
      phone: row.phone ?? '',
      active: row.active !== false,
    }))
}
