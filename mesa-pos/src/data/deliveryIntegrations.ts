import { KSA_DELIVERY_CHANNELS } from '../lib/ksaDelivery'
import { getApiBaseUrl } from '../lib/apiBase'

export const DELIVERY_INTEGRATIONS_KEY = 'mesa-delivery-integrations'
export const DELIVERY_NOTIFY_LOG_KEY = 'mesa-delivery-notify-log'

export type ChannelIntegration = {
  channelId: string
  enabled: boolean
  storeId: string
  apiKey: string
  apiBaseUrl: string
  webhookSecret: string
}

export type DeliveryNotifyPrefs = {
  smsEnabled: boolean
  whatsappEnabled: boolean
  /** Unifonic / Twilio-style sender or WhatsApp business number */
  senderId: string
  /** Provider API key (stored locally until cloud messaging is wired) */
  providerApiKey: string
  /** Provider: local stub logs only until real SMS gateway is connected */
  provider: 'stub' | 'unifonic' | 'twilio'
}

export type DeliveryIntegrationsConfig = {
  channels: ChannelIntegration[]
  notify: DeliveryNotifyPrefs
  /** Shown in UI; must match mesa-api DELIVERY_WEBHOOK_SECRET */
  ingestWebhookSecret: string
  updatedAt: number
}

export type DeliveryNotifyEvent = {
  id: string
  at: number
  channel: 'sms' | 'whatsapp'
  to: string
  body: string
  ticketId?: string
  status: 'queued' | 'sent' | 'failed'
  note?: string
}

function defaultChannels(): ChannelIntegration[] {
  return KSA_DELIVERY_CHANNELS.filter((c) => c.id !== 'Direct').map((c) => ({
    channelId: c.id,
    enabled: false,
    storeId: '',
    apiKey: '',
    apiBaseUrl: '',
    webhookSecret: '',
  }))
}

export function defaultDeliveryIntegrations(): DeliveryIntegrationsConfig {
  return {
    channels: defaultChannels(),
    notify: {
      smsEnabled: true,
      whatsappEnabled: false,
      senderId: 'MESA',
      providerApiKey: '',
      provider: 'stub',
    },
    ingestWebhookSecret: '',
    updatedAt: Date.now(),
  }
}

export function loadDeliveryIntegrations(): DeliveryIntegrationsConfig {
  try {
    const raw = localStorage.getItem(DELIVERY_INTEGRATIONS_KEY)
    if (!raw) return defaultDeliveryIntegrations()
    const parsed = JSON.parse(raw) as Partial<DeliveryIntegrationsConfig>
    const base = defaultDeliveryIntegrations()
    const byId = new Map((parsed.channels ?? []).map((c) => [c.channelId, c]))
    return {
      channels: base.channels.map((c) => ({ ...c, ...(byId.get(c.channelId) ?? {}) })),
      notify: { ...base.notify, ...(parsed.notify ?? {}) },
      ingestWebhookSecret: String(parsed.ingestWebhookSecret ?? ''),
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    }
  } catch {
    return defaultDeliveryIntegrations()
  }
}

export function saveDeliveryIntegrations(cfg: DeliveryIntegrationsConfig) {
  const next = { ...cfg, updatedAt: Date.now() }
  localStorage.setItem(DELIVERY_INTEGRATIONS_KEY, JSON.stringify(next))
  return next
}

export function loadNotifyLog(): DeliveryNotifyEvent[] {
  try {
    const raw = localStorage.getItem(DELIVERY_NOTIFY_LOG_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw) as DeliveryNotifyEvent[]
    return Array.isArray(rows) ? rows.slice(0, 50) : []
  } catch {
    return []
  }
}

export function pushNotifyLog(event: DeliveryNotifyEvent) {
  const next = [event, ...loadNotifyLog()].slice(0, 50)
  localStorage.setItem(DELIVERY_NOTIFY_LOG_KEY, JSON.stringify(next))
  return next
}

export function clearNotifyLog() {
  localStorage.removeItem(DELIVERY_NOTIFY_LOG_KEY)
}

export function posApiBaseUrl() {
  return getApiBaseUrl() ?? ''
}

export function deliveryWebhookUrl() {
  const base = posApiBaseUrl()
  return base ? `${base}/webhooks/delivery/ingest` : ''
}
