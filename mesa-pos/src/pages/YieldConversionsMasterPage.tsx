import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import { HubFooter, HubHeader } from '../components/HubChrome'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import MesaSelect from '../components/MesaSelect'
import {
  deleteYieldLink,
  isYieldPairTaken,
  loadYieldLinks,
  stockSkuOptions,
  upsertYieldLink,
  type YieldLink,
} from '../data/stockYieldLinks'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'

function emptyRow(): YieldLink {
  return {
    id: `yl-${Date.now()}`,
    fromSku: '',
    toSku: '',
    defaultYieldPct: 100,
    label: '',
    note: '',
    active: true,
  }
}

function autoLabel(fromName: string, toName: string) {
  if (!fromName || !toName) return ''
  return `${fromName} → ${toName}`
}

export default function YieldConversionsMasterPage() {
  const { user } = useAuth()
  const { flash, stock } = usePos()
  const { t } = useI18n()
  const canAccess = user ? getPermissions(user.role).canMasters || user.role === 'admin' : false

  const [rows, setRows] = useState<YieldLink[]>(() => loadYieldLinks())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<YieldLink | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const skuOptions = useMemo(() => stockSkuOptions(stock), [stock])
  const stockBySku = useMemo(() => new Map(stock.map((s) => [s.sku, s])), [stock])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (!q) return true
      const from = stockBySku.get(r.fromSku)?.name ?? r.fromSku
      const to = stockBySku.get(r.toSku)?.name ?? r.toSku
      return (
        r.label.toLowerCase().includes(q) ||
        from.toLowerCase().includes(q) ||
        to.toLowerCase().includes(q) ||
        r.fromSku.toLowerCase().includes(q) ||
        r.toSku.toLowerCase().includes(q)
      )
    })
  }, [rows, query, stockBySku])

  function refresh() {
    setRows(loadYieldLinks())
  }

  function startAdd() {
    setIsNew(true)
    setEditing(emptyRow())
  }

  function startEdit(row: YieldLink) {
    setIsNew(false)
    setEditing({ ...row })
  }

  function save() {
    if (!editing) return
    const fromSku = editing.fromSku.trim()
    const toSku = editing.toSku.trim()
    if (!fromSku || !toSku) {
      flash('Select raw and prepped SKUs', 'err')
      return
    }
    if (fromSku === toSku) {
      flash('Raw and prepped must be different SKUs', 'err')
      return
    }
    const from = stockBySku.get(fromSku)
    const to = stockBySku.get(toSku)
    if (!from || !to) {
      flash('Both SKUs must exist in stock master', 'err')
      return
    }
    if (from.unit !== to.unit) {
      flash(`Units must match (${from.unit} vs ${to.unit})`, 'err')
      return
    }
    if (isYieldPairTaken(rows, fromSku, toSku, editing.id)) {
      flash('This raw → prepped pair already exists', 'err')
      return
    }
    const label =
      editing.label.trim() || autoLabel(from.name, to.name) || `${fromSku} → ${toSku}`
    const doc: YieldLink = {
      ...editing,
      fromSku,
      toSku,
      label,
      defaultYieldPct: Math.min(100, Math.max(1, Number(editing.defaultYieldPct) || 100)),
      note: editing.note?.trim() || undefined,
      active: editing.active !== false,
    }
    upsertYieldLink(doc)
    refresh()
    setEditing(null)
    flash(isNew ? `Conversion “${label}” added` : `Conversion “${label}” saved`)
  }

  function remove() {
    if (!editing || isNew) return
    askDelete({
      name: editing.label,
      onConfirm: () => {
        deleteYieldLink(editing.id)
        refresh()
        setEditing(null)
        flash('Conversion deleted')
      },
    })
  }

  if (!canAccess) {
    return (
      <div className="panel floor-panel">
        <div className="ticket-empty">
          <strong>Yield conversions locked</strong>
          <div style={{ marginTop: '1rem' }}>
            <Link to={settingsHubPath('inventory')} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-ing">
      <HubHeader closeTo={settingsHubPath('inventory')} />

      <div className="zk-ing-bar">
        <div className="zk-ing-bar-text">
          <h1>{t.setYieldConversions}</h1>
          <p>{t.setYieldConversionsHint}</p>
        </div>
        <div className="zk-ing-bar-actions">
          <label className="zk-ing-search">
            <span className="sr-only">Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search raw, prepped, label…"
              aria-label="Search yield conversions"
            />
          </label>
          <button type="button" className="zk-ing-add" onClick={startAdd} title="Add conversion">
            +
          </button>
        </div>
      </div>

      <div className="zk-ing-body">
        {filtered.length === 0 ? (
          <div className="zk-ing-empty">
            <strong>{rows.length ? 'No matches' : 'No yield conversions yet'}</strong>
            <span>
              {rows.length
                ? 'Try another search.'
                : 'Link raw SKUs to prepped SKUs for production transfer (e.g. whole potato → fry cut).'}
            </span>
            {!rows.length ? (
              <button type="button" className="btn btn-teal" onClick={startAdd}>
                Add conversion
              </button>
            ) : null}
          </div>
        ) : (
          <div className="zk-mst-panel">
            <div className="zk-mst-panel-head">
              <strong>{filtered.length} conversion{filtered.length === 1 ? '' : 's'}</strong>
              <em>Tap a row to edit · used in production transfer</em>
            </div>
            <div className="zk-mst-table-wrap">
              <table className="zk-mst-table">
                <thead>
                  <tr>
                    <th>Conversion</th>
                    <th>Raw SKU</th>
                    <th>Prepped SKU</th>
                    <th>Yield</th>
                    <th>Status</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const from = stockBySku.get(row.fromSku)
                    const to = stockBySku.get(row.toSku)
                    return (
                      <tr
                        key={row.id}
                        className={row.active !== false ? '' : 'off'}
                        onClick={() => startEdit(row)}
                      >
                        <td className="name-cell">
                          <strong>{row.label}</strong>
                          {row.note ? <small>{row.note}</small> : null}
                        </td>
                        <td>
                          <strong>{from?.name ?? row.fromSku}</strong>
                          <small>{row.fromSku}</small>
                        </td>
                        <td>
                          <strong>{to?.name ?? row.toSku}</strong>
                          <small>{row.toSku}</small>
                        </td>
                        <td className="mesa-ltr-nums">
                          <strong>{row.defaultYieldPct}%</strong>
                        </td>
                        <td>
                          <span className={`zk-mst-status ${row.active !== false ? 'on' : 'off'}`}>
                            {row.active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="zk-mst-edit"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(row)
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <HubFooter backTo={settingsHubPath('inventory')} backLabel={t.inventory} />

      {editing ? (
        <div className="zk-ing-modal" role="dialog" aria-modal="true">
          <div className="zk-ing-sheet">
            <div className="zk-ing-sheet-head">
              <h2>{isNew ? 'New yield conversion' : 'Edit yield conversion'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>

            <div className="zk-ing-form">
              <label>
                <span>Raw SKU (from)</span>
                <MesaSelect
                  value={editing.fromSku}
                  onChange={(fromSku) => {
                    const from = stockBySku.get(fromSku)
                    const to = stockBySku.get(editing.toSku)
                    setEditing({
                      ...editing,
                      fromSku,
                      label:
                        editing.label ||
                        autoLabel(from?.name ?? '', to?.name ?? ''),
                    })
                  }}
                  options={skuOptions}
                  placeholder="Select raw item"
                />
              </label>
              <label>
                <span>Prepped SKU (to)</span>
                <MesaSelect
                  value={editing.toSku}
                  onChange={(toSku) => {
                    const from = stockBySku.get(editing.fromSku)
                    const to = stockBySku.get(toSku)
                    setEditing({
                      ...editing,
                      toSku,
                      label:
                        editing.label ||
                        autoLabel(from?.name ?? '', to?.name ?? ''),
                    })
                  }}
                  options={skuOptions}
                  placeholder="Select prepped item"
                />
              </label>
              <label>
                <span>
                  Label <Req />
                </span>
                <input
                  className="search"
                  value={editing.label}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="Whole potato → fry cut"
                />
              </label>
              <label>
                <span>Default yield %</span>
                <input
                  className="search mesa-ltr-nums"
                  type="number"
                  min={1}
                  max={100}
                  value={editing.defaultYieldPct}
                  onChange={(e) =>
                    setEditing({ ...editing, defaultYieldPct: Number(e.target.value) || 100 })
                  }
                />
              </label>
              <label>
                <span>Note (optional)</span>
                <input
                  className="search"
                  value={editing.note ?? ''}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Peel waste, portioning…"
                />
              </label>
              <label>
                <span>Status</span>
                <MesaSelect
                  value={editing.active !== false ? 'active' : 'inactive'}
                  onChange={(v) => setEditing({ ...editing, active: v === 'active' })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </label>
            </div>

            <div className="zk-ing-actions">
              <button type="button" className="zk-ing-action" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {!isNew ? (
                <button type="button" className="zk-ing-action danger" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="zk-ing-action primary" onClick={save}>
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
