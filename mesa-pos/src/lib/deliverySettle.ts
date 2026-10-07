import { calcChargeAmount, chargesForBranch, loadAllCharges } from '../data/charges'
import { lineTotal, type OpenTicket } from '../data/mock'
import { loadCompanyProfile } from '../data/company'
import { peekDishes } from '../data/repos/mastersRepo'
import { dishTaxPercent, loadTaxes, orderTaxBillOptions } from '../data/tax'
import { channelSettleMethod } from './ksaDelivery'
import { calcBill } from './bill'
import type { AppliedCharge } from '../state/PosContext'

/** @deprecated Prefer channelSettleMethod(ticket.channel) — kept for Direct COD default. */
export const DELIVERY_AUTO_SETTLE_METHOD = 'Cash'

function resolveTicketExtraCharges(ticket: OpenTicket, goods: number): AppliedCharge[] {
  const catalog = chargesForBranch(loadAllCharges())
  const taxes = loadTaxes()
  return (ticket.chargeIds ?? [])
    .map(
      (id) =>
        catalog.find((c) => c.id === id && c.active) ??
        catalog.find((c) => c.id.startsWith(`${id}__`) && c.active) ??
        catalog.find((c) => id.startsWith(`${c.id}__`) && c.active),
    )
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      amount: calcChargeAmount(c!, goods),
      taxPercent: dishTaxPercent(c!.taxIds, taxes),
    }))
}

/** Goods + discount + catalog charges + delivery fee (with VAT). */
export function deliveryBill(ticket: OpenTicket, feeLabel = 'Delivery fee') {
  const goods = lineTotal(ticket.lines)
  const fee = ticket.deliveryFee ?? 0
  const discountPct = ticket.discountPct ?? 0
  const charges: AppliedCharge[] = [
    ...resolveTicketExtraCharges(ticket, goods),
    ...(fee > 0 ? [{ id: 'delivery-fee', name: feeLabel, amount: fee }] : []),
  ]
  return calcBill(
    goods,
    discountPct,
    charges,
    orderTaxBillOptions(
      ticket.lines,
      peekDishes(),
      loadTaxes(),
      loadCompanyProfile().enableTax !== false,
    ),
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
