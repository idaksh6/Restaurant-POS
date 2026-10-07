import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fromApiGiftCard,
  giftBalance,
  isDemoGiftCard,
  loadGiftCards,
  saveGiftCards,
  type GiftCard,
} from '../data/giftCards'
import {
  fromApiTimetable,
  isDemoTimetable,
  loadTimetables,
  saveTimetables,
  type MenuTimetable,
} from '../data/menuTimetable'
import {
  fromApiExpenseDetail,
  fromApiExpenseType,
  fromApiPaymentType,
  isDemoExpenseDetail,
  isDemoExpenseType,
  isDemoPaymentType,
  ensurePaymentTypes,
  loadExpenseDetails,
  loadExpenseTypes,
  loadPaymentTypes,
  saveExpenseDetails,
  saveExpenseTypes,
  savePaymentTypes,
  type ExpenseDetail,
  type ExpenseType,
  type PaymentType,
} from '../data/paymentTypes'
import { fromApiTax, isDemoTax, loadTaxes, saveTaxes, type TaxRate } from '../data/tax'
import {
  fromApiDiscount,
  loadDiscounts,
  saveDiscounts,
  type DiscountRate,
} from '../data/discount'
import { fromApiUnit, isDemoUnit, loadUnits, saveUnits, type MeasureUnit } from '../data/units'
import {
  fromApiBeveragePrice,
  fromApiBeverageQty,
  loadBeveragePrices,
  loadBeverageQtys,
  saveBeveragePrices,
  saveBeverageQtys,
  type BeveragePrice,
  type BeverageQty,
} from '../data/beverages'
import {
  fromApiAddonMaster,
  loadAddonMasters,
  saveAddonMasters,
  type AddonMasterGroup,
} from '../data/addonMasters'
import {
  fromApiCharge,
  isDemoCharge,
  loadAllCharges,
  saveAllCharges,
  type ExtraCharge,
} from '../data/charges'
import {
  fromApiRider,
  isDemoRider,
  loadAllRiders,
  saveAllRiders,
  type DeliveryRider,
} from '../data/deliveryRiders'
import {
  fromApiPrinter,
  loadAllPrinters,
  saveAllPrinters,
  type PrintStation,
} from '../data/printers'
import {
  fromApiTableArea,
  loadTableAreas,
  mergeRemoteTableAreas,
  toApiTableArea,
} from '../data/tableAreas'
import {
  apiDeleteCatalog,
  apiListCatalog,
  apiMastersReady,
  apiPutCatalog,
  apiRedeemGiftCard,
  type CatalogKind,
} from '../lib/apiMasters'
import { getActiveBranchId } from '../data/company'
import { getDeviceId } from '../sync/deviceId'
import { saveStockLocations } from '../data/stockLocations'
import { isSeedYieldLink, saveYieldLinks } from '../data/stockYieldLinks'
import { enqueueOutbox, dropPendingUpsertsFor, pruneRedundantOutbox } from '../sync/outbox'
import { useAuth } from './AuthContext'
import { useBranch } from './BranchContext'
import { useSync } from '../sync/SyncContext'

function listUiSig<T extends { id: string }>(
  rows: T[],
  fields: (row: T) => Array<string | number | boolean | null | undefined>,
) {
  return rows
    .map((r) => `${r.id}:${fields(r).map((v) => (v == null ? '' : String(v))).join(':')}`)
    .sort()
    .join('|')
}

function keepIfSame<T extends { id: string }>(
  prev: T[],
  next: T[],
  fields: (row: T) => Array<string | number | boolean | null | undefined>,
) {
  return listUiSig(prev, fields) === listUiSig(next, fields) ? prev : next
}

