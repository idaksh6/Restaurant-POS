import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  findGiftCard,
  giftBalance,
  type GiftCard,
} from '../data/giftCards'
import { money } from '../data/mock'
import { useCatalog } from '../state/CatalogContext'

export type GiftCardPayResult = {
  giftCardId: string
  giftCardNumber: string
  customerId?: string
  customerName: string
  amount: number
  remaining: number
}

type Props = {
  billAmount: number
  prefillCustomerName?: string
  prefillPhone?: string
  onClose: () => void
  onConfirm: (result: GiftCardPayResult) => void
  embedded?: boolean
}

export default function GiftCardPayModal({
  billAmount,
  prefillCustomerName,
  prefillPhone,
  onClose,
  onConfirm,
  embedded,
}: Props) {
  const { giftCards } = useCatalog()
  const [search, setSearch] = useState('')
  const [card, setCard] = useState<GiftCard | null>(null)
  const [received, setReceived] = useState(String(billAmount))
  const [hint, setHint] = useState('')

  useEffect(() => {
    const seed = prefillPhone || prefillCustomerName || ''
    if (!seed) return
    const hit = findGiftCard(seed, giftCards)
    if (hit) {
      setCard(hit)
      setSearch(hit.number)
      const bal = giftBalance(hit)
      setReceived(String(Math.min(billAmount, bal)))
    }
  }, [prefillCustomerName, prefillPhone, billAmount, giftCards])

  const balance = card ? giftBalance(card) : 0
  const recv = Math.round((Number(received) || 0) * 100) / 100
  const remaining = Math.max(0, Math.round((balance - recv) * 100) / 100)
  const canOk = Boolean(card) && recv > 0 && recv <= balance + 0.001 && recv <= billAmount + 0.001

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 1) return []
    return giftCards
      .filter(
        (g) =>
          g.active &&
          (g.number.includes(q) ||
            g.customerName.toLowerCase().includes(q) ||
            g.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))),
      )
      .slice(0, 5)
  }, [search, giftCards])

  function lookup(raw?: string) {
    const q = (raw ?? search).trim()
    const hit = findGiftCard(q, giftCards)
    if (!hit) {
      setCard(null)
      setHint('No active gift card / customer account found')
      return
    }
    setCard(hit)
    setSearch(hit.number)
    setHint('')
    setReceived(String(Math.min(billAmount, giftBalance(hit))))
  }

  function applyAll() {
    if (!card) return
    setReceived(String(Math.min(billAmount, giftBalance(card))))
  }

  function submit() {
    if (!card || !canOk) return
    onConfirm({
      giftCardId: card.id,
      giftCardNumber: card.number,
      customerId: card.customerId,
      customerName: card.customerName,
      amount: recv,
      remaining,
    })
  }

  const form = (
    <>
      {embedded ? (
        <button type="button" className="settle-back" onClick={onClose}>
          ← Back
        </button>
      ) : (
        <header className="gcp-head">
          <span>Card Type</span>
          <strong>Customer Account</strong>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
      )}

      <div className={embedded ? 'settle-pay-fields gcp-fields-embed' : 'gcp-fields'}>
          <label>
            Search Card No
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') lookup()
              }}
              placeholder="Card number, phone, or name"
              autoFocus
            />
          </label>
          {suggestions.length > 0 && !card ? (
            <div className="gcp-suggest">
              {suggestions.map((g) => (
                <button key={g.id} type="button" onClick={() => lookup(g.number)}>
                  {g.number} · {g.customerName} · {money(giftBalance(g))}
                </button>
              ))}
            </div>
          ) : null}

          <label>
            Customer Name
            <input className="search" readOnly value={card?.customerName ?? ''} />
          </label>
          <label>
            Gift Card Amount
            <input className="search" readOnly value={card ? balance.toFixed(2) : ''} />
          </label>
          <label className="gcp-bill-row">
            Bill Amount
            <span>
              <input className="search" readOnly value={billAmount.toFixed(2)} />
              <button type="button" className="btn btn-secondary" onClick={applyAll} disabled={!card}>
                All
              </button>
            </span>
          </label>
          <label>
            Received
            <input
              className="search"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              disabled={!card}
            />
          </label>
          <label>
            Expiry Date
            <input className="search" readOnly value={card?.expiryDate ?? ''} />
          </label>
          <label>
            Remaining Balance
            <input className="search" readOnly value={card ? remaining.toFixed(2) : ''} />
          </label>
        </div>

        {hint ? <p className="gcp-hint">{hint}</p> : null}
        {card && recv > billAmount + 0.001 ? (
          <p className="gcp-hint">Received cannot exceed bill amount</p>
        ) : null}
        {card && recv > balance + 0.001 ? (
          <p className="gcp-hint">Received exceeds gift card balance</p>
        ) : null}

        <div className={embedded ? 'settle-pay-actions' : 'gcp-actions'}>
          <button type="button" className="btn btn-ghost" onClick={() => lookup()}>
            Lookup
          </button>
          <button type="button" className="btn btn-teal" disabled={!canOk} onClick={submit}>
            Apply account
          </button>
        </div>
    </>
  )

  if (embedded) return <div className="settle-detail settle-pay-panel">{form}</div>

  return createPortal(
    <div className="modal-backdrop gcp-backdrop" role="dialog" aria-modal="true">
      <div className="gcp-card">{form}</div>
    </div>,
    document.body,
  )
}
