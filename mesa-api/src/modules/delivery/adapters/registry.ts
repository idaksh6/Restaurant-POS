import { HungerStationAdapter } from './hungerstation.adapter'
import { JahezAdapter } from './jahez.adapter'
import { KeetaAdapter } from './keeta.adapter'
import { genericKsaAdapters } from './generic-ksa.adapter'
import type { DeliveryChannelAdapter } from './channel-adapter'

/** All platform adapters registered for outbound callbacks + menu sync. */
export function allDeliveryChannelAdapters(): DeliveryChannelAdapter[] {
  return [
    new HungerStationAdapter(),
    new JahezAdapter(),
    new KeetaAdapter(),
    ...genericKsaAdapters(),
  ]
}

export function adapterForChannel(channelId: string): DeliveryChannelAdapter | null {
  return allDeliveryChannelAdapters().find((a) => a.channelId === channelId) ?? null
}

export function supportedChannelIds(): string[] {
  return allDeliveryChannelAdapters().map((a) => a.channelId)
}
