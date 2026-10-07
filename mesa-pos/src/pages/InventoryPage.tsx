import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import { money, type StockItem } from '../data/mock'
import {
  loadAllReceipts,
  receiptsForBranch,
} from '../data/stockReceiving'
import { enrichStockVendors } from '../lib/stockVendor'
import { ingredientVendorRowsForDisplay, primaryVendorUnitPrice } from '../data/ingredients'
import { useStockLocations } from '../hooks/useStockLocations'
import {
  normalizeLocationBalances,
  stockLocationLabel,
} from '../data/stockLocations'
import { buildRecipeUsage } from '../lib/recipeUsage'
import { settingsHubPath } from '../lib/settingsHub'
import { useI18n, type Dict } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

type StockFilter = 'all' | 'low' | 'ok'
type SortKey = 'name' | 'onHand' | 'status' | 'vendor'

const PAGE_SIZE = 8

function sortOptions(t: Dict) {
  return [
    { value: 'status', label: t.invSortStatus },
    { value: 'name', label: t.invSortName },
    { value: 'vendor', label: t.invSortVendor },
    { value: 'onHand', label: t.invSortOnHand },
  ]
}

function poStatusLabel(status: string, t: Dict) {
  if (status === 'draft') return t.invPoStatusDraft
  if (status === 'ordered') return t.invPoStatusOrdered
  if (status === 'partial') return t.invPoStatusPartial
  return status
}

function InvIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="inv-ico"
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

function IconBox() {
  return (
    <InvIcon>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </InvIcon>
  )
}

function IconWarn() {
  return (
    <InvIcon>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </InvIcon>
  )
}

function IconCoin() {
  return (
    <InvIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.5 9.5c.6-.8 1.5-1.2 2.5-1.2 1.5 0 2.5.8 2.5 2s-1 2-2.5 2h-1c-1.5 0-2.5.8-2.5 2s1 2 2.5 2c1 0 1.9-.4 2.5-1.2" />
    </InvIcon>
  )
}

function IconDoc() {
  return (
    <InvIcon>
      <path d="M8 4h7l4 4v12H8V4Z" />
      <path d="M15 4v4h4M10 12h6M10 16h6" />
    </InvIcon>
  )
}

function IconSearch() {
  return (
    <InvIcon>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </InvIcon>
  )
}

function IconTruck() {
  return (
    <InvIcon>
      <path d="M3 7h11v10H3V7Z" />
      <path d="M14 10h4l3 3v4h-7v-7Z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </InvIcon>
  )
}

function IconTransfer() {
  return (
    <InvIcon>
      <path d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3" />
    </InvIcon>
  )
}

function IconPlus() {
  return (
    <InvIcon>
      <path d="M12 5v14M5 12h14" />
    </InvIcon>
  )
}

function IconMinus() {
  return (
    <InvIcon>
      <path d="M5 12h14" />
    </InvIcon>
  )
}

function IconCheck() {
  return (
    <InvIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </InvIcon>
  )
}

function IconSliders() {
  return (
    <InvIcon>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="8" cy="7" r="1.6" fill="currentColor" />
      <circle cx="14" cy="12" r="1.6" fill="currentColor" />
      <circle cx="10" cy="17" r="1.6" fill="currentColor" />
    </InvIcon>
  )
}

function stockLevelPct(item: StockItem) {
  const target = Math.max(item.reorderAt * 2, item.reorderAt + 1, 1)
  return Math.max(0, Math.min(100, Math.round((item.onHand / target) * 100)))
}

function categoryTone(category: string) {
  const c = category.toLowerCase()
  if (/meat|seafood|chicken|beef/.test(c)) return 'meat'
  if (/produce|veg|fruit|tomato/.test(c)) return 'produce'
  if (/dairy|cheese|milk/.test(c)) return 'dairy'
  if (/bev|drink|juice|coffee/.test(c)) return 'bev'
  if (/dry|oil|rice|spice/.test(c)) return 'dry'
  return 'other'
}

