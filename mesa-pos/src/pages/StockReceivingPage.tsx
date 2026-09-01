import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import { useDeleteConfirm } from '../hooks/useDeleteConfirm'
import { getActiveBranchId } from '../data/company'
import { money } from '../data/mock'
import type { Supplier } from '../data/purchasing'
import {
  fromApiReceipt,
  getLastCosts,
  lineTotals,
  loadAllReceipts,
  loadReceipts,
  mergeRemoteReceipts,
  nextReceiveNumber,
  pushCostHistory,
  receiptsForBranch,
  saveAllReceipts,
  type StockReceipt,
  type StockReceiptLine,
} from '../data/stockReceiving'
import { apiListReceipts, apiMastersReady, apiPutReceipt } from '../lib/apiMasters'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'
import { usePurchasing } from '../state/PurchasingContext'
import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { useSync } from '../sync/SyncContext'

function pushReceipt(receipt: StockReceipt) {
  if (apiMastersReady()) {
    void apiPutReceipt(receipt as unknown as Record<string, unknown>)
      .then(() => dropPendingUpsertsFor(receipt.id, 'receipt.upsert'))
      .catch(() =>
        enqueueOutbox('receipt.upsert', receipt.id, receipt, getDeviceId(), receipt.branchId),
      )
  } else {
    enqueueOutbox('receipt.upsert', receipt.id, receipt, getDeviceId(), receipt.branchId)
  }
}

function RecvIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="recv-ico"
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

function IconInbox() {
  return (
    <RecvIcon>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </RecvIcon>
  )
}

function IconBox() {
  return (
    <RecvIcon>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </RecvIcon>
  )
}

function IconVendors() {
  return (
    <RecvIcon>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </RecvIcon>
  )
}

function IconPlus() {
  return (
    <RecvIcon>
      <path d="M12 5v14M5 12h14" />
    </RecvIcon>
  )
}

function IconTrash() {
  return (
    <RecvIcon>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" />
    </RecvIcon>
  )
}

function IconCloud() {
  return (
    <RecvIcon>
      <path d="M7 18h10a4 4 0 0 0 .5-7.95A5.5 5.5 0 0 0 7.1 8.1 3.5 3.5 0 0 0 7 18Z" />
    </RecvIcon>
  )
}

