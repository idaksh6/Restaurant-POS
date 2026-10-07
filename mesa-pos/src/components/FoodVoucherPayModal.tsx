import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  findFoodVoucher,
  suggestFoodVouchers,
  type FoodVoucherCode,
} from '../data/foodVouchers'
import { money } from '../data/mock'
import { useI18n } from '../locale/i18n'
import { useFoodVouchers } from '../state/FoodVoucherContext'

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
  const { t } = useI18n()
  const { codes } = useFoodVouchers()
  const [search, setSearch] = useState('')
  const [hit, setHit] = useState<FoodVoucherCode | null>(null)
  const [hint, setHint] = useState('')
  const [accepted, setAccepted] = useState(false)

  const suggestions = useMemo(
    () => suggestFoodVouchers(search, codes, search.trim() ? 8 : 12),
    [search, codes],
  )

  function selectCode(row: FoodVoucherCode) {
    setHit(row)
    setSearch(row.code)
    setHint('')
  }

  function lookup(raw?: string): FoodVoucherCode | null {
    const q = (raw ?? search).trim()
    if (!q) {
      setHit(null)
      setHint(suggestions.length ? t.fvSelectHint : t.fvNoneAvailable)
      return null
    }
    const found = findFoodVoucher(q, codes)
    if (!found) {
      const matches = suggestFoodVouchers(q, codes, 8)
      setHit(null)
      setHint(matches.length > 1 ? t.fvSeveralMatch : t.fvNotFound)
      return null
    }
    setHit(found)
    setSearch(found.code)
    setHint('')
    return found
  }

  function acceptOk(row: FoodVoucherCode = hit!) {
    if (!row) return
    onConfirm({
      voucherId: row.id,
      voucherCode: row.code,
      voucherName: row.name,
      amount: Math.min(row.amount, billAmount),
    })
  }

  function submit() {
    const row = hit ?? lookup()
    if (!row) return
    if (embedded) {
      acceptOk(row)
      return
    }
    setHit(row)
    setAccepted(true)
  }

  const form = (
    <>
      {embedded ? (
        <button type="button" className="settle-back" onClick={onClose}>
          {t.settleBack}
        </button>
      ) : (
        <header className="fvp-head">
          <strong>{t.fvLabel}</strong>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </header>
      )}

      <div className={embedded ? 'settle-pay-fields' : 'fvp-fields'}>
        <label>
          {t.fvSearch}
          <input
            className="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setHit(null)
              setHint('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lookup()
            }}
            placeholder={t.fvPlaceholder}
            autoFocus
          />
        </label>
        {suggestions.length > 0 && !hit ? (
          <div className="fvp-suggest">
            {suggestions.map((c) => (
              <button key={c.id} type="button" onClick={() => selectCode(c)}>
                {c.code} · {c.name} · {money(c.amount)}
              </button>
            ))}
          </div>
        ) : null}

        <div className={`fvp-info${hit ? ' is-applied' : ''}`}>
          <div>
            <span>{t.fvLabel}</span>
            <strong>{hit?.name ?? '—'}</strong>
          </div>
          <div>
            <span>{t.fvAmount}</span>
            <strong>{hit ? money(hit.amount) : '—'}</strong>
          </div>
          <div>
            <span>{t.fvExpiry}</span>
            <strong>{hit ? String(hit.expiryDate).slice(0, 10) : '—'}</strong>
          </div>
          {hit ? <p className="fvp-applied-tag">{t.fvReady}</p> : null}
        </div>
      </div>

      {hint ? <p className="fvp-hint">{hint}</p> : null}

      <div className={embedded ? 'settle-pay-actions' : 'fvp-actions'}>
        <button type="button" className="btn btn-ghost" onClick={() => lookup()}>
          {t.fvLookup}
        </button>
        <button type="button" className="btn btn-teal" disabled={!hit} onClick={submit}>
          {t.fvApply}
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
              <strong>{t.fvLabel}</strong>
              <p>{t.fvAccepted.replace('{amount}', money(Math.min(hit.amount, billAmount)))}</p>
              <button type="button" className="btn btn-primary" onClick={() => acceptOk()}>
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
