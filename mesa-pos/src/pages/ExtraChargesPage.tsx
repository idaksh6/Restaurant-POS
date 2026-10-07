import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import SuccessModal from '../components/SuccessModal'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { getActiveBranchId } from '../data/company'
import {
  chargesForBranch,
  starterChargesForBranch,
  type ExtraCharge,
} from '../data/charges'
import { activeTaxes, companyDefaultTaxPercent, normalizeTaxIds } from '../data/tax'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

const blank = (sort: number): ExtraCharge => ({
  id: `ch-${Date.now()}`,
  branchId: getActiveBranchId(),
  name: '',
  amount: 0,
  percent: false,
  active: true,
  sort,
  taxIds: [],
})

function chargeTaxLabel(row: ExtraCharge, taxes: ReturnType<typeof activeTaxes>, defaultPct: number) {
  const id = normalizeTaxIds(row.taxIds)[0]
  if (!id) return `Tax · default ${defaultPct}%`
  const tx = taxes.find((t) => t.id === id)
  if (!tx) return `Tax · default ${defaultPct}%`
  return `Tax · ${tx.percent}%`
}

export default function ExtraChargesPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { activeBranchId } = useBranch()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const { extraCharges: allRows, saveExtraCharge, deleteExtraCharge, taxes } = useCatalog()
  const [editing, setEditing] = useState<ExtraCharge | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const rows = useMemo(
    () => chargesForBranch(allRows, activeBranchId),
    [allRows, activeBranchId],
  )

  const selectableTaxes = useMemo(() => activeTaxes(taxes), [taxes])
  const defaultTaxPct = useMemo(() => companyDefaultTaxPercent(taxes), [taxes])

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name),
      ),
    [rows],
  )

  function closeEditor() {
    setEditing(null)
    setIsNew(false)
  }

  function startNew() {
    setIsNew(true)
    setEditing(blank(Math.max(0, ...rows.map((r) => r.sort ?? 0)) + 1))
  }

  function openEdit(row: ExtraCharge) {
    setIsNew(false)
    setEditing({ ...row, taxIds: normalizeTaxIds(row.taxIds) })
  }

  function loadStarter() {
    const starters = starterChargesForBranch(activeBranchId)
    let added = 0
    for (const row of starters) {
      if (rows.some((r) => r.id === row.id || r.name.toLowerCase() === row.name.toLowerCase())) {
        continue
      }
      saveExtraCharge(row)
      added += 1
    }
    if (added) {
      setSuccessMsg(`Added ${added} starter charge(s)`)
      flash(`Added ${added} starter charge(s)`)
    } else {
      flash('Starter charges already loaded')
    }
  }

  function save() {
    if (!editing?.name.trim()) {
      flash('Charge name is required')
      return
    }
    const amount = Math.round((Number(editing.amount) || 0) * 100) / 100
    if (amount < 0) {
      flash('Amount cannot be negative')
      return
    }
    if (editing.percent && amount > 100) {
      flash('Percent must be 0–100')
      return
    }
    const row: ExtraCharge = {
      ...editing,
      branchId: editing.branchId ?? activeBranchId,
      name: editing.name.trim(),
      amount,
      taxIds: normalizeTaxIds(editing.taxIds),
    }
    saveExtraCharge(row)
    setSuccessMsg(isNew ? 'Charge created' : 'Charge updated')
    closeEditor()
    flash(isNew ? 'Charge created' : 'Charge updated')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteExtraCharge(editing.id)
        closeEditor()
        flash('Charge deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Extra Charges locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('products')} className="btn btn-ghost">
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-et">
      <HubHeader closeTo={settingsHubPath('products')} />

      <div className="zk-et-bar">
        <h1>Extra Charges</h1>
        <div className="zk-et-bar-actions">
          {rows.length === 0 ? (
            <button type="button" className="zk-et-starter" onClick={loadStarter}>
              Load starters
            </button>
          ) : null}
          <HubAddButton title="Add charge" className="zk-et-add" onClick={startNew} />
        </div>
      </div>

      <div className="zk-et-body zk-et-body-solo">
        <div className="zk-et-list">
          {sorted.length === 0 ? (
            <div className="zk-et-empty">
              <strong>No extra charges for this branch</strong>
              <span>Load service / packaging / cover starters, or add a custom charge.</span>
              <div className="zk-et-empty-actions">
                <button type="button" className="zk-et-starter" onClick={loadStarter}>
                  Load starter charges
                </button>
                <button type="button" className="btn btn-primary" onClick={startNew}>
                  Add charge
                </button>
              </div>
            </div>
          ) : (
            sorted.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`zk-et-tile${r.active ? '' : ' off'}`}
                onClick={() => openEdit(r)}
              >
                <strong>{r.name}</strong>
                <small>
                  {r.percent ? `${r.amount}%` : `SAR ${r.amount.toFixed(2)}`}
                  {' · '}
                  {chargeTaxLabel(r, selectableTaxes, defaultTaxPct)}
                  {r.active ? '' : ' · inactive'}
                </small>
                <span className={`zk-et-tile-badge${r.active ? '' : ' off'}`}>
                  {r.active ? 'Active' : 'Off'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {editing ? (
        <div
          className="zk-et-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zk-et-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor()
          }}
        >
          <div className="zk-et-sheet">
            <div className="zk-et-sheet-head">
              <div>
                <p className="zk-et-kicker">{isNew ? 'New charge' : 'Edit charge'}</p>
                <h2 id="zk-et-modal-title">{editing.name.trim() || 'Untitled charge'}</h2>
              </div>
              <button type="button" className="zk-et-sheet-close" onClick={closeEditor} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="zk-et-form-fields">
              <label>
                <span className="zk-et-label-text">
                  Name <Req />
                </span>
                <input
                  className="search"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Service charge"
                  autoFocus
                />
              </label>
              <div className="zk-et-form-row">
                <label>
                  <span className="zk-et-label-text">
                    Amount <Req />
                  </span>
                  <input
                    className="search"
                    inputMode="decimal"
                    value={String(editing.amount)}
                    onChange={(e) =>
                      setEditing({ ...editing, amount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label className="zk-et-status">
                  <span className="zk-et-label-text">Type</span>
                  <MesaSelect
                    value={editing.percent ? 'percent' : 'fixed'}
                    onChange={(v) => setEditing({ ...editing, percent: v === 'percent' })}
                    options={[
                      { value: 'fixed', label: 'Fixed SAR' },
                      { value: 'percent', label: 'Percent of goods' },
                    ]}
                  />
                </label>
              </div>
              <label className="zk-et-status">
                <span className="zk-et-label-text">Status</span>
                <MesaSelect
                  value={editing.active ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </label>

              <div className="zk-et-tax">
                <span className="zk-et-label-text">VAT / tax</span>
                <p className="zk-et-tax-hint">
                  Pick one rate for this charge. Company default uses the Tax master default (usually
                  15%). Choose a 0% rate from Tax master if this fee should not add VAT.
                </p>
                {selectableTaxes.length === 0 ? (
                  <div className="zk-et-tax-empty">
                    No active taxes yet. <Link to="/settings/tax">Manage tax master →</Link>
                  </div>
                ) : (
                  <ul className="zk-et-tax-list" role="radiogroup" aria-label="Charge tax rate">
                    <li>
                      <label
                        className={`zk-et-tax-row${!normalizeTaxIds(editing.taxIds).length ? ' on' : ''}`}
                      >
                        <input
                          type="radio"
                          name="charge-tax"
                          checked={!normalizeTaxIds(editing.taxIds).length}
                          onChange={() => setEditing({ ...editing, taxIds: [] })}
                        />
                        <span className="zk-et-tax-name">Company default</span>
                        <span className="zk-et-tax-pct">{defaultTaxPct}%</span>
                      </label>
                    </li>
                    {selectableTaxes.map((tx) => {
                      const on = normalizeTaxIds(editing.taxIds)[0] === tx.id
                      return (
                        <li key={tx.id}>
                          <label className={`zk-et-tax-row${on ? ' on' : ''}`}>
                            <input
                              type="radio"
                              name="charge-tax"
                              checked={on}
                              onChange={() => setEditing({ ...editing, taxIds: [tx.id] })}
                            />
                            <span className="zk-et-tax-name">{tx.name}</span>
                            <span className="zk-et-tax-pct">{tx.percent}%</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="zk-et-actions">
              <button type="button" className="zk-et-action primary" onClick={save}>
                Save
              </button>
              {!isNew ? (
                <button type="button" className="zk-et-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-et-action" onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo={settingsHubPath('products')} backLabel="Products" />
      {deleteConfirmDialog}
      {successMsg ? (
        <SuccessModal message={successMsg} onClose={() => setSuccessMsg('')} />
      ) : null}
    </div>
  )
}
