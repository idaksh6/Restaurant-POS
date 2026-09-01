import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { seedRiders, type DeliveryRider } from '../data/deliveryRiders'
import { money, nowTime, type OpenTicket } from '../data/mock'
import { cashFromSettle, recipesFromDishes } from '../lib/bill'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { useShift } from '../state/ShiftContext'
import { useSync } from '../sync/SyncContext'
import { resolveDeliveryColumn } from '../lib/deliveryBoard'
import { deliveryBill, deliveryNo, makeDeliveryOtp, settleMethodForDelivery } from '../lib/deliverySettle'
import { channelIsPrepaid, channelNeedsOwnRider } from '../lib/ksaDelivery'
import { notifyCustomerDelivery } from '../data/deliveryNotify'
import TextPromptModal from '../components/TextPromptModal'

const RIDER_SESSION_KEY = 'mesa-rider-session'

type RiderSession = { riderId: string; name: string }

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

function pinOf(rider: DeliveryRider) {
  const d = phoneDigits(rider.phone)
  return d.slice(-4)
}

function sameRider(ticketBoyId: string | undefined, rider: DeliveryRider) {
  if (!ticketBoyId) return false
  return ticketBoyId === rider.id || rider.id.startsWith(`${ticketBoyId}__`) || ticketBoyId.startsWith(`${rider.id}__`)
}

function loadSession(): RiderSession | null {
  try {
    const raw = sessionStorage.getItem(RIDER_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as RiderSession
  } catch {
    return null
  }
}

function saveSession(s: RiderSession | null) {
  if (!s) sessionStorage.removeItem(RIDER_SESSION_KEY)
  else sessionStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(s))
}

