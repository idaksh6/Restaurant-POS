import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import MesaSelect from '../components/MesaSelect'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import { money } from '../data/mock'
import type { Supplier } from '../data/purchasing'
import { useAuth } from '../state/AuthContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'
import SuccessModal from '../components/SuccessModal'
import {
  findVendorUniqueConflict,
  vendorRowDuplicatePhones,
} from '../lib/vendorValidation'

function emptyVendor(): Supplier {
  return {
    id: `sup-${Date.now()}`,
    name: '',
    phone: '',
    phone2: '',
    email: '',
    taxId: '',
    address: '',
    city: '',
    active: true,
  }
}

function cityFromAddress(address: string, fallback: string) {
  const parts = address
    .split(/[,|]/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || fallback || ''
}

export default function VendorsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const { dishes, saveDish } = useMasters()
  const { suppliers, vendorLedger, saveSupplier, deleteSupplier, addVendorLedgerEntry } =
    usePurchasing()

  const canAccess = user
    ? getPermissions(user.role).canManageStock || user.role === 'admin'
    : false

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [accountFor, setAccountFor] = useState<Supplier | null>(null)
  const [fromDate, setFromDate] = useState('2020-01-01')
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftFrom, setDraftFrom] = useState('2020-01-01')
  const [draftTo, setDraftTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null)
  const [payModal, setPayModal] = useState<'cash' | 'card' | null>(null)
  const [payReceiveNo, setPayReceiveNo] = useState('1')
  const [payDescription, setPayDescription] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [paySuccess, setPaySuccess] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.phone2 ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.taxId ?? '').toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q),
    )
  }, [suppliers, query])

  const linkedCount = useMemo(() => {
    if (!editing) return 0
    return dishes.filter((d) => d.vendorId === editing.id).length
  }, [dishes, editing])

  const accountRows = useMemo(() => {
    if (!accountFor) return []
    const rows = vendorLedger
      .filter((e) => e.supplierId === accountFor.id)
      .filter((e) => e.date >= fromDate && e.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

    let balance = 0
    return rows.map((e) => {
      balance = Math.round((balance + e.debit - e.credit) * 100) / 100
      return { ...e, balance }
    })
  }, [accountFor, vendorLedger, fromDate, toDate])

  const vendorBalance = useMemo(() => {
    if (!accountFor) return 0
    const rows = vendorLedger
      .filter((e) => e.supplierId === accountFor.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    let balance = 0
    for (const e of rows) {
      balance = Math.round((balance + e.debit - e.credit) * 100) / 100
    }
    return balance
  }, [accountFor, vendorLedger])

  const totals = useMemo(() => {
    return accountRows.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
        balance: r.balance,
      }),
      { debit: 0, credit: 0, balance: 0 },
    )
  }, [accountRows])

  function nextPayReceiveNo() {
    const n = vendorLedger.filter((e) => e.kind === 'cash' || e.kind === 'card').length
    return String(n + 1)
  }

  function openAccount(s: Supplier) {
    const today = new Date().toISOString().slice(0, 10)
    setDraftFrom('2020-01-01')
    setDraftTo(today)
    setFromDate('2020-01-01')
    setToDate(today)
    setSelectedLedgerId(null)
    setPayModal(null)
    setPaySuccess(false)
    setAccountFor(s)
  }

  function applySearch() {
    setFromDate(draftFrom)
    setToDate(draftTo)
    setSelectedLedgerId(null)
  }

  function refreshAccount() {
    const today = new Date().toISOString().slice(0, 10)
    setDraftFrom('2020-01-01')
    setDraftTo(today)
    setFromDate('2020-01-01')
    setToDate(today)
    setSelectedLedgerId(null)
  }

  function openPay(kind: 'cash' | 'card') {
    if (!accountFor) return
    const selected = accountRows.find((r) => r.id === selectedLedgerId)
    const suggest =
      vendorBalance > 0
        ? vendorBalance
        : selected
          ? Math.abs(selected.balance)
          : 0
    setPayModal(kind)
    setPayReceiveNo(nextPayReceiveNo())
    setPayDescription(kind === 'cash' ? t.cash : t.card)
    setPayAmount(suggest > 0 ? String(suggest) : '')
    setPaySuccess(false)
  }

  function savePayment() {
    if (!accountFor || !payModal) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      flash(t.paymentAmountRequired)
      return
    }
    const label = payDescription.trim() || (payModal === 'cash' ? t.cash : t.card)
    addVendorLedgerEntry({
      supplierId: accountFor.id,
      description: `${t.vendorAccount} · ${label} #${payReceiveNo}`,
      debit: 0,
      credit: amount,
      kind: payModal,
    })
    setPaySuccess(true)
  }

  function closePaySuccess() {
    setPaySuccess(false)
    setPayModal(null)
    setPayAmount('')
  }

  function startAdd() {
    setIsNew(true)
    setEditing(emptyVendor())
  }

  function startEdit(s: Supplier) {
    setIsNew(false)
    setEditing({
      ...s,
      phone2: s.phone2 ?? '',
      email: s.email ?? '',
      taxId: s.taxId ?? '',
      address: s.address ?? s.city,
    })
  }

  function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash(t.vendorNameRequired)
      return
    }
    const address = (editing.address ?? '').trim()
    const next: Supplier = {
      ...editing,
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      phone2: (editing.phone2 ?? '').trim(),
      email: (editing.email ?? '').trim(),
      taxId: (editing.taxId ?? '').trim(),
      address,
      city: cityFromAddress(address, editing.city),
    }
    if (vendorRowDuplicatePhones(next.phone, next.phone2 ?? '')) {
      flash(t.vendorSamePhone, 'err')
      return
    }
    const conflict = findVendorUniqueConflict(suppliers, next)
    if (conflict) {
      if (conflict.field === 'email') {
        flash(t.vendorEmailDuplicate.replace('{name}', conflict.vendor.name), 'err')
      } else {
        flash(t.vendorPhoneDuplicate.replace('{name}', conflict.vendor.name), 'err')
      }
      return
    }
    saveSupplier(next)
    setEditing(null)
    flash(isNew ? t.vendorSaved : t.vendorUpdated)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      message:
        linkedCount > 0
          ? `${linkedCount} ${t.deleteVendorLinked}`
          : t.deleteVendorAsk,
      onConfirm: () => {
        const id = editing.id
        dishes
          .filter((d) => d.vendorId === id)
          .forEach((d) => saveDish({ ...d, vendorId: undefined }))
        deleteSupplier(id)
        setEditing(null)
        flash(t.vendorDeleted)
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.vendorLocked}</strong>
          {t.vendorLockedHint}
          <div style={{ marginTop: '1rem' }}>
            <Link to="/settings" className="btn btn-ghost">
              {t.backToSettings}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-vendors">
      <HubHeader />

      <div className="zk-vendors-bar">
        <h1>{t.vendorTitle}</h1>
        <button type="button" className="zk-vendors-add" onClick={startAdd} title={t.addVendor}>
          +
        </button>
      </div>

      <div className="zk-vendors-search">
        <label>
          {t.search}
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchVendor}
          />
        </label>
        <span className="chip mesa-ltr-nums">{filtered.length} {t.vendors}</span>
      </div>

      <div className="zk-vendors-body">
        {filtered.length === 0 ? (
          <div className="zk-vendors-empty">
              <strong>{t.noVendors}</strong>
              <span>{t.tapPlusVendor}</span>
          </div>
        ) : (
          <div className="zk-vendors-grid">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`zk-vendor-card${s.active ? '' : ' inactive'}`}
                onClick={() => startEdit(s)}
              >
                <span className="zk-vendor-icon" aria-hidden>
                  <svg viewBox="0 0 48 48" fill="none">
                    <path
                      d="M10 34h6l3-10h14l4 10h5"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <rect
                      x="18"
                      y="14"
                      width="12"
                      height="10"
                      rx="1.5"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    />
                    <circle cx="16" cy="36" r="3" stroke="currentColor" strokeWidth="2.4" />
                    <circle cx="34" cy="36" r="3" stroke="currentColor" strokeWidth="2.4" />
                    <path
                      d="M28 18h6l3 6"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <strong>{s.name}</strong>
                <span className="zk-vendor-meta">{s.city || '—'}</span>
                <span className={`zk-vendor-badge${s.active ? '' : ' off'}`}>
                  {s.active ? t.userActive : t.inactive}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <HubFooter
        actions={
          <Link to="/purchase-orders" className="zk-hub-back">
            {t.navPurchaseOrders}
          </Link>
        }
      />

      {editing ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-vendors-sheet">
            <div className="zk-vendors-sheet-head">
              <h2>{isNew ? t.newVendor : t.editVendor}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-vendors-form">
              <div className="zk-vendors-col">
                <label>
                  <span>
                    {t.name} <i>*</i>
                  </span>
                  <ArabicTextInput
                    value={editing.name}
                    onChange={(name) => setEditing({ ...editing, name })}
                    mode="auto"
                    showModeToggle={false}
                  />
                </label>
                <label>
                  <span>{t.mobileNo1}</span>
                  <input
                    className="search mesa-ltr-nums"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="+966 …"
                  />
                </label>
                <label>
                  <span>{t.mobileNo2}</span>
                  <input
                    className="search"
                    value={editing.phone2 ?? ''}
                    onChange={(e) => setEditing({ ...editing, phone2: e.target.value })}
                  />
                </label>
                <label>
                  <span>{t.emailId}</span>
                  <input
                    className="search"
                    type="email"
                    value={editing.email ?? ''}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                </label>
              </div>

              <div className="zk-vendors-col">
                <label>
                  <span>{t.status}</span>
                  <MesaSelect
                    value={editing.active ? 'active' : 'inactive'}
                    onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                    options={[
                      { value: 'active', label: t.userActive },
                      { value: 'inactive', label: t.inactive },
                    ]}
                  />
                </label>
                <label>
                  <span>{t.taxIdVat}</span>
                  <input
                    className="search"
                    value={editing.taxId ?? ''}
                    onChange={(e) => setEditing({ ...editing, taxId: e.target.value })}
                    placeholder="3xxxxxxxxxxxxxxx003"
                  />
                </label>
                <label>
                  <span>{t.address}</span>
                  <ArabicTextInput
                    className="search zk-vendors-address"
                    multiline
                    value={editing.address ?? ''}
                    onChange={(address) => setEditing({ ...editing, address })}
                    mode="auto"
                    showModeToggle={false}
                  />
                </label>
              </div>
            </div>

            <div className="zk-vendors-actions">
              {!isNew ? (
                <button
                  type="button"
                  className="zk-vendors-action accent"
                  onClick={() => openAccount(editing)}
                >
                  {t.vendorAccount}
                </button>
              ) : null}
              <button type="button" className="zk-vendors-action" onClick={() => setEditing(null)}>
                {t.cancel}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="zk-vendors-action danger"
                  onClick={remove}
                >
                  {t.delete}
                </button>
              ) : null}
              <button type="button" className="zk-vendors-action primary" onClick={save}>
                {isNew ? t.save : t.update}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountFor ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-vendors-account zk-vendors-account-layout">
            <div className="zk-vendors-account-main">
              <div className="zk-vendors-sheet-head">
                <div>
                  <h2>{t.vendorAccount}</h2>
                  <p className="zk-vendors-account-sub">
                    {accountFor.name} · {t.balanceLabel} {money(vendorBalance)}
                  </p>
                </div>
              </div>

              <div className="zk-vendors-filters">
                <label>
                  {t.fromDate}
                  <input
                    className="search mesa-ltr-nums"
                    type="date"
                    value={draftFrom}
                    onChange={(e) => setDraftFrom(e.target.value)}
                  />
                </label>
                <label>
                  {t.toDate}
                  <input
                    className="search mesa-ltr-nums"
                    type="date"
                    value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                  />
                </label>
                <div className="zk-vendors-filter-btns">
                  <button type="button" className="zk-vendors-action primary" onClick={applySearch}>
                    {t.search}
                  </button>
                  <button type="button" className="zk-vendors-action" onClick={refreshAccount}>
                    {t.refresh}
                  </button>
                </div>
              </div>

              <div className="zk-vendors-ledger-wrap">
                <table className="zk-vendors-ledger">
                  <thead>
                    <tr>
                      <th>{t.date}</th>
                      <th>{t.description}</th>
                      <th>{t.debit}</th>
                      <th>{t.credit}</th>
                      <th>{t.balanceLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty">
                          {t.noLedgerEntries}
                        </td>
                      </tr>
                    ) : (
                      accountRows.map((r) => (
                        <tr
                          key={r.id}
                          className={selectedLedgerId === r.id ? 'selected' : ''}
                          onClick={() => setSelectedLedgerId(r.id)}
                        >
                          <td>{r.date}</td>
                          <td>{r.description}</td>
                          <td>{r.debit.toFixed(2)}</td>
                          <td>{r.credit.toFixed(2)}</td>
                          <td>{r.balance.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{t.transactionTotal}</td>
                      <td>{totals.debit.toFixed(2)}</td>
                      <td>{totals.credit.toFixed(2)}</td>
                      <td>{totals.balance.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <aside className="zk-vendors-account-side">
              <button
                type="button"
                className="zk-vendors-side-btn"
                onClick={() => setAccountFor(null)}
              >
                {t.close}
              </button>
              <button type="button" className="zk-vendors-side-btn cash" onClick={() => openPay('cash')}>
                {t.cash}
              </button>
              <button type="button" className="zk-vendors-side-btn card" onClick={() => openPay('card')}>
                {t.card}
              </button>
            </aside>
          </div>
        </div>
      ) : null}

      {payModal && accountFor ? (
        <div className="zk-vendors-modal zk-vendors-pay-overlay" role="dialog" aria-modal="true">
          <div className="zk-vendors-pay-sheet">
            <div className="zk-vendors-sheet-head">
              <h2>
                {t.vendorPayment} · {payModal === 'cash' ? t.cash : t.card}
              </h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPayModal(null)}
                disabled={paySuccess}
              >
                ✕
              </button>
            </div>

            <div className="zk-vendors-pay-form">
              <div className="zk-vendors-pay-row">
                <span>{t.accountName}</span>
                <strong>
                  {accountFor.name}
                  <em>
                    {t.balanceLabel}: {money(vendorBalance)}
                  </em>
                </strong>
              </div>
              <label>
                <span>{t.receiveNo}</span>
                <input
                  className="search"
                  value={payReceiveNo}
                  onChange={(e) => setPayReceiveNo(e.target.value)}
                />
              </label>
              <label>
                <span>{t.description}</span>
                <textarea
                  className="search zk-vendors-pay-desc"
                  rows={3}
                  value={payDescription}
                  onChange={(e) => setPayDescription(e.target.value)}
                />
              </label>
              <label>
                <span>{t.amountSar}</span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </label>
            </div>

            <div className="zk-vendors-actions">
              <button type="button" className="zk-vendors-action" onClick={() => setPayModal(null)}>
                {t.cancel}
              </button>
              <button type="button" className="zk-vendors-action primary" onClick={savePayment}>
                {t.save}
              </button>
            </div>

            {paySuccess ? (
              <SuccessModal
                title={t.successTitle}
                message={t.updatedSuccessfully}
                okLabel={t.ok}
                onClose={closePaySuccess}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
