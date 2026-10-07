import type { OpenTicket } from '../data/mock'

/** Route that opens this exact ticket on its service screen. */
export function ticketHref(ticket: OpenTicket) {
  const id = encodeURIComponent(ticket.id)
  if (ticket.tableId) {
    return `/dine-in?table=${encodeURIComponent(ticket.tableId)}`
  }
  if (ticket.id.startsWith('qs-')) return `/quick-serve?ticket=${id}`
  if (ticket.id.startsWith('dt-')) return `/drive-thru?ticket=${id}`
  if (ticket.id.startsWith('bc-') || ticket.channel === 'barcode') {
    return `/barcode?ticket=${id}`
  }
  if (ticket.type === 'delivery' || ticket.type === 'online') {
    return `/delivery?ticket=${id}`
  }
  if (ticket.type === 'dine-in') return '/dine-in'
  return `/takeaway?ticket=${id}`
}
