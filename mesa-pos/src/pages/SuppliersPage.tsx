import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import Req from '../components/Req'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import type { Supplier } from '../data/purchasing'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'
import {
  findVendorUniqueConflict,
  vendorRowDuplicatePhones,
} from '../lib/vendorValidation'

const PAGE_SIZE = 8

type StatusFilter = 'all' | 'active' | 'inactive'
type PoFilter = 'all' | 'with' | 'none'
type SortKey = 'name' | 'city' | 'pos' | 'status'

const SORT_OPTIONS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'city', label: 'City' },
  { value: 'pos', label: 'Most orders' },
  { value: 'status', label: 'Status' },
]

function VndIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="vnd-ico"
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

function IconVendors() {
  return (
    <VndIcon>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </VndIcon>
  )
}

function IconActive() {
  return (
    <VndIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.5 2.5L15.5 10" />
    </VndIcon>
  )
}

function IconCity() {
  return (
    <VndIcon>
      <path d="M4 20h16" />
      <path d="M6 20V8l5-3v15" />
      <path d="M11 20V5l7 4v11" />
      <path d="M8 11h1M8 14h1M14 12h1M14 15h1" />
    </VndIcon>
  )
}

function IconSearch() {
  return (
    <VndIcon>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </VndIcon>
  )
}

function IconPlus() {
  return (
    <VndIcon>
      <path d="M12 5v14M5 12h14" />
    </VndIcon>
  )
}

function IconDoc() {
  return (
    <VndIcon>
      <path d="M8 4h7l4 4v12H8V4Z" />
      <path d="M15 4v4h4M10 12h6M10 16h6" />
    </VndIcon>
  )
}

function IconBox() {
  return (
    <VndIcon>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </VndIcon>
  )
}

function IconSliders() {
  return (
    <VndIcon>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" />
    </VndIcon>
  )
}

function IconEdit() {
  return (
    <VndIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
    </VndIcon>
  )
}

function IconTrash() {
  return (
    <VndIcon>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
    </VndIcon>
  )
}

function emptyVendor(): Supplier {
  return {
    id: `vnd-${Date.now()}`,
    name: '',
    phone: '+966 ',
    phone2: '',
    email: '',
    taxId: '',
    address: '',
    city: 'Riyadh',
    active: true,
  }
}

