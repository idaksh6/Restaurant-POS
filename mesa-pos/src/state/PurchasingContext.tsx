import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getActiveBranchId } from '../data/company'
import { tenantGetItem, tenantSetItem } from '../data/repos/db'
import type {
  POLine,
  PurchaseOrder,
  Supplier,
  VendorLedgerEntry,
  VendorLedgerKind,
} from '../data/purchasing'
import {
  DEMO_PO_IDS,
  deriveStatus,
  ensureDefaultSuppliers,
  fromApiPO,
  isDemoVendor,
  loadAllPOs,
  mergeRemotePOs,
  posForBranch,
  saveAllPOs,
} from '../data/purchasing'
import {
  loadAllReceipts,
  nextReceiveNumber,
  receiptsForBranch,
  saveAllReceipts,
  type StockReceipt,
  type StockReceiptLine,
} from '../data/stockReceiving'
import {
  apiDeleteVendor,
  apiListPurchaseOrders,
  apiListVendors,
  apiMastersReady,
  apiPutPurchaseOrder,
  apiPutReceipt,
  apiPutVendor,
  apiPutVendorLedger,
  type ApiVendor,
  type ApiVendorLedger,
} from '../lib/apiMasters'
import { dropPendingUpsertsFor, enqueueOutbox, loadOutbox } from '../sync/outbox'
import { getDeviceId } from '../sync/deviceId'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { useSync } from '../sync/SyncContext'
import { useI18n } from '../locale/i18n'
import { usePos } from './PosContext'

type PurchasingContextValue = {
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  vendorLedger: VendorLedgerEntry[]
  saveSupplier: (supplier: Supplier) => void
  deleteSupplier: (id: string) => void
  addVendorLedgerEntry: (input: {
    supplierId: string
    description: string
    debit: number
    credit: number
    kind: VendorLedgerKind
    date?: string
  }) => void
  createPO: (input: {
    supplierId: string
    lines: Omit<POLine, 'qtyReceived'>[]
    notes?: string
  }) => PurchaseOrder
  updatePO: (id: string, patch: Partial<PurchaseOrder>) => void
  markOrdered: (id: string) => void
  cancelPO: (id: string) => void
  receivePO: (
    poId: string,
    receipts: { stockId: string; qty: number }[],
  ) => { ok: boolean; message: string }
}

const SUP_KEY = 'mesa-suppliers'
const LEDGER_KEY = 'mesa-vendor-ledger'
const DEMO_LEDGER_IDS = new Set(['vl-1', 'vl-2', 'vl-3'])

function fromApiVendor(row: ApiVendor): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    phone2: row.phone2 ?? '',
    email: row.email ?? '',
    taxId: row.taxId ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    active: row.active !== false,
  }
}

function fromApiLedger(row: ApiVendorLedger): VendorLedgerEntry {
  return {
    id: row.id,
    supplierId: row.vendorId,
    date: row.date,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    kind: (row.kind as VendorLedgerKind) || 'adjust',
  }
}

function pushVendor(supplier: Supplier) {
  if (isDemoVendor(supplier.id)) return
  if (apiMastersReady()) {
    void apiPutVendor(supplier)
      .then(() => dropPendingUpsertsFor(supplier.id, 'vendor.upsert'))
      .catch(() => enqueueOutbox('vendor.upsert', supplier.id, supplier, getDeviceId(), null))
  } else {
    enqueueOutbox('vendor.upsert', supplier.id, supplier, getDeviceId(), null)
  }
}

function pushLedger(entry: VendorLedgerEntry) {
  if (DEMO_LEDGER_IDS.has(entry.id) || isDemoVendor(entry.supplierId)) return
  const payload = { ...entry, vendorId: entry.supplierId }
  if (apiMastersReady()) {
    void apiPutVendorLedger(payload)
      .then(() => dropPendingUpsertsFor(entry.id, 'vendorLedger.upsert'))
      .catch(() => enqueueOutbox('vendorLedger.upsert', entry.id, entry, getDeviceId(), null))
  } else {
    enqueueOutbox('vendorLedger.upsert', entry.id, entry, getDeviceId(), null)
  }
}

function persistPO(row: PurchaseOrder) {
  if (DEMO_PO_IDS.has(row.id) || isDemoVendor(row.supplierId)) return
  if (apiMastersReady()) {
    void apiPutPurchaseOrder(row)
      .then(() => dropPendingUpsertsFor(row.id, 'po.upsert'))
      .catch(() => enqueueOutbox('po.upsert', row.id, row, getDeviceId(), row.branchId))
  } else {
    enqueueOutbox('po.upsert', row.id, row, getDeviceId(), row.branchId)
  }
}

