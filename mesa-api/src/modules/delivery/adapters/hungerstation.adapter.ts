import type {
  AdapterResult,
  ChannelIntegrationRow,
  ChannelMenuPayload,
  ChannelOrderStatus,
  DeliveryChannelAdapter,
} from './channel-adapter'

const DEFAULT_BASE = 'https://partner-api.hungerstation.example'

function stubResult(action: string, detail?: unknown): AdapterResult {
  return {
    ok: true,
    mode: 'stub',
    message: `${action} logged (configure API key for live HungerStation)`,
    detail,
  }
}

async function partnerFetch(
  config: ChannelIntegrationRow,
  path: string,
  method: string,
  body?: unknown,
): Promise<AdapterResult> {
  if (!config.apiKey?.trim()) {
    return stubResult(`${method} ${path}`, body)
  }
  const base = (config.apiBaseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, '')
  const url = `${base}${path}`
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'X-Store-Id': config.storeId ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        mode: 'live',
        message: `HungerStation API ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    let detail: unknown = text
    try {
      detail = JSON.parse(text)
    } catch {
      /* plain text */
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

export class HungerStationAdapter implements DeliveryChannelAdapter {
  readonly channelId = 'HungerStation'

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
    return partnerFetch(config, `/v1/orders/${encodeURIComponent(externalOrderId)}/accept`, 'POST', {
      store_id: config.storeId,
      eta_minutes: meta?.etaMinutes ?? 30,
    })
  }

  async rejectOrder(config: ChannelIntegrationRow, externalOrderId: string, reason?: string) {
    return partnerFetch(config, `/v1/orders/${encodeURIComponent(externalOrderId)}/reject`, 'POST', {
      store_id: config.storeId,
      reason: reason ?? 'Unable to fulfill',
    })
  }

  async updateOrderStatus(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    status: ChannelOrderStatus,
  ) {
    const map: Record<ChannelOrderStatus, string> = {
      accepted: 'ACCEPTED',
      rejected: 'REJECTED',
      preparing: 'PREPARING',
      ready: 'READY_FOR_PICKUP',
      dispatched: 'OUT_FOR_DELIVERY',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
    }
    return partnerFetch(config, `/v1/orders/${encodeURIComponent(externalOrderId)}/status`, 'PUT', {
      store_id: config.storeId,
      status: map[status],
    })
  }

  async pushMenu(config: ChannelIntegrationRow, menu: ChannelMenuPayload) {
    return partnerFetch(config, '/v1/menu/sync', 'POST', {
      store_id: config.storeId,
      currency: menu.currency,
      items: menu.items.map((i) => ({
        external_id: i.id,
        name: i.name,
        name_ar: i.nameAr,
        category: i.category,
        price: i.price,
        available: i.active,
        sku: i.code,
      })),
    })
  }
}
