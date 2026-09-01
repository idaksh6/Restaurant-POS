import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getPermissions, loadManagedRoles, roleDisplayName } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import AccessDenied from '../components/AccessDenied'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { useI18n } from '../locale/i18n'
import { loadBranches, getActiveBranchId } from '../data/company'
import { loadManagedUsers, mergeRemoteUsers, saveManagedUsers, isSeedManagedUser, toStaffAccount, upsertManagedUser, type ManagedUser } from '../data/staffUsers'
import { apiAccessReady, apiListUsers, apiSaveUser, syncCompanyRoles } from '../lib/apiAccess'
import { settingsHubPath } from '../lib/settingsHub'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { accessOutboxOverlay } from '../sync/accessOutbox'
import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox } from '../sync/outbox'
import { useSync } from '../sync/SyncContext'

type FormState = {
  id?: string
  name: string
  nameAr: string
  username: string
  pin: string
  role: string
  branchId: string
  active: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  nameAr: '',
  username: '',
  pin: '',
  role: 'cashier',
  branchId: getActiveBranchId(),
  active: true,
})

export default function UsersPage() {
  const { user, companyId, refreshStaff } = useAuth()
  const { activeBranchId } = useBranch()
  const { flash } = usePos()
  const { syncEpoch, runSync } = useSync()
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const pinMode = searchParams.get('focus') === 'pin'
  const canAccess = user
    ? getPermissions(user.role).canManageUsers || user.role === 'admin'
    : false

  const cid = companyId ?? 'co-mesa'
  const [rows, setRows] = useState<ManagedUser[]>([])
  const [listReady, setListReady] = useState(false)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const branches = useMemo(() => loadBranches().filter((b) => b.active), [])
  const [rolesOptions, setRolesOptions] = useState(() => loadManagedRoles(cid))
  const roles = rolesOptions
  useEffect(() => {
    const onLocal = () => setRolesOptions(loadManagedRoles(cid))
    const onRemote = () => {
      void syncCompanyRoles(cid)
        .then((next) => setRolesOptions(next))
        .catch(() => setRolesOptions(loadManagedRoles(cid)))
    }
    onRemote()
    window.addEventListener('mesa:roles-changed', onLocal)
    window.addEventListener('mesa:access-refresh', onRemote)
    return () => {
      window.removeEventListener('mesa:roles-changed', onLocal)
      window.removeEventListener('mesa:access-refresh', onRemote)
    }
  }, [cid, syncEpoch])
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) => r.role === 'admin' || !r.branchId || r.branchId === activeBranchId,
      ),
    [rows, activeBranchId],
  )

  useEffect(() => {
    let alive = true
    setListReady(false)
    async function load() {
      const overlay = accessOutboxOverlay()
      if (!apiAccessReady()) {
        if (!alive) return
        setRows(mergeRemoteUsers(loadManagedUsers(cid), [], overlay.pendingUsers))
        setListReady(true)
        return
      }
      try {
        await syncCompanyRoles(cid)
        const remote = await apiListUsers(activeBranchId)
        if (!alive) return
        const mapped = remote.map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          nameAr: u.nameAr ?? '',
          role: u.role,
          branchId: u.branchId ?? null,
          active: u.active,
          companyId: u.companyId ?? cid,
        }))
        // Keep local pins / pending creates only — never flash seed demos over the API list.
        const prev = loadManagedUsers(cid).filter((r) => !isSeedManagedUser(r))
        const merged = mergeRemoteUsers(prev, mapped, overlay.pendingUsers)
        saveManagedUsers(cid, merged)
        setRows(merged)
      } catch {
        if (alive) {
          setRows(mergeRemoteUsers(loadManagedUsers(cid).filter((r) => !isSeedManagedUser(r)), [], overlay.pendingUsers))
        }
      } finally {
        if (alive) setListReady(true)
      }
    }
    void load()
    const onUsers = () => {
      if (!alive) return
      setRows(loadManagedUsers(cid).filter((r) => !isSeedManagedUser(r)))
    }
    window.addEventListener('mesa:users-changed', onUsers)
    return () => {
      alive = false
      window.removeEventListener('mesa:users-changed', onUsers)
    }
  }, [cid, activeBranchId, syncEpoch])

  function startAdd() {
    if (pinMode) return
    setIsNew(true)
    setFormError('')
    setConfirmPin('')
    setEditing(emptyForm())
  }

  function startEdit(row: ManagedUser) {
    setIsNew(false)
    setFormError('')
    setConfirmPin('')
    setEditing({
      id: row.id,
      name: row.name,
      nameAr: row.nameAr ?? '',
      username: row.username,
      pin: '',
      role: row.role,
      branchId: row.branchId ?? '',
      active: row.active,
    })
  }

  async function save() {
    if (!editing) return
    const name = editing.name.trim()
    const username = editing.username.trim().toLowerCase()
    const original =
      !isNew && editing.id
        ? rows.find((r) => r.id === editing.id) ??
          rows.find((r) => r.username === username)
        : undefined
    const wasAdmin = original?.role === 'admin'
    if (!pinMode) {
    if (wasAdmin && editing.role !== 'admin') {
      setFormError(t.adminRoleLocked)
      return
    }
    if (!wasAdmin && editing.role === 'admin') {
      setFormError(t.adminRoleLocked)
      return
    }
    if (!name) {
      setFormError('Enter staff name')
      return
    }
    if (username.length < 3) {
      setFormError('Username must be at least 3 characters')
      return
    }
    }
    if (pinMode) {
      const pin = editing.pin.trim()
      if (pin.length < 4) {
        setFormError(t.pinMin)
        return
      }
      if (pin !== confirmPin.trim()) {
        setFormError(t.pinMismatch)
        return
      }
    } else if (editing.pin.trim() && editing.pin.trim().length < 4) {
      setFormError(t.pinMin)
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const localId = editing.id || `usr-${Date.now()}`
      const payload = {
        id: localId,
        name,
        nameAr: editing.nameAr,
        username,
        pin: pinMode ? editing.pin.trim() : editing.pin.trim() || undefined,
        role: wasAdmin ? 'admin' : editing.role,
        branchId: editing.branchId || (isNew ? activeBranchId : null),
        active: editing.active,
        companyId: cid,
      }

      // Always persist locally + outbox so peers get SyncOps (web ↔ desktop).
      const savedLocal = upsertManagedUser(cid, {
        id: isNew ? undefined : editing.id,
        name: payload.name,
        nameAr: payload.nameAr,
        username: payload.username,
        pin: payload.pin,
        role: payload.role,
        branchId: payload.branchId,
        active: payload.active,
      })
      enqueueOutbox(
        'user.upsert',
        savedLocal.id,
        {
          id: savedLocal.id,
          name: savedLocal.name,
          nameAr: savedLocal.nameAr,
          username: savedLocal.username,
          pin: payload.pin,
          role: savedLocal.role,
          branchId: savedLocal.branchId,
          active: savedLocal.active,
          companyId: cid,
        },
        getDeviceId(),
        null,
      )

      if (apiAccessReady()) {
        let saved
        try {
          // Always send client id so REST + SyncOp share the same user row.
          saved = await apiSaveUser({
            id: savedLocal.id,
            name: payload.name,
            nameAr: payload.nameAr,
            username: payload.username,
            pin: payload.pin,
            role: payload.role,
            branchId: payload.branchId,
            active: payload.active,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : ''
          if (savedLocal.id && /not found/i.test(msg)) {
            const remote = await apiListUsers()
            const match = remote.find((u) => u.username === username)
            if (match) {
              saved = await apiSaveUser({
                id: match.id,
                name: payload.name,
                nameAr: payload.nameAr,
                username: payload.username,
                pin: payload.pin,
                role: payload.role,
                branchId: payload.branchId,
                active: payload.active,
              })
            } else if (payload.pin) {
              saved = await apiSaveUser({
                id: savedLocal.id,
                name: payload.name,
                nameAr: payload.nameAr,
                username: payload.username,
                pin: payload.pin,
                role: payload.role,
                branchId: payload.branchId,
                active: payload.active,
              })
            } else {
              throw err
            }
          } else {
            throw err
          }
        }
        if (saved.id && saved.id !== savedLocal.id) {
          upsertManagedUser(cid, {
            id: saved.id,
            name: saved.name,
            nameAr: saved.nameAr ?? '',
            username: saved.username,
            pin: payload.pin,
            role: saved.role,
            branchId: saved.branchId ?? null,
            active: saved.active,
          })
        }
        dropPendingUpsertsFor(savedLocal.id, 'user.upsert')
        if (saved.id) dropPendingUpsertsFor(saved.id, 'user.upsert')
        setRows(loadManagedUsers(cid))
        void refreshStaff()
      } else {
        setRows(loadManagedUsers(cid))
      }
      setEditing(null)
      setConfirmPin('')
      flash(pinMode ? t.pinSaved : isNew ? `User “${name}” added` : `User “${name}” saved`, 'ok')
      void runSync({ quiet: true }).catch(() => undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save user'
      setFormError(msg)
      flash(msg, 'err')
    } finally {
      setBusy(false)
    }
  }

  const originalRole =
    editing && !isNew && editing.id ? rows.find((r) => r.id === editing.id)?.role : undefined
  const adminRoleLocked = !isNew && (originalRole === 'admin' || editing?.role === 'admin')
  const roleOptions = roles
    .filter((r) => (adminRoleLocked ? r.key === 'admin' : r.key !== 'admin'))
    .map((r) => ({ value: r.key, label: r.name }))

  if (!canAccess) {
    return <AccessDenied pathname="/settings/users" />
  }

  return (
    <div className="zk-units">
      <HubHeader closeTo={settingsHubPath('user')} />

      <div className="zk-units-bar">
        <h1>{pinMode ? t.setPinLogin : t.userList}</h1>
        {pinMode ? null : (
          <button type="button" className="zk-units-add" onClick={startAdd} title="Add user">
            +
          </button>
        )}
      </div>

      <div className="zk-units-body">
        {pinMode ? <p className="zk-units-hint">{t.pickUserPin}</p> : null}
        {!listReady ? (
          <div className="zk-units-empty">
            <strong>{t.loadingUsers}</strong>
          </div>
        ) : (
          <>
            <div className="zk-units-grid">
              {visibleRows.map((row) => {
                const staff = toStaffAccount(row)
                const branch = branches.find((b) => b.id === row.branchId)
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`zk-unit-card kind-generic zk-user-card${editing?.id === row.id ? ' active' : ''}${row.active ? '' : ' inactive'}`}
                    onClick={() => startEdit(row)}
                  >
                    <span className="zk-unit-icon zk-user-avatar">{staff.initials}</span>
                    <strong>{row.name}</strong>
                    <small>
                      {row.username} · {roleDisplayName(row.role)}
                    </small>
                    <small>{branch?.name ?? 'All branches'}</small>
                    {!row.active ? <em className="zk-user-off">Inactive</em> : null}
                  </button>
                )
              })}
            </div>
            {visibleRows.length === 0 ? (
              <div className="zk-units-empty">
                <strong>No users yet</strong>
                <span>Tap + to add a cashier, server, or kitchen login.</span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <HubFooter
        backTo={settingsHubPath('user')}
        backLabel={t.user}
        primaryTo="/settings/roles"
        primaryLabel={t.rolesAccess}
      />

      {editing ? (
        <div className="zk-units-modal" role="dialog" aria-modal="true">
          <div className="zk-units-sheet zk-access-sheet">
            <div className="zk-units-sheet-head">
              <h2>{pinMode ? t.setPinLogin : isNew ? 'Add user' : 'Edit user'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <div className="zk-units-sheet-body">
            <div className="zk-units-form">
              {pinMode ? (
                <>
                  <label>
                    <span>{t.username}</span>
                    <input className="search" value={editing.username} readOnly />
                  </label>
                  <label>
                    <span>
                      {t.newPin} <Req />
                    </span>
                    <input
                      className="search"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      autoFocus
                      value={editing.pin}
                      onChange={(e) => setEditing({ ...editing, pin: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>
                      {t.confirmPin} <Req />
                    </span>
                    <input
                      className="search"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
              <label>
                <span>
                  Name <Req />
                </span>
                <input
                  className="search"
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                <span>Arabic name</span>
                <input
                  className="search"
                  dir="rtl"
                  value={editing.nameAr}
                  onChange={(e) => setEditing({ ...editing, nameAr: e.target.value })}
                />
              </label>
              <label>
                <span>
                  Username <Req />
                </span>
                <input
                  className="search"
                  autoComplete="off"
                  value={editing.username}
                  onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                />
              </label>
              <label>
                <span>
                  {isNew ? (
                    <>
                      PIN <Req />
                    </>
                  ) : (
                    'New PIN (optional)'
                  )}
                </span>
                <input
                  className="search"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={editing.pin}
                  placeholder={isNew ? '4+ digits' : 'Leave blank to keep'}
                  onChange={(e) => setEditing({ ...editing, pin: e.target.value })}
                />
              </label>
              <label>
                <span>
                  Role <Req />
                </span>
                <MesaSelect
                  value={editing.role}
                  disabled={adminRoleLocked}
                  title={adminRoleLocked ? t.adminRoleHint : undefined}
                  onChange={(v) => {
                    if (adminRoleLocked || v === 'admin') return
                    setEditing({ ...editing, role: v })
                  }}
                  options={roleOptions}
                />
              </label>
              <label>
                <span>Branch</span>
                <MesaSelect
                  value={editing.branchId}
                  onChange={(v) => setEditing({ ...editing, branchId: v })}
                  options={[
                    { value: '', label: 'All branches' },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </label>
              <div className="zk-user-switch-field">
                <span>{t.signInStatus}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editing.active}
                  className={`zk-user-switch${editing.active ? ' on' : ''}`}
                  onClick={() => setEditing({ ...editing, active: !editing.active })}
                >
                  <i aria-hidden />
                  <strong>{editing.active ? t.userActive : t.userInactive}</strong>
                </button>
              </div>
                </>
              )}
            </div>
            </div>
            <div className="zk-units-actions">
              {formError ? <p className="zk-access-error">{formError}</p> : null}
              <button type="button" className="zk-units-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="zk-units-action primary" disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : isNew ? 'Save' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
