export type SettingsSectionId =
  | 'settings'
  | 'printer'
  | 'products'
  | 'user'
  | 'accounts'
  | 'ingredients'
  | 'inventory'
  | 'database'

const SECTION_IDS: SettingsSectionId[] = [
  'settings',
  'printer',
  'products',
  'user',
  'accounts',
  'ingredients',
  'inventory',
  'database',
]

export function parseSettingsTab(value: string | null): SettingsSectionId {
  if (value && SECTION_IDS.includes(value as SettingsSectionId)) {
    return value as SettingsSectionId
  }
  return 'settings'
}

export function settingsHubPath(tab: SettingsSectionId = 'settings') {
  return tab === 'settings' ? '/settings' : `/settings?tab=${tab}`
}
