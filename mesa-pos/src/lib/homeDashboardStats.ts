import { useMemo } from 'react'
import { lineTotal, type KitchenTicket, type OpenTicket, type OrderLine, type Table } from '../data/mock'
import { calcBill } from './bill'
import { isExternalChannelOrder } from './ksaDelivery'
import type { AppliedCharge } from '../state/PosContext'

export type HomeDashboardStats = {
  openTablesCount: number
  billingCount: number
  kitchenQueue: number
  openValue: number
  deliveryCount: number
  onlineCount: number
  takeawayCount: number
  quickServeCount: number
  driveThruCount: number
  unsettledCount: number
  dineOpenCount: number
}

export function badgeCount(n: number): number | undefined {
  return n > 0 ? n : undefined
}

function activeTickets(tickets: OpenTicket[]) {
  return tickets.filter((t) => t.lines.length > 0)
}

function ticketPayable(ticket: OpenTicket) {
  const goods = lineTotal(ticket.lines) + (ticket.deliveryFee ?? 0)
  return calcBill(goods, 0, []).total
}

export function useHomeDashboardStats({
  tables,
  tableOrders,
  tickets,
  kitchen,
  tableDiscounts,
  getTableChargeLines,
}: {
  tables: Table[]
  tableOrders: Record<string, OrderLine[]>
  tickets: OpenTicket[]
  kitchen: KitchenTicket[]
  tableDiscounts: Record<string, number>
  getTableChargeLines: (tableId: string, goodsSubtotal: number) => AppliedCharge[]
}): HomeDashboardStats {
  return useMemo(() => {
    const openTables = tables.filter((t) => t.status === 'occupied' || t.status === 'billing')
    const billing = tables.filter((t) => t.status === 'billing')
    const kitchenQueue = kitchen.filter((k) => k.status !== 'ready').length
    const openRows = activeTickets(tickets)

    const deliveryCount = openRows.filter((t) => t.type === 'delivery').length
    const onlineCount = openRows.filter(
      (t) => t.type === 'online' || (t.type === 'delivery' && isExternalChannelOrder(t)),
    ).length
    const takeawayCount = openRows.filter(
      (t) => t.type === 'takeaway' && !t.id.startsWith('qs-') && !t.id.startsWith('dt-'),
    ).length
    const quickServeCount = openRows.filter((t) => t.id.startsWith('qs-')).length
    const driveThruCount = openRows.filter((t) => t.id.startsWith('dt-')).length

    const tableQueue = openTables.filter((table) => (tableOrders[table.id]?.length ?? 0) > 0)
    const ticketQueue = openRows.filter((t) => t.type !== 'dine-in')
    const unsettledCount = tableQueue.length + ticketQueue.length

    let openValue = 0
    for (const table of tableQueue) {
      const lines = tableOrders[table.id] ?? []
      const goods = lineTotal(lines)
      const discountPct = tableDiscounts[table.id] ?? 0
      const charges = getTableChargeLines(table.id, goods)
      openValue += calcBill(goods, discountPct, charges).total
    }
    for (const ticket of ticketQueue) {
      openValue += ticketPayable(ticket)
    }

    return {
      openTablesCount: openTables.length,
      billingCount: billing.length,
      kitchenQueue,
      openValue,
      deliveryCount,
      onlineCount,
      takeawayCount,
      quickServeCount,
      driveThruCount,
      unsettledCount,
      dineOpenCount: openTables.length,
    }
  }, [tables, tableOrders, tickets, kitchen, tableDiscounts, getTableChargeLines])
}
