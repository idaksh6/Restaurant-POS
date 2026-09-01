import { loadCompanyProfile } from './company'

export type PosPrefs = {
  /** When true, opening a free table shows the seat/guest picker modal. */
  assignGuestsOnOpen: boolean
}

const DEFAULT: PosPrefs = {
  assignGuestsOnOpen: true,
}

export const POS_PREFS_EVENT = 'mesa:pos-prefs-changed'

function prefsKey(companyId?: string) {
  const id = companyId ?? loadCompanyProfile().id
  return `mesa-pos-prefs-${id}`
}

export function loadPosPrefs(companyId?: string): PosPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(companyId))
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<PosPrefs>) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT }
}

export function savePosPrefs(prefs: PosPrefs, companyId?: string) {
  localStorage.setItem(prefsKey(companyId), JSON.stringify({ ...DEFAULT, ...prefs }))
  window.dispatchEvent(new Event(POS_PREFS_EVENT))
}

export function assignGuestsOnOpen(companyId?: string) {
  return loadPosPrefs(companyId).assignGuestsOnOpen
}
