import type { OpenTicket } from './mock'
import {
  loadDeliveryIntegrations,
  loadNotifyLog,
  pushNotifyLog,
  DELIVERY_NOTIFY_LOG_KEY,
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

function patchNotifyLog(id: string, patch: Partial<DeliveryNotifyEvent>) {
  const rows = loadNotifyLog().map((e) => (e.id === id ? { ...e, ...patch } : e))
  localStorage.setItem(DELIVERY_NOTIFY_LOG_KEY, JSON.stringify(rows.slice(0, 50)))
}

/** Twilio: providerApiKey = `AccountSid:AuthToken`. To = E.164 digits. */
async function sendTwilioSms(to: string, body: string, apiKey: string, from: string) {
  const [sid, token] = apiKey.split(':').map((s) => s.trim())
  if (!sid || !token) {
    throw new Error('Twilio key must be AccountSid:AuthToken')
  }
  const auth = btoa(`${sid}:${token}`)
  const form = new URLSearchParams({
    To: to.startsWith('+') ? to : `+${to}`,
    From: from || sid,
    Body: body,
  })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text.slice(0, 180) || `Twilio ${res.status}`)
}

/** Unifonic: providerApiKey = AppSid. */
async function sendUnifonicSms(to: string, body: string, appSid: string, senderId: string) {
  const form = new URLSearchParams({
    AppSid: appSid,
    Recipient: to.replace(/^\+/, ''),
    Body: body,
    SenderID: senderId || 'MESA',
  })
  const res = await fetch('https://el.cloud.unifonic.com/rest/SMS/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text.slice(0, 180) || `Unifonic ${res.status}`)
}

async function deliverChannel(
  event: DeliveryNotifyEvent,
  provider: 'unifonic' | 'twilio',
  apiKey: string,
  senderId: string,
) {
  try {
    if (provider === 'twilio') await sendTwilioSms(event.to, event.body, apiKey, senderId)
    else await sendUnifonicSms(event.to, event.body, apiKey, senderId)
    patchNotifyLog(event.id, { status: 'sent', note: `Via ${provider}` })
  } catch (err) {
    patchNotifyLog(event.id, {
      status: 'failed',
      note: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Queue customer SMS / WhatsApp for delivery milestones.
 * Stub logs only. Unifonic/Twilio send when API key is set (Twilio key = Sid:Token).
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

  const live =
    cfg.notify.provider !== 'stub' && Boolean(cfg.notify.providerApiKey?.trim())

  for (const channel of channels) {
    const event: DeliveryNotifyEvent = {
      id: `n-${Date.now()}-${channel}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      channel,
      to: phone,
      body,
      ticketId: ticket.id,
      status: live ? 'queued' : 'queued',
      note: live
        ? `Sending via ${cfg.notify.provider}…`
        : 'Stub — connect Unifonic/Twilio in Settings → Notifications',
    }
    pushNotifyLog(event)
    if (live && channel === 'sms') {
      void deliverChannel(
        event,
        cfg.notify.provider === 'twilio' ? 'twilio' : 'unifonic',
        cfg.notify.providerApiKey,
        cfg.notify.senderId,
      )
    } else if (live && channel === 'whatsapp') {
      patchNotifyLog(event.id, {
        status: 'failed',
        note: 'WhatsApp send not wired yet — use SMS provider',
      })
    }
  }

  return {
    sent: true,
    message: live
      ? channels.map((c) => c.toUpperCase()).join('+') + ' sending'
      : channels.map((c) => c.toUpperCase()).join('+') + ' stub-queued',
  }
}
