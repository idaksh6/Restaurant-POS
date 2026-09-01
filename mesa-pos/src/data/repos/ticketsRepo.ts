import { lineTotal, type OpenTicket, type OrderLine } from '../mock'
import { getActiveBranchId } from '../company'
import { sameFloorTable, unscopedFloorId } from './floorRepo'
import { mesaDb, tenantGetItem, tenantSetItem } from './db'

const LS_KEY = 'mesa-open-tickets'

function inferredBranch(ticket: OpenTicket): string | undefined {
  if (ticket.branchId) return ticket.branchId
  const match = /^dine:([^:]+):/.exec(ticket.id)
  return match?.[1]
}

function inBranch(ticket: OpenTicket, branchId: string) {
  return inferredBranch(ticket) === branchId
}

export function ticketStamp(ticket: { updatedAt?: number }): number {
  return typeof ticket.updatedAt === 'number' && Number.isFinite(ticket.updatedAt) ? ticket.updatedAt : 0
}

/** Open dine-in check for a floor table. Newest session wins if leftovers exist. */
export function dineCheckForTable(tickets: OpenTicket[], tableId: string, branchId = getActiveBranchId()) {
  const matches = tickets.filter(
    (c) =>
      c.type === 'dine-in' &&
      sameFloorTable(c.tableId, tableId) &&
      c.checkStatus !== 'settled' &&
      (!c.branchId || c.branchId === branchId),
  )
  if (!matches.length) return undefined
  return [...matches].sort((a, b) => ticketStamp(b) - ticketStamp(a))[0]
}

/** Keep the newer check. On a timestamp tie, keep the incoming overlay (b). */
export function preferTicket(a: OpenTicket, b: OpenTicket): OpenTicket {
  const ta = ticketStamp(a)
  const tb = ticketStamp(b)
  if (tb !== ta) return tb > ta ? b : a
  return b
}

function mergeLines(a: OrderLine[], b: OrderLine[]): OrderLine[] {
  const byId = new Map<string, OrderLine>()
  for (const line of [...a, ...b]) {
    const id = String(line.id ?? '')
    if (!id) continue
    const prev = byId.get(id)
    if (!prev) {
      byId.set(id, line)
      continue
    }
    byId.set(id, {
      ...prev,
      ...line,
      qty: Math.max(Number(prev.qty) || 0, Number(line.qty) || 0),
      sent: Boolean(prev.sent || line.sent),
      note: line.note || prev.note,
    })
  }
  return collapseOpenLines([...byId.values()], 'max')
}

/** Merge unsent rows of the same dish so one tap cannot appear as two tickets. */
export function collapseOpenLines(lines: OrderLine[], qtyMode: 'sum' | 'max' = 'sum'): OrderLine[] {
  const sent: OrderLine[] = []
  const open = new Map<string, OrderLine>()
  for (const line of lines) {
    if (line.sent) {
      sent.push(line)
      continue
    }
    const key = `${line.itemId}::${line.note ?? ''}::${Number(line.price)}`
    const prev = open.get(key)
    if (!prev) {
      open.set(key, { ...line })
      continue
    }
    const qty =
      qtyMode === 'sum'
        ? (Number(prev.qty) || 0) + (Number(line.qty) || 0)
        : Math.max(Number(prev.qty) || 0, Number(line.qty) || 0)
    open.set(key, { ...prev, qty })
  }
  return [...sent, ...open.values()]
}

/** Combine two copies of the same check so Chrome and desktop adds both survive. */
export function mergeTicketPair(a: OpenTicket, b: OpenTicket): OpenTicket {
  const winner = preferTicket(a, b)
  const lines = mergeLines(a.lines, b.lines)
  return {
    ...winner,
    lines,
    amount: lineTotal(lines),
    updatedAt: Math.max(ticketStamp(a), ticketStamp(b)) || undefined,
  }
}

export const TICKETS_SYNC_EVENT = 'mesa-tickets-sync'

export function notifyTicketsSynced() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(TICKETS_SYNC_EVENT))
}

