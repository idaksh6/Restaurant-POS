import { lineTotal, type OpenTicket } from '../data/mock'
import { calcBill } from './bill'
import { channelSettleMethod } from './ksaDelivery'

/** @deprecated Prefer channelSettleMethod(ticket.channel) — kept for Direct COD default. */
export const DELIVERY_AUTO_SETTLE_METHOD = 'Cash'

export function deliveryBill(ticket: OpenTicket) {
  const goods = lineTotal(ticket.lines)
  const fee = ticket.deliveryFee ?? 0
  return calcBill(
    goods,
    0,
    fee > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: fee }] : [],
  )
}

export function deliveryNo(ticket: OpenTicket) {
  const m = ticket.id.match(/^dl-(\d+)/)
  if (m) return Number(m[1])
  const digits = ticket.id.replace(/\D/g, '')
  return Number(digits.slice(-2) || '0') || 0
}

export function settleMethodForDelivery(ticket: OpenTicket) {
  return channelSettleMethod(ticket.channel)
}

export function makeDeliveryOtp() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

