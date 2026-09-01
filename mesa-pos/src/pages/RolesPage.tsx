import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  accessFlagLabels,
  allNavKeys,
  emptyRolePrivileges,
  deleteManagedRole,
  flagsFromPermissions,
  getPermissions,
  loadManagedRoles,
  navMeta,
  normalizePrivileges,
  privilegesWithFlagToggle,
  privilegesWithNavToggle,
  rolePermissions,
  upsertManagedRole,
  type CustomPrivileges,
  type ManagedRole,
  type NavKey,
} from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import AccessDenied from '../components/AccessDenied'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { useI18n } from '../locale/i18n'
import { loadManagedUsers } from '../data/staffUsers'
import {
  apiAccessReady,
  apiDeleteRole,
  apiSaveRole,
  syncCompanyRoles,
} from '../lib/apiAccess'
import { settingsHubPath } from '../lib/settingsHub'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { getDeviceId } from '../sync/deviceId'
import { enqueueOutbox } from '../sync/outbox'
import { useSync } from '../sync/SyncContext'

type Draft = {
  id?: string
  key: string
  name: string
  nameAr: string
  system: boolean
  privileges: CustomPrivileges
}

function toDraft(role: ManagedRole): Draft {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    nameAr: role.nameAr ?? '',
    system: role.system,
    privileges: normalizePrivileges(role.privileges),
  }
}

const emptyDraft = (): Draft => ({
  key: '',
  name: '',
  nameAr: '',
  system: false,
  privileges: emptyRolePrivileges(),
})

