import type {
  AdapterResult,
  ChannelIntegrationRow,
  ChannelMenuPayload,
  ChannelOrderStatus,
  DeliveryChannelAdapter,
} from './channel-adapter'

const DEFAULT_BASE = 'https://partner-api.keeta.example'

function stubResult(action: string, detail?: unknown): AdapterResult {
  return {
    ok: true,
    mode: 'stub',
    message: `${action} logged (configure API key for live Keeta)`,
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
        'X-Outlet-Id': config.storeId ?? '',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        mode: 'live',
        message: `Keeta API ${res.status}: ${text.slice(0, 200)}`,
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

const STATUS_MAP: Record<ChannelOrderStatus, string> = {
  accepted: 'CONFIRMED',
  rejected: 'REJECTED',
  preparing: 'PREPARING',
  ready: 'READY',
  dispatched: 'PICKED_UP',
  delivered: 'COMPLETED',
  cancelled: 'CANCELLED',
}

export class KeetaAdapter implements DeliveryChannelAdapter {
  readonly channelId = 'Keeta'

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
    return partnerFetch(config, `/open/v1/orders/${encodeURIComponent(externalOrderId)}/confirm`, 'POST', {
      outlet_id: config.storeId,
      estimated_minutes: meta?.etaMinutes ?? 30,
    })
  }

  async rejectOrder(config: ChannelIntegrationRow, externalOrderId: string, reason?: string) {
    return partnerFetch(config, `/open/v1/orders/${encodeURIComponent(externalOrderId)}/cancel`, 'POST', {
      outlet_id: config.storeId,
      reason: reason ?? 'Cannot fulfill',
    })
  }

  async updateOrderStatus(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    status: ChannelOrderStatus,
  ) {
    return partnerFetch(config, `/open/v1/orders/${encodeURIComponent(externalOrderId)}/status`, 'PATCH', {
      outlet_id: config.storeId,
      status: STATUS_MAP[status],
    })
  }

  async pushMenu(config: ChannelIntegrationRow, menu: ChannelMenuPayload) {
    return partnerFetch(config, '/open/v1/menu/upload', 'POST', {
      outlet_id: config.storeId,
      currency: menu.currency,
      items: menu.items.map((i) => ({
        item_id: i.id,
        name: i.name,
        name_local: i.nameAr,
        category_name: i.category,
        price: i.price,
        available: i.active,
        sku_code: i.code,
      })),
    })
  }
}
