import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import { addMonths, giftBalance, type GiftCard } from '../data/giftCards'
import { money } from '../data/mock'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useCrm } from '../state/CrmContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

function emptyCard(): GiftCard {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: `gc-${Date.now()}`,
    number: '',
    customerName: '',
    phone: '',
    description: '',
    expiryDate: addMonths(today, 12),
    issueAmount: 0,
    extraCharges: 0,
    usedAmount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  }
}

export default function GiftCardsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { customers } = useCrm()
  const { giftCards: rows, saveGiftCard, deleteGiftCard } = useCatalog()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<GiftCard | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [successOpen, setSuccessOpen] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (g) =>
        g.number.includes(q) ||
        g.customerName.toLowerCase().includes(q) ||
        g.phone.includes(q),
    )
  }, [rows, query])

  const customerHits = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    return customers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.id.toLowerCase().includes(q),
    )
  }, [customers, customerQuery])

  const totals = useMemo(() => {
    if (!editing) return { issue: 0, extra: 0, bill: 0, remaining: 0 }
    const issue = Number(editing.issueAmount) || 0
    const extra = Number(editing.extraCharges) || 0
    const used = Number(editing.usedAmount) || 0
    return {
      issue,
      extra,
      bill: Math.round((issue + extra) * 100) / 100,
      remaining: Math.max(0, Math.round((issue + extra - used) * 100) / 100),
    }
  }, [editing])

  function startAdd() {
    setIsNew(true)
    setEditing(emptyCard())
  }

  function startEdit(g: GiftCard) {
    setIsNew(false)
    setEditing({ ...g })
  }

  function setDuration(months: number) {
    if (!editing) return
    const base = new Date().toISOString().slice(0, 10)
    setEditing({ ...editing, expiryDate: addMonths(base, months) })
  }

  function pickCustomer(id: string) {
    if (!editing) return
    const c = customers.find((x) => x.id === id)
    if (!c) return
    setEditing({
      ...editing,
      customerId: c.id,
      customerName: c.name,
      phone: c.phone,
    })
    setCustomerOpen(false)
    setCustomerQuery('')
  }

  function save() {
    if (!editing) return
    if (editing.number.trim().length < 5) {
      flash('Gift card number must be at least 5 characters')
      return
    }
    if (!(editing.issueAmount > 0)) {
      flash('Enter issue amount')
      return
    }
    const row: GiftCard = {
      ...editing,
      number: editing.number.trim(),
      customerName: editing.customerName.trim() || 'Walk-in',
      phone: editing.phone.trim(),
      description: editing.description.trim(),
      issueAmount: Math.round((Number(editing.issueAmount) || 0) * 100) / 100,
      extraCharges: Math.round((Number(editing.extraCharges) || 0) * 100) / 100,
      usedAmount: Math.round((Number(editing.usedAmount) || 0) * 100) / 100,
    }
    saveGiftCard(row)
    setEditing(null)
    setSuccessOpen(true)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.number,
      onConfirm: () => {
        deleteGiftCard(editing.id)
        setEditing(null)
        flash('Gift card deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Gift cards locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/settings" className="btn btn-ghost">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-gift">
      <HubHeader />

      <div className="zk-gift-bar">
        <h1>Customer Gift Card</h1>
        <button type="button" className="zk-gift-add" onClick={startAdd} title="Add gift card">
          +
        </button>
      </div>

      <div className="zk-gift-search">
        <label>
          Search
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, card no, phone…"
          />
        </label>
        <span className="chip">{filtered.length} cards</span>
      </div>

      <div className="zk-gift-body">
        {filtered.length === 0 ? (
          <div className="zk-gift-empty">
            <strong>No gift cards</strong>
            <span>Tap + to issue one.</span>
          </div>
        ) : (
          <div className="zk-gift-grid">
            {filtered.map((g) => (
              <button key={g.id} type="button" className="zk-gift-tile" onClick={() => startEdit(g)}>
                <span className="zk-gift-icon" aria-hidden>
                  <svg viewBox="0 0 48 48" fill="none">
                    <rect x="8" y="14" width="32" height="20" rx="3" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M8 22h32" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M14 28h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </span>
                <strong>{g.customerName || 'Gift card'}</strong>
                <span>{g.number}</span>
                <em>{money(giftBalance(g))} left</em>
              </button>
            ))}
          </div>
        )}
      </div>

      <HubFooter
        actions={
          <Link to="/settings/customers" className="zk-hub-back">
            {t.crm}
          </Link>
        }
      />

      {editing ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-gift-sheet">
            <div className="zk-vendors-sheet-head">
              <h2>{isNew ? 'Issue gift card' : 'Edit gift card'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-gift-form">
              <div className="zk-gift-col">
                <label>
                  <span>
                    Gift card number <i>*</i>
                  </span>
                  <input
                    className="search"
                    value={editing.number}
                    onChange={(e) => setEditing({ ...editing, number: e.target.value })}
                  />
                  <small className={editing.number.trim().length >= 5 ? 'ok' : ''}>
                    Min length 5
                  </small>
                </label>
                <label>
                  <span>Expiry date</span>
                  <input
                    className="search"
                    type="date"
                    value={editing.expiryDate}
                    onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value })}
                  />
                </label>
                <div className="zk-gift-durations">
                  {[1, 3, 6, 12].map((m) => (
                    <button key={m} type="button" onClick={() => setDuration(m)}>
                      {m} Month{m === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="zk-gift-col">
                <label>
                  <span>Customer</span>
                  <div className="zk-gift-customer-row">
                    <input className="search" readOnly value={editing.customerName} placeholder="Select…" />
                    <button type="button" className="zk-gift-pick" onClick={() => setCustomerOpen(true)}>
                      …
                    </button>
                  </div>
                </label>
                <label>
                  <span>Phone no.</span>
                  <input
                    className="search"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    className="search zk-gift-desc"
                    rows={3}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="zk-gift-pay">
              <h3>Payment information</h3>
              <div className="zk-gift-pay-grid">
                <label>
                  <span>Issue amount *</span>
                  <input
                    className="search"
                    type="number"
                    step="0.01"
                    value={editing.issueAmount}
                    onChange={(e) =>
                      setEditing({ ...editing, issueAmount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  <span>Bill amount</span>
                  <input className="search" readOnly value={totals.bill.toFixed(2)} />
                </label>
                <label>
                  <span>Extra charges</span>
                  <input
                    className="search"
                    type="number"
                    step="0.01"
                    value={editing.extraCharges}
                    onChange={(e) =>
                      setEditing({ ...editing, extraCharges: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  <span>Payment amount</span>
                  <input className="search" readOnly value={totals.bill.toFixed(2)} />
                </label>
                <label>
                  <span>Total issue amount</span>
                  <input className="search" readOnly value={totals.issue.toFixed(2)} />
                </label>
                <label>
                  <span>Used amount</span>
                  <input
                    className="search"
                    type="number"
                    step="0.01"
                    value={editing.usedAmount}
                    onChange={(e) =>
                      setEditing({ ...editing, usedAmount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  <span>Total extra charges</span>
                  <input className="search" readOnly value={totals.extra.toFixed(2)} />
                </label>
                <label>
                  <span>Remaining balance</span>
                  <input className="search zk-gift-balance" readOnly value={totals.remaining.toFixed(2)} />
                </label>
              </div>
            </div>

            <div className="zk-vendors-actions">
              <button type="button" className="zk-vendors-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="zk-vendors-action danger"
                  onClick={remove}
                >
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-vendors-action primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customerOpen ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-gift-customer-modal">
            <div className="zk-vendors-sheet-head">
              <h2>Customer search</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setCustomerOpen(false)}>
                ✕
              </button>
            </div>
            <input
              className="search"
              autoFocus
              placeholder="Name, phone…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
            <div className="zk-gift-customer-list">
              <table className="zk-tax-table">
                <thead>
                  <tr>
                    <th>Customer name</th>
                    <th>Phone</th>
                    <th>Points</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customerHits.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{c.phone}</td>
                      <td>{c.points}</td>
                      <td>
                        <button type="button" className="btn btn-secondary" onClick={() => pickCustomer(c.id)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {successOpen ? (
        <SuccessModal
          title={t.successTitle}
          message="Gift card saved successfully"
          okLabel={t.ok}
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
