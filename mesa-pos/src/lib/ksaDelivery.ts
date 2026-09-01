/**
 * KSA food delivery channels — not Swiggy/Zomato (India).
 * Settlement mirrors how restaurants usually book aggregator vs own-fleet orders.
 */

export type DeliveryFleet = 'own' | 'platform'
export type DeliveryPayModel = 'cod' | 'prepaid'

export type KsaDeliveryChannel = {
  id: string
  label: string
  labelAr?: string
  /** Who delivers the food */
  fleet: DeliveryFleet
  /** How the restaurant books payment */
  payModel: DeliveryPayModel
  /** Settle method label (matches payment types / ledger) */
  settleMethod: string
  /** Short badge colour tone */
  tone: 'direct' | 'hs' | 'jahez' | 'keeta' | 'chefz' | 'other'
}

export const KSA_DELIVERY_CHANNELS: KsaDeliveryChannel[] = [
  {
    id: 'Direct',
    label: 'Direct (own fleet)',
    labelAr: 'مباشر',
    fleet: 'own',
    payModel: 'cod',
    settleMethod: 'Cash',
    tone: 'direct',
  },
  {
    id: 'HungerStation',
    label: 'HungerStation',
    labelAr: 'هنقرستيشن',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'HungerStation',
    tone: 'hs',
  },
  {
    id: 'Jahez',
    label: 'Jahez',
    labelAr: 'جاهز',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'Jahez',
    tone: 'jahez',
  },
  {
    id: 'Keeta',
    label: 'Keeta',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'Keeta',
    tone: 'keeta',
  },
  {
    id: 'The Chefz',
    label: 'The Chefz',
    labelAr: 'ذا شفز',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'The Chefz',
    tone: 'chefz',
  },
  {
    id: 'Mrsool',
    label: 'Mrsool',
    labelAr: 'مرسول',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'Mrsool',
    tone: 'other',
  },
  {
    id: 'Talabat',
    label: 'Talabat',
    labelAr: 'طلبات',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'Talabat',
    tone: 'other',
  },
  {
    id: 'Noon Food',
    label: 'Noon Food',
    fleet: 'platform',
    payModel: 'prepaid',
    settleMethod: 'Noon Food',
    tone: 'other',
  },
]

export function resolveDeliveryChannel(channel?: string): KsaDeliveryChannel {
  const id = (channel || 'Direct').trim()
  return KSA_DELIVERY_CHANNELS.find((c) => c.id === id) ?? KSA_DELIVERY_CHANNELS[0]
}

export function channelNeedsOwnRider(channel?: string) {
  return resolveDeliveryChannel(channel).fleet === 'own'
}

export function channelSettleMethod(channel?: string) {
  return resolveDeliveryChannel(channel).settleMethod
}

export function channelIsPrepaid(channel?: string) {
  return resolveDeliveryChannel(channel).payModel === 'prepaid'
}

export function channelDeliverActionLabel(channel?: string) {
  const c = resolveDeliveryChannel(channel)
  if (c.fleet === 'platform') return 'Hand to courier & settle'
  return 'Deliver & settle'
}

export function channelOutHint(channel?: string) {
  const c = resolveDeliveryChannel(channel)
  if (c.fleet === 'platform') return `${c.label} · prepaid`
  return 'Own rider · COD on deliver'
}

export function isExternalChannelOrder(ticket: { channel?: string; externalOrderId?: string }) {
  if (!ticket.externalOrderId) return false
  const ch = resolveDeliveryChannel(ticket.channel)
  return ch.fleet === 'platform'
}

export function needsChannelAccept(ticket: {
  channel?: string
  externalOrderId?: string
  channelAcceptStatus?: string
}) {
  return isExternalChannelOrder(ticket) && ticket.channelAcceptStatus === 'pending'
}
