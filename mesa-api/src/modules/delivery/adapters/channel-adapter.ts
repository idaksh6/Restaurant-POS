/** Shared types for KSA delivery channel adapters (HungerStation, Jahez, …). */

export type ChannelMenuItem = {
  id: string
  name: string
  nameAr?: string
  category: string
  price: number
  active: boolean
  code?: string
}

export type ChannelMenuPayload = {
  storeId: string
  branchId: string
  channelId: string
  currency: string
  items: ChannelMenuItem[]
  syncedAt: string
}

export type ChannelOrderStatus =
  | 'accepted'
  | 'rejected'
  | 'preparing'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export type AdapterResult = {
  ok: boolean
  mode: 'live' | 'stub'
  message: string
  detail?: unknown
}

export type ChannelIntegrationRow = {
  channelId: string
  enabled: boolean
  storeId?: string
  apiKey?: string
  apiBaseUrl?: string
  webhookSecret?: string
}

export interface DeliveryChannelAdapter {
  readonly channelId: string
  buildMenuPayload(
    storeId: string,
    branchId: string,
    items: ChannelMenuItem[],
    currency: string,
  ): ChannelMenuPayload
  acceptOrder(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    meta?: { etaMinutes?: number },
  ): Promise<AdapterResult>
  rejectOrder(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    reason?: string,
  ): Promise<AdapterResult>
  updateOrderStatus(
    config: ChannelIntegrationRow,
    externalOrderId: string,
    status: ChannelOrderStatus,
  ): Promise<AdapterResult>
  pushMenu(
    config: ChannelIntegrationRow,
    menu: ChannelMenuPayload,
  ): Promise<AdapterResult>
}