type CatalogValue = {
  giftCards: GiftCard[]
  taxes: TaxRate[]
  discounts: DiscountRate[]
  units: MeasureUnit[]
  paymentTypes: PaymentType[]
  expenseTypes: ExpenseType[]
  expenseDetails: ExpenseDetail[]
  timetables: MenuTimetable[]
  extraCharges: ExtraCharge[]
  deliveryRiders: DeliveryRider[]
  printStations: PrintStation[]
  beverageQtys: BeverageQty[]
  beveragePrices: BeveragePrice[]
  addonMasters: AddonMasterGroup[]
  saveGiftCard: (row: GiftCard) => void
  deleteGiftCard: (id: string) => void
  redeemGiftCard: (id: string, amount: number) => { ok: boolean; remaining: number }
  saveTax: (row: TaxRate) => void
  deleteTax: (id: string) => void
  saveDiscount: (row: DiscountRate) => void
  deleteDiscount: (id: string) => void
  saveUnit: (row: MeasureUnit) => void
  deleteUnit: (id: string) => void
  savePaymentType: (row: PaymentType) => void
  deletePaymentType: (id: string) => void
  saveExpenseType: (row: ExpenseType) => void
  deleteExpenseType: (id: string) => void
  saveExpenseDetail: (row: ExpenseDetail) => void
  deleteExpenseDetail: (id: string) => void
  saveTimetable: (row: MenuTimetable) => void
  deleteTimetable: (id: string) => void
  saveExtraCharge: (row: ExtraCharge) => void
  deleteExtraCharge: (id: string) => void
  saveDeliveryRider: (row: DeliveryRider) => void
  deleteDeliveryRider: (id: string) => void
  savePrintStation: (row: PrintStation) => void
  deletePrintStation: (id: string) => void
  saveBeverageQty: (row: BeverageQty) => void
  deleteBeverageQty: (id: string) => void
  saveBeveragePrice: (row: BeveragePrice) => void
  deleteBeveragePrice: (id: string) => void
  saveBeveragePricesBulk: (rows: BeveragePrice[]) => void
  saveAddonMaster: (row: AddonMasterGroup) => void
  deleteAddonMaster: (id: string) => void
}

const CatalogContext = createContext<CatalogValue | null>(null)

function pushRow(kind: CatalogKind, row: { id: string; branchId?: string }) {
  // Company-wide masters (tax, discount, …) use null branch so every till/floor pulls them.
  // Branch-stamped rows (riders, charges, …) keep their branchId.
  const branchId = row.branchId ?? null
  const body = { kind, row }
  if (apiMastersReady()) {
    void apiPutCatalog(kind, row as unknown as Record<string, unknown>)
      .then(() => {
        dropPendingUpsertsFor(row.id, 'catalog.upsert')
        pruneRedundantOutbox()
      })
      .catch(() => {
        enqueueOutbox('catalog.upsert', row.id, body, getDeviceId(), branchId)
        // Online REST is preferred; don't leave master-data backlog on the chip.
        pruneRedundantOutbox()
      })
  } else {
    enqueueOutbox('catalog.upsert', row.id, body, getDeviceId(), branchId)
  }
}

