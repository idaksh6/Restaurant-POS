import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import AccountsShell from '../components/AccountsShell'
import AccessDenied from '../components/AccessDenied'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import { money } from '../data/mock'
import { type ExpenseDetail } from '../data/paymentTypes'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

function typeName(types: { id: string; name: string }[], id: string) {
  return types.find((t) => t.id === id)?.name ?? id
}

function payName(types: { id: string; name: string }[], id?: string) {
  if (!id) return '—'
  return types.find((t) => t.id === id)?.name ?? id
}

function formatDisplayDate(iso: string, lang: 'en' | 'ar') {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}

export default function ExpenseDetailsPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t, lang } = useI18n()
  const canAccess = user
    ? getPermissions(user.role).canMasters ||
      getPermissions(user.role).canBackOffice ||
      user.role === 'admin'
    : false
  const { expenseDetails: rows, expenseTypes: allTypes, paymentTypes, saveExpenseDetail, deleteExpenseDetail } =
    useCatalog()
  const types = useMemo(() => allTypes.filter((t) => t.active), [allTypes])
  const pays = useMemo(() => paymentTypes.filter((p) => p.active), [paymentTypes])
  const [editing, setEditing] = useState<ExpenseDetail | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const fmt = (n: number) => money(n, lang)
  const thisMonth = monthKey(new Date().toISOString().slice(0, 10))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...rows]
      .filter((r) => !typeFilter || r.expenseTypeId === typeFilter)
      .filter((r) => {
        if (!q) return true
        const type = typeName(allTypes, r.expenseTypeId).toLowerCase()
        return (
          type.includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.invoiceNo ?? '').toLowerCase().includes(q) ||
          r.date.includes(q)
        )
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [rows, query, typeFilter, allTypes])

  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const monthTotal = filtered
    .filter((r) => monthKey(r.date) === thisMonth)
    .reduce((s, r) => s + r.amount, 0)

  function startAdd() {
    setIsNew(true)
    setEditing({
      id: `ed-${Date.now()}`,
      expenseTypeId: types[0]?.id ?? '',
      description: '',
      invoiceNo: String(rows.length + 1),
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      paymentTypeId: pays.find((p) => p.parent === 'cash')?.id ?? pays[0]?.id,
    })
  }

  function openEdit(row: ExpenseDetail) {
    setIsNew(false)
    setEditing({ ...row, invoiceNo: row.invoiceNo ?? '' })
  }

  function save() {
    if (!editing) return
    if (!editing.expenseTypeId) {
      flash(t.expenseSelectType)
      return
    }
    if (!(editing.amount > 0)) {
      flash(t.expenseAmountRequired)
      return
    }
    if (!editing.description.trim()) {
      flash(t.expenseNarrationRequired)
      return
    }
    const row: ExpenseDetail = {
      ...editing,
      description: editing.description.trim(),
      invoiceNo: editing.invoiceNo?.trim() || undefined,
    }
    saveExpenseDetail(row)
    setEditing(null)
    setIsNew(false)
    flash(isNew ? t.expenseAdded : t.expenseUpdated)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.description || typeName(allTypes, editing.expenseTypeId),
      onConfirm: () => {
        deleteExpenseDetail(editing.id)
        setEditing(null)
        flash(t.expenseDeleted)
      },
    })
  }

  if (!canAccess) {
    return <AccessDenied pathname="/expenses" />
  }

  return (
    <AccountsShell
      active="expense-details"
      title={t.expenseDetails}
      subtitle={t.expenseDetailsHint}
      search={query}
      onSearchChange={setQuery}
      actions={
        <button type="button" className="zk-acct-add" onClick={startAdd} title={t.expenseAdd} aria-label={t.expenseAdd}>
          +
        </button>
      }
    >
      <div className="zk-exp-metrics">
        <div className="zk-exp-metric accent">
          <span>{t.expenseLoggedTotal}</span>
          <strong className="mesa-ltr-nums">{fmt(total)}</strong>
        </div>
        <div className="zk-exp-metric">
          <span>{t.expenseEntryCount}</span>
          <strong className="mesa-ltr-nums">{filtered.length}</strong>
        </div>
        <div className="zk-exp-metric">
          <span>{t.expenseThisMonth}</span>
          <strong className="mesa-ltr-nums">{fmt(monthTotal)}</strong>
        </div>
      </div>

      <div className="zk-exp-toolbar">
        <MesaSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: t.expenseFilterAllTypes },
            ...types.map((type) => ({ value: type.id, label: type.name })),
          ]}
        />
        {types.length === 0 ? (
          <Link to="/expenses/types" className="btn btn-ghost">
            {t.expenseTypes}
          </Link>
        ) : null}
      </div>

      <div className="zk-exp-panel">
        <div className="zk-exp-table-wrap">
          <table className="zk-exp-table">
            <colgroup>
              <col className="col-date" />
              <col className="col-invoice" />
              <col className="col-type" />
              <col />
              <col className="col-paid" />
              <col className="col-amt" />
              <col className="col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>{t.expenseColDate}</th>
                <th>{t.expenseColInvoice}</th>
                <th>{t.expenseColType}</th>
                <th>{t.expenseColNarration}</th>
                <th>{t.expenseColPaidBy}</th>
                <th>{t.expenseColAmount}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="zk-exp-empty">
                      <strong>{rows.length === 0 ? t.expenseEmptyTitle : t.expenseNoResults}</strong>
                      <span>{rows.length === 0 ? t.expenseEmptyHint : t.expenseNoResultsHint}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={editing?.id === r.id ? 'selected' : ''}
                    onClick={() => openEdit(r)}
                  >
                    <td className="mesa-ltr-nums">{formatDisplayDate(r.date, lang)}</td>
                    <td className="mesa-ltr-nums">{r.invoiceNo || '—'}</td>
                    <td>
                      <span className="zk-exp-type-pill">{typeName(allTypes, r.expenseTypeId)}</span>
                    </td>
                    <td className="zk-exp-narration">{r.description}</td>
                    <td>{payName(pays, r.paymentTypeId)}</td>
                    <td className="zk-exp-amt mesa-ltr-nums">{fmt(r.amount)}</td>
                    <td>
                      <button
                        type="button"
                        className="zk-exp-edit-btn"
                        title={t.expenseEdit}
                        aria-label={t.expenseEdit}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(r)
                        }}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="zk-exp-sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="expense-sheet-title">
          <div className="zk-exp-sheet">
            <div className="zk-exp-sheet-head">
              <h2 id="expense-sheet-title">{isNew ? t.expenseAdd : t.expenseEdit}</h2>
              <button
                type="button"
                className="zk-exp-sheet-close"
                onClick={() => {
                  setEditing(null)
                  setIsNew(false)
                }}
                aria-label={t.cancel}
              >
                ✕
              </button>
            </div>

            <div className="zk-exp-form">
              <label className="zk-exp-field">
                <span className="zk-exp-label">{t.expenseTypeLabel}</span>
                <MesaSelect
                  value={editing.expenseTypeId}
                  onChange={(v) => setEditing({ ...editing, expenseTypeId: v })}
                  options={[
                    { value: '', label: t.expenseSelectType },
                    ...types.map((type) => ({ value: type.id, label: type.name })),
                  ]}
                />
              </label>
              <label className="zk-exp-field">
                <span className="zk-exp-label">{t.expenseColDate}</span>
                <input
                  className="search zk-exp-input"
                  type="date"
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                />
              </label>
              <label className="zk-exp-field">
                <span className="zk-exp-label">{t.expenseColInvoice}</span>
                <input
                  className="search zk-exp-input"
                  value={editing.invoiceNo ?? ''}
                  onChange={(e) => setEditing({ ...editing, invoiceNo: e.target.value })}
                  placeholder="1"
                />
              </label>
              <label className="zk-exp-field">
                <span className="zk-exp-label">{t.expensePaidBy}</span>
                <MesaSelect
                  value={editing.paymentTypeId ?? ''}
                  onChange={(v) => setEditing({ ...editing, paymentTypeId: v })}
                  options={pays.map((p) => ({ value: p.id, label: p.name }))}
                />
              </label>
              <label className="zk-exp-field zk-exp-span2">
                <span className="zk-exp-label">
                  {t.expenseColAmount} (SAR)
                  <Req />
                </span>
                <input
                  className="search zk-exp-input zk-exp-input-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editing.amount || ''}
                  onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </label>
              <label className="zk-exp-field zk-exp-span2">
                <span className="zk-exp-label">
                  {t.expenseNarration}
                  <Req />
                </span>
                <textarea
                  className="search zk-exp-input zk-exp-narration-input"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder={t.expenseNarration}
                  rows={4}
                />
              </label>
            </div>

            <div className="zk-exp-sheet-actions">
              {!isNew ? (
                <button type="button" className="zk-exp-btn danger zk-exp-btn-left" onClick={remove}>
                  {t.delete}
                </button>
              ) : null}
              <button
                type="button"
                className="zk-exp-btn"
                onClick={() => {
                  setEditing(null)
                  setIsNew(false)
                }}
              >
                {t.cancel}
              </button>
              <button type="button" className="zk-exp-btn primary" onClick={save}>
                {t.expenseSave}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </AccountsShell>
  )
}
