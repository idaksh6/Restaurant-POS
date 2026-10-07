import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubAddButton, HubFooter, HubHeader } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { getActiveBranchId } from '../data/company'
import { starterRidersForBranch, type DeliveryRider } from '../data/deliveryRiders'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'

const blank = (sort: number): DeliveryRider => ({
  id: `rider-${Date.now()}`,
  branchId: getActiveBranchId(),
  name: '',
  phone: '',
  active: true,
  sort,
})

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default function DeliveryRidersPage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const { deliveryRiders: rows, saveDeliveryRider, deleteDeliveryRider } = useCatalog()
  const [editing, setEditing] = useState<DeliveryRider | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

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

  function openEdit(row: DeliveryRider) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function loadStarter() {
    const starters = starterRidersForBranch()
    let added = 0
    for (const row of starters) {
      if (rows.some((r) => r.id === row.id)) continue
      saveDeliveryRider(row)
      added += 1
    }
    flash(
      added
        ? t.ridersStartersAdded.replace('{count}', String(added))
        : t.ridersStartersExists,
    )
  }

  function save() {
    if (!editing?.name.trim()) {
      flash(t.ridersNameRequired)
      return
    }
    const row: DeliveryRider = {
      ...editing,
      branchId: editing.branchId ?? getActiveBranchId(),
      name: editing.name.trim(),
      phone: editing.phone.trim(),
    }
    saveDeliveryRider(row)
    closeEditor()
    flash(isNew ? t.ridersCreated : t.ridersUpdated)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteDeliveryRider(editing.id)
        closeEditor()
        flash(t.ridersDeleted)
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>{t.ridersLocked}</strong>
          <Link to="/settings" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            {t.backToSettings}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-riders">
      <HubHeader closeTo="/settings" />

      <div className="zk-riders-bar">
        <h1>{t.ridersTitle}</h1>
        <div className="zk-riders-bar-actions">
          {rows.length === 0 ? (
            <button type="button" className="zk-riders-starter" onClick={loadStarter}>
              {t.ridersLoadStarters}
            </button>
          ) : null}
          <HubAddButton onClick={startNew} title={t.ridersAdd} />
        </div>
      </div>

      <div className="zk-riders-body">
        <div className="zk-riders-list">
          {sorted.length === 0 ? (
            <div className="zk-riders-empty">
              <strong>{t.ridersEmpty}</strong>
              <span>{t.ridersEmptyHint}</span>
              <div className="zk-riders-empty-actions">
                <button type="button" className="zk-riders-starter" onClick={loadStarter}>
                  {t.ridersLoadStarters}
                </button>
                <button type="button" className="btn btn-primary" onClick={startNew}>
                  {t.ridersAdd}
                </button>
              </div>
            </div>
          ) : (
            sorted.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`zk-rider-tile${r.active ? '' : ' off'}${editing?.id === r.id ? ' selected' : ''}`}
                onClick={() => openEdit(r)}
              >
                <span className="zk-rider-avatar" aria-hidden>
                  {initials(r.name)}
                </span>
                <span className="zk-rider-copy">
                  <strong>{r.name}</strong>
                  <small>{r.phone || t.ridersNoPhone}</small>
                </span>
                <span className={`zk-rider-badge${r.active ? '' : ' off'}`}>
                  {r.active ? t.active : t.inactive}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {editing ? (
        <div
          className="zk-riders-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zk-riders-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor()
          }}
        >
          <div className="zk-riders-sheet">
            <div className="zk-riders-sheet-head">
              <div className="zk-riders-sheet-title">
                <span className="zk-rider-avatar lg" aria-hidden>
                  {initials(editing.name || t.ridersNew)}
                </span>
                <div>
                  <p className="zk-riders-kicker">{isNew ? t.ridersNew : t.ridersEdit}</p>
                  <h2 id="zk-riders-modal-title">{editing.name.trim() || t.ridersUntitled}</h2>
                </div>
              </div>
              <button
                type="button"
                className="zk-riders-sheet-close"
                onClick={closeEditor}
                aria-label={t.cancel}
              >
                ✕
              </button>
            </div>

            <div className="zk-riders-form-fields">
              <label>
                <span className="zk-riders-label-text">
                  {t.name} <Req />
                </span>
                <input
                  className="search"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder={t.ridersNamePh}
                  autoFocus
                />
              </label>
              <label>
                <span className="zk-riders-label-text">{t.phone}</span>
                <input
                  className="search"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder={t.ridersPhonePh}
                  inputMode="tel"
                />
              </label>
              <label className="zk-riders-status">
                <span className="zk-riders-label-text">{t.status}</span>
                <MesaSelect
                  value={editing.active ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: t.active },
                    { value: 'inactive', label: t.inactive },
                  ]}
                />
              </label>
            </div>

            <div className="zk-riders-actions">
              <button type="button" className="zk-riders-action primary" onClick={save}>
                {t.save}
              </button>
              {!isNew ? (
                <button type="button" className="zk-riders-action danger" onClick={remove}>
                  {t.delete}
                </button>
              ) : null}
              <button type="button" className="zk-riders-action" onClick={closeEditor}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo="/delivery" backLabel={t.delivery} />
      {deleteConfirmDialog}
    </div>
  )
}