function persistReceipt(row: StockReceipt) {
  if (apiMastersReady()) {
    void apiPutReceipt(row)
      .then(() => dropPendingUpsertsFor(row.id, 'receipt.upsert'))
      .catch(() => enqueueOutbox('receipt.upsert', row.id, row, getDeviceId(), row.branchId))
  } else {
    enqueueOutbox('receipt.upsert', row.id, row, getDeviceId(), row.branchId)
  }
}

const PurchasingContext = createContext<PurchasingContextValue | null>(null)

function loadSuppliers(): Supplier[] {
  try {
    const raw = tenantGetItem(SUP_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Supplier[]
      if (Array.isArray(parsed)) {
        const hadReal = parsed.some((s) => !isDemoVendor(s.id))
        const next = ensureDefaultSuppliers(parsed)
        if (!hadReal && next.length) saveSuppliers(next)
        return next
      }
    }
  } catch {
    /* ignore */
  }
  const seeded = ensureDefaultSuppliers([])
  saveSuppliers(seeded)
  return seeded
}

function loadLedger(): VendorLedgerEntry[] {
  try {
    const raw = tenantGetItem(LEDGER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as VendorLedgerEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => !DEMO_LEDGER_IDS.has(e.id) && !isDemoVendor(e.supplierId))
  } catch {
    return []
  }
}

function saveSuppliers(rows: Supplier[]) {
  tenantSetItem(SUP_KEY, JSON.stringify(rows))
}

function saveLedger(rows: VendorLedgerEntry[]) {
  tenantSetItem(LEDGER_KEY, JSON.stringify(rows.slice(0, 2000)))
}

