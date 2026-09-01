import { useMemo, useState } from 'react'
import { getPermissions } from '../auth/roles'
import AccountsShell from '../components/AccountsShell'
import AccessDenied from '../components/AccessDenied'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import {
  paymentParents,
  type PaymentParent,
  type PaymentType,
} from '../data/paymentTypes'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'
import SuccessModal from '../components/SuccessModal'

const empty = (sort: number): PaymentType => ({
  id: `pay-${Date.now()}`,
  name: '',
  parent: 'card',
  active: true,
  sort,
})

export default function PaymentTypesPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user
    ? getPermissions(user.role).canMasters ||
      getPermissions(user.role).canBackOffice ||
      user.role === 'admin'
    : false

  const { paymentTypes: rows, savePaymentType, deletePaymentType } = useCatalog()
  const [filter, setFilter] = useState<'all' | PaymentParent>('all')
  const [editing, setEditing] = useState<PaymentType | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successMsg, setSuccessMsg] = useState('Saved successfully')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const filtered = useMemo(() => {
    const list = filter === 'all' ? rows : rows.filter((r) => r.parent === filter)
    return [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  }, [rows, filter])

  function startAdd() {
    const sort = Math.max(0, ...rows.map((r) => r.sort)) + 1
    setIsNew(true)
    setEditing(empty(sort))
  }

  function startEdit(row: PaymentType) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function save() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      flash('Payment type name is required')
      return
    }
    const nameTaken = rows.some(
      (r) => r.id !== editing.id && r.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (nameTaken) {
      flash(t.paymentTypeNameExists)
      return
    }
    try {
      savePaymentType({ ...editing, name })
    } catch (err) {
      flash(err instanceof Error ? err.message : t.paymentTypeNameExists)
      return
    }
    setEditing(null)
    setSuccessMsg(isNew ? 'Created successfully' : 'Updated successfully')
    setSuccessOpen(true)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deletePaymentType(editing.id)
        setEditing(null)
        flash('Payment type deleted')
      },
    })
  }

  if (!canAccess) {
    return <AccessDenied pathname="/expenses/payment-types" />
  }

  return (
    <AccountsShell
      active="payment-types"
      title={t.paymentTypes}
      subtitle={t.paymentTypesHint}
      actions={
        <button type="button" className="zk-acct-add" onClick={startAdd} title={t.paymentTypes} aria-label={t.paymentTypes}>
          +
        </button>
      }
    >
      <div className="zk-payt-body">
        <aside className="zk-payt-tree">
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {paymentParents.map((p) => (
            <button
              key={p.id}
              type="button"
              className={filter === p.id ? 'active' : ''}
              onClick={() => setFilter(p.id)}
            >
              {p.label}
              <small>{rows.filter((r) => r.parent === p.id).length}</small>
            </button>
          ))}
        </aside>

        <section className="zk-payt-grid-wrap">
          {filtered.length === 0 ? (
            <div className="zk-payt-empty">
              <strong>No payment types</strong>
              <span>Tap + to add one.</span>
            </div>
          ) : (
            <div className="zk-payt-grid">
              {filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`zk-payt-tile parent-${row.parent}${row.active ? '' : ' off'}`}
                  onClick={() => startEdit(row)}
                >
                  <span className="zk-payt-glyph" aria-hidden>
                    {row.parent === 'cash'
                      ? '﷼'
                      : row.parent === 'card'
                        ? '▭'
                        : row.parent === 'voucher'
                          ? '⌘'
                          : row.parent === 'online'
                            ? '◎'
                            : '★'}
                  </span>
                  <strong>{row.name}</strong>
                  <small>{paymentParents.find((p) => p.id === row.parent)?.label}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {editing ? (
        <div className="zk-vendors-modal" role="dialog" aria-modal="true">
          <div className="zk-payt-sheet">
            <div className="zk-vendors-sheet-head">
              <h2>{isNew ? 'New payment type' : 'Edit payment type'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-payt-form">
              <label>
                <span>
                  Payment type <i>*</i>
                </span>
                <input
                  className="search"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. mada, Jahez…"
                />
              </label>
              <label>
                <span>Parent type</span>
                <MesaSelect
                  value={editing.parent}
                  onChange={(v) => setEditing({ ...editing, parent: v as PaymentParent })}
                  options={paymentParents.map((p) => ({ value: p.id, label: p.label }))}
                />
              </label>
              <label>
                <span>Status</span>
                <MesaSelect
                  value={editing.active ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </label>
              <label>
                <span>Sort order</span>
                <input
                  className="search"
                  type="number"
                  value={editing.sort}
                  onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) || 0 })}
                />
              </label>
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

      {successOpen ? (
        <SuccessModal
          title={t.successTitle}
          message={successMsg}
          okLabel={t.ok}
          onClose={() => setSuccessOpen(false)}
        />
      ) : null}
      {deleteConfirmDialog}
    </AccountsShell>
  )
}