export default function RolesPage() {
  const { user, companyId } = useAuth()
  const { flash } = usePos()
  const { syncEpoch, runSync } = useSync()
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const privMode = searchParams.get('focus') === 'privileges'
  const canAccess = user
    ? getPermissions(user.role).canManageUsers || user.role === 'admin'
    : false

  const cid = companyId ?? 'co-mesa'
  const [roles, setRoles] = useState<ManagedRole[]>([])
  const [listReady, setListReady] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  useEffect(() => {
    let alive = true
    setListReady(false)
    async function load() {
      try {
        const next = await syncCompanyRoles(cid)
        if (alive) setRoles(next)
      } catch {
        if (alive) setRoles(loadManagedRoles(cid))
      } finally {
        if (alive) setListReady(true)
      }
    }
    void load()
    // Local edits: trust localStorage immediately (avoid re-fetch resurrecting a just-deleted role).
    const onLocal = () => {
      if (alive) setRoles(loadManagedRoles(cid))
    }
    // Peer / API sync: full refresh from server.
    const onRemote = () => {
      if (!alive) return
      void syncCompanyRoles(cid)
        .then((next) => {
          if (alive) setRoles(next)
        })
        .catch(() => {
          if (alive) setRoles(loadManagedRoles(cid))
        })
    }
    window.addEventListener('mesa:roles-changed', onLocal)
    window.addEventListener('mesa:access-refresh', onRemote)
    return () => {
      alive = false
      window.removeEventListener('mesa:roles-changed', onLocal)
      window.removeEventListener('mesa:access-refresh', onRemote)
    }
  }, [cid, syncEpoch])

  function startAdd() {
    if (privMode) return
    setIsNew(true)
    setEditing(emptyDraft())
  }

  function startEdit(role: ManagedRole) {
    setIsNew(false)
    setEditing(toDraft(role))
  }

  function toggleNav(key: NavKey) {
    if (!editing || key === 'home' || editing.key === 'admin') return
    setEditing((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        privileges: privilegesWithNavToggle(prev.privileges, key),
      }
    })
  }

  function toggleFlag(key: keyof Omit<CustomPrivileges, 'nav'>) {
    if (!editing || editing.key === 'admin') return
    setEditing((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        privileges: privilegesWithFlagToggle(prev.privileges, key),
      }
    })
  }

  async function save() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) {
      flash(t.enterRoleName)
      return
    }
    const nameTaken = roles.some(
      (r) => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== editing.id,
    )
    if (nameTaken) {
      flash(t.roleNameExists)
      return
    }
    setBusy(true)
    try {
      const privileges =
        editing.key === 'admin' ? flagsFromPermissions(rolePermissions.admin) : normalizePrivileges(editing.privileges)
      const local = upsertManagedRole(
        {
          id: isNew ? undefined : editing.id,
          name,
          nameAr: editing.nameAr,
          key: editing.key || undefined,
          privileges,
        },
        cid,
      )

      let synced = local
      if (apiAccessReady()) {
        // New roles POST (no id); updates PUT — ensures the row exists for web peers.
        const saved = await apiSaveRole({
          id: isNew ? undefined : local.id,
          name,
          nameAr: editing.nameAr,
          key: local.key || undefined,
          privileges,
        })
        synced = {
          id: saved.id,
          key: saved.key,
          name: saved.name,
          nameAr: saved.nameAr ?? '',
          system: saved.system,
          privileges: normalizePrivileges(saved.privileges),
        }
        setRoles(await syncCompanyRoles(cid))
      } else {
        setRoles(loadManagedRoles(cid))
      }

      if (!apiAccessReady()) {
        enqueueOutbox(
          'role.upsert',
          synced.id,
          {
            id: synced.id,
            key: synced.key,
            name: synced.name,
            nameAr: synced.nameAr,
            system: synced.system,
            privileges: synced.privileges,
            companyId: cid,
          },
          getDeviceId(),
          null,
        )
      }

      setEditing(null)
      flash(privMode ? t.privilegesSaved : isNew ? `Role “${name}” added` : `Role “${name}” saved`)
      await runSync({ quiet: true }).catch(() => undefined)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save role')
    } finally {
      setBusy(false)
    }
  }

  function remove() {
    if (!editing || isNew || editing.system || !editing.id) return
    askDelete({
      name: editing.name,
      message: `Delete “${editing.name}”? Users on this role must be reassigned first.`,
      onConfirm: () => {
        void (async () => {
          const users = loadManagedUsers(cid).filter((u) => u.role === editing.key && u.active)
          if (users.length) {
            flash('Reassign users before deleting this role')
            return
          }
          setBusy(true)
          const roleId = editing.id!
          const roleName = editing.name
          try {
            // Delete on server first so a following refresh cannot resurrect the card.
            if (apiAccessReady()) {
              await apiDeleteRole(roleId)
            }
            deleteManagedRole(roleId, cid)
            enqueueOutbox('role.delete', roleId, { id: roleId }, getDeviceId(), null)
            setRoles(loadManagedRoles(cid))
            setEditing(null)
            flash(`Role “${roleName}” deleted`)
            await runSync({ quiet: true }).catch(() => undefined)
          } catch (err) {
            flash(err instanceof Error ? err.message : 'Could not delete role')
          } finally {
            setBusy(false)
          }
        })()
      },
    })
  }

  if (!canAccess) {
    return <AccessDenied pathname="/settings/roles" />
  }

  const locked = editing?.key === 'admin'

  return (
    <div className="zk-units">
      <HubHeader closeTo={settingsHubPath('user')} />

      <div className="zk-units-bar">
        <h1>{privMode ? t.setRolePriv : t.rolesAccess}</h1>
        {privMode ? null : (
          <button type="button" className="zk-units-add" onClick={startAdd} title="Add role">
            +
          </button>
        )}
      </div>

      <div className="zk-units-body">
        {privMode ? <p className="zk-units-hint">{t.pickRolePriv}</p> : null}
        {!listReady ? (
          <div className="zk-units-empty">
            <strong>Loading roles…</strong>
          </div>
        ) : (
          <div className="zk-units-grid">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`zk-unit-card kind-generic zk-role-card${editing?.id === role.id ? ' active' : ''}`}
                onClick={() => startEdit(role)}
              >
                <span className="zk-unit-icon">{role.name.slice(0, 2).toUpperCase()}</span>
                <strong>{role.name}</strong>
                <small>{role.system ? 'System role' : 'Custom role'}</small>
                <small>{normalizePrivileges(role.privileges).nav.length} screens</small>
              </button>
            ))}
          </div>
        )}
      </div>

      <HubFooter
        backTo={settingsHubPath('user')}
        backLabel={t.user}
        primaryTo="/settings/users"
        primaryLabel={t.userList}
      />

      {editing ? (
        <div className="zk-units-modal" role="dialog" aria-modal="true">
          <div className="zk-units-sheet zk-access-sheet">
            <div className="zk-units-sheet-head">
              <h2>
                {isNew
                  ? 'New role'
                  : locked
                    ? 'Admin access'
                    : privMode
                      ? `${t.setRolePriv} · ${editing.name}`
                      : `Edit ${editing.name}`}
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-units-sheet-body">
            {privMode ? null : (
            <div className="zk-units-form">
              <label>
                <span>
                  Role name <Req />
                </span>
                <input
                  className="search"
                  autoFocus={isNew}
                  value={editing.name}
                  disabled={locked}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                <span>Arabic name</span>
                <input
                  className="search"
                  dir="rtl"
                  value={editing.nameAr}
                  disabled={locked}
                  onChange={(e) => setEditing({ ...editing, nameAr: e.target.value })}
                />
              </label>
              {isNew ? (
                <label>
                  <span>Key (optional)</span>
                  <input
                    className="search"
                    value={editing.key}
                    placeholder="auto from name"
                    onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                  />
                </label>
              ) : (
                <label>
                  <span>Key</span>
                  <input className="search" value={editing.key} readOnly />
                </label>
              )}
            </div>
            )}

            {locked ? (
              <p className="zk-access-note">Admin always has full access. Create a custom role to limit screens.</p>
            ) : (
              <>
                <h3 className="zk-access-h">{t.screens}</h3>
                <div className="zk-access-nav">
                  {allNavKeys
                    .filter((k) => k !== 'home')
                    .map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={editing.privileges.nav.includes(key) ? 'active' : ''}
                        onClick={() => toggleNav(key)}
                      >
                        {navMeta[key].label}
                      </button>
                    ))}
                </div>
                <h3 className="zk-access-h">{t.actions}</h3>
                <p className="zk-access-note">{t.actionsAutoScreensHint}</p>
                <div className="zk-access-flags">
                  {accessFlagLabels.map(({ key, label, hint }) => (
                    <label key={key} className="zk-access-check">
                      <input
                        type="checkbox"
                        checked={!!editing.privileges[key]}
                        onChange={() => toggleFlag(key)}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            </div>

            <div className="zk-units-actions">
              <button type="button" className="zk-units-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew && !editing.system && !privMode ? (
                <button
                  type="button"
                  className="zk-units-action danger"
                  onClick={remove}
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                className="zk-units-action primary"
                disabled={busy || locked}
                onClick={() => void save()}
              >
                {isNew ? 'Save' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteConfirmDialog}
    </div>
  )
}
