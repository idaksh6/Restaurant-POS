import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { findFoodVoucher, loadCodes, type FoodVoucherCode } from '../data/foodVouchers'
import { money } from '../data/mock'

export type FoodVoucherPayResult = {
  voucherId: string
  voucherCode: string
  voucherName: string
  amount: number
}

type Props = {
  billAmount: number
  onClose: () => void
  onConfirm: (result: FoodVoucherPayResult) => void
  embedded?: boolean
}

export default function FoodVoucherPayModal({ billAmount, onClose, onConfirm, embedded }: Props) {
  const [search, setSearch] = useState('')
  const [hit, setHit] = useState<FoodVoucherCode | null>(null)
  const [hint, setHint] = useState('')
  const [accepted, setAccepted] = useState(false)

  const suggestions = useMemo(() => {
    const q = search.trim()
    if (q.length < 2) return []
    return loadCodes()
      .filter((c) => c.status === 'available' && c.code.includes(q))
      .slice(0, 5)
  }, [search])

  function lookup(raw?: string) {
    const q = (raw ?? search).trim()
    const found = findFoodVoucher(q)
    if (!found) {
      setHit(null)
      setHint('No available food voucher for that code')
      return
    }
    setHit(found)
    setSearch(found.code)
    setHint('')
  }

  function acceptOk() {
    if (!hit) return
    onConfirm({
      voucherId: hit.id,
      voucherCode: hit.code,
      voucherName: hit.name,
      amount: Math.min(hit.amount, billAmount),
    })
  }

  function submit() {
    if (!hit) {
      lookup()
      return
    }
    if (embedded) {
      acceptOk()
      return
    }
    setAccepted(true)
  }

  const form = (
    <>
      {embedded ? (
        <button type="button" className="settle-back" onClick={onClose}>
          ← Back
        </button>
      ) : (
        <header className="fvp-head">
          <strong>Food Voucher</strong>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
      )}

      <div className={embedded ? 'settle-pay-fields' : 'fvp-fields'}>
        <label>
          Search Food Voucher
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lookup()
            }}
            placeholder="Enter voucher code"
            autoFocus
          />
        </label>
        {suggestions.length > 0 && !hit ? (
          <div className="fvp-suggest">
            {suggestions.map((c) => (
              <button key={c.id} type="button" onClick={() => lookup(c.code)}>
                {c.code} · {c.name} · {money(c.amount)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="fvp-info">
          <div>
            <span>Food Voucher</span>
            <strong>{hit?.name ?? '—'}</strong>
          </div>
          <div>
            <span>Voucher Amount</span>
            <strong>{hit ? money(hit.amount) : '—'}</strong>
          </div>
          <div>
            <span>Voucher Expiry Date</span>
            <strong>{hit?.expiryDate ?? '—'}</strong>
          </div>
        </div>
      </div>

      {hint ? <p className="fvp-hint">{hint}</p> : null}

      <div className={embedded ? 'settle-pay-actions' : 'fvp-actions'}>
        <button type="button" className="btn btn-ghost" onClick={() => lookup()}>
          Lookup
        </button>
        <button type="button" className="btn btn-teal" disabled={!hit} onClick={submit}>
          Apply voucher
        </button>
      </div>
    </>
  )

  if (embedded) return <div className="settle-detail settle-pay-panel">{form}</div>

  return createPortal(
    <div className="modal-backdrop fvp-backdrop" role="dialog" aria-modal="true">
      <div className="fvp-card">
        {form}
        {accepted && hit ? (
          <div className="fvp-toast" role="alertdialog">
            <div className="fvp-toast-card">
              <strong>Food Voucher</strong>
              <p>Food voucher accepted · {money(Math.min(hit.amount, billAmount))}</p>
              <button type="button" className="btn btn-primary" onClick={acceptOk}>
                OK
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
