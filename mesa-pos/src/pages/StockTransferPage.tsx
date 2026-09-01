import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getPermissions } from '../auth/roles'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import MesaSelect from '../components/MesaSelect'
import { getActiveBranchId } from '../data/company'
import {
  fromApiTransfer,
  incomingBranchTransfers,
  loadAllTransfers,
  mergeRemoteTransfers,
  outgoingBranchRequests,
  patchTransfer,
  pendingBranchDispatch,
  saveAllTransfers,
  transfersForBranch,
  upsertTransfer,
  type StockTransfer,
  type StockTransferKind,
} from '../data/stockTransfers'
import {
  conversionLabel,
  findYieldLink,
  yieldConversionsForStock,
} from '../data/stockYieldLinks'
import {
  locationBalance,
  preferFromLocationId,
  stockLocationLabel,
  type StockLocationId,
} from '../data/stockLocations'
import { apiListTransfers, apiMastersReady, apiPutTransfer } from '../lib/apiMasters'
import { useI18n } from '../locale/i18n'
import { useAuth } from '../state/AuthContext'
import { useBranch } from '../state/BranchContext'
import { usePos } from '../state/PosContext'
import { useStockLocations } from '../hooks/useStockLocations'
import { useYieldLinks } from '../hooks/useYieldLinks'
import { getDeviceId } from '../sync/deviceId'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { useSync } from '../sync/SyncContext'

const PAGE_SIZE = 8

type BranchFlow = 'send' | 'request'

function pushTransfer(doc: StockTransfer) {
  const branchId = doc.branchId ?? getActiveBranchId()
  if (apiMastersReady()) {
    void apiPutTransfer(doc as unknown as Record<string, unknown>)
      .then(() => dropPendingUpsertsFor(doc.id, 'stockTransfer.upsert'))
      .catch(() =>
        enqueueOutbox('stockTransfer.upsert', doc.id, doc, getDeviceId(), branchId),
      )
  } else {
    enqueueOutbox('stockTransfer.upsert', doc.id, doc, getDeviceId(), branchId)
  }
}

function XferRules({ children }: { children: ReactNode }) {
  return <div className="xfer-rules">{children}</div>
}

function XferRule({ children }: { children: ReactNode }) {
  return <span className="xfer-rule">{children}</span>
}

function XferIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="xfer-ico"
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

function IconSwap() {
  return (
    <XferIcon>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </XferIcon>
  )
}

function IconBox() {
  return (
    <XferIcon>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </XferIcon>
  )
}

function IconList() {
  return (
    <XferIcon>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </XferIcon>
  )
}

function IconCloud() {
  return (
    <XferIcon>
      <path d="M7 18h10a4 4 0 0 0 .5-7.95A5.5 5.5 0 0 0 7.1 8.1 3.5 3.5 0 0 0 7 18Z" />
    </XferIcon>
  )
}

