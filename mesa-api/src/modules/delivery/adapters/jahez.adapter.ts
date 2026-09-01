import type {
  AdapterResult,
  ChannelIntegrationRow,
  ChannelMenuPayload,
  ChannelOrderStatus,
  DeliveryChannelAdapter,
} from './channel-adapter'

const DEFAULT_BASE = 'https://partner-api.jahez.example'

function stubResult(action: string, detail?: unknown): AdapterResult {
  return {
    ok: true,
    mode: 'stub',
    message: `${action} logged (configure API key for live Jahez)`,
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
        'X-API-Key': config.apiKey,
        'X-Restaurant-Id': config.storeId ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        mode: 'live',
        message: `Jahez API ${res.status}: ${text.slice(0, 200)}`,
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

export class JahezAdapter implements DeliveryChannelAdapter {
  readonly channelId = 'Jahez'

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
    return partnerFetch(config, `/api/v2/orders/${encodeURIComponent(externalOrderId)}/accept`, 'POST', {
      restaurant_id: config.storeId,
      preparation_time: meta?.etaMinutes ?? 30,
    })
  }

  async rejectOrder(config: ChannelIntegrationRow, externalOrderId: string, reason?: string) {
    return partnerFetch(config, `/api/v2/orders/${encodeURIComponent(externalOrderId)}/reject`, 'POST', {
      restaurant_id: config.storeId,
      rejection_reason: reason ?? 'Busy',
    })
  }

  async updateOrderStatus(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    status: ChannelOrderStatus,
  ) {
    const map: Record<ChannelOrderStatus, string> = {
      accepted: 'confirmed',
      rejected: 'rejected',
      preparing: 'preparing',
      ready: 'ready',
      dispatched: 'picked_up',
      delivered: 'completed',
      cancelled: 'cancelled',
    }
    return partnerFetch(config, `/api/v2/orders/${encodeURIComponent(externalOrderId)}/status`, 'PATCH', {
      restaurant_id: config.storeId,
      status: map[status],
    })
  }

  async pushMenu(config: ChannelIntegrationRow, menu: ChannelMenuPayload) {
    return partnerFetch(config, '/api/v2/menu', 'PUT', {
      restaurant_id: config.storeId,
      currency: menu.currency,
      products: menu.items.map((i) => ({
        id: i.id,
        name: i.name,
        name_ar: i.nameAr,
        category_name: i.category,
        price: i.price,
        is_available: i.active,
      })),
    })
  }
}
