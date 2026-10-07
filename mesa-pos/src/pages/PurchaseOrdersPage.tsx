import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import type { POLine, PurchaseOrder } from '../data/purchasing'
import { getActiveBranchId } from '../data/company'
import { money } from '../data/mock'
import {
  canonicalizeIngredientCategory,
  ingredientInVendorCatalog,
  ingredientVendorUnitPrice,
  isIngredientNameTaken,
  isIngredientSkuTaken,
  listIngredientCategories,
  nextIngredientSku,
  normalizeIngredient,
} from '../data/ingredients'
import type { Ingredient } from '../data/ingredients'
import { useI18n, type Dict } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'

type DraftLine = { stockId: string; qtyOrdered: number; unitCost: number }
type StatusFilter = 'all' | PurchaseOrder['status']
type QuickItemDraft = {
  lineIdx: number
  name: string
  sku: string
  unit: string
  category: string
  unitCost: string
  error: string
}

type QuickVendorDraft = {
  name: string
  phone: string
  city: string
  email: string
  error: string
}

const PAGE_SIZE = 8
const QUICK_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'box', 'case'] as const

function PoIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="po-ico"
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

function IconDoc() {
  return (
    <PoIcon>
      <path d="M8 4h7l4 4v12H8V4Z" />
      <path d="M15 4v4h4M10 12h6M10 16h6" />
    </PoIcon>
  )
}

function IconOpen() {
  return (
    <PoIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </PoIcon>
  )
}

function IconVendors() {
  return (
    <PoIcon>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </PoIcon>
  )
}

function IconBox() {
  return (
    <PoIcon>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </PoIcon>
  )
}

function IconSearch() {
  return (
    <PoIcon>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </PoIcon>
  )
}

function IconPlus() {
  return (
    <PoIcon>
      <path d="M12 5v14M5 12h14" />
    </PoIcon>
  )
}

function IconTruck() {
  return (
    <PoIcon>
      <path d="M3 7h11v10H3V7Z" />
      <path d="M14 10h4l3 3v4h-7v-7Z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17.5" cy="18" r="1.5" />
    </PoIcon>
  )
}

function statusTone(status: PurchaseOrder['status']) {
  if (status === 'received') return 'ok'
  if (status === 'cancelled') return 'muted'
  if (status === 'partial') return 'warn'
  if (status === 'ordered') return 'info'
  return 'draft'
}

function poTotal(po: PurchaseOrder) {
  return po.lines.reduce((sum, l) => sum + l.qtyOrdered * l.unitCost, 0)
}

function statusLabel(status: PurchaseOrder['status'], t: Dict) {
  if (status === 'draft') return t.poTabDraft
  if (status === 'ordered') return t.poTabOrdered
  if (status === 'partial') return t.poTabPartial
  if (status === 'received') return t.poTabReceived
  return t.poTabCancelled
}

