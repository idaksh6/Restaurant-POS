import { lineTotal, money, type OpenTicket } from '../../data/mock'
import { calcBill } from '../../lib/bill'
import { loadCompanyProfile } from '../../data/company'
import { peekDishes } from '../../data/repos/mastersRepo'
import { loadTaxes, orderTaxBillOptions } from '../../data/tax'

function ticketBill(ticket: OpenTicket) {
  const lines = ticket.lines
  return calcBill(
    lineTotal(lines),
    0,
    [],
    orderTaxBillOptions(
      lines,
      peekDishes(),
      loadTaxes(),
      loadCompanyProfile().enableTax !== false,
    ),
  )
}

export function serveNoFromTicket(ticket: OpenTicket): number {
  const match = ticket.customer.match(/#(\d+)/)
  return match ? Number(match[1]) : 0
}

export function isQuickServeTicket(ticket: OpenTicket) {
  return ticket.id.startsWith('qs-')
}

export function quickServeTickets(tickets: OpenTicket[]) {
  return tickets.filter(isQuickServeTicket)
}

/** Matches home dashboard Quick Serve badge — tickets with at least one line. */
export function quickServeOpenCount(tickets: OpenTicket[]) {
  return quickServeTickets(tickets).filter((t) => t.lines.length > 0).length
}

export function sortQuickServeTickets(list: OpenTicket[]) {
  return [...list].sort((a, b) => {
    const aActive = a.lines.length > 0 ? 1 : 0
    const bActive = b.lines.length > 0 ? 1 : 0
    if (aActive !== bActive) return bActive - aActive
    return serveNoFromTicket(b) - serveNoFromTicket(a)
  })
}

export function ticketStatus(ticket: OpenTicket) {
  const lines = ticket.lines
  if (lines.length === 0) return { label: 'Empty', tone: 'muted' as const }
  if (lines.some((l) => !l.sent)) return { label: 'Open', tone: 'amber' as const }
  return { label: 'Sent', tone: 'teal' as const }
}

export function ticketTotal(ticket: OpenTicket) {
  return ticketBill(ticket).total
}

export function formatTicketAmount(ticket: OpenTicket) {
  return ticket.lines.length > 0 ? money(ticketTotal(ticket)) : '—'
}

/** Guest name after "·" in customer label, e.g. "#79 Quick Serve · Ahmed" → "Ahmed". */
export function guestNameFromTicket(ticket: OpenTicket): string | null {
  const parts = ticket.customer.split('·').map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const name = parts[parts.length - 1]
  if (!name || /^quick serve$/i.test(name)) return null
  return name
}

export function guestLabelFromTicket(ticket: OpenTicket, walkInLabel = 'Walk-in') {
  return guestNameFromTicket(ticket) ?? walkInLabel
}
