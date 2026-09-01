import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ArabicTextInput from '../components/ArabicTextInput'
import Req from '../components/Req'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { money } from '../data/mock'
import {
  addMonths,
  codesForBatch,
  voucherStats,
  type FoodVoucherBatch,
} from '../data/foodVouchers'
import { printFoodVouchers } from '../lib/foodVoucherPrint'
import { branchDisplayName, companyDisplayName } from '../lib/branding'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useFoodVouchers } from '../state/FoodVoucherContext'
import { usePos } from '../state/PosContext'

const durations = [1, 3, 6, 12] as const

function blankBatch(): FoodVoucherBatch {
  return {
    id: `fvb-${Date.now()}`,
    name: '',
    expiryDate: addMonths(new Date().toISOString().slice(0, 10), 1),
    count: 5,
    amount: 50,
    createdAt: new Date().toISOString(),
  }
}

export default function FoodVouchersPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t, lang } = useI18n()
  const { company, activeBranch } = useBranch()
  const { batches, codes, saveBatch, removeBatch } = useFoodVouchers()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [view, setView] = useState<'grid' | 'form'>('grid')
  const [editing, setEditing] = useState<FoodVoucherBatch | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [duration, setDuration] = useState<number>(1)
  const [successMsg, setSuccessMsg] = useState('')
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const stats = useMemo(() => voucherStats(codes), [codes])
  const formCodes = editing ? codesForBatch(editing.id, codes) : []
  /** Only real generated codes — never echo draft count before Save. */
  const panelStats = useMemo(() => {
    if (!editing) return stats
    if (formCodes.length === 0) return { total: 0, used: 0, available: 0 }
    const used = formCodes.filter((c) => c.status === 'used').length
    return { total: formCodes.length, used, available: formCodes.length - used }
  }, [editing, formCodes, stats])

  function startNew() {
    setIsNew(true)
    setDuration(1)
    setEditing(blankBatch())
    setView('form')
  }

  function openBatch(b: FoodVoucherBatch) {
    setIsNew(false)
    setEditing({ ...b })
    setDuration(1)
    setView('form')
  }

  function applyDuration(months: number) {
    setDuration(months)
    if (!editing) return
    setEditing({
      ...editing,
      expiryDate: addMonths(new Date().toISOString().slice(0, 10), months),
    })
  }

  function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash(t.voucherNameRequired)
      return
    }
    if (!(editing.count > 0) || !(editing.amount > 0)) {
      flash(t.voucherCountAmountRequired)
      return
    }
    const batch: FoodVoucherBatch = {
      ...editing,
      name: editing.name.trim(),
      count: Math.floor(editing.count),
      amount: Math.round(editing.amount * 100) / 100,
    }
    const created = saveBatch(batch, isNew || !batches.some((b) => b.id === batch.id))
    setEditing(batch)
    setIsNew(false)
    if (created.length) {
      setSuccessMsg(t.vouchersGenerated)
      flash(t.vouchersGenerated)
    } else {
      setSuccessMsg('')
      flash(t.voucherBatchUpdated)
    }
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        removeBatch(editing.id)
        setEditing(null)
        setView('grid')
        flash(t.voucherBatchDeleted)
      },
    })
  }

  async function printVouchers() {
    if (!editing) return
    const list = codesForBatch(editing.id, codes)
    const printable = list.filter((c) => c.status === 'available')
    const rows = printable.length ? printable : list
    if (rows.length === 0) {
      flash(t.noCodesToPrint)
      return
    }
    const result = await printFoodVouchers(rows, {
      brandName: companyDisplayName(company, 'en'),
      brandAr: company.aliasName || companyDisplayName(company, 'ar'),
      logoDataUrl: company.logoDataUrl,
      branchLabel: branchDisplayName(activeBranch, lang),
      title: editing.name,
      lang,
    })
    if (!result.ok) flash(t.allowPopups)
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.settingsLocked}</strong>
          <Link to="/settings" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            {t.backToSettings}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-fv">
      <HubHeader />

      <div className="zk-fv-bar">
        <h1>{t.foodVoucherTitle}</h1>
        <button type="button" className="zk-fv-add" onClick={startNew} title={t.addVoucher}>
          +
        </button>
      </div>

      {view === 'grid' ? (
        <div className="zk-fv-grid-wrap">
          {batches.length === 0 ? (
            <div className="zk-fv-empty">
              <strong>{t.noFoodVouchers}</strong>
              <span>{t.tapPlusBatch}</span>
            </div>
          ) : (
            <div className="zk-fv-grid">
              {batches.map((b) => {
                const batchCodes = codesForBatch(b.id, codes)
                const avail = batchCodes.filter((c) => c.status === 'available').length
                const total = batchCodes.length || b.count
                return (
                  <button key={b.id} type="button" className="zk-fv-tile" onClick={() => openBatch(b)}>
                    <span className="zk-fv-tile-art" aria-hidden>
                      <svg viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="30" r="18" fill="#ecfdf5" opacity="0.95" />
                        <circle cx="32" cy="30" r="13" stroke="#0f766e" strokeWidth="1.8" opacity="0.35" />
                        <ellipse cx="32" cy="30" rx="8" ry="6" fill="#f59e0b" />
                        <path
                          d="M24 26c4-6 10-7 14-2 2 2 1 6-2 7-5 3-10 0-12-5z"
                          fill="#fbbf24"
                        />
                        <path
                          d="M34 24c5-2 10 1 10 5 0 4-4 7-8 6-4-1-6-5-2-11z"
                          fill="#ef4444"
                          opacity="0.9"
                        />
                        <path
                          d="M18 48v-12M15 36h6M46 36c3 0 5 2.5 5 5.5S49 47 46 47M46 47v1"
                          stroke="#ecfdf5"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="zk-fv-tile-body">
                      <strong>{b.name}</strong>
                      <span className="zk-fv-tile-amount mesa-ltr-nums">{money(b.amount)}</span>
                      <span className="zk-fv-tile-meta mesa-ltr-nums">
                        {avail}/{total} {t.voucherLeft}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : editing ? (
        <div className="zk-fv-form-wrap">
          <div className="zk-fv-form">
            <div className="zk-fv-fields">
              <label>
                <span>{t.expiryDate} <Req /></span>
                <input
                  className="search mesa-ltr-nums"
                  type="date"
                  value={editing.expiryDate}
                  onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value })}
                />
              </label>
              <div className="zk-fv-durations">
                {durations.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={duration === m ? 'active' : ''}
                    onClick={() => applyDuration(m)}
                  >
                    {m} {m === 1 ? t.voucherMonth : t.voucherMonths}
                  </button>
                ))}
              </div>
              <label>
                <span>{t.voucherName} <Req /></span>
                <ArabicTextInput
                  mode="auto"
                  showModeToggle={false}
                  className="search"
                  value={editing.name}
                  onChange={(name) => setEditing({ ...editing, name })}
                  placeholder={t.voucherName}
                />
              </label>
              <label>
                <span>{t.voucherCount} <Req /></span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  min={1}
                  value={editing.count}
                  onChange={(e) => setEditing({ ...editing, count: Number(e.target.value) || 0 })}
                  disabled={!isNew && formCodes.length > 0}
                />
              </label>
              <label>
                <span>{t.voucherAmountSar} <Req /></span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
                />
              </label>
            </div>

            <aside className="zk-fv-stats">
              <div>
                <span>{t.foodVoucherTotal}</span>
                <strong className="mesa-ltr-nums">{panelStats.total}</strong>
              </div>
              <div>
                <span>{t.foodVoucherUsed}</span>
                <strong className="mesa-ltr-nums">{panelStats.used}</strong>
              </div>
              <div>
                <span>{t.foodVoucherAvailable}</span>
                <strong className="mesa-ltr-nums">{panelStats.available}</strong>
              </div>
              {isNew && formCodes.length === 0 ? (
                <p className="zk-fv-stats-hint">Tap Save to generate voucher codes</p>
              ) : null}
            </aside>
          </div>

          <div className="zk-fv-actions">
            <button type="button" className="zk-fv-action primary" onClick={save}>
              {t.save}
            </button>
            {!isNew ? (
              <button type="button" className="zk-fv-action danger" onClick={remove}>
                {t.delete}
              </button>
            ) : null}
            <button
              type="button"
              className="zk-fv-action"
              onClick={() => {
                setView('grid')
                setEditing(null)
              }}
            >
              {t.cancel}
            </button>
            <button type="button" className="zk-fv-action" onClick={printVouchers}>
              {t.printVoucher}
            </button>
          </div>

          {formCodes.length > 0 ? (
            <div className="zk-fv-table-wrap">
              <table className="zk-fv-table">
                <thead>
                  <tr>
                    <th>{t.voucherName}</th>
                    <th>{t.voucherCode}</th>
                    <th>{t.expiryDate}</th>
                    <th>{t.voucherPrice}</th>
                    <th>{t.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {formCodes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        <code className="mesa-ltr-nums">{c.code}</code>
                      </td>
                      <td className="mesa-ltr-nums">{c.expiryDate}</td>
                      <td className="mesa-ltr-nums">{money(c.amount)}</td>
                      <td>
                        <span className={`zk-fv-status ${c.status}`}>
                          {c.status === 'used' ? t.voucherStatusUsed : t.voucherStatusAvailable}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <HubFooter />

      {successMsg ? (
        <div className="zk-fv-toast" role="alertdialog">
          <div className="zk-fv-toast-card">
            <strong>{t.successTitle}</strong>
            <p>{successMsg}</p>
            <button type="button" className="btn btn-primary" onClick={() => setSuccessMsg('')}>
              {t.ok}
            </button>
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
