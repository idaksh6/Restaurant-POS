import { getApiBaseUrl } from './apiBase'

function token() {
  return sessionStorage.getItem('mesa-token')
}

async function deliveryFetch(path: string, init?: RequestInit) {
  const base = getApiBaseUrl()
  if (!base) throw new Error('API not configured')
  const auth = token()
  if (!auth) throw new Error('Sign in required')
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let message = text || `Request failed (${res.status})`
    try {
      const j = JSON.parse(text) as { message?: string | string[] }
      if (j.message) {
        message = Array.isArray(j.message) ? j.message.join(', ') : j.message
      }
    } catch {
      /* keep raw text */
    }
    throw new Error(message)
  }
  return text ? JSON.parse(text) : {}
}

export type ChannelConfigRow = {
  id: string
  branchId: string
  channelId: string
  enabled: boolean
  storeId?: string | null
  apiKey?: string | null
  apiBaseUrl?: string | null
  webhookSecret?: string | null
  lastMenuSyncAt?: string | null
  lastMenuSyncNote?: string | null
}

export async function apiListChannelConfigs(branchId: string) {
  return deliveryFetch(
    `/delivery/channels/config?branchId=${encodeURIComponent(branchId)}`,
  ) as Promise<ChannelConfigRow[]>
}

export async function apiUpsertChannelConfig(body: {
  branchId: string
  channelId: string
  enabled?: boolean
  storeId?: string
  apiKey?: string
  apiBaseUrl?: string
  webhookSecret?: string
}) {
  return deliveryFetch('/delivery/channels/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function apiPreviewChannelMenu(branchId: string, channelId: string) {
  return deliveryFetch(
    `/delivery/channels/${encodeURIComponent(channelId)}/menu/preview?branchId=${encodeURIComponent(branchId)}`,
  )
}

export async function apiSyncChannelMenu(branchId: string, channelId: string) {
  return deliveryFetch(
    `/delivery/channels/${encodeURIComponent(channelId)}/menu/sync?branchId=${encodeURIComponent(branchId)}`,
    { method: 'POST' },
  )
}

export async function apiAcceptChannelOrder(ticketId: string, etaMinutes?: number) {
  return deliveryFetch(`/delivery/orders/${encodeURIComponent(ticketId)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ etaMinutes }),
  })
}

export async function apiRejectChannelOrder(ticketId: string, reason?: string) {
  return deliveryFetch(`/delivery/orders/${encodeURIComponent(ticketId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function apiPushChannelStatus(
  ticketId: string,
  status: 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled',
) {
  return deliveryFetch(`/delivery/orders/${encodeURIComponent(ticketId)}/channel-status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

/** Fire platform status update; never blocks POS flow. */
export function pushChannelStatusQuiet(
  ticketId: string,
  status: 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled',
) {
  void apiPushChannelStatus(ticketId, status).catch(() => undefined)
}
