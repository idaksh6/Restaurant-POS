import type { OpenTicket } from '../data/mock'

export type DeliveryColumn = 'new' | 'preparing' | 'ready' | 'dispatched' | 'delivered'

export function resolveDeliveryColumn(ticket: OpenTicket): DeliveryColumn {
  if (ticket.deliveryStatus === 'delivered') return 'delivered'
  if (ticket.deliveryStatus === 'dispatched') return 'dispatched'
  if (ticket.deliveryStatus === 'ready' || ticket.kitchenStatus === 'ready') return 'ready'
  if (ticket.deliveryStatus === 'preparing') return 'preparing'
  if (ticket.deliveryStatus === 'new') return 'new'

  if (ticket.deliveryBoyId && ticket.lines.some((l) => l.sent)) return 'dispatched'
  if (ticket.lines.some((l) => l.sent)) return 'preparing'
  return 'new'
}
