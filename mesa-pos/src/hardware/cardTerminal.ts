/** mada / SoftPOS / card terminal bridge — Phase 4 scaffold. */

import type { PaymentType } from '../data/paymentTypes'

export type CardPayRequest = {
  amountSar: number
  currency?: 'SAR'
  reference: string
}

export type CardPayResult =
  | { ok: true; authCode: string; rrn: string; offline?: boolean }
  | { ok: false; reason: string }

export type CardTerminalStatus = {
  bridgePresent: boolean
  simulateEnabled: boolean
  label: string
}

const SIMULATE_KEY = 'mesa-card-terminal-simulate'

const AGGREGATOR_RE =
  /hungerstation|jahez|keeta|chefz|mrsool|talabat|noon|food\s*voucher|gift\s*card|customer\s*credit|equal\s*share|^cash$|^split\b/i

const CARD_METHOD_RE = /\bmada\b|visa|mastercard|apple\s*pay|stc\s*pay|softpos|\bcard\b/i

export function isCardTerminalSimulateEnabled() {
  try {
    return localStorage.getItem(SIMULATE_KEY) === '1'
  } catch {
    return false
  }
}

export function setCardTerminalSimulateEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(SIMULATE_KEY, '1')
    else localStorage.removeItem(SIMULATE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasCardPayBridge() {
  return typeof (window as unknown as { mesaCardPay?: unknown }).mesaCardPay === 'function'
}

export function getCardTerminalStatus(): CardTerminalStatus {
  const bridgePresent = hasCardPayBridge()
  const simulateEnabled = isCardTerminalSimulateEnabled()
  if (bridgePresent) {
    return { bridgePresent, simulateEnabled, label: 'Bridge connected' }
  }
  if (simulateEnabled) {
    return { bridgePresent, simulateEnabled, label: 'Demo simulate (not live)' }
  }
  return { bridgePresent, simulateEnabled, label: 'Not connected' }
}

/** True when settle should call SoftPOS / bridge for this tender name. */
export function methodNeedsCardTerminal(
  methodName: string,
  payTypes: PaymentType[] = [],
): boolean {
  const raw = methodName.trim()
  if (!raw) return false
  if (AGGREGATOR_RE.test(raw)) return false
  if (CARD_METHOD_RE.test(raw)) return true
  const hit = payTypes.find((p) => p.name.trim().toLowerCase() === raw.toLowerCase())
  return hit?.parent === 'card'
}

export async function requestCardPayment(req: CardPayRequest): Promise<CardPayResult> {
  const bridge = (
    window as unknown as {
      mesaCardPay?: (payload: CardPayRequest) => Promise<CardPayResult>
    }
  ).mesaCardPay

  if (bridge) return bridge(req)

  if (!isCardTerminalSimulateEnabled()) {
    return {
      ok: false,
      reason:
        'Card terminal not connected. Enable SoftPOS simulate in Settings, or install the terminal bridge.',
    }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: true,
      authCode: `OFF-${Date.now().toString(36).toUpperCase()}`,
      rrn: `LOCAL-${req.reference}`,
      offline: true,
    }
  }

  return {
    ok: true,
    authCode: `AUTH-${Math.floor(Math.random() * 900000 + 100000)}`,
    rrn: `RRN-${req.reference.slice(-8)}`,
  }
}