export default function StockTransferPage() {
  const { user } = useAuth()
  const { flash, stock, ingredients, adjustStock, transferStockLocation } = usePos()
  const { t } = useI18n()
  const { activeBranchId, branches, activeBranch } = useBranch()
  const { syncEpoch, connectivity, outbox, queued } = useSync()
  const canAccess = user
    ? getPermissions(user.role).canManageStock || user.role === 'admin'
    : false

  const [mode, setMode] = useState<StockTransferKind>('location')
  const [query, setQuery] = useState('')
  const [locStockId, setLocStockId] = useState(stock[0]?.id ?? '')
  const [fromLoc, setFromLoc] = useState<StockLocationId>('cold_store')
  const [toLoc, setToLoc] = useState<StockLocationId>('bar')
  const [branchStockId, setBranchStockId] = useState(stock[0]?.id ?? '')
  const [toBranchId, setToBranchId] = useState('')
  const [fromBranchId, setFromBranchId] = useState('')
  const [branchFlow, setBranchFlow] = useState<BranchFlow>('send')
  const [conversionId, setConversionId] = useState('')
  const [yieldPct, setYieldPct] = useState('85')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<StockTransfer[]>(() => transfersForBranch(loadAllTransfers()))
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)

  const stockLocations = useStockLocations()
  const yieldLinks = useYieldLinks()
  const online = connectivity === 'online' || connectivity === 'syncing'
  const locItem = stock.find((s) => s.id === locStockId)
  const locIngredient = useMemo(() => {
    if (!locItem) return undefined
    return ingredients.find((r) => r.id === locItem.ingredientId || r.id === locItem.id)
  }, [locItem, ingredients])

  useEffect(() => {
    if (!locItem) return
    setFromLoc(preferFromLocationId(locItem, locIngredient?.defaultLocationId) as StockLocationId)
  }, [locStockId, locItem, locIngredient?.defaultLocationId])

  const branchItem = stock.find((s) => s.id === branchStockId)
  const conversions = useMemo(() => yieldConversionsForStock(stock), [stock, yieldLinks])
  const activeConversion = useMemo(
    () => conversions.find((c) => c.link.id === conversionId) ?? conversions[0],
    [conversions, conversionId],
  )
  const prodFrom = activeConversion?.from
  const prodTo = activeConversion?.to
  const qtyNum = Number(qty)
  const yieldNum = Number(yieldPct)
  const locFromQty = locItem ? locationBalance(locItem, fromLoc) : 0
  const locToQty = locItem ? locationBalance(locItem, toLoc) : 0
  const outputQty =
    Number.isFinite(qtyNum) && Number.isFinite(yieldNum) && qtyNum > 0
      ? Math.round(qtyNum * (yieldNum / 100) * 100) / 100
      : 0

  const otherBranches = useMemo(
    () => branches.filter((b) => b.active && b.id !== activeBranchId),
    [branches, activeBranchId],
  )

  const conversionOptions = useMemo(
    () => conversions.map((c) => ({ value: c.link.id, label: conversionLabel(c) })),
    [conversions],
  )

  const branchOptions = useMemo(
    () => otherBranches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` })),
    [otherBranches],
  )

  const incoming = useMemo(() => incomingBranchTransfers(activeBranchId), [rows, activeBranchId])
  const pendingDispatch = useMemo(() => pendingBranchDispatch(activeBranchId), [rows, activeBranchId])
  const myRequests = useMemo(() => outgoingBranchRequests(activeBranchId), [rows, activeBranchId])

  const locationOptions = useMemo(
    () => stockLocations.map((l) => ({ value: l.id, label: l.label })),
    [stockLocations],
  )

  const stockOptions = useMemo(
    () =>
      stock.map((s) => ({
        value: s.id,
        label: `${s.name} · ${s.onHand} ${s.unit}`,
      })),
    [stock],
  )

  const pendingTransferIds = useMemo(() => {
    return new Set(
      outbox
        .filter(
          (o) =>
            o.type === 'stockTransfer.upsert' &&
            (o.status === 'pending' || o.status === 'syncing'),
        )
        .map((o) => o.entityId),
    )
  }, [outbox])

  const pendingCount = pendingTransferIds.size

  useEffect(() => {
    if (!stockLocations.length) return
    const ids = new Set(stockLocations.map((l) => l.id))
    if (!ids.has(fromLoc)) {
      setFromLoc(stockLocations.find((l) => l.type === 'cold')?.id ?? stockLocations[0].id)
    }
    if (!ids.has(toLoc)) {
      setToLoc(
        stockLocations.find((l) => l.id === 'bar')?.id ??
          stockLocations.find((l) => l.type === 'station')?.id ??
          stockLocations[1]?.id ??
          stockLocations[0].id,
      )
    }
  }, [stockLocations, fromLoc, toLoc])

  useEffect(() => {
    if (!locStockId && stock[0]?.id) setLocStockId(stock[0].id)
    if (!branchStockId && stock[0]?.id) setBranchStockId(stock[0].id)
    if (!conversionId && conversions[0]?.link.id) setConversionId(conversions[0].link.id)
    if (!toBranchId && otherBranches[0]?.id) setToBranchId(otherBranches[0].id)
    if (!fromBranchId && otherBranches[0]?.id) setFromBranchId(otherBranches[0].id)
  }, [stock, locStockId, branchStockId, conversionId, toBranchId, fromBranchId, otherBranches, conversions])

  useEffect(() => {
    if (!activeConversion) return
    setYieldPct(String(activeConversion.link.defaultYieldPct))
  }, [activeConversion?.link.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const branchId = getActiveBranchId()
      setRows(transfersForBranch(loadAllTransfers(), branchId))
      if (!apiMastersReady() || !online) return
      try {
        const remote = (await apiListTransfers(branchId)) as Record<string, unknown>[]
        if (cancelled) return
        const pending = loadOutbox()
          .filter(
            (o) =>
              o.type === 'stockTransfer.upsert' &&
              (o.status === 'pending' || o.status === 'syncing'),
          )
          .map((o) => o.payload as StockTransfer)
        const merged = mergeRemoteTransfers(
          loadAllTransfers(),
          remote.map(fromApiTransfer),
          branchId,
          pending,
        )
        saveAllTransfers(merged)
        setRows(transfersForBranch(merged, branchId))
      } catch {
        /* keep local — offline or API error */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [syncEpoch, activeBranchId, online])

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (!q) return list
    return list.filter(
      (r) =>
        r.fromName.toLowerCase().includes(q) ||
        r.toName.toLowerCase().includes(q) ||
        (r.note ?? '').toLowerCase().includes(q) ||
        (r.staff ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const pageCount = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredHistory.slice(start, start + PAGE_SIZE)
  }, [filteredHistory, safePage])

  useEffect(() => {
    setPage(1)
  }, [query])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function swapLocations() {
    setFromLoc(toLoc)
    setToLoc(fromLoc)
  }

  function refreshRows() {
    setRows(transfersForBranch(loadAllTransfers(), getActiveBranchId()))
  }

  function transferLocation() {
    if (busy) return
    const n = qtyNum
    if (!locItem) {
      flash('Select a stock item', 'err')
      return
    }
    if (fromLoc === toLoc) {
      flash('Choose two different locations', 'err')
      return
    }
    if (!(n > 0) || !Number.isFinite(n)) {
      flash('Enter a positive quantity', 'err')
      return
    }
    if (locFromQty < n) {
      flash(`Not enough in ${stockLocationLabel(fromLoc)} (${locFromQty} ${locItem.unit})`, 'err')
      return
    }

    setBusy(true)
    try {
      const branchId = getActiveBranchId()
      const noteText = note.trim() || 'Location transfer'
      const doc: StockTransfer = {
        id: `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        branchId,
        kind: 'location',
        status: 'completed',
        stockId: locItem.id,
        fromStockId: locItem.id,
        toStockId: locItem.id,
        fromLocation: fromLoc,
        toLocation: toLoc,
        fromName: `${locItem.name} · ${stockLocationLabel(fromLoc)}`,
        toName: `${locItem.name} · ${stockLocationLabel(toLoc)}`,
        fromSku: locItem.sku,
        toSku: locItem.sku,
        qty: n,
        unit: locItem.unit,
        note: noteText,
        staff: user?.name,
        createdAt: new Date().toISOString(),
      }

      const ok = transferStockLocation(locItem.id, fromLoc, toLoc, n, noteText)
      if (!ok) {
        flash('Transfer failed — check quantity', 'err')
        return
      }

      upsertTransfer(doc)
      pushTransfer(doc)
      refreshRows()
      setQty('1')
      setNote('')

      if (online) {
        flash(`Moved ${n} ${locItem.unit} · ${stockLocationLabel(fromLoc)} → ${stockLocationLabel(toLoc)}`)
      } else {
        flash(`Saved offline · ${n} ${locItem.unit} will sync when online`)
      }
    } finally {
      setBusy(false)
    }
  }

  function dispatchBranchTransfer(row?: StockTransfer) {
    if (busy) return
    const n = row?.qty ?? qtyNum
    const item = row
      ? stock.find((s) => s.sku === row.fromSku && s.unit === row.unit)
      : branchItem
    const dest = row
      ? branches.find((b) => b.id === row.toBranchId)
      : otherBranches.find((b) => b.id === toBranchId)
    if (!item || !dest) {
      flash(row ? 'Stock item not found at this branch' : 'Select item and destination branch', 'err')
      return
    }
    if (row && item.sku !== row.fromSku) {
      flash('SKU mismatch — cannot dispatch', 'err')
      return
    }
    if (!(n > 0) || !Number.isFinite(n)) {
      flash('Enter a positive quantity', 'err')
      return
    }
    if (item.onHand < n) {
      flash(`Not enough on hand (${item.onHand} ${item.unit})`, 'err')
      return
    }

    setBusy(true)
    try {
      const branchId = getActiveBranchId()
      adjustStock(item.id, -n, undefined, { quiet: true })
      const doc: StockTransfer = row
        ? {
            ...row,
            status: 'in_transit',
            fromStockId: item.id,
            toStockId: item.id,
            fromName: `${activeBranch.code} · ${item.name}`,
            toName: `${dest.code} · ${item.name}`,
            fromSku: item.sku,
            toSku: item.sku,
            staff: user?.name,
          }
        : {
            id: `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            branchId,
            kind: 'branch',
            status: 'in_transit',
            fromBranchId: branchId,
            toBranchId: dest.id,
            fromBranchName: activeBranch.name,
            toBranchName: dest.name,
            fromStockId: item.id,
            toStockId: item.id,
            fromName: `${activeBranch.code} · ${item.name}`,
            toName: `${dest.code} · ${item.name}`,
            fromSku: item.sku,
            toSku: item.sku,
            qty: n,
            unit: item.unit,
            note: note.trim() || 'Inter-branch dispatch',
            staff: user?.name,
            createdAt: new Date().toISOString(),
          }
      if (row) {
        patchTransfer(row.id, doc)
        pushTransfer(doc)
      } else {
        upsertTransfer(doc)
        pushTransfer(doc)
      }
      refreshRows()
      setQty('1')
      setNote('')
      flash(`Dispatched ${n} ${item.unit} to ${dest.name} — in transit`)
    } finally {
      setBusy(false)
    }
  }

  function requestBranchTransfer() {
    if (busy) return
    const n = qtyNum
    const item = branchItem
    const source = otherBranches.find((b) => b.id === fromBranchId)
    if (!item || !source) {
      flash('Select item and source branch', 'err')
      return
    }
    if (!(n > 0) || !Number.isFinite(n)) {
      flash('Enter a positive quantity', 'err')
      return
    }

    setBusy(true)
    try {
      const branchId = getActiveBranchId()
      const doc: StockTransfer = {
        id: `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        branchId,
        kind: 'branch',
        status: 'requested',
        fromBranchId: source.id,
        toBranchId: branchId,
        fromBranchName: source.name,
        toBranchName: activeBranch.name,
        fromStockId: item.id,
        toStockId: item.id,
        fromName: `${source.code} · ${item.name}`,
        toName: `${activeBranch.code} · ${item.name}`,
        fromSku: item.sku,
        toSku: item.sku,
        qty: n,
        unit: item.unit,
        note: note.trim() || 'Inter-branch request',
        staff: user?.name,
        createdAt: new Date().toISOString(),
      }
      upsertTransfer(doc)
      pushTransfer(doc)
      refreshRows()
      setQty('1')
      setNote('')
      flash(`Request sent to ${source.name} · ${n} ${item.unit} ${item.sku}`)
    } finally {
      setBusy(false)
    }
  }

  function approveIncoming(row: StockTransfer) {
    if (busy) return
    const match = stock.find((s) => s.sku === row.fromSku && s.unit === row.unit)
    if (!match) {
      flash(`No matching SKU (${row.fromSku}) at this branch — create stock first`, 'err')
      return
    }
    if (row.fromSku && row.toSku && row.fromSku !== row.toSku) {
      flash('Branch transfer requires the same SKU at both branches', 'err')
      return
    }
    setBusy(true)
    try {
      adjustStock(match.id, row.qty, `Branch transfer from ${row.fromBranchName ?? 'peer'}`, {
        quiet: true,
      })
      const updated: StockTransfer = {
        ...row,
        status: 'received',
        receivedAt: new Date().toISOString(),
        toStockId: match.id,
        toName: `${activeBranch.code} · ${match.name}`,
      }
      patchTransfer(row.id, updated)
      pushTransfer(updated)
      refreshRows()
      flash(`Received ${row.qty} ${row.unit} · ${match.name}`)
    } finally {
      setBusy(false)
    }
  }

  function transferProduction() {
    if (busy) return
    const raw = qtyNum
    if (!prodFrom || !prodTo) {
      flash('Select raw and output items', 'err')
      return
    }
    if (prodFrom.id === prodTo.id) {
      flash('Invalid conversion pair', 'err')
      return
    }
    const link = findYieldLink(prodFrom.sku, prodTo.sku)
    if (!link) {
      flash('Only linked raw → prepped conversions are allowed', 'err')
      return
    }
    if (prodFrom.unit !== prodTo.unit) {
      flash(`Units must match (${prodFrom.unit} vs ${prodTo.unit})`, 'err')
      return
    }
    if (!(raw > 0) || !Number.isFinite(raw) || !(outputQty > 0)) {
      flash('Enter raw qty and valid yield %', 'err')
      return
    }
    if (prodFrom.onHand < raw) {
      flash(`Not enough raw stock (${prodFrom.onHand} ${prodFrom.unit})`, 'err')
      return
    }

    setBusy(true)
    try {
      const branchId = getActiveBranchId()
      adjustStock(prodFrom.id, -raw, undefined, { quiet: true })
      adjustStock(prodTo.id, outputQty, undefined, { quiet: true })
      const ratio = Math.round((outputQty / raw) * 1000) / 1000
      const doc: StockTransfer = {
        id: `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        branchId,
        kind: 'production',
        status: 'completed',
        fromStockId: prodFrom.id,
        toStockId: prodTo.id,
        fromName: prodFrom.name,
        toName: prodTo.name,
        fromSku: prodFrom.sku,
        toSku: prodTo.sku,
        qty: outputQty,
        rawQty: raw,
        outputQty,
        yieldRatio: ratio,
        unit: prodFrom.unit,
        note: note.trim() || 'Batch prep / yield',
        staff: user?.name,
        createdAt: new Date().toISOString(),
      }
      upsertTransfer(doc)
      pushTransfer(doc)
      refreshRows()
      setQty('1')
      setNote('')
      flash(`Produced ${outputQty} ${prodTo.unit} from ${raw} ${prodFrom.unit} raw`)
    } finally {
      setBusy(false)
    }
  }

  const locFromAfter =
    locItem && Number.isFinite(qtyNum) && qtyNum > 0 ? Math.max(0, locFromQty - qtyNum) : null
  const locToAfter =
    locItem && Number.isFinite(qtyNum) && qtyNum > 0 ? locToQty + qtyNum : null

  if (!canAccess) {
    return (
      <div className="zk-xfer-desk">
        <DashHeader search={query} onSearchChange={setQuery} brandTo="/inventory" />
        <div className="xfer-page-inner">
          <div className="xfer-empty locked">
            <strong>Stock transfer locked</strong>
            <p>Only Admin / stock roles can transfer inventory.</p>
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
    <div className="zk-xfer-desk">
      <DashHeader search={query} onSearchChange={setQuery} brandTo="/inventory" />

      <div className="xfer-page-inner">
        <header className="xfer-hero">
          <div className="xfer-hero-brand">
            <span className="xfer-hero-mark">
              <IconSwap />
            </span>
            <div>
              <h1>Stock transfer</h1>
              <p>
                Sub-location · inter-branch · production yield — {rows.length} logged
                {pendingCount ? ` · ${pendingCount} waiting to sync` : ''}
              </p>
            </div>
          </div>
          <div className="xfer-hero-stats">
            <span className={`xfer-stat tone-sync${online ? '' : ' warn'}`}>
              <IconCloud />
              <strong>{online ? 'Online' : 'Offline'}</strong>
              <em>{online ? (queued ? `${queued} queued` : 'Synced') : 'Local only'}</em>
            </span>
            <span className="xfer-stat tone-sku">
              <IconBox />
              <strong className="mesa-ltr-nums">{stock.length}</strong>
              <em>SKUs</em>
            </span>
            <span className="xfer-stat tone-xfer">
              <IconList />
              <strong className="mesa-ltr-nums">{rows.length}</strong>
              <em>Transfers</em>
            </span>
          </div>
          <div className="xfer-hero-actions">
            <Link to="/inventory" className="xfer-link-btn">
              <IconBox /> Stock
            </Link>
            <Link to="/settings/inventory/locations" className="xfer-link-btn">
              Locations master
            </Link>
            <Link to="/settings/inventory/yield" className="xfer-link-btn">
              Yield master
            </Link>
            <Link to="/purchase-orders" className="xfer-link-btn primary">
              Purchase orders
            </Link>
          </div>
        </header>

        <div className="xfer-layout">
          <section className="xfer-form-card">
            <div className="xfer-form-head">
              <div className="xfer-mode-tabs" role="tablist" aria-label="Transfer type">
                <button
                  type="button"
                  className={mode === 'location' ? 'on' : ''}
                  onClick={() => setMode('location')}
                >
                  Sub-location
                </button>
                <button
                  type="button"
                  className={mode === 'branch' ? 'on' : ''}
                  onClick={() => setMode('branch')}
                >
                  Branch
                </button>
                <button
                  type="button"
                  className={mode === 'production' ? 'on' : ''}
                  onClick={() => setMode('production')}
                >
                  Production
                </button>
              </div>
              {!online ? (
                <span className="xfer-pill offline">Offline — saves locally</span>
              ) : pendingCount ? (
                <span className="xfer-pill pending">{pendingCount} syncing</span>
              ) : (
                <span className="xfer-pill online">Ready</span>
              )}
            </div>

            {mode === 'location' ? (
              <>
                <XferRules>
                  <XferRule>Single SKU</XferRule>
                  <XferRule>Location changes</XferRule>
                  <XferRule>On-hand unchanged</XferRule>
                </XferRules>
                <p className="xfer-mode-lead">
                  Move stock between storage areas inside this restaurant (e.g. Walk-in refrigerator →
                  Beverage / bar counter). Fresh Milk stays Fresh Milk — only the location split
                  updates.
                </p>
                <div className="xfer-examples">
                  <p>
                    <strong>Example:</strong> Fresh Milk · 12 L from Walk-in refrigerator → Beverage /
                    bar counter (bartender restock for the shift).
                  </p>
                  <p>
                    <strong>Example:</strong> All-Purpose Flour · 10 kg from Central dry store →
                    Bakery / pastry line.
                  </p>
                </div>
                <label className="xfer-field">
                  <span>Item</span>
                  <MesaSelect
                    aria-label="Stock item"
                    value={locStockId}
                    onChange={setLocStockId}
                    options={stockOptions}
                    placeholder="Select item"
                  />
                  {locItem ? (
                    <em className="xfer-field-hint mesa-ltr-nums">
                      Total {locItem.onHand} {locItem.unit} (unchanged after move)
                      {locIngredient?.defaultLocationId
                        ? ` · home ${stockLocationLabel(locIngredient.defaultLocationId)}`
                        : ''}
                    </em>
                  ) : null}
                </label>

                <label className="xfer-field">
                  <span>From location</span>
                  <MesaSelect
                    aria-label="From location"
                    value={fromLoc}
                    onChange={(v) => setFromLoc(v as StockLocationId)}
                    options={locationOptions}
                  />
                  {locItem ? (
                    <em className="xfer-field-hint mesa-ltr-nums">
                      {stockLocationLabel(fromLoc)} {locFromQty} {locItem.unit}
                      {locFromAfter != null ? ` → ${locFromAfter}` : ''}
                    </em>
                  ) : null}
                </label>

                <div className="xfer-swap-row">
                  <button type="button" className="xfer-swap-btn" onClick={swapLocations} title="Swap locations">
                    <IconSwap /> Swap
                  </button>
                </div>

                <label className="xfer-field">
                  <span>To location</span>
                  <MesaSelect
                    aria-label="To location"
                    value={toLoc}
                    onChange={(v) => setToLoc(v as StockLocationId)}
                    options={locationOptions}
                  />
                  {locItem ? (
                    <em className="xfer-field-hint mesa-ltr-nums">
                      {stockLocationLabel(toLoc)} {locToQty} {locItem.unit}
                      {locToAfter != null ? ` → ${locToAfter}` : ''}
                    </em>
                  ) : null}
                </label>

                <div className="xfer-form-grid">
                  <label className="xfer-field">
                    <span>Quantity</span>
                    <input
                      className="xfer-input mesa-ltr-nums"
                      type="number"
                      min={0}
                      step="0.01"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </label>
                  <label className="xfer-field">
                    <span>Note</span>
                    <input
                      className="xfer-input"
                      value={note}
                      placeholder="Optional"
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="xfer-submit"
                  disabled={busy || !locItem || fromLoc === toLoc}
                  onClick={transferLocation}
                >
                  {busy ? 'Transferring…' : online ? 'Move to station' : 'Save offline'}
                </button>
              </>
            ) : mode === 'branch' ? (
              <>
                <XferRules>
                  <XferRule>Single SKU</XferRule>
                  <XferRule>Request → dispatch → receive</XferRule>
                </XferRules>
                <p className="xfer-mode-lead">
                  Move the same SKU between branches (e.g. Riyadh → Jeddah). Arborio Rice stays
                  Arborio Rice at both ends.
                </p>
                <div className="xfer-branch-flow" role="tablist" aria-label="Branch workflow">
                  <button
                    type="button"
                    className={branchFlow === 'send' ? 'on' : ''}
                    onClick={() => setBranchFlow('send')}
                  >
                    Send / dispatch
                  </button>
                  <button
                    type="button"
                    className={branchFlow === 'request' ? 'on' : ''}
                    onClick={() => setBranchFlow('request')}
                  >
                    Request from branch
                  </button>
                </div>
                {otherBranches.length === 0 ? (
                  <p className="xfer-warn">Only one branch is active — add branches in Company settings.</p>
                ) : null}
                {branchFlow === 'send' ? (
                  <>
                    <label className="xfer-field">
                      <span>To branch</span>
                      <MesaSelect
                        aria-label="Destination branch"
                        value={toBranchId}
                        onChange={setToBranchId}
                        options={branchOptions}
                        placeholder="Select branch"
                      />
                    </label>
                  </>
                ) : (
                  <label className="xfer-field">
                    <span>Request from branch</span>
                    <MesaSelect
                      aria-label="Source branch"
                      value={fromBranchId}
                      onChange={setFromBranchId}
                      options={branchOptions}
                      placeholder="Select source branch"
                    />
                  </label>
                )}
                <label className="xfer-field">
                  <span>Item (same SKU)</span>
                  <MesaSelect
                    aria-label="Stock item"
                    value={branchStockId}
                    onChange={setBranchStockId}
                    options={stockOptions}
                  />
                  {branchItem ? (
                    <em className="xfer-field-hint mesa-ltr-nums">
                      On hand {branchItem.onHand} {branchItem.unit} · {branchItem.sku}
                    </em>
                  ) : null}
                </label>
                <div className="xfer-form-grid">
                  <label className="xfer-field">
                    <span>{branchFlow === 'send' ? 'Dispatch qty' : 'Request qty'}</span>
                    <input
                      className="xfer-input mesa-ltr-nums"
                      type="number"
                      min={0}
                      step="0.01"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                    />
                  </label>
                  <label className="xfer-field">
                    <span>Note</span>
                    <input
                      className="xfer-input"
                      value={note}
                      placeholder="Optional"
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="xfer-submit"
                  disabled={
                    busy ||
                    !branchItem ||
                    otherBranches.length === 0 ||
                    (branchFlow === 'send' ? !toBranchId : !fromBranchId)
                  }
                  onClick={branchFlow === 'send' ? () => dispatchBranchTransfer() : requestBranchTransfer}
                >
                  {busy
                    ? branchFlow === 'send'
                      ? 'Dispatching…'
                      : 'Submitting…'
                    : branchFlow === 'send'
                      ? 'Dispatch (in transit)'
                      : 'Submit request'}
                </button>

                {pendingDispatch.length ? (
                  <div className="xfer-incoming tone-dispatch">
                    <h3>Requests to approve &amp; dispatch</h3>
                    <ul>
                      {pendingDispatch.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong className="mesa-ltr-nums">
                              {row.qty} {row.unit}
                            </strong>{' '}
                            {row.fromSku}
                            <em> requested by {row.toBranchName}</em>
                          </div>
                          <button
                            type="button"
                            className="btn btn-teal"
                            onClick={() => dispatchBranchTransfer(row)}
                          >
                            Approve &amp; dispatch
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {myRequests.length ? (
                  <div className="xfer-incoming tone-request">
                    <h3>Your open requests</h3>
                    <ul>
                      {myRequests.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong className="mesa-ltr-nums">
                              {row.qty} {row.unit}
                            </strong>{' '}
                            {row.fromSku}
                            <em> from {row.fromBranchName}</em>
                          </div>
                          <span className="xfer-pill pending">Awaiting dispatch</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {incoming.length ? (
                  <div className="xfer-incoming">
                    <h3>Incoming — approve receipt</h3>
                    <ul>
                      {incoming.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong className="mesa-ltr-nums">
                              {row.qty} {row.unit}
                            </strong>{' '}
                            {row.fromName}
                            <em> from {row.fromBranchName}</em>
                          </div>
                          <button type="button" className="btn btn-teal" onClick={() => approveIncoming(row)}>
                            Approve receive
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="xfer-mode-foot">
                  Wrong SKU entry? Use <Link to="/inventory">Stock → Adjust</Link> with reason{' '}
                  <strong>Entry mistake</strong> — not transfer.
                </p>
              </>
            ) : (
              <>
                <XferRules>
                  <XferRule>Raw SKU → prepped SKU</XferRule>
                  <XferRule>Linked conversions only</XferRule>
                  <XferRule>Same location</XferRule>
                </XferRules>
                <p className="xfer-mode-lead">
                  Convert raw into prepped stock at this branch (e.g. Whole Paneer → Paneer Cubes,
                  Raw Potatoes → French Fry Cuts). Only pairs defined in Yield conversions.
                </p>
                {conversions.length === 0 ? (
                  <p className="xfer-warn">
                    No yield conversions configured. Add raw → prepped links in{' '}
                    <Link to="/settings/inventory/yield">Settings → Yield conversions</Link>.
                  </p>
                ) : (
                  <>
                    <label className="xfer-field">
                      <span>Prep conversion</span>
                      <MesaSelect
                        aria-label="Yield conversion"
                        value={conversionId || activeConversion?.link.id || ''}
                        onChange={setConversionId}
                        options={conversionOptions}
                      />
                      {activeConversion?.link.note ? (
                        <em className="xfer-field-hint">{activeConversion.link.note}</em>
                      ) : null}
                    </label>
                    {prodFrom && prodTo ? (
                      <div className="xfer-conversion-pair">
                        <div>
                          <span>From (raw)</span>
                          <strong>{prodFrom.name}</strong>
                          <em className="mesa-ltr-nums">
                            {prodFrom.sku} · on hand {prodFrom.onHand} {prodFrom.unit}
                          </em>
                        </div>
                        <span aria-hidden>→</span>
                        <div>
                          <span>To (prepped)</span>
                          <strong>{prodTo.name}</strong>
                          <em className="mesa-ltr-nums">
                            {prodTo.sku} · on hand {prodTo.onHand} {prodTo.unit}
                          </em>
                        </div>
                      </div>
                    ) : null}
                    <div className="xfer-form-grid">
                      <label className="xfer-field">
                        <span>Raw qty used</span>
                        <input
                          className="xfer-input mesa-ltr-nums"
                          type="number"
                          min={0}
                          step="0.01"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                        />
                      </label>
                      <label className="xfer-field">
                        <span>Yield %</span>
                        <input
                          className="xfer-input mesa-ltr-nums"
                          type="number"
                          min={1}
                          max={100}
                          step="1"
                          value={yieldPct}
                          onChange={(e) => setYieldPct(e.target.value)}
                        />
                      </label>
                    </div>
                    {prodFrom && prodTo ? (
                      <p className="xfer-field-hint mesa-ltr-nums">
                        Output: <strong>{outputQty}</strong> {prodTo.unit} ({yieldPct}% yield)
                      </p>
                    ) : null}
                    <label className="xfer-field">
                      <span>Note</span>
                      <input
                        className="xfer-input"
                        value={note}
                        placeholder="Butcher prep, batch cook…"
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="xfer-submit"
                      disabled={busy || !prodFrom || !prodTo || conversions.length === 0}
                      onClick={transferProduction}
                    >
                      {busy ? 'Processing…' : 'Record production'}
                    </button>
                    <p className="xfer-mode-foot">
                      Wrong item logged? Use <Link to="/inventory">Stock → Adjust</Link> with{' '}
                      <strong>Entry mistake</strong> — never transfer unrelated SKUs (e.g. rice →
                      espresso).
                    </p>
                  </>
                )}
              </>
            )}
          </section>

          <section className="xfer-history-card">
            <div className="xfer-form-head">
              <h2>Recent transfers</h2>
              <span className="mesa-ltr-nums xfer-muted">{filteredHistory.length}</span>
            </div>

            {pageItems.length === 0 ? (
              <div className="xfer-empty">
                <strong>No transfers yet</strong>
                <p>Sub-location, branch, and production moves appear here.</p>
              </div>
            ) : (
              <>
                <div className="xfer-table-wrap">
                  <table className="xfer-table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Move</th>
                        <th>When</th>
                        <th>Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((row) => {
                        const pending = pendingTransferIds.has(row.id)
                        return (
                          <tr key={row.id}>
                            <td className="mesa-ltr-nums">
                              <strong>
                                {row.qty} {row.unit}
                              </strong>
                            </td>
                            <td>
                              <div className="xfer-move">
                                <span className={`xfer-kind ${row.kind ?? 'location'}`}>
                                  {row.kind === 'branch'
                                    ? 'Branch'
                                    : row.kind === 'production'
                                      ? 'Yield'
                                      : 'Sub-loc'}
                                </span>
                                <strong title={row.fromName}>{row.fromName}</strong>
                                <span aria-hidden>→</span>
                                <strong title={row.toName}>{row.toName}</strong>
                              </div>
                              {row.status === 'requested' ? (
                                <em className="xfer-note">Requested</em>
                              ) : row.status === 'in_transit' ? (
                                <em className="xfer-note">In transit</em>
                              ) : row.status === 'received' ? (
                                <em className="xfer-note">Received</em>
                              ) : null}
                              {row.note ? <em className="xfer-note">{row.note}</em> : null}
                            </td>
                            <td>
                              <span className="xfer-when">
                                {new Date(row.createdAt).toLocaleString()}
                              </span>
                              {row.staff ? <em className="xfer-note">{row.staff}</em> : null}
                            </td>
                            <td>
                              <span className={`xfer-sync ${pending ? (online ? 'pending' : 'offline') : 'ok'}`}>
                                {pending ? (online ? 'Queued' : 'Offline') : 'Synced'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="xfer-pager">
                  <span className="mesa-ltr-nums">
                    {(safePage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safePage * PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length}
                  </span>
                  <div className="xfer-pager-actions">
                    <button
                      type="button"
                      className="xfer-page-btn"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="xfer-page-btn"
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
      </div>

      <HubFooter backTo="/inventory" backLabel={t.inventory} />
    </div>
  )
}