export default function StockReceivingPage() {
  const { user, token } = useAuth()
  const { flash, stock, receiveStock } = usePos()
  const { t } = useI18n()
  const { dishes } = useMasters()
  const { suppliers, addVendorLedgerEntry } = usePurchasing()
  const { activeBranchId } = useBranch()
  const { syncEpoch, connectivity, queued } = useSync()
  const { askDelete, deleteConfirmDialog } = useDeleteConfirm()

  const canAccess = user
    ? getPermissions(user.role).canManageStock || user.role === 'admin'
    : false
  const online = connectivity === 'online' || connectivity === 'syncing'

  const [query, setQuery] = useState('')
  const [receipts, setReceipts] = useState(loadReceipts)
  const [receiveNumber, setReceiveNumber] = useState(() => nextReceiveNumber(loadReceipts()))
  const [receivingDate, setReceivingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [supplierId, setSupplierId] = useState(suppliers.find((s) => s.active)?.id ?? '')
  const [packingQty, setPackingQty] = useState(1)
  const [lines, setLines] = useState<StockReceiptLine[]>([])
  const [vendorOpen, setVendorOpen] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [vendorQuery, setVendorQuery] = useState('')
  const [itemQuery, setItemQuery] = useState('')
  const [retrieveOpen, setRetrieveOpen] = useState(false)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [barcodeMode, setBarcodeMode] = useState(false)
  const [busy, setBusy] = useState(false)

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.active), [suppliers])

  const vendor = suppliers.find((s) => s.id === supplierId) ?? null
  const selected = selectedLine != null ? lines[selectedLine] : null
  const lastCosts = selected?.stockId ? getLastCosts(selected.stockId, 3, receipts) : []
  const onHand = selected?.stockId
    ? (stock.find((s) => s.id === selected.stockId)?.onHand ?? 0)
    : null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const branchId = getActiveBranchId()
      const local = receiptsForBranch(loadAllReceipts(), branchId)
      setReceipts(local)
      if (!apiMastersReady() || !online) return
      try {
        const remote = (await apiListReceipts(branchId)) as Record<string, unknown>[]
        if (cancelled) return
        const pending = loadOutbox()
          .filter((o) => o.type === 'receipt.upsert' && (o.status === 'pending' || o.status === 'syncing'))
          .map((o) => o.payload as StockReceipt)
        const merged = mergeRemoteReceipts(loadAllReceipts(), remote.map(fromApiReceipt), branchId, pending)
        saveAllReceipts(merged)
        setReceipts(receiptsForBranch(merged, branchId))
      } catch {
        /* keep local */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, syncEpoch, activeBranchId, online])

  useEffect(() => {
    if (!supplierId && activeSuppliers[0]) setSupplierId(activeSuppliers[0].id)
  }, [supplierId, activeSuppliers])

  const catalog = useMemo(() => {
    return stock.map((s) => {
      const dish =
        dishes.find((d) => d.code === s.sku) ||
        dishes.find((d) => d.name.toLowerCase() === s.name.toLowerCase())
      return {
        stockId: s.id,
        code: s.sku,
        name: s.name,
        alias: dish?.alias ?? '',
        salePrice: dish?.price ?? Math.round(s.cost * 1.4 * 100) / 100,
        cost: s.cost,
        onHand: s.onHand,
        unit: s.unit,
      }
    })
  }, [stock, dishes])

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase()
    return activeSuppliers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.phone ?? '').includes(q) ||
        (s.city ?? '').toLowerCase().includes(q),
    )
  }, [activeSuppliers, vendorQuery])

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    return catalog.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.alias.toLowerCase().includes(q),
    )
  }, [catalog, itemQuery])

  const netAmount = lines.reduce((sum, l) => sum + l.total, 0)
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)

  function pickVendor(s: Supplier) {
    setSupplierId(s.id)
    setVendorOpen(false)
    setVendorQuery('')
  }

  function openAddItem() {
    setItemQuery('')
    setItemOpen(true)
  }

  function pickItem(stockId: string) {
    const item = catalog.find((x) => x.stockId === stockId)
    if (!item) return
    const taxPct = 15
    const qty = 1
    const { taxAmount, total } = lineTotals(item.cost, qty, taxPct)
    const row: StockReceiptLine = {
      stockId: item.stockId,
      code: item.code,
      name: item.name,
      salePrice: item.salePrice,
      costPrice: item.cost,
      taxPct,
      qty,
      taxAmount,
      total,
    }
    setLines((prev) => {
      const next = [...prev, row]
      setSelectedLine(next.length - 1)
      return next
    })
    setItemOpen(false)
    setItemQuery('')
  }

  function patchLine(
    index: number,
    patch: Partial<Pick<StockReceiptLine, 'salePrice' | 'costPrice' | 'taxPct' | 'qty'>>,
  ) {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const next = { ...row, ...patch }
        const { taxAmount, total } = lineTotals(next.costPrice, next.qty, next.taxPct)
        return { ...next, taxAmount, total }
      }),
    )
  }

  function applyLastCost(cost: number) {
    if (selectedLine == null) {
      flash('Select a line first', 'err')
      return
    }
    patchLine(selectedLine, { costPrice: cost })
  }

  function removeSelected() {
    if (selectedLine == null) {
      flash('Select a line to delete', 'err')
      return
    }
    const lineIndex = selectedLine
    askDelete({
      message: 'Delete this receiving line?',
      onConfirm: () => {
        setLines((prev) => prev.filter((_, i) => i !== lineIndex))
        setSelectedLine(null)
      },
    })
  }

  function resetForm(nextNum?: string) {
    setReceiveNumber(nextNum ?? nextReceiveNumber(receipts))
    setReceivingDate(new Date().toISOString().slice(0, 10))
    setInvoiceNumber('')
    setInvoiceDate(new Date().toISOString().slice(0, 10))
    setPackingQty(1)
    setLines([])
    setSelectedLine(null)
    setSupplierId(activeSuppliers[0]?.id ?? '')
  }

  function saveReceipt() {
    if (busy) return
    if (!supplierId) {
      flash('Select a vendor', 'err')
      setVendorOpen(true)
      return
    }
    if (!vendor?.active) {
      flash('Selected vendor is inactive — choose an active vendor', 'err')
      setVendorOpen(true)
      return
    }
    if (lines.length === 0) {
      flash('Add at least one item', 'err')
      openAddItem()
      return
    }
    if (lines.some((l) => !(l.qty > 0))) {
      flash('Every line needs quantity > 0', 'err')
      return
    }

    setBusy(true)
    try {
      const receipt: StockReceipt = {
        id: `rcpt-${Date.now()}`,
        branchId: getActiveBranchId(),
        receiveNumber,
        receivingDate,
        invoiceNumber: invoiceNumber.trim() || receiveNumber,
        invoiceDate,
        supplierId,
        receivingPerson: user?.name ?? 'Admin',
        packingQty,
        lines,
        netAmount,
        createdAt: new Date().toISOString(),
      }

      receiveStock(
        lines.map((l) => ({
          stockId: l.stockId,
          qty: l.qty,
          cost: l.costPrice,
          vendorId: supplierId,
          vendor: vendor?.name,
        })),
      )
      lines.forEach((l) => pushCostHistory(l.stockId, l.costPrice))

      const goods = Math.round(lines.reduce((s, l) => s + l.costPrice * l.qty, 0) * 100) / 100
      if (goods > 0) {
        addVendorLedgerEntry({
          supplierId,
          description: `Stock receiving #${receiveNumber}${invoiceNumber ? ` · Inv ${invoiceNumber}` : ''}`,
          debit: goods,
          credit: 0,
          kind: 'invoice',
          date: receivingDate,
        })
      }

      const nextAll = [receipt, ...loadAllReceipts().filter((r) => r.id !== receipt.id)]
      saveAllReceipts(nextAll)
      pushReceipt(receipt)
      const next = receiptsForBranch(nextAll)
      setReceipts(next)
      if (online) {
        flash(`Received ${lines.length} item(s) · ${money(netAmount)}`)
      } else {
        flash(`Saved offline · ${lines.length} item(s) will sync when online`)
      }
      resetForm(nextReceiveNumber(next))
    } finally {
      setBusy(false)
    }
  }

  function loadReceipt(r: StockReceipt) {
    setReceiveNumber(r.receiveNumber)
    setReceivingDate(r.receivingDate)
    setInvoiceNumber(r.invoiceNumber)
    setInvoiceDate(r.invoiceDate)
    setSupplierId(r.supplierId)
    setPackingQty(r.packingQty)
    setLines(r.lines.map((l) => ({ ...l })))
    setSelectedLine(r.lines.length ? 0 : null)
    setRetrieveOpen(false)
    flash(`Loaded receive #${r.receiveNumber}`)
  }

  if (!canAccess) {
    return (
      <div className="zk-recv-desk">
        <DashHeader search={query} onSearchChange={setQuery} brandTo="/inventory" />
        <div className="recv-page-inner">
          <div className="recv-empty locked">
            <strong>Stock receiving locked</strong>
            <p>Only Admin / stock roles can post receipts.</p>
            <Link to="/inventory" className="btn btn-ghost">
              Back to stock
            </Link>
          </div>
        </div>
        <HubFooter backTo="/inventory" backLabel={t.inventory} />
      </div>
    )
  }

  return (
    <div className="zk-recv-desk">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/inventory" />

      <div className="recv-page-inner">
        <header className="recv-hero">
          <div className="recv-hero-brand">
            <span className="recv-hero-mark">
              <IconInbox />
            </span>
            <div>
              <h1>Stock receiving</h1>
              <p>
                Receive #{receiveNumber} · {lines.length} line{lines.length === 1 ? '' : 's'}
                {vendor ? ` · ${vendor.name}` : ''}
              </p>
            </div>
          </div>
          <div className="recv-hero-stats">
            <span className={`recv-stat tone-sync${online ? '' : ' warn'}`}>
              <IconCloud />
              <strong>{online ? 'Online' : 'Offline'}</strong>
              <em>{online ? (queued ? `${queued} queued` : 'Synced') : 'Local only'}</em>
            </span>
            <span className="recv-stat tone-sku">
              <IconBox />
              <strong className="mesa-ltr-nums">{lines.length}</strong>
              <em>Lines</em>
            </span>
            <span className="recv-stat tone-amt">
              <strong className="mesa-ltr-nums">{money(netAmount)}</strong>
              <em>Net</em>
            </span>
          </div>
          <div className="recv-hero-actions">
            <Link to="/inventory" className="recv-link-btn">
              <IconBox /> Stock
            </Link>
            <Link to="/suppliers" className="recv-link-btn">
              <IconVendors /> Vendors
            </Link>
            <button type="button" className="recv-link-btn primary" onClick={openAddItem}>
              <IconPlus /> Add item
            </button>
          </div>
        </header>

        <div className="recv-layout">
          <section className="recv-card recv-meta-card">
            <div className="recv-card-head">
              <h2>Receipt details</h2>
              {!online ? (
                <span className="recv-pill offline">Offline</span>
              ) : (
                <span className="recv-pill online">Ready</span>
              )}
            </div>

            <div className="recv-fields">
              <label className="recv-field">
                <span>Receive #</span>
                <input
                  className="recv-input"
                  value={receiveNumber}
                  onChange={(e) => setReceiveNumber(e.target.value)}
                />
              </label>
              <label className="recv-field">
                <span>Receiving date</span>
                <input
                  className="recv-input"
                  type="date"
                  value={receivingDate}
                  onChange={(e) => setReceivingDate(e.target.value)}
                />
              </label>
              <label className="recv-field recv-field-span">
                <span>Vendor</span>
                <button type="button" className="recv-pick" onClick={() => setVendorOpen(true)}>
                  {vendor
                    ? vendor.active
                      ? vendor.name
                      : `${vendor.name} (inactive)`
                    : 'Select vendor…'}
                </button>
                {vendor ? (
                  <em className="recv-hint">
                    {vendor.active
                      ? [vendor.city, vendor.phone].filter(Boolean).join(' · ') || vendor.id
                      : 'Inactive — select another vendor'}
                  </em>
                ) : null}
              </label>
              <label className="recv-field">
                <span>Invoice #</span>
                <input
                  className="recv-input"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Supplier invoice"
                />
              </label>
              <label className="recv-field">
                <span>Invoice date</span>
                <input
                  className="recv-input"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
              <label className="recv-field">
                <span>Packing qty</span>
                <input
                  className="recv-input mesa-ltr-nums"
                  type="number"
                  min={0}
                  value={packingQty}
                  onChange={(e) => setPackingQty(Number(e.target.value) || 0)}
                />
              </label>
              <label className="recv-field">
                <span>Received by</span>
                <input className="recv-input" readOnly value={user?.name ?? 'Admin'} />
              </label>
            </div>

            <div className="recv-side-panel">
              <strong>Selected line</strong>
              {selected ? (
                <>
                  <p className="recv-selected-name">{selected.name}</p>
                  <div className="recv-onhand">
                    <span>On hand now</span>
                    <em className="mesa-ltr-nums">{onHand ?? '—'}</em>
                  </div>
                  <div className="recv-costs">
                    <span>Last costs</span>
                    {lastCosts.length === 0 ? (
                      <em className="recv-hint">No history yet</em>
                    ) : (
                      <div className="recv-cost-chips">
                        {lastCosts.map((c, i) => (
                          <button key={`${c}-${i}`} type="button" onClick={() => applyLastCost(c)}>
                            {c.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <em className="recv-hint">Select a table row to see stock & cost history</em>
              )}
            </div>
          </section>

          <section className="recv-card recv-lines-card">
            <div className="recv-card-head">
              <h2>Lines</h2>
              <div className="recv-lines-tools">
                <button
                  type="button"
                  className={`recv-chip-btn${barcodeMode ? ' on' : ''}`}
                  onClick={() => {
                    setBarcodeMode((v) => !v)
                    flash(barcodeMode ? 'Barcode mode off' : 'Barcode mode on — type SKU in Add item')
                    if (!barcodeMode) openAddItem()
                  }}
                >
                  {barcodeMode ? 'Barcode on' : 'Barcode'}
                </button>
                <button type="button" className="recv-chip-btn" onClick={() => setRetrieveOpen(true)}>
                  Retrieve
                </button>
                <button type="button" className="recv-chip-btn accent" onClick={openAddItem}>
                  <IconPlus /> Add item
                </button>
              </div>
            </div>

            <div className="recv-table-wrap">
              <table className="recv-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item</th>
                    <th>Cost</th>
                    <th>Tax %</th>
                    <th>Qty</th>
                    <th>Tax</th>
                    <th>Total</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty">
                        No lines yet — tap <strong>Add item</strong> to receive stock
                      </td>
                    </tr>
                  ) : (
                    lines.map((l, i) => (
                      <tr
                        key={`${l.stockId}-${i}`}
                        className={selectedLine === i ? 'selected' : ''}
                        onClick={() => setSelectedLine(i)}
                      >
                        <td className="mesa-ltr-nums">{i + 1}</td>
                        <td>
                          <div className="recv-item-cell">
                            <strong>{l.name}</strong>
                            <span className="mesa-ltr-nums">{l.code || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            className="recv-cell mesa-ltr-nums"
                            type="number"
                            step="0.01"
                            value={l.costPrice}
                            onChange={(e) => patchLine(i, { costPrice: Number(e.target.value) || 0 })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td>
                          <input
                            className="recv-cell mesa-ltr-nums"
                            type="number"
                            step="0.1"
                            value={l.taxPct}
                            onChange={(e) => patchLine(i, { taxPct: Number(e.target.value) || 0 })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td>
                          <input
                            className="recv-cell recv-qty mesa-ltr-nums"
                            type="number"
                            step="0.01"
                            min={0}
                            value={l.qty}
                            onChange={(e) => patchLine(i, { qty: Number(e.target.value) || 0 })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="mesa-ltr-nums recv-ro">{l.taxAmount.toFixed(2)}</td>
                        <td className="mesa-ltr-nums recv-ro">
                          <strong>{l.total.toFixed(2)}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="recv-row-del"
                            title="Remove line"
                            onClick={(e) => {
                              e.stopPropagation()
                              setLines((prev) => prev.filter((_, idx) => idx !== i))
                              setSelectedLine(null)
                            }}
                          >
                            <IconTrash />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="recv-summary">
              <div className="recv-totals">
                <span>
                  Items <strong className="mesa-ltr-nums">{lines.length}</strong>
                </span>
                <span>
                  Qty <strong className="mesa-ltr-nums">{totalQty}</strong>
                </span>
                <span className="recv-net">
                  Net <strong className="mesa-ltr-nums">{money(netAmount)}</strong>
                </span>
              </div>
              <div className="recv-actions">
                <button type="button" className="recv-act" onClick={() => resetForm()}>
                  New
                </button>
                <button
                  type="button"
                  className="recv-act danger"
                  disabled={selectedLine == null}
                  onClick={removeSelected}
                >
                  Delete line
                </button>
                <button
                  type="button"
                  className="recv-act primary"
                  disabled={busy || lines.length === 0}
                  onClick={saveReceipt}
                >
                  {busy ? 'Posting…' : online ? 'Post receive' : 'Save offline'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {vendorOpen ? (
        <div
          className="recv-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVendorOpen(false)
          }}
        >
          <div className="recv-modal">
            <div className="recv-modal-head">
              <h2>Select vendor</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setVendorOpen(false)}>
                Close
              </button>
            </div>
            <input
              className="recv-input"
              autoFocus
              placeholder="Search name, ID, phone…"
              value={vendorQuery}
              onChange={(e) => setVendorQuery(e.target.value)}
            />
            <div className="recv-modal-list">
              {activeSuppliers.length === 0 ? (
                <p className="recv-empty-inline">No active vendors — activate a vendor first</p>
              ) : filteredVendors.length === 0 ? (
                <p className="recv-empty-inline">No vendors match</p>
              ) : (
                filteredVendors.map((s) => (
                  <button key={s.id} type="button" className="recv-modal-row" onClick={() => pickVendor(s)}>
                    <strong>{s.name}</strong>
                    <span>
                      {s.city || '—'}
                      {s.phone ? ` · ${s.phone}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {itemOpen ? (
        <div
          className="recv-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setItemOpen(false)
          }}
        >
          <div className="recv-modal recv-modal-wide">
            <div className="recv-modal-head">
              <h2>Add item</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setItemOpen(false)}>
                Close
              </button>
            </div>
            <input
              className="recv-input"
              autoFocus
              placeholder={barcodeMode ? 'Scan / type SKU…' : 'Search code, name, alias…'}
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredItems[0]) {
                  e.preventDefault()
                  pickItem(filteredItems[0].stockId)
                }
              }}
            />
            <div className="recv-modal-list">
              {filteredItems.length === 0 ? (
                <p className="recv-empty-inline">No matching items</p>
              ) : (
                filteredItems.map((s) => (
                  <button
                    key={s.stockId}
                    type="button"
                    className="recv-modal-row"
                    onClick={() => pickItem(s.stockId)}
                  >
                    <div>
                      <strong>{s.name}</strong>
                      <span className="mesa-ltr-nums">
                        {s.code || '—'}
                        {s.alias ? ` · ${s.alias}` : ''}
                      </span>
                    </div>
                    <em className="mesa-ltr-nums">
                      {s.onHand} {s.unit}
                    </em>
                  </button>
                ))
              )}
            </div>
            <p className="recv-modal-foot mesa-ltr-nums">{filteredItems.length} items</p>
          </div>
        </div>
      ) : null}

      {retrieveOpen ? (
        <div
          className="recv-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRetrieveOpen(false)
          }}
        >
          <div className="recv-modal recv-modal-wide">
            <div className="recv-modal-head">
              <h2>Retrieve receipts</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setRetrieveOpen(false)}>
                Close
              </button>
            </div>
            <div className="recv-modal-list">
              {receipts.length === 0 ? (
                <p className="recv-empty-inline">No saved receipts yet</p>
              ) : (
                receipts.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="recv-modal-row"
                    onClick={() => loadReceipt(r)}
                  >
                    <div>
                      <strong>#{r.receiveNumber}</strong>
                      <span>
                        {r.receivingDate} ·{' '}
                        {suppliers.find((s) => s.id === r.supplierId)?.name ?? r.supplierId}
                      </span>
                    </div>
                    <em className="mesa-ltr-nums">
                      {r.lines.length} · {money(r.netAmount)}
                    </em>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <HubFooter backTo="/inventory" backLabel={t.inventory} />
      {deleteConfirmDialog}
    </div>
  )
}