export default function PurchaseOrdersPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const canManage = user ? getPermissions(user.role).canManageStock : false
  const { stock, flash, ingredients, saveIngredient } = usePos()
  const { suppliers, purchaseOrders, createPO, markOrdered, cancelPO, receivePO, saveSupplier } =
    usePurchasing()

  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: t.all },
    { id: 'draft', label: t.poTabDraft },
    { id: 'ordered', label: t.poTabOrdered },
    { id: 'partial', label: t.poTabPartial },
    { id: 'received', label: t.poTabReceived },
    { id: 'cancelled', label: t.poTabCancelled },
  ]

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null)
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})

  const [showAllStock, setShowAllStock] = useState(false)
  const [supplierId, setSupplierId] = useState(suppliers.find((s) => s.active)?.id ?? '')
  const [notes, setNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { stockId: stock[0]?.id ?? 's1', qtyOrdered: 5, unitCost: stock[0]?.cost ?? 0 },
  ])
  const [quickItem, setQuickItem] = useState<QuickItemDraft | null>(null)
  const [quickVendor, setQuickVendor] = useState<QuickVendorDraft | null>(null)

  const ingredientByStockId = useMemo(() => {
    const map = new Map<string, (typeof ingredients)[0]>()
    for (const row of stock) {
      const ingId = row.ingredientId || row.id
      const ing = ingredients.find((i) => i.id === ingId || i.id === row.id)
      if (ing) map.set(row.id, ing)
    }
    return map
  }, [stock, ingredients])

  const supplierMeta = useMemo(() => {
    const row = suppliers.find((s) => s.id === supplierId)
    return { id: supplierId, name: row?.name?.trim() ?? '' }
  }, [suppliers, supplierId])

  const stockMatchesVendor = (row: (typeof stock)[0]) => {
    if (!supplierMeta.id) return true
    if (row.vendorId === supplierMeta.id) return true
    const vendorName = supplierMeta.name.toLowerCase()
    if (vendorName && row.vendor?.trim().toLowerCase() === vendorName) return true
    const ing = ingredientByStockId.get(row.id)
    if (ing) {
      return ingredientInVendorCatalog(ing, supplierMeta.id, supplierMeta.name)
    }
    return false
  }

  const linkedVendorCount = useMemo(() => {
    if (!supplierMeta.id) return 0
    const seen = new Set<string>()
    for (const row of stock) {
      if (!stockMatchesVendor(row)) continue
      const key = `${row.name.trim().toLowerCase()}|${(row.unit || '').toLowerCase()}`
      seen.add(key)
    }
    return seen.size
  }, [stock, supplierMeta, ingredientByStockId])

  const poStockItems = useMemo(() => {
    const prefer = (
      a: (typeof stock)[0],
      b: (typeof stock)[0],
    ): (typeof stock)[0] => {
      const aIng = ingredientByStockId.get(a.id)
      const bIng = ingredientByStockId.get(b.id)
      if (aIng && !bIng) return a
      if (!aIng && bIng) return b
      if ((a.onHand ?? 0) !== (b.onHand ?? 0)) {
        return (a.onHand ?? 0) > (b.onHand ?? 0) ? a : b
      }
      return a.sku?.trim() ? a : b
    }

    const identityKeys = (row: (typeof stock)[0]) => {
      const ing = ingredientByStockId.get(row.id)
      return [
        ing?.id,
        row.ingredientId,
        row.sku?.trim(),
        `${row.name.trim()}|${row.unit || ''}`.toLowerCase(),
        row.id,
      ]
        .filter(Boolean)
        .map((k) => String(k).toLowerCase())
    }

    // Collapse duplicate stock cards (same ingredient / SKU / name+unit).
    const byKey = new Map<string, (typeof stock)[0]>()
    for (const row of stock) {
      const keys = identityKeys(row)
      const existingKey = keys.find((k) => byKey.has(k))
      const winner = existingKey ? prefer(byKey.get(existingKey)!, row) : row
      for (const k of new Set([...keys, ...identityKeys(winner)])) {
        byKey.set(k, winner)
      }
    }

    const unique = new Map<string, (typeof stock)[0]>()
    for (const row of byKey.values()) unique.set(row.id, row)
    let rows = [...unique.values()]

    if (supplierId && !showAllStock) {
      rows = rows.filter((row) => stockMatchesVendor(row))
    }

    // Final pass: identical display names still collapse.
    const byName = new Map<string, (typeof stock)[0]>()
    for (const row of rows) {
      const nk = `${row.name.trim().toLowerCase()}|${(row.unit || '').toLowerCase()}`
      const prev = byName.get(nk)
      byName.set(nk, prev ? prefer(prev, row) : row)
    }
    return [...byName.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku),
    )
  }, [stock, supplierId, showAllStock, ingredientByStockId, supplierMeta])

  const stockSelectOptions = useMemo(
    () =>
      poStockItems.map((s) => ({
        value: s.id,
        label: s.sku?.trim() ? `${s.name} · ${s.sku}` : `${s.name} (${s.unit})`,
      })),
    [poStockItems],
  )

  function unitCostForStock(stockId: string, vendor: string) {
    const ing = ingredientByStockId.get(stockId)
    const fromCatalog = ing ? ingredientVendorUnitPrice(ing, vendor) : undefined
    if (fromCatalog != null) return fromCatalog
    return stock.find((s) => s.id === stockId)?.cost ?? 0
  }

  function changeSupplier(id: string) {
    setSupplierId(id)
  }

  const quickCategoryOptions = useMemo(() => {
    const catalog = listIngredientCategories(ingredients.map((r) => r.category))
    return catalog.map((c) => ({ value: c, label: c }))
  }, [ingredients])

  function openQuickItem(lineIdx: number) {
    setQuickItem({
      lineIdx,
      name: '',
      sku: nextIngredientSku(ingredients),
      unit: 'kg',
      category: 'General',
      unitCost: '',
      error: '',
    })
  }

  function openQuickVendor() {
    setQuickVendor({
      name: '',
      phone: '',
      city: '',
      email: '',
      error: '',
    })
  }

  function saveQuickVendor() {
    if (!quickVendor) return
    const name = quickVendor.name.trim()
    if (name.length < 2) {
      setQuickVendor({ ...quickVendor, error: t.vendorNameRequired })
      return
    }
    if (suppliers.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      setQuickVendor({
        ...quickVendor,
        error: t.poVendorExists.replace('{name}', name),
      })
      return
    }
    const id = `sup-${Date.now()}`
    saveSupplier({
      id,
      name,
      phone: quickVendor.phone.trim(),
      email: quickVendor.email.trim() || undefined,
      city: quickVendor.city.trim(),
      active: true,
    })
    setSupplierId(id)
    setShowAllStock(true)
    setQuickVendor(null)
    flash(t.poVendorAdded.replace('{name}', name))
  }

  function saveQuickItem() {
    if (!quickItem) return
    const name = quickItem.name.trim()
    if (!name) {
      setQuickItem({ ...quickItem, error: t.poItemNameRequired })
      return
    }
    if (isIngredientNameTaken(ingredients, name)) {
      setQuickItem({
        ...quickItem,
        error: t.poItemExists.replace('{name}', name),
      })
      return
    }
    if (stock.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      setQuickItem({
        ...quickItem,
        error: t.poStockExists.replace('{name}', name),
      })
      return
    }
    const sku = quickItem.sku.trim() || nextIngredientSku(ingredients)
    if (isIngredientSkuTaken(ingredients, sku)) {
      setQuickItem({
        ...quickItem,
        error: t.poSkuExists.replace('{sku}', sku),
      })
      return
    }
    if (stock.some((s) => s.sku.trim().toLowerCase() === sku.toLowerCase())) {
      setQuickItem({
        ...quickItem,
        error: t.poSkuExistsStock.replace('{sku}', sku),
      })
      return
    }
    const unit = quickItem.unit.trim() || 'pcs'
    const category = canonicalizeIngredientCategory(quickItem.category) || 'General'
    const unitCost = Math.max(0, Number(quickItem.unitCost) || 0)
    const id = `ing-${Date.now()}`
    const vendorName = supplierMeta.name || undefined
    const row: Ingredient = normalizeIngredient({
      id,
      name,
      sku,
      category,
      unit,
      active: true,
      branchId: getActiveBranchId(),
      vendorId: supplierId || undefined,
      vendor: vendorName,
      vendorLinks: supplierId
        ? [
            {
              vendorId: supplierId,
              vendor: vendorName,
              unitPrice: unitCost || undefined,
              primary: true,
            },
          ]
        : undefined,
    })
    saveIngredient(row)
    const stockId = `stk-${id}`
    const lineIdx = quickItem.lineIdx
    setDraftLines((prev) =>
      prev.map((line, i) =>
        i === lineIdx ? { ...line, stockId, unitCost } : line,
      ),
    )
    setQuickItem(null)
    flash(t.poItemAdded.replace('{name}', name))
  }

  useEffect(() => {
    if (!showNew) return
    const allowed = new Set(poStockItems.map((s) => s.id))
    const fallback = poStockItems[0]?.id ?? ''
    setDraftLines((prev) => {
      let changed = false
      const next = prev.map((line) => {
        if (allowed.has(line.stockId) || !fallback) {
          const cost = unitCostForStock(line.stockId, supplierId)
          if (cost === line.unitCost) return line
          changed = true
          return { ...line, unitCost: cost }
        }
        // Keep a freshly quick-added stk-* id until stock list catches up.
        if (line.stockId.startsWith('stk-') && !stock.some((s) => s.id === line.stockId)) {
          return line
        }
        changed = true
        return {
          ...line,
          stockId: fallback,
          unitCost: unitCostForStock(fallback, supplierId),
        }
      })
      return changed ? next : prev
    })
  }, [supplierId, showAllStock, poStockItems, showNew, stock])

  const activeSuppliers = suppliers.filter((s) => s.active)

  const counts = useMemo(() => {
    const by: Record<StatusFilter, number> = {
      all: purchaseOrders.length,
      draft: 0,
      ordered: 0,
      partial: 0,
      received: 0,
      cancelled: 0,
    }
    for (const po of purchaseOrders) by[po.status] += 1
    return by
  }, [purchaseOrders])

  const openCount = counts.draft + counts.ordered + counts.partial

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return purchaseOrders
      .filter((p) => statusFilter === 'all' || p.status === statusFilter)
      .filter((p) => {
        if (!q) return true
        const vendor = suppliers.find((s) => s.id === p.supplierId)?.name ?? ''
        const hay = [p.id, vendor, p.notes ?? '', p.status, ...p.lines.map((l) => l.stockId)]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [purchaseOrders, statusFilter, search, suppliers])

  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return list.slice(start, start + PAGE_SIZE)
  }, [list, safePage])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    if (!supplierId && activeSuppliers[0]) setSupplierId(activeSuppliers[0].id)
  }, [supplierId, activeSuppliers])

  function supplierName(id: string) {
    return suppliers.find((s) => s.id === id)?.name ?? id
  }

  function stockName(id: string) {
    const s = stock.find((x) => x.id === id)
    return s ? `${s.name} (${s.unit})` : id
  }

  function startReceive(po: PurchaseOrder) {
    const qty: Record<string, string> = {}
    for (const line of po.lines) {
      const rem = Math.max(0, line.qtyOrdered - line.qtyReceived)
      qty[line.stockId] = rem > 0 ? String(rem) : '0'
    }
    setReceiveQty(qty)
    setReceiveTarget(po)
  }

  function confirmReceive() {
    if (!receiveTarget) return
    const receipts = Object.entries(receiveQty).map(([stockId, q]) => ({
      stockId,
      qty: Number(q) || 0,
    }))
    const res = receivePO(receiveTarget.id, receipts)
    flash(res.message)
    if (res.ok) setReceiveTarget(null)
  }

  function submitNew() {
    if (!supplierId || draftLines.length === 0) {
      flash(t.poPickVendorLine)
      return
    }
    const lines = draftLines.filter((l) => l.qtyOrdered > 0)
    if (!lines.length) {
      flash(t.poAddOrderedQty)
      return
    }
    createPO({ supplierId, lines, notes: notes || undefined })
    setShowNew(false)
    setNotes('')
    setDraftLines([{
      stockId: poStockItems[0]?.id ?? stock[0]?.id ?? 's1',
      qtyOrdered: 5,
      unitCost: unitCostForStock(poStockItems[0]?.id ?? stock[0]?.id ?? 's1', supplierId),
    }])
    flash(t.poDraftCreated)
  }

  if (!canManage) {
    return (
      <div className="zk-po">
        <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />
        <div className="po-page-inner">
          <div className="po-empty locked">
            <span className="po-empty-ico">
              <IconDoc />
            </span>
            <strong>{t.poLocked}</strong>
            <p>{t.poLockedHint}</p>
          </div>
        </div>
        <HubFooter backTo="/" backLabel={t.home} />
      </div>
    )
  }

  return (
    <div className="zk-po">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="po-page-inner">
        <header className="po-hero">
          <div className="po-hero-brand">
            <span className="po-hero-mark">
              <IconDoc />
            </span>
            <div>
              <h1>{t.invPurchaseOrders}</h1>
              <p>
                {(activeSuppliers.length
                  ? t.poHeroMetaVendors
                      .replace('{open}', String(openCount))
                      .replace('{total}', String(purchaseOrders.length))
                      .replace('{vendors}', String(activeSuppliers.length))
                  : t.poHeroMeta
                      .replace('{open}', String(openCount))
                      .replace('{total}', String(purchaseOrders.length)))}
              </p>
            </div>
          </div>
          <div className="po-hero-stats">
            <span className={`po-stat${openCount ? ' warn' : ''}`}>
              <IconOpen />
              <strong className="mesa-ltr-nums">{openCount}</strong>
              <em>{t.openAmount}</em>
            </span>
            <span className="po-stat">
              <IconDoc />
              <strong className="mesa-ltr-nums">{purchaseOrders.length}</strong>
              <em>{t.all}</em>
            </span>
            <span className="po-stat">
              <IconVendors />
              <strong className="mesa-ltr-nums">{activeSuppliers.length}</strong>
              <em>{t.vendors}</em>
            </span>
          </div>
          <div className="po-hero-actions">
            <Link to="/inventory" className="po-link-btn">
              <IconBox /> {t.navStock}
            </Link>
            <Link to="/suppliers" className="po-link-btn">
              <IconVendors /> {t.vendors}
            </Link>
            <button type="button" className="po-link-btn primary" onClick={() => setShowNew(true)}>
              <IconPlus /> {t.poNew}
            </button>
          </div>
        </header>

        <div className="po-layout">
          <section className="po-main">
            <div className="po-toolbar">
              <label className="po-search">
                <IconSearch />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.poSearchPlaceholder}
                  aria-label={t.poSearchAria}
                />
              </label>
              <div className="po-filters" role="tablist">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`po-filter tone-${tab.id}${statusFilter === tab.id ? ' on' : ''}`}
                    onClick={() => setStatusFilter(tab.id)}
                  >
                    {tab.label}
                    <em className="mesa-ltr-nums">{counts[tab.id]}</em>
                  </button>
                ))}
              </div>
            </div>

            {list.length === 0 ? (
              <div className="po-empty">
                <span className="po-empty-ico">
                  <IconDoc />
                </span>
                <strong>{t.poEmptyTitle}</strong>
                <p>
                  {purchaseOrders.length === 0 ? t.poEmptyHintNew : t.poEmptyHintFilter}
                </p>
                <div className="po-empty-actions">
                  {statusFilter !== 'all' || search ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setSearch('')
                        setStatusFilter('all')
                      }}
                    >
                      {t.invResetFilters}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
                    <IconPlus /> {t.poNew}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="po-table-wrap">
                  <table className="po-table">
                    <thead>
                      <tr>
                        <th>{t.poColPo}</th>
                        <th>{t.vendorTitle}</th>
                        <th>{t.status}</th>
                        <th>{t.poColLines}</th>
                        <th>{t.poColValue}</th>
                        <th>{t.poColCreated}</th>
                        <th>{t.invColAction}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((po) => {
                        const vendor = supplierName(po.supplierId)
                        return (
                          <tr key={po.id}>
                            <td>
                              <div className="po-id">
                                <strong className="mesa-ltr-nums">{po.id}</strong>
                                {po.notes ? <span>{po.notes}</span> : null}
                              </div>
                            </td>
                            <td>
                              <span className="po-vendor" title={vendor}>
                                {vendor}
                              </span>
                            </td>
                            <td>
                              <span className={`po-badge tone-${statusTone(po.status)}`}>
                                {statusLabel(po.status, t)}
                              </span>
                            </td>
                            <td>
                              <div className="po-lines">
                                {po.lines.slice(0, 3).map((l) => (
                                  <span key={l.stockId} className="mesa-ltr-nums">
                                    {stockName(l.stockId)} · {l.qtyReceived}/{l.qtyOrdered}
                                  </span>
                                ))}
                                {po.lines.length > 3 ? (
                                  <em>{t.poMoreLines.replace('{count}', String(po.lines.length - 3))}</em>
                                ) : null}
                              </div>
                            </td>
                            <td className="mesa-ltr-nums">
                              <strong>{money(poTotal(po))}</strong>
                            </td>
                            <td className="mesa-ltr-nums po-date">
                              {new Date(po.createdAt).toLocaleString()}
                            </td>
                            <td>
                              <div className="po-actions">
                                {po.status === 'draft' ? (
                                  <button
                                    type="button"
                                    className="po-act teal"
                                    onClick={() => markOrdered(po.id)}
                                  >
                                    {t.poMarkOrdered}
                                  </button>
                                ) : null}
                                {po.status === 'ordered' || po.status === 'partial' ? (
                                  <button
                                    type="button"
                                    className="po-act primary"
                                    onClick={() => startReceive(po)}
                                  >
                                    <IconTruck /> {t.poReceive}
                                  </button>
                                ) : null}
                                {po.status !== 'received' && po.status !== 'cancelled' ? (
                                  <button
                                    type="button"
                                    className="po-act ghost"
                                    onClick={() => cancelPO(po.id)}
                                  >
                                    {t.cancel}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="po-pager">
                  <span className="mesa-ltr-nums">
                    {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, list.length)}{' '}
                    {t.expensePagerOf} {list.length}
                  </span>
                  <div className="po-pager-actions">
                    <button
                      type="button"
                      className="po-page-btn"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t.expensePagerPrev}
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`po-page-btn${n === safePage ? ' on' : ''}`}
                        onClick={() => setPage(n)}
                        aria-current={n === safePage ? 'page' : undefined}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="po-page-btn"
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

          <aside className="po-side">
            <section className="po-panel">
              <header>
                <h2>
                  <IconOpen /> {t.poOpenPipeline}
                </h2>
                <em className="mesa-ltr-nums">{openCount}</em>
              </header>
              <ul className="po-pipeline">
                <li>
                  <span>{t.poTabDraft}</span>
                  <strong className="mesa-ltr-nums">{counts.draft}</strong>
                </li>
                <li>
                  <span>{t.poTabOrdered}</span>
                  <strong className="mesa-ltr-nums">{counts.ordered}</strong>
                </li>
                <li>
                  <span>{t.poTabPartial}</span>
                  <strong className="mesa-ltr-nums">{counts.partial}</strong>
                </li>
              </ul>
            </section>

            <section className="po-panel">
              <header>
                <h2>
                  <IconVendors /> {t.vendors}
                </h2>
                <em className="mesa-ltr-nums">{activeSuppliers.length}</em>
              </header>
              {activeSuppliers.length === 0 ? (
                <div className="po-side-empty">
                  <strong>{t.noVendors}</strong>
                  <span>{t.poNoVendorsSideHint}</span>
                  <button type="button" className="po-side-link" onClick={() => { setShowNew(true); openQuickVendor() }}>
                    {t.poQuickAddVendor}
                  </button>
                  <Link to="/suppliers">{t.poManageVendors}</Link>
                </div>
              ) : (
                <div className="po-vendor-list">
                  {activeSuppliers.slice(0, 6).map((s) => (
                    <div key={s.id} className="po-vendor-row">
                      <strong>{s.name}</strong>
                      <span>{s.city || '—'}</span>
                    </div>
                  ))}
                  {activeSuppliers.length > 6 ? (
                    <Link to="/suppliers" className="po-side-link">
                      {t.poViewAll.replace('{count}', String(activeSuppliers.length))}
                    </Link>
                  ) : (
                    <Link to="/suppliers" className="po-side-link">
                      {t.poManageVendors}
                    </Link>
                  )}
                </div>
              )}
            </section>

            <section className="po-panel">
              <header>
                <h2>
                  <IconBox /> {t.navStock}
                </h2>
              </header>
              <p className="po-side-hint">{t.poStockHint}</p>
              <Link to="/inventory" className="po-side-cta">
                {t.poOpenInventory}
              </Link>
            </section>
          </aside>
        </div>
      </div>

      {showNew ? (
        <div
          className="modal-backdrop po-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNew(false)
          }}
        >
          <div className="modal-card po-modal">
            <div className="section-head">
              <h2>{t.poNewTitle}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
                {t.close}
              </button>
            </div>

            <div className="po-modal-body">
              <div className="po-field">
                <span className="field-label">{t.vendorTitle}</span>
                <div className="po-control-row">
                  <MesaSelect
                    value={supplierId}
                    onChange={changeSupplier}
                    options={activeSuppliers.map((s) => ({
                      value: s.id,
                      label: `${s.name}${s.city ? ` · ${s.city}` : ''}`,
                    }))}
                    placeholder={
                      activeSuppliers.length ? t.poSelectVendor : t.poNoVendorsTap
                    }
                  />
                  <button
                    type="button"
                    className="po-icon-btn po-icon-btn-add"
                    title={t.poQuickAddVendor}
                    aria-label={t.poQuickAddVendor}
                    onClick={openQuickVendor}
                  >
                    +
                  </button>
                </div>
                {!activeSuppliers.length ? (
                  <p className="po-field-hint">
                    {t.poNoVendorsModalHint}{' '}
                    <Link to="/suppliers">{t.poManageVendors}</Link>.
                  </p>
                ) : null}
              </div>

              <label className="po-check">
                <input
                  type="checkbox"
                  checked={showAllStock}
                  onChange={(e) => setShowAllStock(e.target.checked)}
                />
                <span>{t.poShowAllStock}</span>
              </label>

              {showAllStock || supplierId ? (
                <p className="po-field-hint">
                  {showAllStock
                    ? `${(poStockItems.length === 1 ? t.poShowingAllOne : t.poShowingAll).replace(
                        '{count}',
                        String(poStockItems.length),
                      )}${
                        supplierId
                          ? ` · ${t.poLinkedToVendor.replace('{count}', String(linkedVendorCount))}`
                          : ''
                      }`
                    : (poStockItems.length === 1 ? t.poShowingLinkedOne : t.poShowingLinked).replace(
                        '{count}',
                        String(poStockItems.length),
                      )}
                </p>
              ) : null}

              <div className="po-field">
                <span className="field-label">{t.poNotes}</span>
                <input
                  className="search"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.poOptional}
                />
              </div>

              <div className="po-lines">
                <div className="po-lines-head">
                  <strong>{t.poLinesHead}</strong>
                </div>
                <div className="po-draft-head" aria-hidden>
                  <span>{t.poItem}</span>
                  <span />
                  <span>{t.poQty}</span>
                  <span>{t.poCost}</span>
                  <span />
                </div>
                {draftLines.map((line, idx) => {
                  const unit = stock.find((s) => s.id === line.stockId)?.unit ?? ''
                  const lineOptions = (() => {
                    if (stockSelectOptions.some((o) => o.value === line.stockId)) {
                      return stockSelectOptions
                    }
                    const row = stock.find((s) => s.id === line.stockId)
                    if (!row) return stockSelectOptions
                    return [
                      {
                        value: row.id,
                        label: row.sku?.trim()
                          ? `${row.name} · ${row.sku}`
                          : `${row.name} (${row.unit})`,
                      },
                      ...stockSelectOptions,
                    ]
                  })()
                  const selectValue = lineOptions.some((o) => o.value === line.stockId)
                    ? line.stockId
                    : ''
                  return (
                    <div key={idx} className="po-draft-row">
                      <div className="po-draft-item">
                        <MesaSelect
                          value={selectValue}
                          onChange={(id) => {
                            setDraftLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      stockId: id,
                                      unitCost: unitCostForStock(id, supplierId),
                                    }
                                  : row,
                              ),
                            )
                          }}
                          options={lineOptions}
                          placeholder={lineOptions.length ? t.poSelectItem : t.poNoItemsForVendor}
                          aria-label={t.poLineItemAria.replace('{n}', String(idx + 1))}
                        />
                      </div>
                      <button
                        type="button"
                        className="po-icon-btn po-icon-btn-add"
                        title={t.poQuickAddItem}
                        aria-label={t.poQuickAddItemLine.replace('{n}', String(idx + 1))}
                        onClick={() => openQuickItem(idx)}
                      >
                        +
                      </button>
                      <input
                        className="search po-draft-input po-draft-qty"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        aria-label={
                          unit
                            ? t.poQtyOrderedUnitAria.replace('{unit}', unit)
                            : t.poQtyOrderedAria
                        }
                        value={line.qtyOrdered || ''}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, qtyOrdered: Number(e.target.value) || 0 } : row,
                            ),
                          )
                        }
                      />
                      <input
                        className="search po-draft-input po-draft-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        aria-label={t.poUnitCost}
                        value={line.unitCost || ''}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitCost: Number(e.target.value) || 0 } : row,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="po-icon-btn po-icon-btn-remove"
                        aria-label={t.poRemoveLine}
                        onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  className="btn btn-ghost po-add-line"
                  onClick={() =>
                    setDraftLines((prev) => [
                      ...prev,
                      {
                        stockId: poStockItems[0]?.id ?? stock[0]?.id ?? 's1',
                        qtyOrdered: 1,
                        unitCost: unitCostForStock(
                          poStockItems[0]?.id ?? stock[0]?.id ?? 's1',
                          supplierId,
                        ),
                      },
                    ])
                  }
                >
                  {t.poAddLine}
                </button>
              </div>

              <div className="po-modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!supplierId}
                  onClick={submitNew}
                >
                  {t.poCreateDraft}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quickVendor ? (
        <div
          className="zk-products-quick-modal zk-ing-quick-modal po-quick-item-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t.poQuickAddVendor}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickVendor(null)
          }}
        >
          <div className="zk-products-quick-sheet">
            <div className="zk-products-quick-head">
              <strong>{t.poQuickAddVendor}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setQuickVendor(null)}>
                ×
              </button>
            </div>
            <div className="zk-products-quick-body">
              <label>
                <span>{t.venNamePlaceholder}</span>
                <input
                  className="search"
                  autoFocus
                  value={quickVendor.name}
                  placeholder={t.poVendorNameEg}
                  onChange={(e) =>
                    setQuickVendor({ ...quickVendor, name: e.target.value, error: '' })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveQuickVendor()
                    }
                  }}
                />
              </label>
              <div className="po-quick-item-grid">
                <label>
                  <span>{t.phone}</span>
                  <input
                    className="search"
                    value={quickVendor.phone}
                    placeholder={t.poOptional}
                    onChange={(e) =>
                      setQuickVendor({ ...quickVendor, phone: e.target.value, error: '' })
                    }
                  />
                </label>
                <label>
                  <span>{t.venCity}</span>
                  <input
                    className="search"
                    value={quickVendor.city}
                    placeholder={t.poCityEg}
                    onChange={(e) =>
                      setQuickVendor({ ...quickVendor, city: e.target.value, error: '' })
                    }
                  />
                </label>
              </div>
              <label>
                <span>{t.emailId}</span>
                <input
                  className="search"
                  type="email"
                  value={quickVendor.email}
                  placeholder={t.poOptional}
                  onChange={(e) =>
                    setQuickVendor({ ...quickVendor, email: e.target.value, error: '' })
                  }
                />
              </label>
              {quickVendor.error ? <p className="po-quick-item-error">{quickVendor.error}</p> : null}
            </div>
            <div className="zk-products-quick-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setQuickVendor(null)}>
                {t.cancel}
              </button>
              <button type="button" className="btn btn-teal" onClick={saveQuickVendor}>
                {t.addVendor}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickItem ? (
        <div
          className="zk-products-quick-modal zk-ing-quick-modal po-quick-item-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t.poQuickAddItem}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuickItem(null)
          }}
        >
          <div className="zk-products-quick-sheet">
            <div className="zk-products-quick-head">
              <strong>{t.poQuickAddItemTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setQuickItem(null)}>
                ×
              </button>
            </div>
            <div className="zk-products-quick-body">
              <label>
                <span>{t.poItemName}</span>
                <input
                  className="search"
                  autoFocus
                  value={quickItem.name}
                  placeholder={t.poItemNameEg}
                  onChange={(e) =>
                    setQuickItem({ ...quickItem, name: e.target.value, error: '' })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveQuickItem()
                    }
                  }}
                />
                <small className="zk-ing-hint">{t.poUniqueHint}</small>
              </label>
              <label>
                <span>{t.poSkuCode}</span>
                <input
                  className="search"
                  value={quickItem.sku}
                  placeholder={t.poUniqueCode}
                  onChange={(e) =>
                    setQuickItem({ ...quickItem, sku: e.target.value, error: '' })
                  }
                />
              </label>
              <div className="po-quick-item-grid">
                <label>
                  <span>{t.poUnit}</span>
                  <MesaSelect
                    value={quickItem.unit}
                    onChange={(v) => setQuickItem({ ...quickItem, unit: v })}
                    options={QUICK_UNITS.map((u) => ({ value: u, label: u }))}
                  />
                </label>
                <label>
                  <span>{t.poUnitCost}</span>
                  <input
                    className="search"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={quickItem.unitCost}
                    onChange={(e) =>
                      setQuickItem({ ...quickItem, unitCost: e.target.value, error: '' })
                    }
                  />
                </label>
              </div>
              <label>
                <span>{t.poCategory}</span>
                <MesaSelect
                  value={canonicalizeIngredientCategory(quickItem.category)}
                  onChange={(v) => setQuickItem({ ...quickItem, category: v })}
                  options={
                    quickCategoryOptions.length
                      ? quickCategoryOptions
                      : [{ value: 'General', label: 'General' }]
                  }
                />
              </label>
              {supplierMeta.name ? (
                <p className="po-side-hint">
                  {t.poLinkedVendor.replace('{name}', supplierMeta.name)}
                </p>
              ) : null}
              {quickItem.error ? <p className="po-quick-item-error">{quickItem.error}</p> : null}
            </div>
            <div className="zk-products-quick-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setQuickItem(null)}>
                {t.cancel}
              </button>
              <button type="button" className="btn btn-teal" onClick={saveQuickItem}>
                {t.poAddItem}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiveTarget ? (
        <div
          className="modal-backdrop po-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReceiveTarget(null)
          }}
        >
          <div className="modal-card po-modal">
            <div className="section-head">
              <h2>{t.poReceiveTitle.replace('{id}', receiveTarget.id)}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setReceiveTarget(null)}>
                {t.close}
              </button>
            </div>
            <p className="modal-lead">{supplierName(receiveTarget.supplierId)}</p>
            {receiveTarget.lines.map((line: POLine) => {
              const rem = Math.max(0, line.qtyOrdered - line.qtyReceived)
              return (
                <div key={line.stockId} className="po-recv-line">
                  <label className="field-label">
                    {stockName(line.stockId)} · {t.poRemaining.replace('{rem}', String(rem))}
                  </label>
                  <input
                    className="search"
                    type="number"
                    step="0.01"
                    value={receiveQty[line.stockId] ?? '0'}
                    onChange={(e) =>
                      setReceiveQty((prev) => ({ ...prev, [line.stockId]: e.target.value }))
                    }
                  />
                </div>
              )
            })}
            <div className="po-modal-actions">
              <button type="button" className="btn btn-teal" onClick={confirmReceive}>
                {t.poConfirmReceive}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo="/" backLabel={t.home} />
    </div>
  )
}
