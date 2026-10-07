import { useState } from 'react'
import { getPermissions } from '../auth/roles'
import ExpensesShell from '../components/ExpensesShell'
import AccessDenied from '../components/AccessDenied'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import MesaSelect from '../components/MesaSelect'
import { type ExpenseType } from '../data/paymentTypes'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

const blank = (sort: number): ExpenseType => ({
  id: `et-${Date.now()}`,
  name: '',
  description: '',
  active: true,
  sort,
})

export default function ExpenseTypesPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user
    ? getPermissions(user.role).canMasters ||
      getPermissions(user.role).canBackOffice ||
      user.role === 'admin'
    : false
  const { expenseTypes: rows, saveExpenseType, deleteExpenseType } = useCatalog()
  const [editing, setEditing] = useState<ExpenseType | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  function startNew() {
    setIsNew(true)
    setEditing(blank(Math.max(0, ...rows.map((r) => r.sort)) + 1))
  }

  function save() {
    if (!editing?.name.trim()) {
      flash('Expense type name is required')
      return
    }
    const row: ExpenseType = {
      ...editing,
      name: editing.name.trim(),
      description: editing.description?.trim() || undefined,
    }
    saveExpenseType(row)
    setEditing(null)
    setIsNew(false)
    flash(isNew ? 'Expense type created' : 'Expense type updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteExpenseType(editing.id)
        setEditing(null)
        flash('Expense type deleted')
      },
    })
  }

  if (!canAccess) {
    return <AccessDenied pathname="/expenses/types" />
  }

  const sorted = [...rows].sort((a, b) => a.sort - b.sort)

  return (
    <ExpensesShell
      active="expense-types"
      title={t.expenseTypes}
      subtitle={t.expenseTypesHint}
      actions={
        <button type="button" className="zk-acct-add" onClick={startNew} title={t.expenseTypes} aria-label={t.expenseTypes}>
          +
        </button>
      }
    >
      <div className="zk-exp-panel">
        <div className="bo-roles-layout" style={{ padding: '0.85rem', gap: '0.85rem' }}>
          <div className="bo-roles-list" style={{ maxHeight: 'none' }}>
            {sorted.length === 0 ? (
              <div className="zk-exp-empty">
                <strong>No expense types</strong>
                <span>Tap + to create one</span>
              </div>
            ) : (
              sorted.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`bo-role-card${editing?.id === r.id ? ' active' : ''}${r.active ? '' : ' off'}`}
                  onClick={() => {
                    setIsNew(false)
                    setEditing({ ...r, description: r.description ?? '' })
                  }}
                >
                  <span className="bo-role-avatar" aria-hidden>
                    {r.name.slice(0, 2).toUpperCase() || 'ET'}
                  </span>
                  <span className="bo-role-card-body">
                    <strong>{r.name}</strong>
                    <span className="bo-role-meta">
                      <span className={`bo-role-badge ${r.active ? 'custom' : 'system'}`}>
                        {r.active ? t.userActive : t.userInactive}
                      </span>
                      <span>{r.description || '—'}</span>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <section className="bo-panel zk-exp-type-editor" style={{ minHeight: 280 }}>
            {editing ? (
              <div className="zk-exp-type-form">
                <h2>{isNew ? 'New expense type' : 'Edit expense type'}</h2>
                <label className="zk-exp-field">
                  <span className="zk-exp-label">
                    Expense Type Name <Req />
                  </span>
                  <input
                    className="search zk-exp-input"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Rent"
                    autoFocus
                  />
                </label>
                <label className="zk-exp-field">
                  <span className="zk-exp-label">Description</span>
                  <textarea
                    className="search zk-exp-input zk-exp-narration-input"
                    value={editing.description ?? ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Optional notes"
                    rows={4}
                  />
                </label>
                <label className="zk-exp-field">
                  <span className="zk-exp-label">Status</span>
                  <MesaSelect
                    value={editing.active ? 'active' : 'inactive'}
                    onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                    options={[
                      { value: 'active', label: t.userActive },
                      { value: 'inactive', label: t.userInactive },
                    ]}
                  />
                </label>
                <div className="zk-exp-sheet-actions zk-exp-type-actions">
                  <button type="button" className="zk-exp-btn primary" onClick={save}>
                    {t.update}
                  </button>
                  {!isNew ? (
                    <button type="button" className="zk-exp-btn danger" onClick={remove}>
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
                </div>
              </div>
            ) : (
              <div className="zk-exp-empty">
                <strong>Select a type</strong>
                <span>Or tap + to add a new expense type</span>
              </div>
            )}
          </section>
        </div>
      </div>
      {deleteConfirmDialog}
    </ExpensesShell>
  )
}
