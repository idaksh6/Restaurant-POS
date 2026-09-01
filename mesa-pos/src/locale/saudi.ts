/** Saudi Arabia market defaults for Mesa POS (Petpooja-style). */

export const SAUDI = {
  country: 'Saudi Arabia',
  countryAr: 'المملكة العربية السعودية',
  currency: 'SAR',
  currencyLabel: 'Saudi Riyal',
  locale: 'en-SA',
  localeAr: 'ar-SA',
  /** Standard VAT in KSA */
  vatRate: 0.15,
  vatLabel: 'VAT 15%',
  vatLabelAr: 'ضريبة القيمة المضافة ١٥٪',
  city: 'Riyadh',
  cityAr: 'الرياض',
  brandTagline: 'Restaurant POS for Saudi Arabia',
  brandTaglineAr: 'نظام نقاط البيع للمطاعم في السعودية',
} as const

export const paymentMethods = [
  'Cash',
  'mada',
  'Visa / Mastercard',
  'Apple Pay',
  'STC Pay',
  'Split bill',
  'Customer credit',
] as const

export const onlineChannels = [
  'HungerStation',
  'Jahez',
  'Keeta',
  'The Chefz',
  'Mrsool',
] as const

export const saudiAreas = ['Main Hall', 'Family Section', 'Outdoor', 'Private'] as const

export function money(n: number, lang: 'en' | 'ar' = 'en') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(n)
}

export function calcVat(subtotal: number) {
  return subtotal * SAUDI.vatRate
}

export function withVat(subtotal: number) {
  return subtotal + calcVat(subtotal)
}