export default function InventoryPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const canManage = user ? getPermissions(user.role).canManageStock : false
  const { stock, adjustStock, flash, ingredients, saveIngredient, upsertStockItem } = usePos()
  const { dishes } = useMasters()
  const { activeBranch } = useBranch()
  const { purchaseOrders, suppliers } = usePurchasing()
  const stockLocations = useStockLocations()
  const [searchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const fromParam = searchParams.get('from')
  const focus = focusParam === 'recipes' ? 'recipes' : 'stock'
  const pageTitle = focus === 'recipes' ? t.setRecipeUsage : t.setStockList
  const stockRef = useRef<HTMLElement | null>(null)
  const recipesRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [page, setPage] = useState(1)
  const [adjustId, setAdjustId] = useState<string | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [reorderId, setReorderId] = useState<string | null>(null)
  const [reorderValue, setReorderValue] = useState('')

  const reasonChips = useMemo(
    () => [
      t.invReasonMistake,
      t.invReasonVariance,
      t.invReasonCount,
      t.invReasonWaste,
      t.invReasonSpoil,
    ],
    [t],
  )

  useEffect(() => {
    const el = focus === 'recipes' ? recipesRef.current : stockRef.current
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus])

  const ingredientEditPath = (item: StockItem) =>
    `/settings/ingredients/list?edit=${encodeURIComponent(item.ingredientId || item.id)}`

  const vendorNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  )

  const openPOs = useMemo(
    () =>
      purchaseOrders.filter(
        (p) => p.status === 'ordered' || p.status === 'partial' || p.status === 'draft',
      ),
    [purchaseOrders],
  )

  const receipts = useMemo(
    () => receiptsForBranch(loadAllReceipts(), activeBranch.id),
    [activeBranch.id, purchaseOrders.length, stock.length],
  )

  const rows = useMemo(
    () => enrichStockVendors(stock, suppliers, purchaseOrders, receipts, ingredients),
    [stock, suppliers, purchaseOrders, receipts, ingredients],
  )

  const lowItems = useMemo(
    () => rows.filter((item) => item.onHand <= item.reorderAt),
    [rows],
  )
  const okCount = rows.length - lowItems.length
  const value = rows.reduce((sum, item) => sum + item.onHand * item.cost, 0)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rows.filter((item) => {
      const vendor = (item.vendor ?? '').toLowerCase()
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        vendor.includes(q)
      const isLow = item.onHand <= item.reorderAt
      const matchesFilter = filter === 'all' || (filter === 'low' ? isLow : !isLow)
      return matchesQuery && matchesFilter
    })
    return filtered.sort((a, b) => {
      if (sortKey === 'onHand') return a.onHand - b.onHand
      if (sortKey === 'vendor') {
        const cmp = (a.vendor ?? '').localeCompare(b.vendor ?? '')
        if (cmp !== 0) return cmp
      }
      if (sortKey === 'status') {
        const al = a.onHand <= a.reorderAt ? 0 : 1
        const bl = b.onHand <= b.reorderAt ? 0 : 1
        if (al !== bl) return al - bl
      }
      return a.name.localeCompare(b.name)
    })
  }, [rows, query, filter, sortKey])

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }, [items, safePage])

  useEffect(() => {
    setPage(1)
  }, [query, filter, sortKey])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const recipeUsage = useMemo(
    () =>
      buildRecipeUsage(dishes, ingredients, stock).map((row) => ({
        dish: row.dishName,
        lines: row.lines.map((line) => `${line.qty} ${line.unit} ${line.name}`.trim()),
      })),
    [dishes, stock, ingredients],
  )

  const adjusting = adjustId ? stock.find((s) => s.id === adjustId) : null
  const reordering = reorderId ? stock.find((s) => s.id === reorderId) : null
  const deltaNum = Number(adjustDelta)
  const reorderNum = Number(reorderValue)
  const previewOnHand =
    adjusting && Number.isFinite(deltaNum)
      ? Math.max(0, Math.round((adjusting.onHand + deltaNum) * 100) / 100)
      : null

  function openAdjust(item: StockItem) {
    if (!canManage) {
      flash(t.invNoPermAdjust)
      return
    }
    setAdjustId(item.id)
    setAdjustDelta('')
    setAdjustReason(t.invManualAdjust)
  }

  function openReorder(item: StockItem) {
    if (!canManage) {
      flash(t.invNoPermReorder)
      return
    }
    setReorderId(item.id)
    setReorderValue(String(item.reorderAt ?? 0))
  }

  function applyReorder() {
    if (!reordering || !canManage) return
    if (!Number.isFinite(reorderNum) || reorderNum < 0) {
      flash(t.invInvalidReorder)
      return
    }
    const next = Math.round(reorderNum * 100) / 100
    const ing = ingredients.find(
      (r) => r.id === reordering.ingredientId || r.id === reordering.id,
    )
    if (ing) {
      saveIngredient({ ...ing, reorderAt: next })
    } else {
      upsertStockItem({ ...reordering, reorderAt: next })
    }
    setReorderId(null)
    flash(t.invReorderUpdated.replace('{name}', reordering.name))
  }

  function applyAdjust() {
    if (!adjusting || !canManage) return
    const delta = Number(adjustDelta)
    if (!Number.isFinite(delta) || delta === 0) {
      flash(t.invEnterDelta)
      return
    }
    if (adjusting.onHand + delta < 0) {
      flash(t.invOnHandBelowZero)
      return
    }
    adjustStock(adjusting.id, delta, adjustReason.trim() || t.invManualAdjust)
    setAdjustId(null)
  }

  function bumpDelta(step: number) {
    const cur = Number(adjustDelta)
    const base = Number.isFinite(cur) ? cur : 0
    const next = Math.round((base + step) * 100) / 100
    setAdjustDelta(String(next))
  }

  if (focusParam === 'recipes' && fromParam === 'ingredients') {
    return <Navigate to="/settings/ingredients/usage" replace />
  }

  return (
    <div className="zk-stock">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/" />

      <div className="stk-page-inner">
      <header className="stk-hero">
        <div className="stk-hero-brand">
          <span className="stk-hero-mark">
            <IconBox />
          </span>
          <div>
            <h1>{pageTitle}</h1>
            <p>
              <span className="mesa-ltr-nums">{stock.length}</span> {t.invSkus} ·{' '}
              <span className="mesa-ltr-nums">{lowItems.length}</span> {t.invNeedReorder}
              {!canManage ? ` · ${t.invViewOnly}` : ''}
            </p>
          </div>
        </div>
        <div className="stk-hero-stats">
          <span className="stk-stat">
            <IconBox />
            <strong className="mesa-ltr-nums">{rows.length}</strong>
            <em>{t.invSkus}</em>
          </span>
          <span className={`stk-stat${lowItems.length ? ' warn' : ''}`}>
            <IconWarn />
            <strong className="mesa-ltr-nums">{lowItems.length}</strong>
            <em>{t.invLow}</em>
          </span>
          <span className="stk-stat">
            <IconCoin />
            <strong className="mesa-ltr-nums">{money(value, lang)}</strong>
            <em>{t.invValue}</em>
          </span>
          <span className="stk-stat">
            <IconDoc />
            <strong className="mesa-ltr-nums">{openPOs.length}</strong>
            <em>{t.navPurchaseOrders}</em>
          </span>
        </div>
        <div className="stk-hero-actions">
          <Link to="/settings/inventory/receiving" className="stk-link-btn">
            <IconTruck /> {t.stockReceiving}
          </Link>
          <Link to="/settings/inventory/transfer" className="stk-link-btn">
            <IconTransfer /> {t.stockTransfer}
          </Link>
          <Link to="/purchase-orders" className="stk-link-btn primary">
            <IconDoc /> {t.invPurchaseOrders}
          </Link>
        </div>
      </header>

      <div className="stk-layout">
        <section
          ref={stockRef}
          className={`stk-main${focus === 'stock' ? ' stk-focus' : ''}`}
        >
          <div className="stk-toolbar">
            <label className="stk-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.invSearchPlaceholder}
                aria-label={t.invSearchAria}
              />
            </label>
            <div className="stk-filters" role="tablist">
              {(
                [
                  ['all', t.all, rows.length],
                  ['low', t.invLow, lowItems.length],
                  ['ok', t.invFilterHealthy, okCount],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={`stk-filter tone-${id}${filter === id ? ' on' : ''}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <em className="mesa-ltr-nums">{count}</em>
                </button>
              ))}
            </div>
            <div className="stk-sort">
              <IconSliders />
              <MesaSelect
                aria-label={t.invSortAria}
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
                options={sortOptions(t)}
              />
            </div>
          </div>

          {items.length === 0 ? (
            <div className="stk-main-scroll">
              <div className="stk-empty">
                <span className="stk-empty-ico">
                  <IconBox />
                </span>
                <strong>{t.invEmptyTitle}</strong>
                <p>{t.invEmptyHint}</p>
                <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); setFilter('all') }}>
                  {t.invResetFilters}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="stk-main-scroll">
                <div className="stk-table-wrap">
                  <table className="stk-table">
                <thead>
                  <tr>
                    <th>{t.invColItem}</th>
                    <th>{t.invColCategory}</th>
                    <th>{t.preferredVendor}</th>
                    <th>{t.invColLevel}</th>
                    <th>{t.invColOnHand}</th>
                    <th>{t.invColLocations}</th>
                    <th>{t.invColReorder}</th>
                    <th>{t.status}</th>
                    <th>{t.invColCost}</th>
                    {canManage ? <th>{t.invColAction}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    const low = item.onHand <= item.reorderAt
                    const pct = stockLevelPct(item)
                    const ing = ingredients.find((r) => r.id === (item.ingredientId || item.id))
                    const vendorRows = ingredientVendorRowsForDisplay(ing, vendorNameById, {
                      vendorId: item.vendorId,
                      vendor: item.vendor,
                      unitPrice: (ing ? primaryVendorUnitPrice(ing) : undefined) ?? item.cost,
                    })
                    return (
                      <tr key={item.id} className={low ? 'is-low' : ''}>
                        <td>
                          <div className="stk-item">
                            <span className={`stk-cat-dot tone-${categoryTone(item.category)}`} />
                            <div>
                              <strong>{item.name}</strong>
                              <span className="mesa-ltr-nums">{item.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`stk-cat-pill tone-${categoryTone(item.category)}`}>
                            {item.category}
                          </span>
                        </td>
                        <td className="stk-vendor-col">
                          <div className="stk-vendor-cell">
                            {vendorRows.length ? (
                              <ul
                                className="stk-vendor-stack"
                                aria-label={t.invVendorsFor.replace('{name}', item.name)}
                              >
                                {vendorRows.map((row) => (
                                  <li
                                    key={row.vendorId || row.vendor}
                                    className={`stk-vendor-row${row.primary ? ' is-primary' : ''}`}
                                  >
                                    <span className="stk-vendor-name" title={row.vendor}>
                                      {row.vendor}
                                      {row.primary ? (
                                        <em className="stk-vendor-tag">{t.vendorPrimary}</em>
                                      ) : null}
                                    </span>
                                    <span className="stk-vendor-price mesa-ltr-nums">
                                      {row.unitPrice != null ? money(row.unitPrice, lang) : '—'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="stk-vendor empty">—</span>
                            )}
                            {canManage ? (
                              <Link
                                to={ingredientEditPath(item)}
                                className="stk-vendor-edit"
                                title={t.editPreferredVendor}
                              >
                                {t.edit}
                              </Link>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div
                            className="stk-level"
                            title={t.invLevelPct.replace('{pct}', String(pct))}
                          >
                            <span className={`stk-level-bar${low ? ' low' : ''}`} style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="mesa-ltr-nums">
                          <strong>{item.onHand}</strong> {item.unit}
                        </td>
                        <td>
                          <div className="stk-locs">
                            {stockLocations.map((loc) => {
                              const bal = normalizeLocationBalances(item)[loc.id]
                              if (bal <= 0) return null
                              return (
                                <span key={loc.id} className="stk-loc-chip" title={stockLocationLabel(loc.id)}>
                                  {loc.label.split(' ')[0]} <strong>{bal}</strong>
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td className="mesa-ltr-nums">
                          <div className="stk-reorder-cell">
                            <span>
                              {item.reorderAt} {item.unit}
                            </span>
                            {canManage ? (
                              <button
                                type="button"
                                className="stk-vendor-edit"
                                title={t.editReorderLevel}
                                onClick={() => openReorder(item)}
                              >
                                {t.edit}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={`stk-badge ${low ? 'low' : 'ok'}`}>
                            {low ? (
                              <>
                                <IconWarn /> {t.invStatusReorder}
                              </>
                            ) : (
                              <>
                                <IconCheck /> {t.ok}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="mesa-ltr-nums">{money(item.cost, lang)}</td>
                        {canManage ? (
                          <td>
                            <button
                              type="button"
                              className="stk-adjust-btn"
                              onClick={() => openAdjust(item)}
                            >
                              <IconSliders /> {t.invAdjust}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
                </div>
              </div>

            <div className="stk-pager">
              <span className="mesa-ltr-nums">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, items.length)}{' '}
                {t.expensePagerOf} {items.length}
              </span>
              <div className="stk-pager-actions">
                <button
                  type="button"
                  className="stk-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t.expensePagerPrev}
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`stk-page-btn${n === safePage ? ' on' : ''}`}
                    onClick={() => setPage(n)}
                    aria-current={n === safePage ? 'page' : undefined}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="stk-page-btn"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  {t.expensePagerNext}
                </button>
              </div>
            </div>
            </>
          )}
        </section>

        <aside className="stk-side">
          <section className="stk-panel alerts">
            <header>
              <h2>
                <IconWarn /> {t.invAlerts}
              </h2>
              <em className="mesa-ltr-nums">{lowItems.length}</em>
            </header>
            <div className="stk-alert-list">
              {lowItems.length === 0 ? (
                <div className="stk-side-empty ok">
                  <IconCheck />
                  <div>
                    <strong>{t.invAllHealthy}</strong>
                    <span>{t.invNoBelowReorder}</span>
                  </div>
                </div>
              ) : (
                lowItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="stk-alert"
                    onClick={() => {
                      setFilter('low')
                      setQuery(item.name)
                      if (canManage) openAdjust(item)
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span className="mesa-ltr-nums">
                      {t.invLeftReorderAt
                        .replace('{onHand}', String(item.onHand))
                        .replace('{unit}', item.unit)
                        .replace('{reorder}', String(item.reorderAt))}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="stk-panel">
            <header>
              <h2>
                <IconDoc /> {t.invOpenPos}
              </h2>
              <em className="mesa-ltr-nums">{openPOs.length}</em>
            </header>
            <div className="stk-po-list">
              {openPOs.length === 0 ? (
                <div className="stk-side-empty">
                  <strong>{t.invNoOpenPos}</strong>
                  <Link to="/purchase-orders">{t.invCreatePo}</Link>
                </div>
              ) : (
                <>
                  {openPOs.slice(0, 6).map((po) => (
                    <Link key={po.id} to="/purchase-orders" className="stk-po">
                      <strong className="mesa-ltr-nums">{po.id}</strong>
                      <span>
                        {t.invPoLines
                          .replace('{status}', poStatusLabel(po.status, t))
                          .replace('{count}', String(po.lines.length))}
                      </span>
                    </Link>
                  ))}
                  <Link to="/purchase-orders" className="btn btn-teal stk-po-cta">
                    {t.invReceiveGoods}
                  </Link>
                </>
              )}
            </div>
          </section>

          <section
            ref={recipesRef}
            className={`stk-panel${focus === 'recipes' ? ' stk-focus' : ''}`}
            id="stk-recipe-usage"
          >
            <header>
              <h2>
                <IconBox /> {t.setRecipeUsage}
              </h2>
            </header>
            <div className="stk-recipe-list">
              {recipeUsage.length === 0 ? (
                <div className="stk-side-empty">
                  <strong>{t.invNoRecipes}</strong>
                  <Link to="/settings/ingredients/usage">{t.invViewRecipeUsage}</Link>
                  <Link to="/masters?tab=dishes">{t.invEditMenuRecipes}</Link>
                </div>
              ) : (
                (focus === 'recipes' ? recipeUsage : recipeUsage.slice(0, 8)).map((r) => (
                  <div key={r.dish} className="stk-recipe">
                    <strong>{r.dish}</strong>
                    <span>{r.lines.join(' · ')}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
      </div>

      {adjusting && canManage ? (
        <div
          className="modal-backdrop stk-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdjustId(null)
          }}
        >
          <div className="modal-card stk-modal">
            <div className="section-head">
              <h2>{t.invAdjustTitle.replace('{name}', adjusting.name)}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setAdjustId(null)}>
                {t.close}
              </button>
            </div>
            <p className="modal-lead mesa-ltr-nums">
              {t.invOnHandLabel} <strong>{adjusting.onHand}</strong> {adjusting.unit}
              {previewOnHand != null ? (
                <>
                  {' '}
                  → <strong>{previewOnHand}</strong> {adjusting.unit}
                </>
              ) : null}
            </p>

            <div className="stk-delta-row">
              <button type="button" className="stk-delta-btn" onClick={() => bumpDelta(-1)} aria-label={t.invMinus1}>
                <IconMinus />
              </button>
              <button type="button" className="stk-delta-btn" onClick={() => bumpDelta(-0.5)} aria-label={t.invMinus05}>
                −0.5
              </button>
              <input
                className="search"
                type="number"
                step="0.01"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder={t.invDeltaPlaceholder}
                autoFocus
              />
              <button type="button" className="stk-delta-btn" onClick={() => bumpDelta(0.5)} aria-label={t.invPlus05}>
                +0.5
              </button>
              <button type="button" className="stk-delta-btn" onClick={() => bumpDelta(1)} aria-label={t.invPlus1}>
                <IconPlus />
              </button>
            </div>

            <label className="field-label">{t.invReason}</label>
            <input
              className="search"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder={t.invReasonPlaceholder}
            />

            <div className="stk-reason-chips">
              {reasonChips.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={adjustReason === r ? 'on' : ''}
                  onClick={() => setAdjustReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={!Number.isFinite(deltaNum) || deltaNum === 0}
              onClick={applyAdjust}
            >
              {t.invApplyAdjust}
            </button>
          </div>
        </div>
      ) : null}

      {reordering && canManage ? (
        <div
          className="modal-backdrop stk-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stk-reorder-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReorderId(null)
          }}
        >
          <div className="modal-card stk-modal">
            <div className="section-head">
              <h2 id="stk-reorder-title">
                {t.invReorderTitle.replace('{name}', reordering.name)}
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setReorderId(null)}>
                {t.close}
              </button>
            </div>
            <p className="modal-lead mesa-ltr-nums">
              {t.reorderLevelHint} ({reordering.unit})
            </p>
            <label className="field-label" htmlFor="stk-reorder-input">
              {t.reorderLevel}
            </label>
            <input
              id="stk-reorder-input"
              className="search"
              type="number"
              min={0}
              step="0.01"
              value={reorderValue}
              onChange={(e) => setReorderValue(e.target.value)}
              autoFocus
            />
            <div className="stk-modal-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setReorderId(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!Number.isFinite(reorderNum) || reorderNum < 0}
                onClick={applyReorder}
              >
                {t.update}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter
        backTo={settingsHubPath('inventory')}
        backLabel={t.inventory}
      />
    </div>
  )
}