export function mergeRemoteTickets(
  remote: OpenTicket[],
  branchId: string,
  pendingCreates: OpenTicket[],
  settledIds: string[],
  otherBranchTickets: OpenTicket[] = [],
  localOverlay: OpenTicket[] = [],
  pendingUpdates: OpenTicket[] = [],
) {
  const byId = new Map<string, OpenTicket>()
  const stamp = (row: OpenTicket) => ({
    ...row,
    branchId: row.branchId ?? inferredBranch(row) ?? branchId,
  })

  // Server list is source of truth for this branch.
  for (const row of remote) {
    const next = stamp(row)
    byId.set(next.id, next)
  }

  // Keep newer in-memory edits (e.g. void) only for tickets still open on the server.
  // Never resurrect a check the API omitted (settled on another terminal).
  for (const row of localOverlay) {
    if (!inBranch(row, branchId)) continue
    const next = stamp(row)
    const cur = byId.get(next.id)
    if (!cur) continue
    byId.set(next.id, preferTicket(cur, next))
  }

  // Unsynced updates only apply when the server still has the ticket.
  for (const row of pendingUpdates) {
    if (inferredBranch(row) && inferredBranch(row) !== branchId) continue
    const next = stamp(row)
    const cur = byId.get(next.id)
    if (!cur) continue
    byId.set(next.id, preferTicket(cur, next))
  }

  // Unsynced creates may not be on the server yet — keep them.
  for (const row of pendingCreates) {
    if (inferredBranch(row) && inferredBranch(row) !== branchId) continue
    const next = stamp(row)
    const cur = byId.get(next.id)
    byId.set(next.id, cur ? preferTicket(cur, next) : next)
  }

  for (const id of settledIds) byId.delete(id)

  const rest: OpenTicket[] = []
  const dineByTable = new Map<string, OpenTicket>()
  for (const row of byId.values()) {
    if (row.type !== 'dine-in' || !row.tableId || row.checkStatus === 'settled') {
      rest.push(row)
      continue
    }
    const key = `${unscopedFloorId(row.tableId)}:${row.branchId ?? branchId}`
    const cur = dineByTable.get(key)
    if (!cur || ticketStamp(row) >= ticketStamp(cur)) dineByTable.set(key, row)
  }

  const others = otherBranchTickets.filter((t) => {
    const br = inferredBranch(t)
    return Boolean(br && br !== branchId)
  })
  return [...others, ...rest, ...dineByTable.values()]
}

export const ticketsRepo = {
  async list(branchId = getActiveBranchId()): Promise<OpenTicket[]> {
    const rows = await mesaDb.tickets.toArray()
    const scoped = rows.filter((t) => inBranch(t, branchId))
    if (scoped.length) return scoped
    try {
      const raw = tenantGetItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as OpenTicket[]
        const forBranch = parsed.filter((t) => inBranch(t, branchId))
        if (forBranch.length) {
          await mesaDb.tickets.bulkPut(
            forBranch.map((t) => ({ ...t, branchId: t.branchId ?? branchId })),
          )
          return forBranch
        }
      }
    } catch {
      /* ignore */
    }
    return []
  },

  async saveAll(tickets: OpenTicket[], branchId = getActiveBranchId()) {
    const stamped = tickets.map((t) => ({ ...t, branchId: t.branchId ?? inferredBranch(t) ?? branchId }))
    const others = (await mesaDb.tickets.toArray()).filter((t) => {
      const br = inferredBranch(t)
      return Boolean(br && br !== branchId)
    })
    await mesaDb.tickets.clear()
    const all = [...others, ...stamped]
    if (all.length) await mesaDb.tickets.bulkPut(all)
    tenantSetItem(LS_KEY, JSON.stringify(all))
  },

  async put(ticket: OpenTicket, branchId = getActiveBranchId()) {
    await mesaDb.tickets.put({ ...ticket, branchId: ticket.branchId ?? branchId })
    const all = await mesaDb.tickets.toArray()
    tenantSetItem(LS_KEY, JSON.stringify(all))
  },

  async remove(id: string) {
    await mesaDb.tickets.delete(id)
    const all = await mesaDb.tickets.toArray()
    tenantSetItem(LS_KEY, JSON.stringify(all))
  },
}
