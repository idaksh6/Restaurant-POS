import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import {
  createTableArea,
  ensureAreasFromTables,
  loadTableAreas,
  nextAreaSortOrder,
  saveTableAreas,
  type TableArea,
} from '../data/tableAreas'
import { loadPosPrefs, POS_PREFS_EVENT, savePosPrefs, type PosPrefs } from '../data/posPrefs'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n, type Dict } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

type Tab = 'areas' | 'tables'
type StatusFilter = 'all' | 'free' | 'occupied' | 'billing'

type TableDraft = {
  id?: string
  label: string
  note: string
  seats: number
  area: string
  status?: string
}

function isTableLocked(status?: string) {
  return status === 'occupied' || status === 'billing'
}

function normalizeTableNo(value: string) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return ''
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 1 || n > 999) return ''
  return String(n).padStart(2, '0')
}

function nextTableNo(rows: { label: string }[]) {
  let max = 0
  for (const row of rows) {
    const n = Number.parseInt(row.label.replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return String(max + 1).padStart(2, '0')
}

function tableNoTaken(rows: { id: string; label: string }[], tableNo: string, excludeId?: string) {
  const key = normalizeTableNo(tableNo)
  if (!key) return false
  return rows.some((row) => {
    if (excludeId && row.id === excludeId) return false
    return normalizeTableNo(row.label) === key
  })
}

function FtmIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ftm-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconTables() {
  return (
    <FtmIcon>
      <rect x="3" y="7" width="18" height="4" rx="1.5" />
      <path d="M6 11v7M18 11v7M10 11v4M14 11v4" />
    </FtmIcon>
  )
}

function IconArea() {
  return (
    <FtmIcon>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </FtmIcon>
  )
}

function IconSearch() {
  return (
    <FtmIcon>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </FtmIcon>
  )
}

function IconEdit() {
  return (
    <FtmIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </FtmIcon>
  )
}

function tableStatusMeta(status: string, t: Dict) {
  switch (status) {
    case 'free':
      return { label: t.ftmStatusFree, tone: 'free' as const }
    case 'occupied':
      return { label: t.ftmStatusOccupied, tone: 'occupied' as const }
    case 'billing':
      return { label: t.ftmStatusBilling, tone: 'billing' as const }
    default:
      return { label: status, tone: 'other' as const }
  }
}

function emptyArea(rows: TableArea[]): TableArea {
  return {
    id: '',
    name: '',
    sortOrder: nextAreaSortOrder(rows),
    active: true,
  }
}

function displayAreaName(name: string, t: Dict) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '—') return t.ftmUnassignedArea
  return trimmed
}

function emptyTable(defaultArea: string, rows: { label: string }[]): TableDraft {
  return { label: nextTableNo(rows), note: '', seats: 4, area: defaultArea }
}