export function PurchasingProvider({ children }: { children: ReactNode }) {
  const { token, companyId } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const { t } = useI18n()
  const { receiveStock, flash, stock } = usePos()
  const [suppliers, setSuppliers] = useState<Supplier[]>(loadSuppliers)
  const [allPOs, setAllPOs] = useState<PurchaseOrder[]>(() => loadAllPOs())
  const [vendorLedger, setVendorLedger] = useState<VendorLedgerEntry[]>(loadLedger)

  const purchaseOrders = useMemo(
    () => posForBranch(allPOs, activeBranchId),
    [allPOs, activeBranchId],
  )

  useEffect(() => {
    let cancelled = false
    setSuppliers(loadSuppliers())
    setVendorLedger(loadLedger())
    setAllPOs(loadAllPOs())
    if (!apiMastersReady()) return
    void (async () => {
      const branchId = getActiveBranchId()
      try {
        const remote = await apiListVendors()
        if (cancelled) return
        const remoteVendors = (remote.vendors ?? [])
          .map(fromApiVendor)
          .filter((s) => !isDemoVendor(s.id))
        const vendors = ensureDefaultSuppliers(remoteVendors)
        const ledger = (remote.ledger ?? [])
          .map(fromApiLedger)
          .filter((e) => !DEMO_LEDGER_IDS.has(e.id) && !isDemoVendor(e.supplierId))
        saveSuppliers(vendors)
        saveLedger(ledger)
        setSuppliers(vendors)
        setVendorLedger(ledger)
        if (!remoteVendors.length && vendors.length) {
          for (const v of vendors) pushVendor(v)
        }
      } catch {
        /* keep local cache */
      }
      try {
        const remotePOs = (await apiListPurchaseOrders(branchId)) as Record<string, unknown>[]
        if (cancelled) return
        const pending = loadOutbox()
          .filter((o) => o.type === 'po.upsert' && (o.status === 'pending' || o.status === 'syncing'))
          .map((o) => o.payload as PurchaseOrder)
        const merged = mergeRemotePOs(loadAllPOs(), remotePOs.map(fromApiPO), branchId, pending)
        saveAllPOs(merged)
        setAllPOs(merged)
      } catch {
        /* keep local POs */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId, syncEpoch, activeBranchId])

  const saveSupplier = useCallback((supplier: Supplier) => {
    if (isDemoVendor(supplier.id)) return
    setSuppliers((prev) => {
      const isNew = !prev.some((s) => s.id === supplier.id)
      const next = isNew
        ? [...prev, supplier]
        : prev.map((s) => (s.id === supplier.id ? supplier : s))
      saveSuppliers(next)
      return next
    })
    pushVendor(supplier)
    setVendorLedger((prev) => {
      if (prev.some((e) => e.supplierId === supplier.id)) return prev
      const opening: VendorLedgerEntry = {
        id: `vl-${Date.now()}`,
        supplierId: supplier.id,
        date: new Date().toISOString().slice(0, 10),
        description: t.balanceBroughtForward,
        debit: 0,
        credit: 0,
        kind: 'opening',
      }
      const next = [...prev, opening]
      saveLedger(next)
      pushLedger(opening)
      return next
    })
  }, [t])

  const deleteSupplier = useCallback((id: string) => {
    setSuppliers((prev) => {
      const next = prev.filter((s) => s.id !== id)
      saveSuppliers(next)
      return next
    })
    setVendorLedger((prev) => {
      const next = prev.filter((e) => e.supplierId !== id)
      saveLedger(next)
      return next
    })
    enqueueOutbox('vendor.delete', id, { id }, getDeviceId(), null)
    if (apiMastersReady()) void apiDeleteVendor(id).catch(() => undefined)
  }, [])

  const addVendorLedgerEntry = useCallback(
    (input: {
      supplierId: string
      description: string
      debit: number
      credit: number
      kind: VendorLedgerKind
      date?: string
    }) => {
      const entry: VendorLedgerEntry = {
        id: `vl-${Date.now()}`,
        supplierId: input.supplierId,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        description: input.description,
        debit: Math.round((input.debit || 0) * 100) / 100,
        credit: Math.round((input.credit || 0) * 100) / 100,
        kind: input.kind,
      }
      setVendorLedger((prev) => {
        const next = [...prev, entry]
        saveLedger(next)
        return next
      })
      pushLedger(entry)
      flash(
        input.kind === 'cash' || input.kind === 'card'
          ? `Payment recorded (${input.kind})`
          : 'Ledger updated',
      )
    },
    [flash],
  )

  const upsertLocalPO = useCallback((row: PurchaseOrder) => {
    setAllPOs((prev) => {
      const next = prev.some((p) => p.id === row.id)
        ? prev.map((p) => (p.id === row.id ? row : p))
        : [row, ...prev]
      saveAllPOs(next)
      return next
    })
    persistPO(row)
  }, [])

  const createPO = useCallback(
    (input: { supplierId: string; lines: Omit<POLine, 'qtyReceived'>[]; notes?: string }) => {
      const po: PurchaseOrder = {
        id: `po-${Date.now()}`,
        branchId: getActiveBranchId(),
        supplierId: input.supplierId,
        status: 'draft',
        createdAt: new Date().toISOString(),
        notes: input.notes,
        lines: input.lines.map((l) => ({
          stockId: l.stockId,
          qtyOrdered: l.qtyOrdered,
          qtyReceived: 0,
          unitCost: l.unitCost,
        })),
      }
      upsertLocalPO(po)
      return po
    },
    [upsertLocalPO],
  )

  const updatePO = useCallback((id: string, patch: Partial<PurchaseOrder>) => {
    setAllPOs((prev) => {
      const current = prev.find((p) => p.id === id)
      if (!current) return prev
      const row = { ...current, ...patch, branchId: current.branchId ?? getActiveBranchId() }
      const next = prev.map((p) => (p.id === id ? row : p))
      saveAllPOs(next)
      persistPO(row)
      return next
    })
  }, [])

  const markOrdered = useCallback(
    (id: string) => {
      setAllPOs((prev) => {
        const current = prev.find((p) => p.id === id)
        if (!current || (current.status !== 'draft' && current.status !== 'ordered')) return prev
        const row = { ...current, status: 'ordered' as const, branchId: current.branchId ?? getActiveBranchId() }
        const next = prev.map((p) => (p.id === id ? row : p))
        saveAllPOs(next)
        persistPO(row)
        return next
      })
      flash('PO marked ordered')
    },
    [flash],
  )

  const cancelPO = useCallback(
    (id: string) => {
      setAllPOs((prev) => {
        const current = prev.find((p) => p.id === id)
        if (!current || current.status === 'received') return prev
        const row = { ...current, status: 'cancelled' as const, branchId: current.branchId ?? getActiveBranchId() }
        const next = prev.map((p) => (p.id === id ? row : p))
        saveAllPOs(next)
        persistPO(row)
        return next
      })
      flash('PO cancelled')
    },
    [flash],
  )

  const receivePO = useCallback(
    (poId: string, receipts: { stockId: string; qty: number }[]) => {
      const po = purchaseOrders.find((p) => p.id === poId)
      if (!po) return { ok: false, message: 'PO not found' }
      if (po.status === 'cancelled' || po.status === 'draft' || po.status === 'received') {
        return { ok: false, message: `Cannot receive PO in status ${po.status}` }
      }

      const applied: { stockId: string; qty: number; unitCost: number }[] = []
      let invoiceTotal = 0
      const nextLines = po.lines.map((line) => {
        const receipt = receipts.find((r) => r.stockId === line.stockId)
        const want = receipt?.qty ?? 0
        if (want <= 0) return line
        const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived)
        const qty = Math.min(want, remaining)
        if (qty <= 0) return line
        applied.push({ stockId: line.stockId, qty, unitCost: line.unitCost })
        invoiceTotal += qty * line.unitCost
        return { ...line, qtyReceived: Math.round((line.qtyReceived + qty) * 100) / 100 }
      })

      if (applied.length === 0) return { ok: false, message: 'Enter qty to receive' }

      const vendorName = suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierId
      receiveStock(
        applied.map(({ stockId, qty, unitCost }) => ({
          stockId,
          qty,
          cost: unitCost,
          vendorId: po.supplierId,
          vendor: vendorName,
        })),
      )
      const status = deriveStatus(nextLines, po.status === 'ordered' ? 'ordered' : po.status)
      const updated: PurchaseOrder = {
        ...po,
        branchId: po.branchId ?? getActiveBranchId(),
        lines: nextLines,
        status,
      }
      upsertLocalPO(updated)

      const branchId = updated.branchId ?? getActiveBranchId()
      const today = new Date().toISOString().slice(0, 10)
      const existingReceipts = receiptsForBranch(loadAllReceipts(), branchId)
      const receiptLines: StockReceiptLine[] = applied.map((row) => {
        const item = stock.find((s) => s.id === row.stockId)
        const total = Math.round(row.qty * row.unitCost * 100) / 100
        return {
          stockId: row.stockId,
          code: item?.sku ?? '',
          name: item?.name ?? row.stockId,
          salePrice: 0,
          costPrice: row.unitCost,
          taxPct: 0,
          qty: row.qty,
          taxAmount: 0,
          total,
        }
      })
      const netAmount = Math.round(receiptLines.reduce((s, l) => s + l.total, 0) * 100) / 100
      const receiveNumber = nextReceiveNumber(existingReceipts)
      const doc: StockReceipt = {
        id: `rcpt-${Date.now()}`,
        branchId,
        receiveNumber,
        receivingDate: today,
        invoiceNumber: poId,
        invoiceDate: today,
        supplierId: po.supplierId,
        receivingPerson: 'PO receive',
        packingQty: 1,
        notes: `Goods received · ${poId}`,
        lines: receiptLines,
        netAmount,
        createdAt: new Date().toISOString(),
      }
      saveAllReceipts([doc, ...loadAllReceipts().filter((r) => r.id !== doc.id)])
      persistReceipt(doc)

      if (invoiceTotal > 0) {
        const entry: VendorLedgerEntry = {
          id: `vl-${Date.now()}`,
          supplierId: po.supplierId,
          date: today,
          description: `Goods received · ${poId}`,
          debit: Math.round(invoiceTotal * 100) / 100,
          credit: 0,
          kind: 'invoice',
        }
        setVendorLedger((prev) => {
          const next = [...prev, entry]
          saveLedger(next)
          return next
        })
        pushLedger(entry)
      }

      flash(`Received ${applied.length} line(s) on ${poId}`)
      return { ok: true, message: `Stock updated · PO ${status}` }
    },
    [flash, purchaseOrders, receiveStock, stock, suppliers, upsertLocalPO],
  )

  const value = useMemo(
    () => ({
      suppliers,
      purchaseOrders,
      vendorLedger,
      saveSupplier,
      deleteSupplier,
      addVendorLedgerEntry,
      createPO,
      updatePO,
      markOrdered,
      cancelPO,
      receivePO,
    }),
    [
      suppliers,
      purchaseOrders,
      vendorLedger,
      saveSupplier,
      deleteSupplier,
      addVendorLedgerEntry,
      createPO,
      updatePO,
      markOrdered,
      cancelPO,
      receivePO,
    ],
  )

  return <PurchasingContext.Provider value={value}>{children}</PurchasingContext.Provider>
}

export function usePurchasing() {
  const ctx = useContext(PurchasingContext)
  if (!ctx) throw new Error('usePurchasing must be used within PurchasingProvider')
  return ctx
}