export default function SuppliersPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { flash } = usePos()
  const canManage = user ? getPermissions(user.role).canManageStock : false
  const { suppliers, saveSupplier, deleteSupplier, purchaseOrders } = usePurchasing()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [poFilter, setPoFilter] = useState<PoFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const poCountByVendor = useMemo(() => {
    const map = new Map<string, number>()
    for (const po of purchaseOrders) {
      map.set(po.supplierId, (map.get(po.supplierId) ?? 0) + 1)
    }
    return map
  }, [purchaseOrders])

  const activeCount = suppliers.filter((s) => s.active).length
  const inactiveCount = suppliers.length - activeCount
  const cityCount = new Set(suppliers.map((s) => s.city).filter(Boolean)).size
  const withPoCount = suppliers.filter((s) => (poCountByVendor.get(s.id) ?? 0) > 0).length
  const noPoCount = suppliers.length - withPoCount

  const cityOptions = useMemo(() => {
    const cities = [...new Set(suppliers.map((s) => s.city.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )
    return [
      { value: 'all', label: 'All cities' },
      ...cities.map((c) => ({ value: c, label: c })),
    ]
  }, [suppliers])

  const poOptions = [
    { value: 'all', label: 'All orders' },
    { value: 'with', label: `With orders (${withPoCount})` },
    { value: 'none', label: `No orders (${noPoCount})` },
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = suppliers.filter((s) => {
      if (statusFilter === 'active' && !s.active) return false
      if (statusFilter === 'inactive' && s.active) return false
      if (cityFilter !== 'all' && s.city.trim() !== cityFilter) return false
      const poCount = poCountByVendor.get(s.id) ?? 0
      if (poFilter === 'with' && poCount === 0) return false
      if (poFilter === 'none' && poCount > 0) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        (s.phone2 ?? '').includes(q) ||
        s.city.toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.taxId ?? '').toLowerCase().includes(q)
      )
    })

    return rows.sort((a, b) => {
      if (sortKey === 'city') return a.city.localeCompare(b.city) || a.name.localeCompare(b.name)
      if (sortKey === 'pos') {
        const da = poCountByVendor.get(a.id) ?? 0
        const db = poCountByVendor.get(b.id) ?? 0
        return db - da || a.name.localeCompare(b.name)
      }
      if (sortKey === 'status') {
        if (a.active !== b.active) return a.active ? -1 : 1
        return a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })
  }, [suppliers, query, statusFilter, cityFilter, poFilter, sortKey, poCountByVendor])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  const filtersActive =
    query.trim() !== '' || statusFilter !== 'all' || cityFilter !== 'all' || poFilter !== 'all'

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, cityFilter, poFilter, sortKey])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function resetFilters() {
    setQuery('')
    setStatusFilter('all')
    setCityFilter('all')
    setPoFilter('all')
    setSortKey('name')
  }

  function saveEditing() {
    if (!editing) return
    if (!editing.name.trim()) {
      flash(t.vendorNameRequired, 'err')
      return
    }
    const isNew = !suppliers.some((s) => s.id === editing.id)
    const next = {
      ...editing,
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      phone2: (editing.phone2 ?? '').trim(),
      email: (editing.email ?? '').trim(),
      city: editing.city.trim() || 'Riyadh',
    }
    if (vendorRowDuplicatePhones(next.phone, next.phone2 ?? '')) {
      flash(t.vendorSamePhone, 'err')
      return
    }
    const conflict = findVendorUniqueConflict(suppliers, next)
    if (conflict) {
      if (conflict.field === 'email') {
        flash(t.vendorEmailDuplicate.replace('{name}', conflict.vendor.name), 'err')
      } else {
        flash(t.vendorPhoneDuplicate.replace('{name}', conflict.vendor.name), 'err')
      }
      return
    }
    saveSupplier(next)
    setEditing(null)
    flash(isNew ? `Vendor “${next.name}” added` : `Vendor “${next.name}” saved`)
  }

  function removeVendor(s: Supplier) {
    askDelete({
      name: s.name,
      onConfirm: () => {
        deleteSupplier(s.id)
        flash(`Vendor “${s.name}” removed`)
      },
    })
  }

  if (!canManage) {
    return (
      <div className="zk-vnd">
        <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />
        <div className="vnd-page-inner">
          <div className="vnd-empty locked">
            <span className="vnd-empty-ico">
              <IconVendors />
            </span>
            <strong>Vendors locked</strong>
            <p>Only Admin / stock roles can manage vendors.</p>
          </div>
        </div>
        <HubFooter backTo="/" backLabel={t.home} />
      </div>
    )
  }

  return (
    <div className="zk-vnd">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      <div className="vnd-page-inner">
        <header className="vnd-hero">
          <div className="vnd-hero-brand">
            <span className="vnd-hero-mark">
              <IconVendors />
            </span>
            <div>
              <h1>Vendors</h1>
              <p>
                {activeCount} active · {suppliers.length} total
                {cityCount ? ` · ${cityCount} cities` : ''}
              </p>
            </div>
          </div>
          <div className="vnd-hero-stats">
            <span className="vnd-stat">
              <IconVendors />
              <strong className="mesa-ltr-nums">{suppliers.length}</strong>
              <em>Vendors</em>
            </span>
            <span className={`vnd-stat${activeCount ? '' : ' warn'}`}>
              <IconActive />
              <strong className="mesa-ltr-nums">{activeCount}</strong>
              <em>Active</em>
            </span>
            <span className="vnd-stat">
              <IconCity />
              <strong className="mesa-ltr-nums">{cityCount}</strong>
              <em>Cities</em>
            </span>
          </div>
          <div className="vnd-hero-actions">
            <Link to="/inventory" className="vnd-link-btn">
              <IconBox /> Stock
            </Link>
            <Link to="/purchase-orders" className="vnd-link-btn">
              <IconDoc /> Purchase orders
            </Link>
            <button type="button" className="vnd-link-btn primary" onClick={() => setEditing(emptyVendor())}>
              <IconPlus /> New vendor
            </button>
          </div>
        </header>

        <section className="vnd-main">
          <div className="vnd-toolbar">
            <label className="vnd-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, city, or email"
                aria-label="Search vendors"
              />
            </label>
            <div className="vnd-filters" role="tablist">
              {(
                [
                  ['all', 'All', suppliers.length],
                  ['active', 'Active', activeCount],
                  ['inactive', 'Inactive', inactiveCount],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={`vnd-filter${statusFilter === id ? ' on' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                  <em className="mesa-ltr-nums">{count}</em>
                </button>
              ))}
            </div>
            <div className="vnd-pick">
              <MesaSelect
                aria-label="Filter by city"
                value={cityFilter}
                onChange={setCityFilter}
                options={cityOptions}
              />
            </div>
            <div className="vnd-pick">
              <MesaSelect
                aria-label="Filter by purchase orders"
                value={poFilter}
                onChange={(v) => setPoFilter(v as PoFilter)}
                options={poOptions}
              />
            </div>
            <div className="vnd-pick vnd-sort">
              <IconSliders />
              <MesaSelect
                aria-label="Sort vendors"
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
                options={SORT_OPTIONS}
              />
            </div>
            {filtersActive ? (
              <button type="button" className="vnd-reset" onClick={resetFilters}>
                Clear
              </button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className="vnd-empty">
              <span className="vnd-empty-ico">
                <IconVendors />
              </span>
              <strong>No vendors found</strong>
              <p>
                {suppliers.length === 0
                  ? 'Add your first vendor to create purchase orders.'
                  : 'Try another search or clear the filters.'}
              </p>
              <div className="vnd-empty-actions">
                {filtersActive ? (
                  <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                    Reset filters
                  </button>
                ) : null}
                <button type="button" className="btn btn-primary" onClick={() => setEditing(emptyVendor())}>
                  <IconPlus /> New vendor
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="vnd-table-wrap">
                <table className="vnd-table">
                  <colgroup>
                    <col className="vnd-col-vendor" />
                    <col className="vnd-col-contact" />
                    <col className="vnd-col-city" />
                    <col className="vnd-col-pos" />
                    <col className="vnd-col-status" />
                    <col className="vnd-col-action" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Phone</th>
                      <th>City</th>
                      <th>Orders</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((s) => {
                      const poCount = poCountByVendor.get(s.id) ?? 0
                      const phone = s.phone?.trim()
                      const email = s.email?.trim()
                      return (
                        <tr key={s.id} className={s.active ? '' : 'is-inactive'}>
                          <td>
                            <div className="vnd-name">
                              <span className={`vnd-dot${s.active ? '' : ' off'}`} aria-hidden />
                              <div className="vnd-name-text">
                                <strong title={s.name}>{s.name}</strong>
                                {email ? <span title={email}>{email}</span> : null}
                              </div>
                            </div>
                          </td>
                          <td className="mesa-ltr-nums">
                            {phone || <em className="vnd-muted">—</em>}
                          </td>
                          <td>
                            <span className="vnd-city">{s.city || '—'}</span>
                          </td>
                          <td>
                            <Link
                              to="/purchase-orders"
                              className={`vnd-po-chip${poCount ? '' : ' empty'}`}
                              title="Open purchase orders"
                            >
                              <span className="mesa-ltr-nums">{poCount}</span>
                            </Link>
                          </td>
                          <td>
                            <span className={`vnd-badge ${s.active ? 'ok' : 'off'}`}>
                              {s.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="vnd-actions">
                              <button
                                type="button"
                                className="vnd-icon-btn"
                                title="Edit"
                                aria-label={`Edit ${s.name}`}
                                onClick={() => setEditing({ ...s })}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className="vnd-icon-btn danger"
                                title="Delete"
                                aria-label={`Delete ${s.name}`}
                                onClick={() => removeVendor(s)}
                              >
                                <IconTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="vnd-pager">
                <span className="mesa-ltr-nums">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="vnd-pager-actions">
                  <button
                    type="button"
                    className="vnd-page-btn"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`vnd-page-btn${n === safePage ? ' on' : ''}`}
                      onClick={() => setPage(n)}
                      aria-current={n === safePage ? 'page' : undefined}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="vnd-page-btn"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {editing ? (
        <div
          className="modal-backdrop vnd-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null)
          }}
        >
          <div className="modal-card vnd-modal">
            <div className="section-head">
              <h2>{suppliers.some((s) => s.id === editing.id) ? 'Edit vendor' : 'New vendor'}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
            <label className="field-label">
              Name <Req />
            </label>
            <input
              className="search"
              placeholder="Vendor name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <label className="field-label">Phone</label>
            <input
              className="search"
              placeholder="+966 …"
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            <label className="field-label">City</label>
            <input
              className="search"
              placeholder="City"
              value={editing.city}
              onChange={(e) => setEditing({ ...editing, city: e.target.value })}
            />
            <label className="field-label">Email</label>
            <input
              className="search"
              placeholder="Optional"
              value={editing.email ?? ''}
              onChange={(e) => setEditing({ ...editing, email: e.target.value })}
            />
            <label className="vnd-check">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active vendor
            </label>
            <div className="vnd-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!editing.name.trim()}
                onClick={saveEditing}
              >
                Save vendor
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo="/" backLabel={t.home} />
      {deleteConfirmDialog}
    </div>
  )
}
