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

/** Find a dish for a ticket / ledger line (id first, then name / alias match). */
export function findDishForLine(
  line: { itemId?: string; name: string },
  dishes: Array<{ id: string; name: string; alias?: string | null }>,
) {
  if (line.itemId) {
    const byId = dishes.find((d) => d.id === line.itemId)
    if (byId) return byId
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
  const name = norm(line.name)
  const nameLower = name.toLowerCase()
  return (
    dishes.find((d) => norm(d.name) === name) ||
    dishes.find((d) => d.alias?.trim() && norm(d.alias) === name) ||
    dishes.find((d) => norm(d.name).toLowerCase() === nameLower) ||
    dishes.find((d) => name.startsWith(norm(d.name))) ||
    dishes.find((d) => d.alias?.trim() && name.startsWith(norm(d.alias))) ||
    undefined
  )
}

/** Ticket line label — prefers live masters alias when language is Arabic. */
export function localizedLineName(
  line: { itemId: string; name: string },
  dishes: Array<{ id: string; name: string; alias?: string | null }>,
  lang: 'en' | 'ar',
) {
  const dish = findDishForLine(line, dishes)
  if (!dish) return line.name
  const base = localizedName(dish, lang)
  if (line.name === dish.name || line.name === (dish.alias ?? '')) return base
  if (line.name.startsWith(dish.name)) return `${base}${line.name.slice(dish.name.length)}`
  if (dish.alias && line.name.startsWith(dish.alias)) {
    return `${base}${line.name.slice(dish.alias.length)}`
  }
  return line.name
}

/** Resolve Arabic name for a line: stamped nameAr, else product alias. */
export function resolveLineArabic(
  line: { itemId?: string; name: string; nameAr?: string | null },
  dishes: Array<{ id: string; name: string; alias?: string | null }>,
): string {
  const stamped = line.nameAr?.trim()
  if (stamped) return stamped
  const dish = findDishForLine(line, dishes)
  const alias = dish?.alias?.trim()
  if (alias && alias !== dish?.name && alias !== line.name.trim()) return alias
  return ''
}

/** Bilingual slip parts: English on top, Arabic below when alias exists. */
export function bilingualNameParts(row: { name: string; alias?: string | null; nameAr?: string | null }) {
  const en = row.name
  const ar = (row.nameAr ?? row.alias)?.trim() || ''
  if (ar && ar !== en) return { en, ar }
  return { en, ar: '' }
}

/** Bilingual slip: English then Arabic on a second line when alias exists. */
export function bilingualName(row: { name: string; alias?: string | null }) {
  const { en, ar } = bilingualNameParts(row)
  return ar ? `${en}\n${ar}` : en
}

/** Common KSA floor area labels — storage stays English; UI may show Arabic. */
const AREA_NAME_AR: Record<string, string> = {
  'Main Hall': 'القاعة الرئيسية',
  'Family Section': 'قسم العائلات',
  Outdoor: 'خارجي',
  Private: 'خاص',
  'VIP Lounge': 'صالة كبار الشخصيات',
  'Executive Suites': 'الأجنحة التنفيذية',
  Rooftop: 'السطح',
}

export function localizedAreaName(name: string, lang: 'en' | 'ar'): string {
  if (lang !== 'ar') return name
  return AREA_NAME_AR[name] ?? name
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
