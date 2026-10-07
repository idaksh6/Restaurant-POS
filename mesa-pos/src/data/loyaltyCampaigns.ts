import { tenantGetItem, tenantSetItem } from './repos/db'
import { pushNotifyLog } from './deliveryIntegrations'

export type LoyaltyCampaign = {
  id: string
  active: boolean
  name: string
  type: 'birthday' | 'punch'
  /** Birthday: bonus points once per year in window. Punch: reward after N visits. */
  bonusPts: number
  /** Birthday window ± days around DOB (MM-DD). */
  windowDays?: number
  /** Punch card visits required. */
  visitsRequired?: number
  messageTemplate: string
}

export type CampaignCustomerState = {
  birthDate?: string
  lastBirthdayBonusYear?: number
  punchProgress?: number
  lastPunchRewardAt?: string
}

const CAMPAIGN_KEY = 'mesa-loyalty-campaigns'

const SEED: LoyaltyCampaign[] = [
  {
    id: 'camp-birthday',
    active: true,
    name: 'Birthday bonus',
    type: 'birthday',
    bonusPts: 50,
    windowDays: 7,
    messageTemplate: 'Happy birthday {name}! You earned {pts} bonus points.',
  },
  {
    id: 'camp-punch',
    active: true,
    name: 'Visit punch card',
    type: 'punch',
    bonusPts: 100,
    visitsRequired: 5,
    messageTemplate: 'Punch card complete — {pts} points for {name}.',
  },
]

export function loadLoyaltyCampaigns(): LoyaltyCampaign[] {
  try {
    const raw = tenantGetItem(CAMPAIGN_KEY)
    if (!raw) return SEED
    const parsed = JSON.parse(raw) as LoyaltyCampaign[]
    return Array.isArray(parsed) && parsed.length ? parsed : SEED
  } catch {
    return SEED
  }
}

export function saveLoyaltyCampaigns(rows: LoyaltyCampaign[]) {
  tenantSetItem(CAMPAIGN_KEY, JSON.stringify(rows))
}

function fillTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}

function mmDd(isoOrMd: string) {
  const s = isoOrMd.trim()
  if (/^\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inBirthdayWindow(birthDate: string | undefined, windowDays: number, now = new Date()) {
  if (!birthDate) return false
  const md = mmDd(birthDate)
  if (!md) return false
  const [mm, dd] = md.split('-').map(Number)
  const year = now.getFullYear()
  const target = new Date(year, mm - 1, dd, 12)
  const start = new Date(target)
  start.setDate(start.getDate() - windowDays)
  const end = new Date(target)
  end.setDate(end.getDate() + windowDays)
  return now >= start && now <= end
}

export type CampaignApplyResult = {
  bonusPts: number
  messages: string[]
  patch: CampaignCustomerState
}

/** Evaluate campaigns after a visit/earn. Mutates patch fields for persistence on customer. */
export function applyLoyaltyCampaigns(input: {
  name: string
  phone?: string
  visitsAfter: number
  state: CampaignCustomerState
  campaigns?: LoyaltyCampaign[]
}): CampaignApplyResult {
  const campaigns = (input.campaigns ?? loadLoyaltyCampaigns()).filter((c) => c.active)
  let bonusPts = 0
  const messages: string[] = []
  const patch: CampaignCustomerState = { ...input.state }
  const year = new Date().getFullYear()

  for (const camp of campaigns) {
    if (camp.type === 'birthday') {
      const windowDays = camp.windowDays ?? 7
      if (
        inBirthdayWindow(patch.birthDate, windowDays) &&
        patch.lastBirthdayBonusYear !== year
      ) {
        bonusPts += camp.bonusPts
        patch.lastBirthdayBonusYear = year
        const msg = fillTemplate(camp.messageTemplate, {
          name: input.name,
          pts: camp.bonusPts,
        })
        messages.push(msg)
        pushNotifyLog({
          id: `camp-${Date.now()}-${camp.id}`,
          at: Date.now(),
          channel: 'sms',
          to: input.phone || '—',
          body: msg,
          status: 'queued',
          note: `Campaign · ${camp.name}`,
        })
      }
    }
    if (camp.type === 'punch') {
      const need = Math.max(2, camp.visitsRequired ?? 5)
      const progress = ((patch.punchProgress ?? 0) % need) + 1
      patch.punchProgress = progress
      if (progress >= need) {
        bonusPts += camp.bonusPts
        patch.punchProgress = 0
        patch.lastPunchRewardAt = new Date().toISOString()
        const msg = fillTemplate(camp.messageTemplate, {
          name: input.name,
          pts: camp.bonusPts,
        })
        messages.push(msg)
        pushNotifyLog({
          id: `camp-${Date.now()}-${camp.id}`,
          at: Date.now(),
          channel: 'sms',
          to: input.phone || '—',
          body: msg,
          status: 'queued',
          note: `Campaign · ${camp.name}`,
        })
      }
    }
  }

  return { bonusPts, messages, patch }
}