export default function FloorTablesMasterPage() {
  const { user } = useAuth()
  const { tables, flash, saveFloorTable, deleteFloorTable } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'tables' ? 'tables' : 'areas'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [areas, setAreas] = useState<TableArea[]>(() => loadTableAreas())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editingArea, setEditingArea] = useState<TableArea | null>(null)
  const [areaIsNew, setAreaIsNew] = useState(false)
  const [editingTable, setEditingTable] = useState<TableDraft | null>(null)
  const [tableIsNew, setTableIsNew] = useState(false)
  const [posPrefs, setPosPrefs] = useState<PosPrefs>(() => loadPosPrefs())

  useEffect(() => {
    const sync = () => setPosPrefs(loadPosPrefs())
    window.addEventListener(POS_PREFS_EVENT, sync)
    return () => window.removeEventListener(POS_PREFS_EVENT, sync)
  }, [])

  function toggleAssignGuests() {
    const next = { ...posPrefs, assignGuestsOnOpen: !posPrefs.assignGuestsOnOpen }
    savePosPrefs(next)
    setPosPrefs(next)
    flash(next.assignGuestsOnOpen ? t.ftmAssignGuestsEnabled : t.ftmAssignGuestsDisabled)
  }

  function switchTab(next: Tab) {
    setTab(next)
    setQuery('')
    setStatusFilter('all')
    setSearchParams(next === 'tables' ? { tab: 'tables' } : {}, { replace: true })
  }

  useEffect(() => {
    const sync = () => {
      const names = tables.map((tbl) => tbl.area)
      setAreas(ensureAreasFromTables(names))
    }
    sync()
    const onAreas = () => setAreas(loadTableAreas())
    window.addEventListener('mesa:table-areas-changed', onAreas)
    return () => window.removeEventListener('mesa:table-areas-changed', onAreas)
  }, [tables])

  const areaOptions = useMemo(
    () =>
      areas
        .filter((a) => a.active)
        .map((a) => ({ value: a.name, label: a.name })),
    [areas],
  )

  const tableCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const table of tables) {
      const key = table.area.trim()
      if (!key) continue
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [tables])

  const statusCounts = useMemo(() => {
    const counts = { free: 0, occupied: 0, billing: 0 }
    for (const row of tables) {
      if (row.status === 'free') counts.free += 1
      else if (row.status === 'occupied') counts.occupied += 1
      else if (row.status === 'billing') counts.billing += 1
    }
    return counts
  }, [tables])

  const activeAreaCount = useMemo(() => areas.filter((a) => a.active).length, [areas])

  const filteredAreas = useMemo(() => {
    const q = query.trim().toLowerCase()
    return areas.filter((a) => {
      if (!q) return true
      return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
    })
  }, [areas, query])

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...tables]
      .sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label, undefined, { numeric: true }))
      .filter((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (!q) return true
        return (
          row.label.toLowerCase().includes(q) ||
          row.area.toLowerCase().includes(q) ||
          String(row.seats).includes(q)
        )
      })
  }, [tables, query, statusFilter])

  const tablesGroupedByArea = useMemo(() => {
    const byArea = new Map<string, typeof filteredTables>()
    for (const row of filteredTables) {
      const key = row.area.trim() || '—'
      const list = byArea.get(key) ?? []
      list.push(row)
      byArea.set(key, list)
    }
    const order = new Map(areas.map((a) => [a.name, a.sortOrder]))
    return [...byArea.entries()].sort(([a], [b]) => {
      const oa = order.get(a) ?? 9999
      const ob = order.get(b) ?? 9999
      if (oa !== ob) return oa - ob
      return a.localeCompare(b)
    })
  }, [filteredTables, areas])

  function areaGroupSummary(rows: typeof filteredTables) {
    let free = 0
    let occupied = 0
    let billing = 0
    let seats = 0
    for (const row of rows) {
      seats += row.seats
      if (row.status === 'free') free += 1
      else if (row.status === 'occupied') occupied += 1
      else if (row.status === 'billing') billing += 1
    }
    return { free, occupied, billing, seats, total: rows.length }
  }

  function persistAreas(next: TableArea[]) {
    setAreas(saveTableAreas(next))
  }

  function startAddArea() {
    setAreaIsNew(true)
    setEditingArea(emptyArea(areas))
  }

  function startEditArea(row: TableArea) {
    setAreaIsNew(false)
    setEditingArea({ ...row })
  }

  function saveArea() {
    if (!editingArea) return
    const name = editingArea.name.trim()
    if (!name) {
      flash('Area name is required', 'err')
      return
    }
    if (areas.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingArea.id)) {
      flash('Area name already exists', 'err')
      return
    }

    if (areaIsNew) {
      const doc = createTableArea(name, areas)
      persistAreas([
        { ...doc, sortOrder: Number(editingArea.sortOrder) || doc.sortOrder, active: editingArea.active },
        ...areas,
      ])
      setEditingArea(null)
      flash(`Area “${name}” added`)
      return
    }

    const prevName = areas.find((a) => a.id === editingArea.id)?.name
    const nextAreas = areas.map((a) =>
      a.id === editingArea.id
        ? {
            ...a,
            name,
            sortOrder: Number(editingArea.sortOrder) || a.sortOrder,
            active: editingArea.active,
          }
        : a,
    )
    persistAreas(nextAreas)

    if (prevName && prevName !== name) {
      for (const table of tables) {
        if (table.area === prevName) {
          saveFloorTable({
            id: table.id,
            label: table.label,
            seats: table.seats,
            area: name,
          })
        }
      }
    }

    setEditingArea(null)
    flash(`Area “${name}” saved`)
  }

  function removeArea() {
    if (!editingArea || areaIsNew) return
    const count = tableCounts.get(editingArea.name) ?? 0
    if (count > 0) {
      flash(`Reassign ${count} table${count === 1 ? '' : 's'} before deleting this area`, 'err')
      return
    }
    askDelete({
      name: editingArea.name,
      onConfirm: () => {
        persistAreas(areas.filter((a) => a.id !== editingArea.id))
        setEditingArea(null)
        flash('Area deleted')
      },
    })
  }

  function startAddTable() {
    const defaultArea = areaOptions[0]?.value ?? ''
    if (!defaultArea) {
      flash('Add a table area first', 'err')
      setTab('areas')
      return
    }
    setTableIsNew(true)
    setEditingTable(emptyTable(defaultArea, tables))
  }

  function startEditTable(row: {
    id: string
    label: string
    note?: string
    seats: number
    area: string
    status: string
  }) {
    if (isTableLocked(row.status)) {
      flash(t.ftmTableLocked, 'err')
      return
    }
    setTableIsNew(false)
    const digits = row.label.replace(/\D/g, '')
    setEditingTable({
      id: row.id,
      label: normalizeTableNo(digits) || digits.slice(0, 3),
      note: row.note ?? '',
      seats: row.seats,
      area: row.area,
      status: row.status,
    })
  }

  function saveTable() {
    if (!editingTable) return
    if (!tableIsNew && isTableLocked(editingTable.status)) {
      flash(t.ftmTableLocked, 'err')
      return
    }
    const tableNo = normalizeTableNo(editingTable.label)
    if (!tableNo) {
      flash(t.ftmTableNoInvalid, 'err')
      return
    }
    if (tableNoTaken(tables, tableNo, tableIsNew ? undefined : editingTable.id)) {
      flash(t.ftmTableNoExists, 'err')
      return
    }
    const ok = saveFloorTable({
      id: tableIsNew ? undefined : editingTable.id,
      label: tableNo,
      note: editingTable.note.trim(),
      seats: editingTable.seats,
      area: editingTable.area,
    })
    if (ok) setEditingTable(null)
  }

  function removeTable() {
    if (!editingTable?.id || tableIsNew) return
    askDelete({
      name: `Table ${editingTable.label}`,
      onConfirm: () => {
        if (deleteFloorTable(editingTable.id!)) setEditingTable(null)
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Floor tables locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath()} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-ftm">
      <HubHeader closeTo={settingsHubPath()} />

      <div className="ftm-page">
        <header className="ftm-hero">
          <div className="ftm-hero-brand">
            <span className="ftm-hero-mark">
              <IconTables />
            </span>
            <div>
              <h1>{t.setFloorTables}</h1>
              <p>{t.setFloorTablesHint}</p>
            </div>
          </div>
          <div className="ftm-hero-stats">
            <span className="ftm-stat">
              <strong className="mesa-ltr-nums">{tables.length}</strong>
              <em>{t.ftmStatTotal}</em>
            </span>
            <span className="ftm-stat">
              <strong className="mesa-ltr-nums">{areas.length}</strong>
              <em>{t.ftmStatAreas}</em>
            </span>
            {tab === 'tables' ? (
              <>
                <span className="ftm-stat tone-free">
                  <strong className="mesa-ltr-nums">{statusCounts.free}</strong>
                  <em>{t.ftmStatusFree}</em>
                </span>
                <span className="ftm-stat tone-occupied">
                  <strong className="mesa-ltr-nums">{statusCounts.occupied}</strong>
                  <em>{t.ftmStatusOccupied}</em>
                </span>
                <span className="ftm-stat tone-billing">
                  <strong className="mesa-ltr-nums">{statusCounts.billing}</strong>
                  <em>{t.ftmStatusBilling}</em>
                </span>
              </>
            ) : (
              <span className="ftm-stat tone-active">
                <strong className="mesa-ltr-nums">{activeAreaCount}</strong>
                <em>{t.ftmStatActive}</em>
              </span>
            )}
          </div>
        </header>

        <div className="ftm-control-bar">
          <div className="ftm-control-main">
            <div className="ftm-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'areas'}
                className={tab === 'areas' ? 'active' : ''}
                onClick={() => switchTab('areas')}
              >
                <IconArea />
                {t.setTableArea}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'tables'}
                className={tab === 'tables' ? 'active' : ''}
                onClick={() => switchTab('tables')}
              >
                <IconTables />
                {t.setTableMgmt}
              </button>
            </div>

            <label className="ftm-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'areas' ? t.ftmSearchAreas : t.ftmSearchTables}
                aria-label={tab === 'areas' ? t.ftmSearchAreas : t.ftmSearchTables}
              />
            </label>

            <button
              type="button"
              className="ftm-add"
              onClick={tab === 'areas' ? startAddArea : startAddTable}
              title={tab === 'areas' ? t.ftmAddArea : t.ftmAddTable}
            >
              <span aria-hidden>+</span>
              <em>{tab === 'areas' ? t.ftmAddArea : t.ftmAddTable}</em>
            </button>
          </div>

          <div className="ftm-control-pref">
            <strong title={t.ftmAssignGuestsHint}>{t.ftmAssignGuestsTitle}</strong>
            <button
              type="button"
              role="switch"
              aria-checked={posPrefs.assignGuestsOnOpen}
              aria-label={t.ftmAssignGuestsTitle}
              title={t.ftmAssignGuestsHint}
              className={`zk-user-switch${posPrefs.assignGuestsOnOpen ? ' on' : ''}`}
              onClick={toggleAssignGuests}
            >
              <i aria-hidden />
              <strong>{posPrefs.assignGuestsOnOpen ? t.ftmActive : t.ftmInactive}</strong>
            </button>
          </div>
        </div>

        {tab === 'tables' ? (
          <div className="ftm-filters">
            {(
              [
                ['all', t.ftmFilterAll, tables.length],
                ['free', t.ftmStatusFree, statusCounts.free],
                ['occupied', t.ftmStatusOccupied, statusCounts.occupied],
                ['billing', t.ftmStatusBilling, statusCounts.billing],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={`ftm-filter${statusFilter === key ? ' on' : ''}${key !== 'all' ? ` tone-${key}` : ''}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
                <em className="mesa-ltr-nums">{count}</em>
              </button>
            ))}
          </div>
        ) : null}

        <div className="ftm-body">
          {tab === 'areas' ? (
            filteredAreas.length === 0 ? (
              <div className="ftm-empty">
                <span className="ftm-empty-ico">
                  <IconArea />
                </span>
                <strong>{areas.length ? t.noSelectMatches : 'No areas yet'}</strong>
                <span>
                  {areas.length
                    ? t.noMatches
                    : 'Create dining areas like Main Hall, Outdoor, Private.'}
                </span>
                {!areas.length ? (
                  <button type="button" className="btn btn-teal" onClick={startAddArea}>
                    {t.ftmAddArea}
                  </button>
                ) : null}
              </div>
            ) : (
              <section className="ftm-panel">
                <div className="ftm-panel-head">
                  <strong className="mesa-ltr-nums">
                    {filteredAreas.length} {t.ftmStatAreas.toLowerCase()}
                  </strong>
                  <em>{t.ftmAreasHint}</em>
                </div>
                <div className="ftm-table-wrap">
                  <table className="ftm-table">
                    <thead>
                      <tr>
                        <th>{t.ftmColOrder}</th>
                        <th>{t.ftmColArea}</th>
                        <th>{t.ftmColTablesCount}</th>
                        <th>{t.status}</th>
                        <th aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAreas.map((row) => (
                        <tr
                          key={row.id}
                          className={row.active ? '' : 'is-off'}
                          onClick={() => startEditArea(row)}
                        >
                          <td>
                            <span className="ftm-order mesa-ltr-nums">{row.sortOrder}</span>
                          </td>
                          <td>
                            <div className="ftm-name-cell">
                              <span className="ftm-area-mark">
                                <IconArea />
                              </span>
                              <strong>{row.name}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="ftm-count mesa-ltr-nums">
                              {tableCounts.get(row.name) ?? 0}
                            </span>
                          </td>
                          <td>
                            <span className={`ftm-badge ${row.active ? 'active' : 'inactive'}`}>
                              {row.active ? t.ftmActive : t.ftmInactive}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ftm-row-action"
                              aria-label={t.update}
                              onClick={(e) => {
                                e.stopPropagation()
                                startEditArea(row)
                              }}
                            >
                              <IconEdit />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          ) : filteredTables.length === 0 ? (
            <div className="ftm-empty">
              <span className="ftm-empty-ico">
                <IconTables />
              </span>
              <strong>{tables.length ? t.noSelectMatches : 'No tables yet'}</strong>
              <span>
                {tables.length ? t.noMatches : 'Add floor tables and assign each to an area.'}
              </span>
              {!tables.length ? (
                <button type="button" className="btn btn-teal" onClick={startAddTable}>
                  {t.ftmAddTable}
                </button>
              ) : null}
            </div>
          ) : (
            <section className="ftm-panel ftm-panel-cards">
              <div className="ftm-panel-head">
                <strong className="mesa-ltr-nums">
                  {filteredTables.length} {t.ftmColTable.toLowerCase()} · {tablesGroupedByArea.length}{' '}
                  {t.ftmStatAreas.toLowerCase()}
                </strong>
                <em>{t.ftmTablesCardHint}</em>
              </div>

              <div className="ftm-card-groups">
                {tablesGroupedByArea.map(([areaName, rows]) => {
                  const summary = areaGroupSummary(rows)
                  const label = displayAreaName(areaName, t)
                  return (
                    <section key={areaName} className="ftm-area-block">
                      <header className="ftm-area-block-head">
                        <div className="ftm-area-block-title">
                          <span className="ftm-area-mark">
                            <IconArea />
                          </span>
                          <div>
                            <strong>{label}</strong>
                            <span className="ftm-area-block-meta mesa-ltr-nums">
                              {summary.total} {t.ftmColTable.toLowerCase()} · {summary.seats}{' '}
                              {t.ftmColSeats.toLowerCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ftm-area-block-stats">
                          {summary.free > 0 ? (
                            <span className="ftm-mini-stat tone-free">
                              {t.ftmStatusFree} <em className="mesa-ltr-nums">{summary.free}</em>
                            </span>
                          ) : null}
                          {summary.occupied > 0 ? (
                            <span className="ftm-mini-stat tone-occupied">
                              {t.ftmStatusOccupied}{' '}
                              <em className="mesa-ltr-nums">{summary.occupied}</em>
                            </span>
                          ) : null}
                          {summary.billing > 0 ? (
                            <span className="ftm-mini-stat tone-billing">
                              {t.ftmStatusBilling}{' '}
                              <em className="mesa-ltr-nums">{summary.billing}</em>
                            </span>
                          ) : null}
                        </div>
                      </header>

                      <div className="ftm-table-cards">
                        {rows.map((row) => {
                          const status = tableStatusMeta(row.status, t)
                          const locked = isTableLocked(row.status)
                          return (
                            <article
                              key={row.id}
                              className={`ftm-table-card status-${status.tone}${locked ? ' is-locked' : ''}`}
                              onClick={() => {
                                if (!locked) startEditTable(row)
                              }}
                            >
                              <div className="ftm-table-card-top">
                                <span className="ftm-table-card-num mesa-ltr-nums">{row.label}</span>
                                <button
                                  type="button"
                                  className="ftm-card-edit"
                                  aria-label={t.update}
                                  disabled={locked}
                                  title={locked ? t.ftmTableLocked : t.update}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditTable(row)
                                  }}
                                >
                                  <IconEdit />
                                </button>
                              </div>
                              <div className="ftm-table-card-meta">
                                {row.note?.trim() ? (
                                  <span className="ftm-table-card-note">{row.note.trim()}</span>
                                ) : null}
                                <span className="ftm-table-card-seats mesa-ltr-nums">
                                  {row.seats} {t.ftmColSeats.toLowerCase()}
                                </span>
                                <span className={`ftm-badge status-${status.tone}`}>{status.label}</span>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      <HubFooter />

      {editingArea
        ? createPortal(
            <div
              className="zk-ing-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ftm-area-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditingArea(null)
              }}
            >
          <div className="zk-ing-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="zk-ing-sheet-head">
              <h2 id="ftm-area-title">{areaIsNew ? t.ftmAddAreaTitle : t.ftmEditAreaTitle}</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingArea(null)}
                aria-label={t.cancel}
              >
                ✕
              </button>
            </div>
            <div className="zk-ing-sheet-body">
              <div className="zk-ing-form">
                <p className="zk-ing-form-note">{t.ftmAreaModalHint}</p>
                <label>
                  <span>
                    {t.ftmColArea} <Req />
                  </span>
                  <input
                    className="search"
                    value={editingArea.name}
                    onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })}
                    placeholder="e.g. Main Hall"
                    autoFocus
                  />
                </label>
                <div className="ftm-form-row">
                  <label>
                    <span>{t.ftmColOrder}</span>
                    <input
                      className="search mesa-ltr-nums"
                      type="number"
                      value={editingArea.sortOrder}
                      onChange={(e) =>
                        setEditingArea({ ...editingArea, sortOrder: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    <span>{t.status}</span>
                    <MesaSelect
                      value={editingArea.active ? 'active' : 'inactive'}
                      onChange={(v) => setEditingArea({ ...editingArea, active: v === 'active' })}
                      options={[
                        { value: 'active', label: t.ftmActive },
                        { value: 'inactive', label: t.ftmInactive },
                      ]}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="zk-ing-actions">
              <button type="button" className="zk-ing-action" onClick={() => setEditingArea(null)}>
                {t.cancel}
              </button>
              {!areaIsNew ? (
                <button type="button" className="zk-ing-action danger" onClick={removeArea}>
                  {t.delete}
                </button>
              ) : null}
              <button type="button" className="zk-ing-action primary" onClick={saveArea}>
                {t.save}
              </button>
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}

      {editingTable
        ? createPortal(
            <div
              className="zk-ing-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ftm-table-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setEditingTable(null)
              }}
            >
          <div className="zk-ing-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="zk-ing-sheet-head">
              <h2 id="ftm-table-title">{tableIsNew ? t.ftmAddTableTitle : t.ftmEditTableTitle}</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingTable(null)}
                aria-label={t.cancel}
              >
                ✕
              </button>
            </div>
            <div className="zk-ing-sheet-body">
              <div className="zk-ing-form">
                <p className="zk-ing-form-note">{t.ftmTableModalHint}</p>
                <div className="ftm-form-row">
                  <label>
                    <span>
                      {t.ftmColTableNo} <Req />
                    </span>
                    <input
                      className="search mesa-ltr-nums"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={editingTable.label}
                      onChange={(e) =>
                        setEditingTable({
                          ...editingTable,
                          label: e.target.value.replace(/\D/g, '').slice(0, 3),
                        })
                      }
                      placeholder="01"
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>
                      {t.ftmColSeats} <Req />
                    </span>
                    <input
                      className="search mesa-ltr-nums"
                      type="number"
                      min={1}
                      max={40}
                      value={editingTable.seats}
                      onChange={(e) =>
                        setEditingTable({ ...editingTable, seats: Number(e.target.value) || 1 })
                      }
                    />
                  </label>
                </div>
                <label>
                  <span>{t.ftmColTableName}</span>
                  <input
                    className="search"
                    value={editingTable.note}
                    onChange={(e) => setEditingTable({ ...editingTable, note: e.target.value })}
                    placeholder={t.ftmColTableNameHint}
                  />
                </label>
                <label>
                  <span>
                    {t.ftmColArea} <Req />
                  </span>
                  <MesaSelect
                    value={editingTable.area}
                    onChange={(area) => setEditingTable({ ...editingTable, area })}
                    options={
                      areaOptions.length
                        ? areaOptions
                        : [{ value: editingTable.area, label: editingTable.area || '—' }]
                    }
                  />
                </label>
                {isTableLocked(editingTable.status) ? (
                  <p className="ftm-form-locked">{t.ftmTableLocked}</p>
                ) : null}
              </div>
            </div>
            <div className="zk-ing-actions">
              <button type="button" className="zk-ing-action" onClick={() => setEditingTable(null)}>
                {t.cancel}
              </button>
              {!tableIsNew && !isTableLocked(editingTable.status) ? (
                <button type="button" className="zk-ing-action danger" onClick={removeTable}>
                  {t.delete}
                </button>
              ) : null}
              {!isTableLocked(editingTable.status) ? (
                <button type="button" className="zk-ing-action primary" onClick={saveTable}>
                  {tableIsNew ? t.save : t.update}
                </button>
              ) : null}
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}

      {deleteConfirmDialog}
    </div>
  )
}