function pushDelete(kind: CatalogKind, id: string) {
  if (apiMastersReady()) {
    void apiDeleteCatalog(kind, id)
      .then(() => dropPendingUpsertsFor(id, 'catalog.upsert'))
      .catch(() => enqueueOutbox('catalog.delete', id, { kind }, getDeviceId(), null))
  } else {
    enqueueOutbox('catalog.delete', id, { kind }, getDeviceId(), null)
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { token, companyId } = useAuth()
  const { activeBranchId } = useBranch()
  const { syncEpoch } = useSync()
  const [giftCards, setGiftCards] = useState<GiftCard[]>(() => loadGiftCards())
  const [taxes, setTaxes] = useState<TaxRate[]>(() => loadTaxes())
  const [discounts, setDiscounts] = useState<DiscountRate[]>(() => loadDiscounts())
  const [units, setUnits] = useState<MeasureUnit[]>(() => loadUnits())
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>(() => loadPaymentTypes())
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>(() => loadExpenseTypes())
  const [expenseDetails, setExpenseDetails] = useState<ExpenseDetail[]>(() => loadExpenseDetails())
  const [timetables, setTimetables] = useState<MenuTimetable[]>(() => loadTimetables())
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>(() => loadAllCharges())
  const [deliveryRiders, setDeliveryRiders] = useState<DeliveryRider[]>(() => loadAllRiders())
  const [printStations, setPrintStations] = useState<PrintStation[]>(() => loadAllPrinters())
  const [beverageQtys, setBeverageQtys] = useState<BeverageQty[]>(() => loadBeverageQtys())
  const [beveragePrices, setBeveragePrices] = useState<BeveragePrice[]>(() => loadBeveragePrices())
  const [addonMasters, setAddonMasters] = useState<AddonMasterGroup[]>(() => loadAddonMasters())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Keep React references when local cache is unchanged — background sync must not blink tax UI.
      setGiftCards((prev) =>
        keepIfSame(prev, loadGiftCards(), (g) => [
          g.number,
          g.issueAmount,
          g.extraCharges,
          g.usedAmount,
          g.active ? 1 : 0,
        ]),
      )
      setTaxes((prev) =>
        keepIfSame(prev, loadTaxes(), (t) => [t.name, t.percent, t.active ? 1 : 0, t.isDefault ? 1 : 0]),
      )
      setDiscounts((prev) =>
        keepIfSame(prev, loadDiscounts(), (d) => [d.name, d.percent, d.active ? 1 : 0]),
      )
      setUnits((prev) =>
        keepIfSame(prev, loadUnits(), (u) => [u.name, u.code, u.quantity, u.kind]),
      )
      setPaymentTypes((prev) =>
        keepIfSame(prev, loadPaymentTypes(), (p) => [p.name, p.active ? 1 : 0, p.sort ?? 0]),
      )
      setExpenseTypes((prev) =>
        keepIfSame(prev, loadExpenseTypes(), (e) => [e.name, e.active ? 1 : 0]),
      )
      setExpenseDetails((prev) =>
        keepIfSame(prev, loadExpenseDetails(), (e) => [
          e.description,
          e.expenseTypeId,
          e.amount,
          e.date,
          e.branchId ?? '',
        ]),
      )
      setTimetables((prev) =>
        keepIfSame(prev, loadTimetables(), (t) => [
          t.name,
          t.active ? 1 : 0,
          (t.productIds ?? []).join(','),
          (t.departmentIds ?? []).join(','),
        ]),
      )
      setExtraCharges((prev) =>
        keepIfSame(prev, loadAllCharges(), (c) => [
          c.name,
          c.amount,
          c.percent ? 1 : 0,
          c.active ? 1 : 0,
          c.branchId ?? '',
          (c.taxIds ?? []).join(','),
        ]),
      )
      setDeliveryRiders((prev) =>
        keepIfSame(prev, loadAllRiders(), (r) => [r.name, r.active ? 1 : 0, r.branchId ?? '']),
      )
      setPrintStations((prev) =>
        keepIfSame(prev, loadAllPrinters(), (p) => [p.name, p.active ? 1 : 0]),
      )
      setBeverageQtys((prev) =>
        keepIfSame(prev, loadBeverageQtys(), (b) => [b.name, b.ml, b.active ? 1 : 0]),
      )
      setBeveragePrices((prev) =>
        keepIfSame(prev, loadBeveragePrices(), (b) => [b.productId, b.qtyId, b.price]),
      )
      setAddonMasters((prev) =>
        keepIfSame(prev, loadAddonMasters(), (a) => [a.name, a.active ? 1 : 0]),
      )
      if (!apiMastersReady()) return
      try {
        const remote = await apiListCatalog(activeBranchId)
        if (cancelled) return
        const nextCards = (remote.giftCards ?? [])
          .map(fromApiGiftCard)
          .filter((g) => !isDemoGiftCard(g.id))
        const nextTaxes = (remote.taxes ?? []).map(fromApiTax).filter((t) => !isDemoTax(t.id))
        const nextDiscounts = (remote.discounts ?? []).map(fromApiDiscount)
        const nextUnits = (remote.units ?? []).map(fromApiUnit).filter((u) => !isDemoUnit(u.id))
        const remotePays = (remote.paymentTypes ?? [])
          .map(fromApiPaymentType)
          .filter((p) => !isDemoPaymentType(p.id))
        const nextPays = ensurePaymentTypes(remotePays)
        if (remotePays.length === 0 && nextPays.length > 0) {
          for (const row of nextPays) pushRow('paymentType', row)
        }
        const nextExpTypes = (remote.expenseTypes ?? [])
          .map(fromApiExpenseType)
          .filter((e) => !isDemoExpenseType(e.id))
        const nextExpDetails = (remote.expenseDetails ?? [])
          .map(fromApiExpenseDetail)
          .filter((e) => !isDemoExpenseDetail(e.id) && !isDemoExpenseType(e.expenseTypeId))
        const nextTimes = (remote.timetables ?? [])
          .map(fromApiTimetable)
          .filter((t) => !isDemoTimetable(t.id))
        const nextCharges = (remote.extraCharges ?? [])
          .map(fromApiCharge)
          .filter((c) => !isDemoCharge(c.id))
        const nextRiders = (remote.deliveryRiders ?? [])
          .map(fromApiRider)
          .filter((r) => !isDemoRider(r.id))
        const nextPrinters = Array.isArray(remote.printStations)
          ? remote.printStations.map(fromApiPrinter)
          : loadAllPrinters()
        const remoteAreas = Array.isArray(remote.tableAreas)
          ? remote.tableAreas
              .map(fromApiTableArea)
              .filter((a) => a.id && a.name)
              .map((a) => ({ ...a, branchId: a.branchId || activeBranchId }))
          : []
        const nextBevQtys = Array.isArray(remote.beverageQtys)
          ? remote.beverageQtys.map(fromApiBeverageQty)
          : loadBeverageQtys()
        const nextBevPrices = Array.isArray(remote.beveragePrices)
          ? remote.beveragePrices.map(fromApiBeveragePrice)
          : loadBeveragePrices()
        const nextAddonMasters = Array.isArray(remote.addonMasters)
          ? remote.addonMasters.map(fromApiAddonMaster)
          : loadAddonMasters()
        saveGiftCards(nextCards)
        saveTaxes(nextTaxes)
        if (Array.isArray(remote.discounts)) {
          saveDiscounts(nextDiscounts)
          setDiscounts((prev) =>
            keepIfSame(prev, nextDiscounts, (d) => [d.name, d.percent, d.active ? 1 : 0]),
          )
        }
        saveUnits(nextUnits)
        savePaymentTypes(nextPays)
        saveExpenseTypes(nextExpTypes)
        saveExpenseDetails(nextExpDetails)
        saveTimetables(nextTimes)
        saveAllCharges(nextCharges)
        saveAllRiders(nextRiders)
        saveAllPrinters(nextPrinters)
        if (Array.isArray(remote.beverageQtys)) {
          saveBeverageQtys(nextBevQtys)
          setBeverageQtys((prev) =>
            keepIfSame(prev, nextBevQtys, (b) => [b.name, b.ml, b.active ? 1 : 0]),
          )
        }
        if (Array.isArray(remote.beveragePrices)) {
          saveBeveragePrices(nextBevPrices)
          setBeveragePrices((prev) =>
            keepIfSame(prev, nextBevPrices, (b) => [b.productId, b.qtyId, b.price]),
          )
        }
        if (Array.isArray(remote.addonMasters)) {
          saveAddonMasters(nextAddonMasters)
          setAddonMasters((prev) =>
            keepIfSame(prev, nextAddonMasters, (a) => [a.name, a.active ? 1 : 0]),
          )
        }
        if (Array.isArray(remote.stockLocations) && remote.stockLocations.length) {
          const locs = remote.stockLocations.map((row) => ({
            id: String(row.id ?? ''),
            label: String(row.label ?? '').trim() || String(row.id ?? ''),
            hint: row.hint ? String(row.hint) : undefined,
            type: (['cold', 'dry', 'station', 'other'].includes(String(row.type))
              ? String(row.type)
              : 'other') as import('../data/stockLocations').StockLocation['type'],
            active: row.active !== false,
            sortOrder: Number(row.sortOrder ?? 0) || 0,
          })).filter((r) => r.id)
          if (locs.length) saveStockLocations(locs)
        }
        if (Array.isArray(remote.yieldLinks)) {
          const links = remote.yieldLinks
            .map((row) => ({
              id: String(row.id ?? ''),
              fromSku: String(row.fromSku ?? '').trim(),
              toSku: String(row.toSku ?? '').trim(),
              defaultYieldPct: Math.min(
                100,
                Math.max(1, Math.round(Number(row.defaultYieldPct) || 100)),
              ),
              label: String(row.label ?? '').trim(),
              note: row.note ? String(row.note) : undefined,
              active: row.active !== false,
              branchId: row.branchId ? String(row.branchId) : activeBranchId,
            }))
            .filter((r) => r.id && !isSeedYieldLink(r))
          saveYieldLinks(links, activeBranchId)
        }
        if (remoteAreas.length) {
          const merged = mergeRemoteTableAreas(remoteAreas, activeBranchId)
          for (const area of merged) {
            if (!remoteAreas.some((r) => r.id === area.id)) {
              pushRow('tableArea', toApiTableArea(area) as { id: string })
            }
          }
        } else {
          // Only upload this branch's areas — never push HO catalog into a new empty branch.
          const localAreas = loadTableAreas(activeBranchId)
          for (const area of localAreas) {
            pushRow('tableArea', toApiTableArea({ ...area, branchId: activeBranchId }) as { id: string })
          }
        }
        setGiftCards((prev) =>
          keepIfSame(prev, nextCards, (g) => [
            g.number,
            g.issueAmount,
            g.extraCharges,
            g.usedAmount,
            g.active ? 1 : 0,
          ]),
        )
        setTaxes((prev) =>
          keepIfSame(prev, nextTaxes, (t) => [t.name, t.percent, t.active ? 1 : 0, t.isDefault ? 1 : 0]),
        )
        setUnits((prev) =>
          keepIfSame(prev, nextUnits, (u) => [u.name, u.code, u.quantity, u.kind]),
        )
        setPaymentTypes((prev) =>
          keepIfSame(prev, nextPays, (p) => [p.name, p.active ? 1 : 0, p.sort ?? 0]),
        )
        setExpenseTypes((prev) =>
          keepIfSame(prev, nextExpTypes, (e) => [e.name, e.active ? 1 : 0]),
        )
        setExpenseDetails((prev) =>
          keepIfSame(prev, nextExpDetails, (e) => [
            e.description,
            e.expenseTypeId,
            e.amount,
            e.date,
            e.branchId ?? '',
          ]),
        )
        setTimetables((prev) =>
          keepIfSame(prev, nextTimes, (t) => [
            t.name,
            t.active ? 1 : 0,
            (t.productIds ?? []).join(','),
            (t.departmentIds ?? []).join(','),
          ]),
        )
        setExtraCharges((prev) =>
          keepIfSame(prev, nextCharges, (c) => [
            c.name,
            c.amount,
            c.percent ? 1 : 0,
            c.active ? 1 : 0,
            c.branchId ?? '',
            (c.taxIds ?? []).join(','),
          ]),
        )
        setDeliveryRiders((prev) =>
          keepIfSame(prev, nextRiders, (r) => [r.name, r.active ? 1 : 0, r.branchId ?? '']),
        )
        setPrintStations((prev) =>
          keepIfSame(prev, nextPrinters, (p) => [p.name, p.active ? 1 : 0]),
        )
      } catch {
        /* keep local cache */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, companyId, syncEpoch, activeBranchId])

  const upsertList = useCallback(<T extends { id: string }>(rows: T[], row: T) => {
    return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]
  }, [])

  const saveGiftCard = useCallback(
    (row: GiftCard) => {
      if (isDemoGiftCard(row.id)) return
      const next = upsertList(giftCards, row)
      setGiftCards(next)
      saveGiftCards(next)
      pushRow('giftCard', row)
    },
    [giftCards, upsertList],
  )

  const deleteGiftCard = useCallback(
    (id: string) => {
      const next = giftCards.filter((g) => g.id !== id)
      setGiftCards(next)
      saveGiftCards(next)
      pushDelete('giftCard', id)
    },
    [giftCards],
  )

  const redeemGiftCardFn = useCallback(
    (id: string, amount: number) => {
      const idx = giftCards.findIndex((g) => g.id === id)
      if (idx < 0) return { ok: false, remaining: 0 }
      const card = giftCards[idx]
      const bal = giftBalance(card)
      const take = Math.round(Math.min(Math.max(0, amount), bal) * 100) / 100
      if (take <= 0) return { ok: false, remaining: bal }
      const nextCard = { ...card, usedAmount: Math.round((card.usedAmount + take) * 100) / 100 }
      const next = giftCards.map((g) => (g.id === id ? nextCard : g))
      setGiftCards(next)
      saveGiftCards(next)
      enqueueOutbox('giftCard.redeem', id, { amount: take }, getDeviceId(), null)
      if (apiMastersReady()) void apiRedeemGiftCard(id, take).catch(() => undefined)
      return { ok: true, remaining: giftBalance(nextCard) }
    },
    [giftCards],
  )

  const saveTax = useCallback(
    (row: TaxRate) => {
      if (isDemoTax(row.id)) return
      let next = upsertList(taxes, row)
      if (row.isDefault) next = next.map((t) => ({ ...t, isDefault: t.id === row.id }))
      setTaxes(next)
      saveTaxes(next)
      pushRow('tax', next.find((t) => t.id === row.id) ?? row)
    },
    [taxes, upsertList],
  )

  const deleteTax = useCallback(
    (id: string) => {
      const next = taxes.filter((t) => t.id !== id)
      setTaxes(next)
      saveTaxes(next)
      pushDelete('tax', id)
    },
    [taxes],
  )

  const saveDiscount = useCallback(
    (row: DiscountRate) => {
      let next = upsertList(discounts, row)
      if (row.isDefault) next = next.map((d) => ({ ...d, isDefault: d.id === row.id }))
      setDiscounts(next)
      saveDiscounts(next)
      pushRow('discount', next.find((d) => d.id === row.id) ?? row)
    },
    [discounts, upsertList],
  )

  const deleteDiscount = useCallback(
    (id: string) => {
      const next = discounts.filter((d) => d.id !== id)
      setDiscounts(next)
      saveDiscounts(next)
      pushDelete('discount', id)
    },
    [discounts],
  )

  const saveUnit = useCallback(
    (row: MeasureUnit) => {
      if (isDemoUnit(row.id)) return
      const next = upsertList(units, row)
      setUnits(next)
      saveUnits(next)
      pushRow('unit', row)
    },
    [units, upsertList],
  )

  const deleteUnit = useCallback(
    (id: string) => {
      const next = units.filter((u) => u.id !== id)
      setUnits(next)
      saveUnits(next)
      pushDelete('unit', id)
    },
    [units],
  )

  const savePaymentType = useCallback(
    (row: PaymentType) => {
      if (isDemoPaymentType(row.id)) return
      const name = row.name.trim()
      const clash = paymentTypes.some(
        (p) => p.id !== row.id && p.name.trim().toLowerCase() === name.toLowerCase(),
      )
      if (clash) throw new Error('Payment type name already exists')
      const stamped = { ...row, name }
      const next = upsertList(paymentTypes, stamped)
      setPaymentTypes(next)
      savePaymentTypes(next)
      pushRow('paymentType', stamped)
    },
    [paymentTypes, upsertList],
  )

  const deletePaymentType = useCallback(
    (id: string) => {
      const next = paymentTypes.filter((p) => p.id !== id)
      setPaymentTypes(next)
      savePaymentTypes(next)
      pushDelete('paymentType', id)
    },
    [paymentTypes],
  )

  const saveExpenseType = useCallback(
    (row: ExpenseType) => {
      if (isDemoExpenseType(row.id)) return
      const next = upsertList(expenseTypes, row)
      setExpenseTypes(next)
      saveExpenseTypes(next)
      pushRow('expenseType', row)
    },
    [expenseTypes, upsertList],
  )

  const deleteExpenseType = useCallback(
    (id: string) => {
      const next = expenseTypes.filter((e) => e.id !== id)
      setExpenseTypes(next)
      saveExpenseTypes(next)
      pushDelete('expenseType', id)
    },
    [expenseTypes],
  )

  const saveExpenseDetail = useCallback(
    (row: ExpenseDetail) => {
      if (isDemoExpenseDetail(row.id) || isDemoExpenseType(row.expenseTypeId)) return
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(expenseDetails, stamped)
      setExpenseDetails(next)
      saveExpenseDetails(next)
      pushRow('expenseDetail', stamped)
    },
    [expenseDetails, upsertList],
  )

  const deleteExpenseDetail = useCallback(
    (id: string) => {
      const next = expenseDetails.filter((e) => e.id !== id)
      setExpenseDetails(next)
      saveExpenseDetails(next)
      pushDelete('expenseDetail', id)
    },
    [expenseDetails],
  )

  const saveTimetable = useCallback(
    (row: MenuTimetable) => {
      if (isDemoTimetable(row.id)) return
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(timetables, stamped)
      setTimetables(next)
      saveTimetables(next)
      pushRow('timetable', stamped)
    },
    [timetables, upsertList],
  )

  const deleteTimetable = useCallback(
    (id: string) => {
      const next = timetables.filter((t) => t.id !== id)
      setTimetables(next)
      saveTimetables(next)
      pushDelete('timetable', id)
    },
    [timetables],
  )

  const saveExtraCharge = useCallback(
    (row: ExtraCharge) => {
      if (isDemoCharge(row.id)) return
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(extraCharges, stamped)
      setExtraCharges(next)
      saveAllCharges(next)
      pushRow('extraCharge', stamped)
    },
    [extraCharges, upsertList],
  )

  const deleteExtraCharge = useCallback(
    (id: string) => {
      const next = extraCharges.filter((c) => c.id !== id)
      setExtraCharges(next)
      saveAllCharges(next)
      pushDelete('extraCharge', id)
    },
    [extraCharges],
  )

  const saveDeliveryRider = useCallback(
    (row: DeliveryRider) => {
      if (isDemoRider(row.id)) return
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(deliveryRiders, stamped)
      setDeliveryRiders(next)
      saveAllRiders(next)
      pushRow('deliveryRider', stamped)
    },
    [deliveryRiders, upsertList],
  )

  const deleteDeliveryRider = useCallback(
    (id: string) => {
      const next = deliveryRiders.filter((r) => r.id !== id)
      setDeliveryRiders(next)
      saveAllRiders(next)
      pushDelete('deliveryRider', id)
    },
    [deliveryRiders],
  )

  const savePrintStation = useCallback(
    (row: PrintStation) => {
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(printStations, stamped)
      setPrintStations(next)
      saveAllPrinters(next)
      pushRow('printStation', stamped)
    },
    [printStations, upsertList],
  )

  const deletePrintStation = useCallback(
    (id: string) => {
      const next = printStations.filter((p) => p.id !== id)
      setPrintStations(next)
      saveAllPrinters(next)
      pushDelete('printStation', id)
    },
    [printStations],
  )

  const saveBeverageQty = useCallback(
    (row: BeverageQty) => {
      let next = upsertList(beverageQtys, row)
      if (row.isDefault) {
        next = next.map((q) => ({ ...q, isDefault: q.id === row.id }))
      }
      setBeverageQtys(next)
      saveBeverageQtys(next)
      pushRow('beverageQty', row)
    },
    [beverageQtys, upsertList],
  )

  const deleteBeverageQty = useCallback(
    (id: string) => {
      const nextQty = beverageQtys.filter((q) => q.id !== id)
      const nextPrices = beveragePrices.filter((p) => p.qtyId !== id)
      setBeverageQtys(nextQty)
      saveBeverageQtys(nextQty)
      setBeveragePrices(nextPrices)
      saveBeveragePrices(nextPrices)
      pushDelete('beverageQty', id)
      for (const p of beveragePrices.filter((x) => x.qtyId === id)) {
        pushDelete('beveragePrice', p.id)
      }
    },
    [beverageQtys, beveragePrices],
  )

  const saveBeveragePrice = useCallback(
    (row: BeveragePrice) => {
      const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
      const next = upsertList(beveragePrices, stamped)
      setBeveragePrices(next)
      saveBeveragePrices(next)
      pushRow('beveragePrice', stamped)
    },
    [beveragePrices, upsertList],
  )

  const deleteBeveragePrice = useCallback(
    (id: string) => {
      const next = beveragePrices.filter((p) => p.id !== id)
      setBeveragePrices(next)
      saveBeveragePrices(next)
      pushDelete('beveragePrice', id)
    },
    [beveragePrices],
  )

  const saveBeveragePricesBulk = useCallback(
    (rows: BeveragePrice[]) => {
      let next = [...beveragePrices]
      for (const row of rows) {
        const stamped = { ...row, branchId: row.branchId ?? getActiveBranchId() }
        next = next.some((p) => p.id === stamped.id)
          ? next.map((p) => (p.id === stamped.id ? stamped : p))
          : [...next, stamped]
        pushRow('beveragePrice', stamped)
      }
      setBeveragePrices(next)
      saveBeveragePrices(next)
    },
    [beveragePrices],
  )

  const saveAddonMaster = useCallback(
    (row: AddonMasterGroup) => {
      const next = upsertList(addonMasters, row)
      setAddonMasters(next)
      saveAddonMasters(next)
      pushRow('addonMaster', row as { id: string; branchId?: string })
    },
    [addonMasters, upsertList],
  )

  const deleteAddonMaster = useCallback(
    (id: string) => {
      const next = addonMasters.filter((r) => r.id !== id)
      setAddonMasters(next)
      saveAddonMasters(next)
      pushDelete('addonMaster', id)
    },
    [addonMasters],
  )

  const value = useMemo(
    () => ({
      giftCards,
      taxes,
      discounts,
      units,
      paymentTypes,
      expenseTypes,
      expenseDetails: expenseDetails.filter((e) => !e.branchId || e.branchId === activeBranchId),
      timetables: timetables.filter((t) => !t.branchId || t.branchId === activeBranchId),
      extraCharges: extraCharges.filter((c) => !c.branchId || c.branchId === activeBranchId),
      deliveryRiders: deliveryRiders.filter((r) => !r.branchId || r.branchId === activeBranchId),
      printStations: printStations.filter((p) => !p.branchId || p.branchId === activeBranchId),
      beverageQtys,
      beveragePrices: beveragePrices.filter((p) => !p.branchId || p.branchId === activeBranchId),
      addonMasters,
      saveGiftCard,
      deleteGiftCard,
      redeemGiftCard: redeemGiftCardFn,
      saveTax,
      deleteTax,
      saveDiscount,
      deleteDiscount,
      saveUnit,
      deleteUnit,
      savePaymentType,
      deletePaymentType,
      saveExpenseType,
      deleteExpenseType,
      saveExpenseDetail,
      deleteExpenseDetail,
      saveTimetable,
      deleteTimetable,
      saveExtraCharge,
      deleteExtraCharge,
      saveDeliveryRider,
      deleteDeliveryRider,
      savePrintStation,
      deletePrintStation,
      saveBeverageQty,
      deleteBeverageQty,
      saveBeveragePrice,
      deleteBeveragePrice,
      saveBeveragePricesBulk,
      saveAddonMaster,
      deleteAddonMaster,
    }),
    [
      giftCards,
      taxes,
      discounts,
      units,
      paymentTypes,
      expenseTypes,
      expenseDetails,
      timetables,
      extraCharges,
      deliveryRiders,
      printStations,
      beverageQtys,
      beveragePrices,
      addonMasters,
      activeBranchId,
      saveGiftCard,
      deleteGiftCard,
      redeemGiftCardFn,
      saveTax,
      deleteTax,
      saveDiscount,
      deleteDiscount,
      saveUnit,
      deleteUnit,
      savePaymentType,
      deletePaymentType,
      saveExpenseType,
      deleteExpenseType,
      saveExpenseDetail,
      deleteExpenseDetail,
      saveTimetable,
      deleteTimetable,
      saveExtraCharge,
      deleteExtraCharge,
      saveDeliveryRider,
      deleteDeliveryRider,
      savePrintStation,
      deletePrintStation,
      saveBeverageQty,
      deleteBeverageQty,
      saveBeveragePrice,
      deleteBeveragePrice,
      saveBeveragePricesBulk,
      saveAddonMaster,
      deleteAddonMaster,
    ],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog must be used inside CatalogProvider')
  return ctx
}
