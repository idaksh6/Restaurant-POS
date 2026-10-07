import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import {
  blankTimetable,
  isTimetableActiveNow,
  starterTimetablesForBranch,
  type MenuTimetable,
} from '../data/menuTimetable'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

export default function MenuTimetablePage() {
  const { user } = useAuth()
  const { flash } = usePos()
  const { categories, dishes } = useMasters()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const { timetables: rows, saveTimetable, deleteTimetable } = useCatalog()
  const [view, setView] = useState<'grid' | 'form'>('grid')
  const [editing, setEditing] = useState<MenuTimetable | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [pickDept, setPickDept] = useState<string | null>(null)
  const [pickProd, setPickProd] = useState<string | null>(null)
  const [pickSelDept, setPickSelDept] = useState<string | null>(null)
  const [pickSelProd, setPickSelProd] = useState<string | null>(null)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const mainCats = useMemo(
    () => categories.filter((c) => c.active && !c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const subCats = useMemo(
    () => categories.filter((c) => c.active && c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const deptOptions = useMemo(() => {
    // Mains first (POS departments), then selling subs with parent label context.
    const mains = mainCats.map((c) => ({ id: c.id, name: c.name, sort: c.sort }))
    const parentName = new Map(mainCats.map((m) => [m.id, m.name]))
    const subs = subCats.map((c) => ({
      id: c.id,
      name: parentName.get(c.parentId ?? '') ? `${parentName.get(c.parentId!)!} · ${c.name}` : c.name,
      sort: 1000 + c.sort,
    }))
    return [...mains, ...subs].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  }, [subCats, mainCats])

  const availableDepts = useMemo(() => {
    if (!editing) return []
    const selected = new Set(editing.departmentIds)
    return deptOptions.filter((c) => !selected.has(c.id))
  }, [editing, deptOptions])

  const selectedDepts = useMemo(() => {
    if (!editing) return []
    return editing.departmentIds
      .map((id) => {
        const opt = deptOptions.find((d) => d.id === id)
        const cat = categories.find((c) => c.id === id)
        if (opt) return { id, name: opt.name }
        if (cat) return { id, name: cat.name }
        return { id, name: id }
      })
  }, [editing, categories, deptOptions])

  const availableProducts = useMemo(() => {
    if (!editing) return []
    const selected = new Set(editing.productIds)
    const deptSet = new Set(editing.departmentIds)
    return dishes
      .filter((d) => d.active)
      .filter((d) => {
        if (selected.has(d.id)) return false
        if (!deptSet.size) return true
        const sub = categories.find((c) => c.id === d.categoryId)
        return (
          deptSet.has(d.categoryId) ||
          (sub?.parentId ? deptSet.has(sub.parentId) : false) ||
          (sub ? deptSet.has(sub.id) : false)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [editing, dishes, categories])

  const selectedProducts = useMemo(() => {
    if (!editing) return []
    return editing.productIds
      .map((id) => dishes.find((d) => d.id === id))
      .filter(Boolean) as typeof dishes
  }, [editing, dishes])

  function clearPicks() {
    setPickDept(null)
    setPickProd(null)
    setPickSelDept(null)
    setPickSelProd(null)
  }

  function startNew() {
    setIsNew(true)
    setEditing(blankTimetable())
    setView('form')
    clearPicks()
  }

  function loadStarters() {
    const starters = starterTimetablesForBranch()
    let added = 0
    for (const row of starters) {
      if (rows.some((r) => r.name === row.name && r.branchId === row.branchId)) continue
      saveTimetable(row)
      added += 1
    }
    flash(added ? `Added ${added} sample timetable(s)` : 'Sample schedules already loaded')
  }

  function openRow(row: MenuTimetable) {
    setIsNew(false)
    setEditing({ ...row, departmentIds: [...row.departmentIds], productIds: [...row.productIds] })
    setView('form')
    clearPicks()
  }

  function addDepartment() {
    if (!editing || !pickDept) return
    if (editing.departmentIds.includes(pickDept)) return
    setEditing({ ...editing, departmentIds: [...editing.departmentIds, pickDept] })
    setPickDept(null)
  }

  function removeDepartment() {
    if (!editing || !pickSelDept) return
    setEditing({
      ...editing,
      departmentIds: editing.departmentIds.filter((id) => id !== pickSelDept),
    })
    setPickSelDept(null)
  }

  function addProduct() {
    if (!editing || !pickProd) return
    if (editing.productIds.includes(pickProd)) return
    setEditing({ ...editing, productIds: [...editing.productIds, pickProd] })
    setPickProd(null)
  }

  function removeProduct() {
    if (!editing || !pickSelProd) return
    setEditing({
      ...editing,
      productIds: editing.productIds.filter((id) => id !== pickSelProd),
    })
    setPickSelProd(null)
  }

  function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash('Name is required')
      return
    }
    if (!editing.validFrom || !editing.validTo) {
      flash('Validity dates are required')
      return
    }
    if (editing.validTo < editing.validFrom) {
      flash('Validity end must be after start')
      return
    }
    if (!editing.timeFrom || !editing.timeTo) {
      flash('From / to time are required')
      return
    }
    const row: MenuTimetable = {
      ...editing,
      name: editing.name.trim(),
      timeFrom: editing.timeFrom.slice(0, 5),
      timeTo: editing.timeTo.slice(0, 5),
    }
    saveTimetable(row)
    setIsNew(false)
    setEditing(null)
    setView('grid')
    flash(isNew ? 'Timetable created' : 'Timetable saved')
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.name,
      onConfirm: () => {
        deleteTimetable(editing.id)
        setEditing(null)
        setView('grid')
        flash('Timetable deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Locked</strong>
          <Link to="/settings" className="btn btn-ghost" style={{ marginTop: '1rem' }}>
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-mt">
      <HubHeader closeTo="/settings" />

      <div className="zk-mt-bar">
        <h1>Menu Timetable</h1>
        <div className="zk-mt-bar-actions">
          {rows.length === 0 ? (
            <button type="button" className="zk-mt-starter" onClick={loadStarters}>
              Load samples
            </button>
          ) : null}
          <button type="button" className="zk-mt-add" onClick={startNew} title="Add timetable" aria-label="Add timetable">
            +
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="zk-mt-grid-wrap">
          {rows.length === 0 ? (
            <div className="zk-mt-empty">
              <strong>No timetables yet</strong>
              <span>Schedules are saved per branch and sync when online.</span>
              <span>Tap + to create one, or load Breakfast / Lunch / Dinner samples.</span>
              <button type="button" className="zk-mt-starter primary" onClick={loadStarters}>
                Load sample schedules
              </button>
            </div>
          ) : (
            <div className="zk-mt-grid">
              {rows.map((r) => {
                const live = isTimetableActiveNow(r)
                const scoped = r.departmentIds.length > 0 || r.productIds.length > 0
                return (
                  <button key={r.id} type="button" className="zk-mt-tile" onClick={() => openRow(r)}>
                    <span className="zk-mt-tile-icon" aria-hidden>
                      <svg viewBox="0 0 48 48" fill="none">
                        <path
                          d="M14 28h20M18 28v-6h12v6M16 34h16"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        />
                        <path d="M12 20h24v18H12V20Z" stroke="currentColor" strokeWidth="2.4" />
                      </svg>
                    </span>
                    <strong>{r.name}</strong>
                    <em>
                      {r.validFrom} → {r.validTo}
                    </em>
                    <em>
                      {r.timeFrom} – {r.timeTo}
                    </em>
                    <span className={`zk-mt-tile-badge${r.active ? '' : ' off'}`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                    {live && scoped ? <span className="zk-mt-tile-live">Live on menu</span> : null}
                    {live && !scoped ? <span className="zk-mt-tile-live">Live · full menu</span> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : editing ? (
        <div className="zk-mt-form-wrap">
          <div className="zk-mt-form-scroll">
            <div className="zk-mt-form">
              <header className="zk-mt-form-head">
                <div>
                  <p className="zk-mt-kicker">{isNew ? 'New schedule' : 'Edit schedule'}</p>
                  <h2>{editing.name.trim() || 'Untitled timetable'}</h2>
                </div>
                <label className={`zk-mt-active${editing.active ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  <span className="zk-mt-active-pill">{editing.active ? 'Active' : 'Inactive'}</span>
                </label>
              </header>

              <section className="zk-mt-section">
                <h3>Schedule</h3>
                <p className="zk-mt-hint">
                  When this schedule is live and has departments or products selected, the POS menu shows only those
                  items. Leave both lists empty to keep the full menu during this window.
                </p>
                <div className="zk-mt-fields">
                  <label className="zk-mt-field full">
                    Name <Req />
                    <input
                      className="search"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="e.g. Breakfast · Lunch · Dinner"
                      autoFocus
                    />
                  </label>
                  <label className="zk-mt-field">
                    Validity from
                    <span className="zk-mt-input-icon">
                      <input
                        className="search"
                        type="date"
                        value={editing.validFrom}
                        onChange={(e) => setEditing({ ...editing, validFrom: e.target.value })}
                      />
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </label>
                  <label className="zk-mt-field">
                    Validity to
                    <span className="zk-mt-input-icon">
                      <input
                        className="search"
                        type="date"
                        value={editing.validTo}
                        onChange={(e) => setEditing({ ...editing, validTo: e.target.value })}
                      />
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </label>
                  <label className="zk-mt-field">
                    From time
                    <span className="zk-mt-input-icon">
                      <input
                        className="search"
                        type="time"
                        value={editing.timeFrom.slice(0, 5)}
                        onChange={(e) => setEditing({ ...editing, timeFrom: e.target.value })}
                      />
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M12 8v4.25L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </label>
                  <label className="zk-mt-field">
                    To time
                    <span className="zk-mt-input-icon">
                      <input
                        className="search"
                        type="time"
                        value={editing.timeTo.slice(0, 5)}
                        onChange={(e) => setEditing({ ...editing, timeTo: e.target.value })}
                      />
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M12 8v4.25L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </label>
                </div>
              </section>

              <section className="zk-mt-section">
                <div className="zk-mt-section-head">
                  <h3>Departments</h3>
                  <span className="zk-mt-count">{selectedDepts.length} selected</span>
                </div>
                <div className="zk-mt-transfer-row">
                  <div className="zk-mt-list-panel">
                    <p className="zk-mt-list-label">Available</p>
                    <div className="zk-mt-list" role="listbox" aria-label="Available departments">
                      {availableDepts.length === 0 ? (
                        <em className="zk-mt-list-empty">None left to add</em>
                      ) : (
                        availableDepts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={pickDept === c.id ? 'selected' : ''}
                            onClick={() => setPickDept(c.id)}
                            onDoubleClick={() => {
                              setEditing({
                                ...editing,
                                departmentIds: editing.departmentIds.includes(c.id)
                                  ? editing.departmentIds
                                  : [...editing.departmentIds, c.id],
                              })
                              setPickDept(null)
                            }}
                          >
                            {c.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="zk-mt-transfer-btns">
                    <button type="button" className="zk-mt-mini primary" onClick={addDepartment} disabled={!pickDept}>
                      Add
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="zk-mt-mini" onClick={removeDepartment} disabled={!pickSelDept}>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Remove
                    </button>
                  </div>
                  <div className="zk-mt-list-panel">
                    <p className="zk-mt-list-label">In this schedule</p>
                    <div className="zk-mt-list" role="listbox" aria-label="Selected departments">
                      {selectedDepts.length === 0 ? (
                        <em className="zk-mt-list-empty">Select departments and tap Add</em>
                      ) : (
                        selectedDepts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={pickSelDept === c.id ? 'selected' : ''}
                            onClick={() => setPickSelDept(c.id)}
                            onDoubleClick={() => {
                              setEditing({
                                ...editing,
                                departmentIds: editing.departmentIds.filter((id) => id !== c.id),
                              })
                              setPickSelDept(null)
                            }}
                          >
                            {c.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="zk-mt-section">
                <div className="zk-mt-section-head">
                  <h3>Products</h3>
                  <span className="zk-mt-count">{selectedProducts.length} selected</span>
                </div>
                <div className="zk-mt-transfer-row">
                  <div className="zk-mt-list-panel">
                    <p className="zk-mt-list-label">Available</p>
                    <div className="zk-mt-list" role="listbox" aria-label="Available products">
                      {availableProducts.length === 0 ? (
                        <em className="zk-mt-list-empty">None left to add</em>
                      ) : (
                        availableProducts.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className={pickProd === d.id ? 'selected' : ''}
                            onClick={() => setPickProd(d.id)}
                            onDoubleClick={() => {
                              setEditing({
                                ...editing,
                                productIds: editing.productIds.includes(d.id)
                                  ? editing.productIds
                                  : [...editing.productIds, d.id],
                              })
                              setPickProd(null)
                            }}
                          >
                            {d.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="zk-mt-transfer-btns">
                    <button type="button" className="zk-mt-mini primary" onClick={addProduct} disabled={!pickProd}>
                      Add
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="zk-mt-mini" onClick={removeProduct} disabled={!pickSelProd}>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Remove
                    </button>
                  </div>
                  <div className="zk-mt-list-panel">
                    <p className="zk-mt-list-label">In this schedule</p>
                    <div className="zk-mt-list" role="listbox" aria-label="Selected products">
                      {selectedProducts.length === 0 ? (
                        <em className="zk-mt-list-empty">Select products and tap Add</em>
                      ) : (
                        selectedProducts.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className={pickSelProd === d.id ? 'selected' : ''}
                            onClick={() => setPickSelProd(d.id)}
                            onDoubleClick={() => {
                              setEditing({
                                ...editing,
                                productIds: editing.productIds.filter((id) => id !== d.id),
                              })
                              setPickSelProd(null)
                            }}
                          >
                            {d.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="zk-mt-actions">
            <button type="button" className="zk-mt-action primary" onClick={save}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Save
            </button>
            {!isNew ? (
              <button type="button" className="zk-mt-action danger" onClick={remove}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="zk-mt-action"
              onClick={() => {
                setView('grid')
                setEditing(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <HubFooter />
      {deleteConfirmDialog}
    </div>
  )
}
