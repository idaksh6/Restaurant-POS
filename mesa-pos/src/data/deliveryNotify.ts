import type { OpenTicket } from './mock'
import {
  loadDeliveryIntegrations,
  pushNotifyLog,
  type DeliveryNotifyEvent,
} from './deliveryIntegrations'
import { deliveryNo } from '../lib/deliverySettle'
import { resolveDeliveryChannel } from '../lib/ksaDelivery'

function digitsPhone(phone?: string) {
  return (phone ?? '').replace(/\D/g, '')
}

function buildEtaBody(ticket: OpenTicket, kind: 'dispatched' | 'otp' | 'ready') {
  const no = deliveryNo(ticket)
  const ch = resolveDeliveryChannel(ticket.channel).label
  if (kind === 'ready') {
    return `MESA · Order D-${no} (${ch}) is ready. We will dispatch shortly.`
  }
  if (kind === 'otp' && ticket.deliveryOtp) {
    return `MESA · Order D-${no} is on the way. Hand-over OTP: ${ticket.deliveryOtp}. Do not share with anyone except the rider.`
  }
  return `MESA · Order D-${no} (${ch}) is out for delivery${
    ticket.deliveryOtp ? `. OTP ${ticket.deliveryOtp}` : ''
  }.`
}

/**
 * Queue customer SMS / WhatsApp for delivery milestones.
 * Stub provider writes to local outbox until Unifonic/Twilio is configured.
 */
export function notifyCustomerDelivery(
  ticket: OpenTicket,
  kind: 'dispatched' | 'otp' | 'ready' = 'dispatched',
): { sent: boolean; message?: string } {
  const cfg = loadDeliveryIntegrations()
  const phone = digitsPhone(ticket.phone)
  if (!phone) return { sent: false, message: 'No customer phone' }

  const body = buildEtaBody(ticket, kind)
  const channels: Array<'sms' | 'whatsapp'> = []
  if (cfg.notify.smsEnabled) channels.push('sms')
  if (cfg.notify.whatsappEnabled) channels.push('whatsapp')
  if (!channels.length) return { sent: false, message: 'Notifications off' }

  for (const channel of channels) {
    const event: DeliveryNotifyEvent = {
      id: `n-${Date.now()}-${channel}`,
      at: Date.now(),
      channel,
      to: phone,
      body,
      ticketId: ticket.id,
      status: cfg.notify.provider === 'stub' || !cfg.notify.providerApiKey ? 'queued' : 'sent',
      note:
        cfg.notify.provider === 'stub' || !cfg.notify.providerApiKey
          ? 'Stub — connect Unifonic/Twilio in Settings → Notifications'
          : `Via ${cfg.notify.provider}`,
    }
    pushNotifyLog(event)
  }

  return {
    sent: true,
    message: channels.map((c) => c.toUpperCase()).join('+') + ' queued',
  }
}
