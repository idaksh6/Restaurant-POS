/** mada / card terminal hooks — Phase 4. */

export type CardPayRequest = {
  amountSar: number
  currency?: 'SAR'
  reference: string
}

export type CardPayResult =
  | { ok: true; authCode: string; rrn: string; offline?: boolean }
  | { ok: false; reason: string }

export async function requestCardPayment(req: CardPayRequest): Promise<CardPayResult> {
  const bridge = (
    window as unknown as {
      mesaCardPay?: (payload: CardPayRequest) => Promise<CardPayResult>
    }
  ).mesaCardPay

  if (bridge) return bridge(req)

  // Dev stub: simulate approved auth when online
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
