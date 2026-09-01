import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ArabicTextInput from './ArabicTextInput'
import { money } from '../data/mock'
import { localeTag, useI18n } from '../locale/i18n'
import { useCrm, type CrmCustomer } from '../state/CrmContext'

type Props = {
  title?: string
  selectedId?: string | null
  onSelect: (customer: CrmCustomer | null) => void
  onClose: () => void
}

type FormMode = null | 'new' | 'edit' | 'account' | 'advance'

function formatVisit(value: string | undefined, lang: 'en' | 'ar') {
  if (!value || value === '—') return '—'
  if (value === 'Today' || value === 'Yesterday') return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeTag(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CustomerSearchPanel({
  title = 'Customer Search',
  selectedId = null,
  onSelect,
  onClose,
}: Props) {
  const { customers, upsertCustomer } = useCrm()
  const { lang } = useI18n()
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState<string | null>(selectedId)
  const [mode, setMode] = useState<FormMode>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [note, setNote] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.phone.toLowerCase().includes(s) ||
        (c.address ?? '').toLowerCase().includes(s),
    )
  }, [customers, q])

  const active = customers.find((c) => c.id === activeId) ?? null

  function openNew() {
    setFormName('')
    setFormPhone('')
    setFormAddress('')
    setMode('new')
    setNote('')
  }

  function openEdit() {
    if (!active) {
      setNote('Select a customer first')
      return
    }
    setFormName(active.name)
    setFormPhone(active.phone)
    setFormAddress(active.address ?? '')
    setMode('edit')
    setNote('')
  }

  function openAccount() {
    if (!active) {
      setNote('Select a customer first')
      return
    }
    setMode('account')
    setNote('')
  }

  function openAdvance() {
    if (!active) {
      setNote('Select a customer first')
      return
    }
    setMode('advance')
    setNote('')
  }

  function saveForm() {
    if (!formName.trim() || !formPhone.trim()) {
      setNote('Name and phone are required')
      return
    }
    const saved = upsertCustomer({
      id: mode === 'edit' ? active?.id : undefined,
      name: formName,
      phone: formPhone,
      address: formAddress,
    })
    setActiveId(saved.id)
    setMode(null)
    setNote(mode === 'edit' ? `Updated · ${saved.name}` : `Created · ${saved.name}`)
  }

  function selectActive() {
    if (!active) {
      setNote('Select a customer row first')
      return
    }
    onSelect(active)
  }

  return createPortal(
    <div className="modal-backdrop cs-backdrop" role="dialog" aria-modal="true">
      <div className="cs-shell">
        <header className="cs-head">
          <div>
            <h2>{title}</h2>
            <p>Find a guest, link to the ticket, or manage account details.</p>
          </div>
          <button type="button" className="dine-ticket-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cs-layout">
          <div className="cs-main">
            <div className="cs-search-row">
              <label>
                Search
                <input
                  className="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, phone, or address"
                  autoFocus
                />
              </label>
              <button type="button" className="cs-clear" onClick={() => setQ('')} aria-label="Clear">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="cs-table-wrap">
              <table className="cs-table">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th className="num">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="cs-empty">
                        No customers match
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr
                        key={c.id}
                        className={c.id === activeId ? 'selected' : ''}
                        onClick={() => {
                          setActiveId(c.id)
                          setNote('')
                        }}
                        onDoubleClick={() => onSelect(c)}
                      >
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td className="mesa-ltr-nums">{c.phone}</td>
                        <td className="muted">{c.address || '—'}</td>
                        <td className="num">{c.points}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="cs-count">
              {filtered.length} customer{filtered.length === 1 ? '' : 's'}
              {q.trim() ? ' found' : ''}
            </p>
            {note ? <p className="cs-note">{note}</p> : null}
          </div>

          <aside className="cs-rail">
            <button
              type="button"
              className={`cs-rail-btn${mode === null ? ' primary' : ''}`}
              aria-pressed={mode === null}
              onClick={() => {
                setMode(null)
                selectActive()
              }}
            >
              Select Customer
            </button>
            <button
              type="button"
              className={`cs-rail-btn${mode === 'edit' ? ' primary' : ''}`}
              aria-pressed={mode === 'edit'}
              onClick={openEdit}
            >
              Edit Customer
            </button>
            <button
              type="button"
              className={`cs-rail-btn${mode === 'new' ? ' primary' : ''}`}
              aria-pressed={mode === 'new'}
              onClick={openNew}
            >
              New Customer
            </button>
            <button
              type="button"
              className={`cs-rail-btn${mode === 'account' ? ' primary' : ''}`}
              aria-pressed={mode === 'account'}
              onClick={openAccount}
            >
              Account Details
            </button>
            <button
              type="button"
              className={`cs-rail-btn${mode === 'advance' ? ' primary' : ''}`}
              aria-pressed={mode === 'advance'}
              onClick={openAdvance}
            >
              Advance
            </button>
            <button
              type="button"
              className="cs-rail-btn ghost"
              onClick={() => onSelect(null)}
            >
              Walk-in
            </button>
          </aside>
        </div>

        {mode === 'new' || mode === 'edit' ? (
          <div className="cs-sheet">
            <div className="dine-pick-head">
              <div>
                <h2>{mode === 'new' ? 'New customer' : 'Edit customer'}</h2>
                <p className="modal-lead">Name and phone are required. Double-click a row later to link them to the ticket.</p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setMode(null)} aria-label="Cancel">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="cs-form">
              <label>
                <span>
                  Name <i>*</i>
                </span>
                <ArabicTextInput
                  value={formName}
                  onChange={setFormName}
                  mode="auto"
                  showModeToggle={false}
                  placeholder="Guest name"
                />
              </label>
              <label>
                <span>
                  Phone <i>*</i>
                </span>
                <input
                  className="search mesa-ltr-nums"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                />
              </label>
              <label>
                <span>Address</span>
                <ArabicTextInput
                  value={formAddress}
                  onChange={setFormAddress}
                  mode="auto"
                  showModeToggle={false}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="cs-form-actions">
              <button type="button" className="cs-rail-btn ghost" onClick={() => setMode(null)}>
                Cancel
              </button>
              <button type="button" className="cs-rail-btn primary" onClick={saveForm}>
                {mode === 'new' ? 'Save customer' : 'Update customer'}
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'account' && active ? (
          <div className="cs-sheet">
            <div className="dine-pick-head">
              <div>
                <h2>Account</h2>
                <p className="modal-lead">{active.name}</p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setMode(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ul className="cs-account">
              <li>
                <span>Phone</span>
                <strong className="mesa-ltr-nums">{active.phone}</strong>
              </li>
              <li>
                <span>Address</span>
                <strong>{active.address || '—'}</strong>
              </li>
              <li>
                <span>Loyalty points</span>
                <strong>{active.points}</strong>
              </li>
              <li>
                <span>Visits</span>
                <strong>{active.visits}</strong>
              </li>
              <li>
                <span>Lifetime spend</span>
                <strong>{money(active.spent)}</strong>
              </li>
              <li>
                <span>Last visit</span>
                <strong className="cs-visit">{formatVisit(active.lastVisit, lang)}</strong>
              </li>
            </ul>
          </div>
        ) : null}

        {mode === 'advance' && active ? (
          <div className="cs-sheet">
            <div className="dine-pick-head">
              <div>
                <h2>Advance</h2>
                <p className="modal-lead">{active.name}</p>
              </div>
              <button type="button" className="dine-ticket-close" onClick={() => setMode(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="modal-lead">
              Customer advances / deposits can be recorded from Accounts. Balance on file:{' '}
              <strong>{money(0)}</strong>
            </p>
            <div className="cs-form-actions">
              <button type="button" className="cs-rail-btn primary" onClick={() => setMode(null)}>
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
