import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { loadNotifyLog } from '../data/deliveryIntegrations'
import { resolveDeliveryColumn } from '../lib/deliveryBoard'
import {
  isExternalChannelOrder,
  needsChannelAccept,
} from '../lib/ksaDelivery'
import { useI18n } from '../locale/i18n'
import { usePos } from '../state/PosContext'
import { useSync } from '../sync/SyncContext'

export type HubNotificationItem = {
  id: string
  title: string
  hint?: string
  to?: string
  action?: () => void
  tone?: 'warn' | 'info' | 'ok'
}

export function useHubNotifications(): HubNotificationItem[] {
  const { tickets } = usePos()
  const { connectivity, queued, outbox } = useSync()
  const { t } = useI18n()

  return useMemo(() => {
    const items: HubNotificationItem[] = []
    const pendingAccept = tickets.filter(
      (ticket) => ticket.type === 'delivery' && needsChannelAccept(ticket),
    )
    if (pendingAccept.length) {
      items.push({
        id: 'dl-accept',
        title: `${pendingAccept.length} app order${pendingAccept.length > 1 ? 's' : ''} need accept`,
        hint: 'HungerStation / Jahez / Keeta',
        to: '/delivery',
        tone: 'warn',
      })
    }

    const courierReady = tickets.filter(
      (ticket) =>
        ticket.type === 'delivery' &&
        isExternalChannelOrder(ticket) &&
        !needsChannelAccept(ticket) &&
        resolveDeliveryColumn(ticket) === 'ready',
    )
    if (courierReady.length) {
      items.push({
        id: 'courier-ready',
        title: `${courierReady.length} order${courierReady.length > 1 ? 's' : ''} ready for platform courier`,
        to: '/courier',
        tone: 'info',
      })
    }

    const poison = outbox.some((op) => op.status === 'poison')
    const pendingErr = outbox.find(
      (op) =>
        (op.status === 'pending' || op.status === 'syncing') &&
        op.lastError &&
        op.lastError !== 'retry',
    )?.lastError
    if (poison) {
      items.push({
        id: 'sync-poison',
        title: t.syncPoison,
        hint: outbox.find((op) => op.lastError)?.lastError,
        tone: 'warn',
      })
    } else if (queued > 0) {
      const hint =
        connectivity === 'offline'
          ? t.offline
          : connectivity === 'syncing'
            ? t.syncing
            : pendingErr
              ? pendingErr
              : 'Tap to retry sync'
      items.push({
        id: 'sync-queue',
        title: `${queued} ${t.queuedCount}`,
        hint,
        tone: pendingErr || connectivity === 'offline' ? 'warn' : 'info',
      })
    }

    const smsQueued = loadNotifyLog().filter((n) => n.status === 'queued').length
    if (smsQueued > 0) {
      items.push({
        id: 'sms-queue',
        title: `${smsQueued} customer alert${smsQueued > 1 ? 's' : ''} queued`,
        to: '/settings/notifications',
        tone: 'info',
      })
    }

    return items
  }, [tickets, outbox, queued, connectivity, t])
}

export default function HubNotifications({ onSync }: { onSync?: () => void }) {
  const { t } = useI18n()
  const items = useHubNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 })

  function place() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(320, document.documentElement.clientWidth - 16)
    const left = Math.min(
      Math.max(8, r.right - width),
      document.documentElement.clientWidth - width - 8,
    )
    const top = r.bottom + 8
    setPos({ top, left, width })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const node = e.target as Node
      if (rootRef.current?.contains(node) || panelRef.current?.contains(node)) return
      setOpen(false)
    }
    function onReposition() {
      place()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  const count = items.length
  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    width: pos.width,
    zIndex: 400,
  }

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="zk-hub-notif-panel"
          role="dialog"
          aria-label={t.notifications}
          style={panelStyle}
        >
          <div className="zk-hub-notif-head">
            <strong>{t.notifications}</strong>
            {count > 0 ? <span>{count}</span> : null}
          </div>
          {items.length === 0 ? (
            <p className="zk-hub-notif-empty">All clear — no pending alerts.</p>
          ) : (
            <ul className="zk-hub-notif-list">
              {items.map((item) => (
                <li key={item.id} className={`tone-${item.tone ?? 'info'}`}>
                  {item.to ? (
                    <Link to={item.to} className="zk-hub-notif-item" onClick={() => setOpen(false)}>
                      <strong>{item.title}</strong>
                      {item.hint ? <span>{item.hint}</span> : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="zk-hub-notif-item"
                      onClick={() => {
                        if (item.id === 'sync-poison' || item.id === 'sync-queue') onSync?.()
                        item.action?.()
                        setOpen(false)
                      }}
                    >
                      <strong>{item.title}</strong>
                      {item.hint ? <span>{item.hint}</span> : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div className="zk-hub-notif" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={`zk-hub-notif-btn${open ? ' open' : ''}${count ? ' has' : ''}`}
        aria-label={t.notifications}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="zk-hub-notif-icon">
          <path
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.71V4a2 2 0 1 0-4 0v.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"
            fill="currentColor"
          />
        </svg>
        {count > 0 ? <span className="zk-hub-notif-badge">{count}</span> : null}
      </button>
      {panel}
    </div>
  )
}
