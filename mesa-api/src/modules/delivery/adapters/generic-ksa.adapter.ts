import type {
  AdapterResult,
  ChannelIntegrationRow,
  ChannelMenuPayload,
  ChannelOrderStatus,
  DeliveryChannelAdapter,
} from './channel-adapter'

type GenericPartnerConfig = {
  channelId: string
  defaultBaseUrl: string
  label: string
}

const STATUS_MAP: Record<ChannelOrderStatus, string> = {
  accepted: 'accepted',
  rejected: 'rejected',
  preparing: 'preparing',
  ready: 'ready',
  dispatched: 'picked_up',
  delivered: 'completed',
  cancelled: 'cancelled',
}

function stubResult(label: string, action: string, detail?: unknown): AdapterResult {
  return {
    ok: true,
    mode: 'stub',
    message: `${action} logged (configure API key for live ${label})`,
    detail,
  }
}

async function partnerFetch(
  profile: GenericPartnerConfig,
  config: ChannelIntegrationRow,
  path: string,
  method: string,
  body?: unknown,
): Promise<AdapterResult> {
  if (!config.apiKey?.trim()) {
    return stubResult(profile.label, `${method} ${path}`, body)
  }
  const base = (config.apiBaseUrl?.trim() || profile.defaultBaseUrl).replace(/\/$/, '')
  const url = `${base}${path}`
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'X-Store-Id': config.storeId ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        mode: 'live',
        message: `${profile.label} API ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    let detail: unknown = text
    try {
      detail = JSON.parse(text)
    } catch {
      /* plain */
    }
    return { ok: true, mode: 'live', message: 'OK', detail }
  } catch (err) {
    return {
      ok: false,
      mode: 'live',
      message: err instanceof Error ? err.message : 'Network error',
    }
  }
}

export class GenericKsaPartnerAdapter implements DeliveryChannelAdapter {
  readonly channelId: string
  private readonly profile: GenericPartnerConfig

  constructor(profile: GenericPartnerConfig) {
    this.profile = profile
    this.channelId = profile.channelId
  }

  buildMenuPayload(
    storeId: string,
    branchId: string,
    items: ChannelMenuPayload['items'],
    currency: string,
  ): ChannelMenuPayload {
    return {
      storeId,
      branchId,
      channelId: this.channelId,
      currency,
      items,
      syncedAt: new Date().toISOString(),
    }
  }

  async acceptOrder(config: ChannelIntegrationRow, externalOrderId: string, meta?: { etaMinutes?: number }) {
    return partnerFetch(
      this.profile,
      config,
      `/partner/orders/${encodeURIComponent(externalOrderId)}/accept`,
      'POST',
      { store_id: config.storeId, prep_time_minutes: meta?.etaMinutes ?? 30 },
    )
  }

  async rejectOrder(config: ChannelIntegrationRow, externalOrderId: string, reason?: string) {
    return partnerFetch(
      this.profile,
      config,
      `/partner/orders/${encodeURIComponent(externalOrderId)}/reject`,
      'POST',
      { store_id: config.storeId, reason: reason ?? 'Rejected' },
    )
  }

  async updateOrderStatus(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    status: ChannelOrderStatus,
  ) {
    return partnerFetch(
      this.profile,
      config,
      `/partner/orders/${encodeURIComponent(externalOrderId)}/status`,
      'PUT',
      { store_id: config.storeId, status: STATUS_MAP[status] },
    )
  }

  async pushMenu(config: ChannelIntegrationRow, menu: ChannelMenuPayload) {
    return partnerFetch(this.profile, config, '/partner/menu/sync', 'POST', {
      store_id: config.storeId,
      currency: menu.currency,
      products: menu.items.map((i) => ({
        id: i.id,
        name: i.name,
        name_ar: i.nameAr,
        category: i.category,
        price: i.price,
        available: i.active,
      })),
    })
  }
}

export const GENERIC_KSA_PARTNERS: GenericPartnerConfig[] = [
  { channelId: 'Talabat', label: 'Talabat', defaultBaseUrl: 'https://partner-api.talabat.example' },
  { channelId: 'Noon Food', label: 'Noon Food', defaultBaseUrl: 'https://partner-api.noonfood.example' },
  { channelId: 'Mrsool', label: 'Mrsool', defaultBaseUrl: 'https://partner-api.mrsool.example' },
  { channelId: 'The Chefz', label: 'The Chefz', defaultBaseUrl: 'https://partner-api.thechefz.example' },
]

export function genericKsaAdapters(): DeliveryChannelAdapter[] {
  return GENERIC_KSA_PARTNERS.map((p) => new GenericKsaPartnerAdapter(p))
}
