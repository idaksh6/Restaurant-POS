import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import TextPromptModal from '../components/TextPromptModal'
import { money, nowTime, type OpenTicket } from '../data/mock'
import { resolveDeliveryColumn } from '../lib/deliveryBoard'
import { deliveryBill, deliveryNo, makeDeliveryOtp } from '../lib/deliverySettle'
import {
  apiAcceptChannelOrder,
  apiRejectChannelOrder,
  pushChannelStatusQuiet,
} from '../lib/apiDeliveryChannels'
import { apiMastersReady } from '../lib/apiMasters'
import {
  channelIsPrepaid,
  channelNeedsOwnRider,
  isExternalChannelOrder,
  needsChannelAccept,
  resolveDeliveryChannel,
} from '../lib/ksaDelivery'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

/**
 * Counter screen for platform courier pickup (HungerStation / Jahez / Keeta …).
 * Own-fleet riders use /rider instead.
 */
export default function CourierPickupPage() {
  const { user } = useAuth()
  const { tickets, updateTicket, cancelTicket, flash } = usePos()
  const { runSync } = useSync()
  const [search, setSearch] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)

  const platformOrders = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.type === 'delivery' &&
          isExternalChannelOrder(t) &&
          t.channelAcceptStatus !== 'rejected' &&
          t.checkStatus !== 'settled',
      ),
    [tickets],
  )

  const ready = useMemo(
    () =>
      platformOrders.filter(
        (t) => resolveDeliveryColumn(t) === 'ready' || resolveDeliveryColumn(t) === 'preparing',
      ),
    [platformOrders],
  )

  const pendingAccept = useMemo(
    () => platformOrders.filter((t) => needsChannelAccept(t)),
    [platformOrders],
  )

  const q = search.trim().toLowerCase()
  const filtered = q
    ? platformOrders.filter((t) => {
        const no = `d-${deliveryNo(t)}`
        return (
          no.includes(q) ||
          t.customer.toLowerCase().includes(q) ||
          (t.externalOrderId ?? '').toLowerCase().includes(q) ||
          (t.phone ?? '').includes(q)
        )
      })
    : [...pendingAccept, ...ready]

  async function acceptOrder(ticket: OpenTicket) {
    try {
      if (apiMastersReady()) {
        await apiAcceptChannelOrder(ticket.id, 25)
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        updateTicket(ticket.id, { channelAcceptStatus: 'accepted' })
      }
      flash(`Accepted · ${resolveDeliveryChannel(ticket.channel).label}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Accept failed', 'err')
    }
  }

  async function rejectOrder(ticket: OpenTicket, reason?: string) {
    try {
      if (apiMastersReady()) {
        await apiRejectChannelOrder(ticket.id, reason)
        void runSync({ quiet: true }).catch(() => undefined)
      } else {
        cancelTicket(ticket.id, reason ?? 'Rejected')
      }
      flash(`Rejected · D-${deliveryNo(ticket)}`)
      setRejectId(null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Reject failed', 'err')
    }
  }

  function releaseToCourier(ticket: OpenTicket) {
    if (channelNeedsOwnRider(ticket.channel)) return
    const code = makeDeliveryOtp()
    updateTicket(ticket.id, {
      deliveryStatus: 'dispatched',
      dispatchedAt: nowTime(),
      deliveryOtp: code,
    })
    pushChannelStatusQuiet(ticket.id, 'dispatched')
    flash(
      `Handed to ${resolveDeliveryChannel(ticket.channel).label} courier · pickup ${code}`,
    )
  }

  const canUse = user ? getPermissions(user.role).canSendOrders || user.role === 'admin' : false

  if (!canUse) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Courier pickup locked</strong>
          <Link to="/delivery" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Delivery board
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-courier">
      <HubHeader closeTo="/delivery" />

      <div className="zk-courier-head">
        <h1>Platform courier pickup</h1>
        <p>HungerStation · Jahez · Keeta — hand prepaid bags to their courier.</p>
        <input
          className="zk-courier-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search D-no, app order #, phone…"
        />
      </div>

      <div className="zk-courier-stats">
        <span>{pendingAccept.length} awaiting accept</span>
        <span>{ready.length} ready for courier</span>
      </div>

      <div className="zk-courier-list">
        {filtered.length === 0 ? (
          <div className="zk-courier-empty">No platform orders right now.</div>
        ) : (
          filtered.map((ticket) => {
            const ch = resolveDeliveryChannel(ticket.channel)
            const col = resolveDeliveryColumn(ticket)
            const pending = needsChannelAccept(ticket)
            return (
              <article key={ticket.id} className={`zk-courier-card${pending ? ' pending' : ''}`}>
                <div className="zk-courier-card-top">
                  <strong>D-{deliveryNo(ticket)}</strong>
                  <span className={`dl-channel tone-${ch.tone}`}>{ch.label}</span>
                </div>
                <p className="zk-courier-name">{ticket.customer}</p>
                {ticket.externalOrderId ? (
                  <p className="zk-courier-ext">#{ticket.externalOrderId}</p>
                ) : null}
                <p className="zk-courier-meta">
                  {col} · {money(deliveryBill(ticket).total)} ·{' '}
                  {channelIsPrepaid(ticket.channel) ? 'Prepaid' : 'COD'}
                </p>
                {ticket.deliveryOtp && col === 'dispatched' ? (
                  <p className="zk-courier-code">Pickup code <strong>{ticket.deliveryOtp}</strong></p>
                ) : null}
                <div className="zk-courier-actions">
                  {pending ? (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => void acceptOrder(ticket)}>
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setRejectId(ticket.id)}
                      >
                        Reject
                      </button>
                    </>
                  ) : col === 'ready' || col === 'preparing' ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => releaseToCourier(ticket)}
                    >
                      Hand to courier
                    </button>
                  ) : (
                    <span className="zk-courier-done">{col}</span>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {rejectId ? (
        <TextPromptModal
          title="Reject platform order"
          label="Reason (optional)"
          initialValue=""
          confirmLabel="Reject"
          cancelLabel="Back"
          onClose={() => setRejectId(null)}
          onConfirm={(value) => {
            const t = platformOrders.find((x) => x.id === rejectId)
            if (t) void rejectOrder(t, value || undefined)
            else setRejectId(null)
          }}
        />
      ) : null}

      <HubFooter backTo="/delivery" backLabel="Delivery" primaryTo="/" primaryLabel="Main Menu" />
    </div>
  )
}