export default function RiderAppPage() {
  const { user, logout: authLogout } = useAuth()
  const { deliveryRiders } = useCatalog()
  const { customers, earnPoints } = useCrm()
  const { dishes } = useMasters()
  const { addCashIn } = useShift()
  const { tickets, updateTicket, settleTicket, deductRecipeStock, flash } = usePos()
  const { connectivity, runSync } = useSync()
  const [session, setSession] = useState<RiderSession | null>(() => {
    if (user?.riderId) return { riderId: user.riderId, name: user.name }
    return loadSession()
  })
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [otpTicketId, setOtpTicketId] = useState<string | null>(null)

  useEffect(() => {
    if (user?.riderId) {
      const next = { riderId: user.riderId, name: user.name }
      saveSession(next)
      setSession(next)
    }
  }, [user?.riderId, user?.name])

  const riders = useMemo(() => {
    const base = deliveryRiders.length ? deliveryRiders.filter((r) => r.active) : seedRiders
    return [...base].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
  }, [deliveryRiders])

  const me = riders.find((r) => r.id === session?.riderId) ?? null

  useEffect(() => {
    const id = window.setInterval(() => {
      void runSync({ quiet: true }).catch(() => undefined)
    }, 12000)
    return () => window.clearInterval(id)
  }, [runSync])

  const myOrders = useMemo(() => {
    if (!me) return []
    return tickets
      .filter((t) => t.type === 'delivery' && sameRider(t.deliveryBoyId, me))
      .filter((t) => channelNeedsOwnRider(t.channel))
      .filter((t) => {
        const col = resolveDeliveryColumn(t)
        return col === 'ready' || col === 'dispatched'
      })
      .sort((a, b) => {
        const rank = (t: OpenTicket) => {
          const c = resolveDeliveryColumn(t)
          if (c === 'dispatched') return 0
          if (c === 'ready') return 1
          return 2
        }
        return rank(a) - rank(b)
      })
  }, [tickets, me])

  function loginWithPin() {
    const code = pin.trim()
    if (code.length < 4) {
      setError('Enter the last 4 digits of your phone')
      return
    }
    const match = riders.find((r) => pinOf(r) === code)
    if (!match) {
      setError('No rider matches that PIN')
      return
    }
    const next = { riderId: match.id, name: match.name }
    saveSession(next)
    setSession(next)
    setPin('')
    setError('')
    flash(`Rider · ${match.name}`)
  }

  function loginAs(rider: DeliveryRider) {
    const next = { riderId: rider.id, name: rider.name }
    saveSession(next)
    setSession(next)
    setError('')
    flash(`Rider · ${rider.name}`)
  }

  function logout() {
    saveSession(null)
    setSession(null)
    setPin('')
    if (user?.role === 'rider') authLogout()
  }

  async function startDelivery(ticket: OpenTicket) {
    setBusyId(ticket.id)
    try {
      const otp = makeDeliveryOtp()
      updateTicket(ticket.id, {
        deliveryStatus: 'dispatched',
        dispatchedAt: nowTime(),
        deliveryBoyId: me?.id ?? ticket.deliveryBoyId,
        deliveryOtp: otp,
      })
      const n = notifyCustomerDelivery(
        {
          ...ticket,
          deliveryStatus: 'dispatched',
          deliveryBoyId: me?.id ?? ticket.deliveryBoyId,
          deliveryOtp: otp,
        },
        'otp',
      )
      flash(
        `Out for delivery · D-${deliveryNo(ticket)} · OTP ${otp}${n.sent ? ` · ${n.message}` : ''}`,
      )
      void runSync({ quiet: true }).catch(() => undefined)
    } finally {
      setBusyId(null)
    }
  }

  async function markDelivered(ticket: OpenTicket) {
    if (!ticket.lines.length) {
      flash('Order has no items')
      return
    }
    if (ticket.deliveryOtp) {
      setOtpTicketId(ticket.id)
      return
    }
    await finishRiderDeliver(ticket)
  }

  async function finishRiderDeliver(ticket: OpenTicket) {
    setBusyId(ticket.id)
    try {
      const no = deliveryNo(ticket)
      const bill = deliveryBill(ticket)
      const feeAmt = ticket.deliveryFee ?? 0
      const match = customers.find(
        (c) => c.name === ticket.customer || (ticket.phone && c.phone === ticket.phone),
      )
      const method = settleMethodForDelivery(ticket)
      updateTicket(ticket.id, {
        deliveryStatus: 'delivered',
        deliveredAt: nowTime(),
      })
      if (match) earnPoints(match.id, bill.total)
      settleTicket(ticket.id, {
        method,
        source: `Delivery D-${no} · ${ticket.customer} · rider deliver & settle`,
        staff: me?.name ?? user?.name,
        subtotal: bill.taxable,
        tax: bill.tax,
        total: bill.total,
        lines: ticket.lines,
        customerId: match?.id,
        charges:
          feeAmt > 0 ? [{ id: 'delivery-fee', name: 'Delivery fee', amount: feeAmt }] : undefined,
      })
      deductRecipeStock(ticket.lines, recipesFromDishes(dishes))
      addCashIn(cashFromSettle(method, bill.total))
      flash(`Delivered & settled · D-${no} · ${method}`)
      setOtpTicketId(null)
      void runSync({ quiet: true }).catch(() => undefined)
    } finally {
      setBusyId(null)
    }
  }

  if (!session || !me) {
    return (
      <div className="zk-rider">
        <header className="rider-top">
          <div>
            <h1>Rider</h1>
            <p>Sign in with your phone PIN (last 4 digits)</p>
          </div>
          <Link to="/delivery" className="rider-link">
            Board
          </Link>
        </header>

        <section className="rider-card">
          <label className="rider-pin-label">
            PIN
            <input
              className="rider-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loginWithPin()
              }}
              placeholder="••••"
              autoFocus
            />
          </label>
          <button type="button" className="btn btn-primary rider-btn" onClick={loginWithPin}>
            Start shift
          </button>
          {error ? <p className="rider-error">{error}</p> : null}
        </section>

        <section className="rider-pick">
          <h2>Or pick your name</h2>
          <div className="rider-pick-list">
            {riders.map((r) => (
              <button key={r.id} type="button" className="rider-pick-btn" onClick={() => loginAs(r)}>
                <strong>{r.name}</strong>
                <span>{r.phone}</span>
                <em>PIN {pinOf(r)}</em>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="zk-rider">
      <header className="rider-top">
        <div>
          <h1>{me.name}</h1>
          <p>
            {myOrders.length} active · {connectivity === 'online' ? 'Live' : connectivity}
          </p>
        </div>
        <div className="rider-top-actions">
          <Link to="/delivery" className="rider-link">
            Board
          </Link>
          <button type="button" className="rider-link ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {myOrders.length === 0 ? (
        <div className="rider-empty">
          <strong>No assigned deliveries</strong>
          <span>When the counter assigns you an order, it appears here automatically.</span>
        </div>
      ) : (
        <div className="rider-orders">
          {myOrders.map((ticket) => {
            const col = resolveDeliveryColumn(ticket)
            const no = deliveryNo(ticket)
            const busy = busyId === ticket.id
            return (
              <article key={ticket.id} className={`rider-order col-${col}`}>
                <div className="rider-order-head">
                  <strong>D-{no || '—'}</strong>
                  <span className={`rider-badge ${col}`}>
                    {col === 'ready' ? 'Ready · pickup' : col === 'dispatched' ? 'On the way' : 'Delivered'}
                  </span>
                </div>
                <h2>{ticket.customer}</h2>
                <p className="rider-addr">{ticket.address || 'Address TBD'}</p>
                {ticket.phone ? (
                  <a className="rider-phone" href={`tel:${phoneDigits(ticket.phone)}`}>
                    Call {ticket.phone}
                  </a>
                ) : null}
                <div className="rider-meta">
                  <span>{money(deliveryBill(ticket).total)}</span>
                  <span className="rider-unpaid">
                    {channelIsPrepaid(ticket.channel) ? 'Prepaid' : 'COD · auto-settle'}
                  </span>
                </div>
                {ticket.deliveryOtp ? (
                  <p className="rider-otp">
                    Customer OTP <strong>{ticket.deliveryOtp}</strong>
                  </p>
                ) : null}
                <ul className="rider-lines">
                  {ticket.lines.slice(0, 6).map((l) => (
                    <li key={l.id}>
                      {l.qty}× {l.name}
                    </li>
                  ))}
                  {ticket.lines.length > 6 ? <li>+{ticket.lines.length - 6} more</li> : null}
                </ul>
                <div className="rider-actions">
                  {col === 'ready' ? (
                    <button
                      type="button"
                      className="btn btn-primary rider-btn"
                      disabled={busy}
                      onClick={() => void startDelivery(ticket)}
                    >
                      Start delivery
                    </button>
                  ) : null}
                  {col === 'dispatched' ? (
                    <button
                      type="button"
                      className="btn btn-primary rider-btn"
                      disabled={busy}
                      onClick={() => void markDelivered(ticket)}
                    >
                      Deliver & settle
                    </button>
                  ) : null}
                  {col === 'delivered' ? (
                    <p className="rider-done">Settled · removed from open board</p>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {otpTicketId ? (
        <TextPromptModal
          title="Customer OTP"
          label="Enter the 4-digit code the customer received / shows on the board"
          initialValue=""
          placeholder="••••"
          confirmLabel="Verify & settle"
          cancelLabel="Back"
          onClose={() => setOtpTicketId(null)}
          onConfirm={(value) => {
            const t = myOrders.find((x) => x.id === otpTicketId) ?? tickets.find((x) => x.id === otpTicketId)
            if (!t) {
              setOtpTicketId(null)
              return
            }
            if (value.replace(/\D/g, '') !== String(t.deliveryOtp ?? '')) {
              flash('Wrong OTP')
              return
            }
            void finishRiderDeliver(t)
          }}
        />
      ) : null}
    </div>
  )
}
